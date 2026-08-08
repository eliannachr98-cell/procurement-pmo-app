import os
import sys
import time
import json
import argparse
from datetime import date, timedelta, datetime
from decimal import Decimal

import requests
import psycopg
from psycopg.types.json import Jsonb

BASE_URL = "https://cerpp.eprocurement.gov.gr/khmdhs-opendata"
SOURCES = {
    "notice": "notices",
    "auction": "auctions",
    "contract": "contracts",
}

HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "procurement-pmo-app/0.3"
}

def pick_value(obj):
    if isinstance(obj, dict):
        if obj.get("value") is not None:
            return obj.get("value")
        if obj.get("key") is not None:
            return obj.get("key")
    return obj

def pick_key(obj):
    if isinstance(obj, dict):
        return obj.get("key")
    return obj

def safe_date(v):
    if not v:
        return None
    try:
        return str(v)[:10]
    except Exception:
        return None

def safe_datetime(v):
    if not v:
        return None
    return str(v)

def safe_number(v):
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except Exception:
        return None

def organization_parts(item):
    org = item.get("organization")
    if isinstance(org, dict):
        return str(org.get("key") or "") or None, org.get("value")
    return None, str(org) if org else None

def extract_cpvs(item):
    found = {}

    def add(cpv):
        if isinstance(cpv, dict):
            code = cpv.get("key")
            desc = cpv.get("value")
            if code:
                found[str(code)] = desc
        elif cpv:
            found[str(cpv)] = None

    for collection_key in ("objectDetails", "objectDetailsList"):
        rows = item.get(collection_key) or []
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            cpvs = row.get("cpvs") or []
            if isinstance(cpvs, list):
                for cpv in cpvs:
                    add(cpv)

    return [(code, desc) for code, desc in found.items()]

def find_contractor(item):
    # API structures may evolve; retain raw_data regardless.
    direct_name_keys = ("contractorName", "supplierName")
    direct_vat_keys = ("contractorVatNumber", "vatNumber", "supplierVatNumber")

    name = next((item.get(k) for k in direct_name_keys if item.get(k)), None)
    vat = next((item.get(k) for k in direct_vat_keys if item.get(k)), None)

    def walk(obj):
        nonlocal name, vat
        if isinstance(obj, dict):
            for k, v in obj.items():
                kl = str(k).lower()
                if not name and ("contractor" in kl or "supplier" in kl) and "name" in kl and isinstance(v, str):
                    name = v
                if not vat and ("contractor" in kl or "supplier" in kl) and "vat" in kl and isinstance(v, (str, int)):
                    vat = str(v)
                walk(v)
        elif isinstance(obj, list):
            for x in obj:
                walk(x)

    walk(item)
    return name, vat

def request_page(source, page, date_from, date_to, timeout=60):
    url = f"{BASE_URL}/{source}"
    payload = {
        "dateFrom": date_from,
        "dateTo": date_to
    }

    for attempt in range(1, 5):
        try:
            response = requests.post(
                url,
                params={"page": page},
                headers=HEADERS,
                json=payload,
                timeout=timeout,
            )

            if response.status_code == 429:
                wait = 10 * attempt
                print(f"{source}: rate limit, waiting {wait}s")
                time.sleep(wait)
                continue

            response.raise_for_status()
            return response.json()

        except requests.RequestException as exc:
            if attempt == 4:
                raise
            wait = 3 * attempt
            print(f"{source}: request attempt {attempt} failed: {exc}; retrying in {wait}s")
            time.sleep(wait)

def iter_records(source, date_from, date_to, max_pages=None):
    page = 0

    while True:
        data = request_page(source, page, date_from, date_to)
        content = data.get("content") or []

        print(
            f"{source}: page {page + 1}/{data.get('totalPages', '?')} "
            f"records={len(content)} total={data.get('totalElements', '?')}"
        )

        for item in content:
            yield item

        if data.get("last", False):
            break

        page += 1

        if max_pages is not None and page >= max_pages:
            print(f"{source}: stopping at max_pages={max_pages}")
            break

        # Well below the official 350 requests/minute limit.
        time.sleep(0.25)

def upsert_notice(cur, item):
    ref = item.get("referenceNumber")
    if not ref:
        return False

    org_id, org_name = organization_parts(item)
    procedure = pick_value(item.get("procedureType"))
    contract_type = pick_value(item.get("contractType"))
    status = "Cancelled" if item.get("cancelled") else "Active"

    cur.execute(
        """
        INSERT INTO public.notices (
            reference_number, title,
            organization_id, organization_name,
            contract_type,
            publication_date, final_submission_date, opening_date,
            total_cost, status, cancel_date,
            raw_data, source_updated_at, synced_at
        )
        VALUES (
            %(reference_number)s, %(title)s,
            %(organization_id)s, %(organization_name)s,
            %(contract_type)s,
            %(publication_date)s, %(final_submission_date)s, NULL,
            %(total_cost)s, %(status)s, %(cancel_date)s,
            %(raw_data)s, %(source_updated_at)s, now()
        )
        ON CONFLICT (reference_number) DO UPDATE SET
            title = EXCLUDED.title,
            organization_id = EXCLUDED.organization_id,
            organization_name = EXCLUDED.organization_name,
            contract_type = EXCLUDED.contract_type,
            publication_date = EXCLUDED.publication_date,
            final_submission_date = EXCLUDED.final_submission_date,
            total_cost = EXCLUDED.total_cost,
            status = EXCLUDED.status,
            cancel_date = EXCLUDED.cancel_date,
            raw_data = EXCLUDED.raw_data,
            source_updated_at = EXCLUDED.source_updated_at,
            synced_at = now()
        """,
        {
            "reference_number": ref,
            "title": item.get("title"),
            "organization_id": org_id,
            "organization_name": org_name,
            "contract_type": str(contract_type) if contract_type is not None else None,
            # dateFrom/dateTo refer to KHMDHS registration; submissionDate is the closest raw timestamp.
            "publication_date": safe_date(item.get("submissionDate") or item.get("signedDate")),
            "final_submission_date": safe_datetime(item.get("finalSubmissionDate")),
            "total_cost": safe_number(item.get("totalCostWithoutVAT") or item.get("budget")),
            "status": status,
            "cancel_date": safe_date(item.get("cancellationDate")),
            "raw_data": Jsonb(item),
            "source_updated_at": safe_datetime(item.get("lastUpdateDate")),
        }
    )
    refresh_cpvs(cur, "notice", ref, item)
    return True

def upsert_auction(cur, item):
    ref = item.get("referenceNumber")
    if not ref:
        return False

    org_id, org_name = organization_parts(item)
    contractor_name, contractor_vat = find_contractor(item)

    cur.execute(
        """
        INSERT INTO public.auctions (
            reference_number, notice_reference_number,
            title, organization_id, organization_name,
            contract_type, award_date, total_cost,
            contractor_name, contractor_vat,
            cancel_date, raw_data, source_updated_at, synced_at
        )
        VALUES (
            %(reference_number)s, %(notice_reference_number)s,
            %(title)s, %(organization_id)s, %(organization_name)s,
            %(contract_type)s, %(award_date)s, %(total_cost)s,
            %(contractor_name)s, %(contractor_vat)s,
            %(cancel_date)s, %(raw_data)s, %(source_updated_at)s, now()
        )
        ON CONFLICT (reference_number) DO UPDATE SET
            notice_reference_number = EXCLUDED.notice_reference_number,
            title = EXCLUDED.title,
            organization_id = EXCLUDED.organization_id,
            organization_name = EXCLUDED.organization_name,
            contract_type = EXCLUDED.contract_type,
            award_date = EXCLUDED.award_date,
            total_cost = EXCLUDED.total_cost,
            contractor_name = EXCLUDED.contractor_name,
            contractor_vat = EXCLUDED.contractor_vat,
            cancel_date = EXCLUDED.cancel_date,
            raw_data = EXCLUDED.raw_data,
            source_updated_at = EXCLUDED.source_updated_at,
            synced_at = now()
        """,
        {
            "reference_number": ref,
            "notice_reference_number": item.get("noticeRefNo"),
            "title": item.get("title"),
            "organization_id": org_id,
            "organization_name": org_name,
            "contract_type": str(pick_value(item.get("contractType"))) if item.get("contractType") else None,
            "award_date": safe_date(item.get("signedDate") or item.get("submissionDate")),
            "total_cost": safe_number(
                item.get("totalCostWithoutVAT")
                or item.get("auctionAmount")
                or item.get("budget")
            ),
            "contractor_name": contractor_name,
            "contractor_vat": contractor_vat,
            "cancel_date": safe_date(item.get("cancellationDate")),
            "raw_data": Jsonb(item),
            "source_updated_at": safe_datetime(item.get("lastUpdateDate")),
        }
    )
    refresh_cpvs(cur, "auction", ref, item)
    return True

def upsert_contract(cur, item):
    ref = item.get("referenceNumber")
    if not ref:
        return False

    org_id, org_name = organization_parts(item)
    contractor_name, contractor_vat = find_contractor(item)

    cur.execute(
        """
        INSERT INTO public.contracts (
            reference_number,
            auction_reference_number, notice_reference_number,
            title, organization_id, organization_name,
            contract_type,
            contract_signed_date, start_date, end_date,
            total_cost, contractor_name, contractor_vat,
            cancel_date, raw_data, source_updated_at, synced_at
        )
        VALUES (
            %(reference_number)s,
            %(auction_reference_number)s, %(notice_reference_number)s,
            %(title)s, %(organization_id)s, %(organization_name)s,
            %(contract_type)s,
            %(contract_signed_date)s, %(start_date)s, %(end_date)s,
            %(total_cost)s, %(contractor_name)s, %(contractor_vat)s,
            %(cancel_date)s, %(raw_data)s, %(source_updated_at)s, now()
        )
        ON CONFLICT (reference_number) DO UPDATE SET
            auction_reference_number = EXCLUDED.auction_reference_number,
            notice_reference_number = EXCLUDED.notice_reference_number,
            title = EXCLUDED.title,
            organization_id = EXCLUDED.organization_id,
            organization_name = EXCLUDED.organization_name,
            contract_type = EXCLUDED.contract_type,
            contract_signed_date = EXCLUDED.contract_signed_date,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            total_cost = EXCLUDED.total_cost,
            contractor_name = EXCLUDED.contractor_name,
            contractor_vat = EXCLUDED.contractor_vat,
            cancel_date = EXCLUDED.cancel_date,
            raw_data = EXCLUDED.raw_data,
            source_updated_at = EXCLUDED.source_updated_at,
            synced_at = now()
        """,
        {
            "reference_number": ref,
            "auction_reference_number": item.get("auctionRefNo"),
            "notice_reference_number": item.get("noticeReferenceNumber"),
            "title": item.get("title"),
            "organization_id": org_id,
            "organization_name": org_name,
            "contract_type": str(pick_value(item.get("contractType"))) if item.get("contractType") else None,
            "contract_signed_date": safe_date(item.get("contractSignedDate")),
            "start_date": safe_date(item.get("startDate")),
            "end_date": safe_date(item.get("endDate")),
            "total_cost": safe_number(
                item.get("totalCostWithoutVAT")
                or item.get("contractBudget")
                or item.get("budget")
            ),
            "contractor_name": contractor_name,
            "contractor_vat": contractor_vat,
            "cancel_date": safe_date(item.get("cancellationDate")),
            "raw_data": Jsonb(item),
            "source_updated_at": safe_datetime(item.get("lastUpdateDate")),
        }
    )
    refresh_cpvs(cur, "contract", ref, item)
    return True

def refresh_cpvs(cur, source, reference_number, item):
    cur.execute(
        "DELETE FROM public.cpv_items WHERE source_type=%s AND reference_number=%s",
        (source, reference_number),
    )

    cpvs = extract_cpvs(item)
    for code, desc in cpvs:
        cur.execute(
            """
            INSERT INTO public.cpv_items (
                source_type, reference_number, cpv_code, cpv_description
            )
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (source_type, reference_number, cpv_code)
            DO UPDATE SET cpv_description = EXCLUDED.cpv_description
            """,
            (source, reference_number, code, desc)
        )

def sync_source(conn, source, date_from, date_to, max_pages=None):
    received = 0
    saved = 0
    log_id = None

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.sync_log (
                source_type, date_from, date_to, status
            )
            VALUES (%s, %s, %s, 'running')
            RETURNING id
            """,
            (source, date_from, date_to)
        )
        log_id = cur.fetchone()[0]
        conn.commit()

    try:
        for item in iter_records(source, date_from, date_to, max_pages=max_pages):
            received += 1

            with conn.cursor() as cur:
                if source == "notice":
                    ok = upsert_notice(cur, item)
                elif source == "auction":
                    ok = upsert_auction(cur, item)
                elif source == "contract":
                    ok = upsert_contract(cur, item)
                else:
                    raise ValueError(source)

                if ok:
                    saved += 1

            # Commit periodically so a large page does not hold a long transaction.
            if received % 100 == 0:
                conn.commit()

        conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.sync_log
                SET finished_at=now(),
                    records_received=%s,
                    records_inserted=%s,
                    records_updated=0,
                    status='success'
                WHERE id=%s
                """,
                (received, saved, log_id)
            )
        conn.commit()

        print(f"SUCCESS {source}: received={received}, saved/upserted={saved}")

    except Exception as exc:
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.sync_log
                SET finished_at=now(),
                    records_received=%s,
                    records_inserted=%s,
                    status='failed',
                    error_message=%s
                WHERE id=%s
                """,
                (received, saved, str(exc)[:3000], log_id)
            )
        conn.commit()
        raise

def validate_dates(date_from, date_to):
    df = date.fromisoformat(date_from)
    dt = date.fromisoformat(date_to)
    if dt < df:
        raise ValueError("date_to must be >= date_from")
    if (dt - df).days > 180:
        raise ValueError("Date range must not exceed 180 days.")
    return df, dt

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date-from")
    parser.add_argument("--date-to")
    parser.add_argument("--source", choices=["all", "notice", "auction", "contract"], default="all")
    parser.add_argument("--max-pages", type=int, default=None)
    args = parser.parse_args()

    today = date.today()
    date_to = args.date_to or today.isoformat()
    date_from = args.date_from or (today - timedelta(days=1)).isoformat()
    validate_dates(date_from, date_to)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is missing.")
        sys.exit(1)

    selected = list(SOURCES.keys()) if args.source == "all" else [args.source]

    print(f"Sync window: {date_from} -> {date_to}")
    print(f"Sources: {', '.join(selected)}")
    print(f"Max pages per source: {args.max_pages or 'ALL'}")

    try:
        with psycopg.connect(database_url, connect_timeout=30) as conn:
            for source in selected:
                sync_source(conn, source, date_from, date_to, max_pages=args.max_pages)
    except Exception as exc:
        print(f"ERROR: {type(exc).__name__}: {exc}")
        sys.exit(2)

    print("ALL DONE.")

if __name__ == "__main__":
    main()
