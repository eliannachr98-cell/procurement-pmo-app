"""Download KHMDHS pages and write compact, database-ready NDJSON files.

This program never writes to Supabase. It is the safe staging step used before
the reviewed compact schema is deployed.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, timedelta
from pathlib import Path

import requests

from compact_transform import transform


BASE_URL = "https://cerpp.eprocurement.gov.gr/khmdhs-opendata"
ENDPOINTS = {"notice": "notice", "auction": "auction", "contract": "contract"}


def date_windows(date_from: str, date_to: str, days: int = 7):
    """Yield small inclusive windows so KHMDHS does not time out on long ranges."""
    current = date.fromisoformat(date_from)
    end = date.fromisoformat(date_to)
    if current > end:
        raise ValueError("date-from must be before or equal to date-to")
    if days < 1:
        raise ValueError("window-days must be at least 1")
    while current <= end:
        window_end = min(current + timedelta(days=days - 1), end)
        yield current.isoformat(), window_end.isoformat()
        current = window_end + timedelta(days=1)


def request_page(source: str, page: int, payload: dict) -> dict:
    url = f"{BASE_URL}/{ENDPOINTS[source]}"
    read_timeout = float(os.environ.get("KHMDHS_READ_TIMEOUT", "60"))
    for attempt in range(1, 6):
        try:
            response = requests.post(
                url,
                params={"page": page},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "User-Agent": "procurement-pmo-app/compact-1.2",
                },
                json=payload,
                timeout=read_timeout,
            )
            if response.status_code not in (429, 500, 502, 503, 504):
                response.raise_for_status()
                return response.json()
            if attempt == 5:
                response.raise_for_status()
            wait = min(45, 5 * (2 ** (attempt - 1)))
            print(f"{source}: HTTP {response.status_code} on page {page + 1}; retry {attempt}/5 in {wait}s")
            time.sleep(wait)
        except requests.RequestException as exc:
            if attempt == 5:
                raise
            wait = min(45, 5 * (2 ** (attempt - 1)))
            print(f"{source}: network error on page {page + 1}: {exc}; retry {attempt}/5 in {wait}s")
            time.sleep(wait)
    raise RuntimeError("unreachable retry state")


def iter_records(source: str, date_from: str, date_to: str, max_pages: int | None = None):
    page = 0
    payload = {"dateFrom": date_from, "dateTo": date_to}
    while True:
        data = request_page(source, page, payload)
        content = data.get("content") or []
        print(f"{source}: page {page + 1}/{data.get('totalPages', '?')} records={len(content)}")
        yield from content
        if data.get("last", False):
            break
        page += 1
        if max_pages is not None and page >= max_pages:
            break
        time.sleep(0.25)


def prepare_source(
    source: str,
    date_from: str,
    date_to: str,
    output_dir: Path,
    max_pages: int | None,
    window_days: int = 7,
) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    record_path = output_dir / f"{source}.ndjson"
    cpv_path = output_dir / f"{source}_cpvs.ndjson"
    contractor_path = output_dir / f"{source}_contractors.ndjson"
    counts = {"records": 0, "cpvs": 0, "contractors": 0, "errors": 0}

    with record_path.open("w", encoding="utf-8") as record_file, \
            cpv_path.open("w", encoding="utf-8") as cpv_file, \
            contractor_path.open("w", encoding="utf-8") as contractor_file:
        for window_from, window_to in date_windows(date_from, date_to, window_days):
            print(f"{source}: window {window_from} -> {window_to}")
            for raw in iter_records(source, window_from, window_to, max_pages=max_pages):
                try:
                    compact = transform(source, raw)
                except (TypeError, ValueError) as exc:
                    counts["errors"] += 1
                    print(f"SKIP {source}: {exc}")
                    continue

                record = compact["record"]
                record_file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                counts["records"] += 1
                record_type = {"notice": "procurement", "auction": "award", "contract": "contract"}[source]

                for cpv in compact["cpvs"]:
                    cpv_file.write(json.dumps({
                        "record_type": record_type,
                        "record_adam": record["adam"],
                        **cpv,
                    }, ensure_ascii=False, separators=(",", ":")) + "\n")
                    counts["cpvs"] += 1

                for contractor in compact["contractors"]:
                    contractor_file.write(json.dumps({
                        "record_type": record_type,
                        "record_adam": record["adam"],
                        **contractor,
                    }, ensure_ascii=False, separators=(",", ":")) + "\n")
                    counts["contractors"] += 1

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare compact TenderScope data without touching Supabase")
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument("--source", choices=("all", "notice", "auction", "contract"), default="all")
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--window-days", type=int, default=7)
    parser.add_argument("--output-dir", type=Path, default=Path("staging/compact"))
    args = parser.parse_args()

    sources = ("notice", "auction", "contract") if args.source == "all" else (args.source,)
    summary = {
        source: prepare_source(
            source,
            args.date_from,
            args.date_to,
            args.output_dir,
            args.max_pages,
            args.window_days,
        )
        for source in sources
    }
    (args.output_dir / "summary.json").write_text(json.dumps({
        "date_from": args.date_from,
        "date_to": args.date_to,
        "sources": summary,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()

