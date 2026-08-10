"""Load reviewed compact NDJSON files into the new Supabase tables.

Writing is impossible unless --write is explicitly supplied. The legacy tables
are never referenced or modified by this loader.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


TABLES = {
    "notice": ("procurements_compact", (
        "adam", "title", "authority_id", "authority_name", "contract_type",
        "procedure_type", "document_category", "nuts_code", "nuts_name",
        "publication_date", "opening_at", "budget_ex_vat", "budget_inc_vat",
        "budget_unknown_vat", "status", "cancelled_at", "source_updated_at",
    )),
    "auction": ("awards_compact", (
        "adam", "procurement_adam", "title", "authority_id", "authority_name",
        "contract_type", "award_date", "amount_ex_vat", "amount_inc_vat",
        "amount_unknown_vat", "cancelled_at", "source_updated_at",
    )),
    "contract": ("contracts_compact", (
        "adam", "procurement_adam", "award_adam", "title", "authority_id",
        "authority_name", "contract_type", "signed_date", "start_date",
        "delivery_date", "amount_ex_vat", "amount_inc_vat", "amount_unknown_vat",
        "cancelled_at", "source_updated_at",
    )),
}


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def upsert_rows(cursor, table: str, columns: tuple[str, ...], rows: list[dict]) -> None:
    if not rows:
        return
    placeholders = ",".join(["%s"] * len(columns))
    updates = ",".join(f"{column}=excluded.{column}" for column in columns if column != "adam")
    query = (
        f"insert into public.{table} ({','.join(columns)}) values ({placeholders}) "
        f"on conflict (adam) do update set {updates}, synced_at=now()"
    )
    cursor.executemany(query, [tuple(row.get(column) for column in columns) for row in rows])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--write", action="store_true", help="Required safety switch for database writes")
    args = parser.parse_args()

    summary = {source: len(read_ndjson(args.input_dir / f"{source}.ndjson")) for source in TABLES}
    summary["cpvs"] = sum(len(read_ndjson(args.input_dir / f"{source}_cpvs.ndjson")) for source in TABLES)
    summary["contractors"] = sum(len(read_ndjson(args.input_dir / f"{source}_contractors.ndjson")) for source in TABLES)
    if not args.write:
        print(json.dumps({"mode": "dry-run", **summary}, ensure_ascii=False))
        return

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required with --write")
    import psycopg

    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        for source, (table, columns) in TABLES.items():
            upsert_rows(cursor, table, columns, read_ndjson(args.input_dir / f"{source}.ndjson"))

        for source, record_type in (("notice", "procurement"), ("auction", "award"), ("contract", "contract")):
            cpv_rows = read_ndjson(args.input_dir / f"{source}_cpvs.ndjson")
            contractor_rows = read_ndjson(args.input_dir / f"{source}_contractors.ndjson")
            adams = sorted({row["record_adam"] for row in cpv_rows + contractor_rows})
            if adams:
                cursor.execute("delete from public.record_cpvs_compact where record_type=%s and record_adam=any(%s)", (record_type, adams))
                cursor.execute("delete from public.record_contractors_compact where record_type=%s and record_adam=any(%s)", (record_type, adams))
            cursor.executemany(
                "insert into public.record_cpvs_compact(record_type,record_adam,cpv_code,cpv_description) values(%s,%s,%s,%s) on conflict do nothing",
                [(row["record_type"], row["record_adam"], row["cpv_code"], row.get("cpv_description")) for row in cpv_rows],
            )
            cursor.executemany(
                "insert into public.record_contractors_compact(record_type,record_adam,position,contractor_name,contractor_vat) values(%s,%s,%s,%s,%s) on conflict do nothing",
                [(row["record_type"], row["record_adam"], row["position"], row["contractor_name"], row.get("contractor_vat")) for row in contractor_rows],
            )
        connection.commit()
    print(json.dumps({"mode": "written", **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()


