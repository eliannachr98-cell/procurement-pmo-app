"""Record each notice's KHMDHS noticeType.key in public.procurement_quality_flags.

Only the notice_type_key column of that small flags table is written - the large
*_compact tables are never touched, so this adds no bloat to them. A notice whose
type key is 3 ("Διακήρυξη") is the only kind the thesis Excel keeps.

Writing is impossible unless --write is explicitly supplied.
"""

from __future__ import annotations

import argparse
import os

import psycopg

from compact_transform import keyed, text
from prepare_compact_data import iter_records


def collect(date_from: str, date_to: str, max_pages: int | None) -> dict[str, str]:
    found: dict[str, str] = {}
    for item in iter_records("notice", date_from, date_to, max_pages=max_pages):
        adam = text(item.get("referenceNumber"))
        key, _ = keyed(item.get("noticeType"))
        if adam and key:
            found[adam] = key
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    found = collect(args.date_from, args.date_to, args.max_pages or None)
    counts: dict[str, int] = {}
    for key in found.values():
        counts[key] = counts.get(key, 0) + 1
    print(f"notice types {args.date_from} -> {args.date_to}: {len(found)} notices, by key: {counts}")

    if not args.write:
        print("Dry run - pass --write to update public.procurement_quality_flags")
        return

    expected_ref = os.environ.get("EXPECTED_DB_REF")
    url = os.environ["DATABASE_URL"]
    if expected_ref and expected_ref not in url:
        raise SystemExit("DATABASE_URL does not point at the expected Supabase project")

    with psycopg.connect(url) as conn, conn.cursor() as cursor:
        cursor.executemany(
            "update public.procurement_quality_flags set notice_type_key = %s where adam = %s",
            [(key, adam) for adam, key in found.items()],
        )
        print(f"updated up to {len(found)} flag rows")


if __name__ == "__main__":
    main()
