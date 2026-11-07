"""Record each notice's KHMDHS noticeType.key and award-reference presence in
public.procurement_quality_flags.

Only notice_type_key and has_award_ref of that small flags table are written -
the large *_compact tables are never touched, so no bloat is added to them.
The thesis Excel keeps only noticeType "Διακήρυξη" (key 3) and drops a
cancelled notice whose own auctionRefNo is blank or "NULL"; both are read from
the notice payload here so the database can apply exactly the same rules.

Writing is impossible unless --write is explicitly supplied.
"""

from __future__ import annotations

import argparse
import os

import psycopg

from compact_transform import keyed, text
from prepare_compact_data import iter_records


def has_award_ref(value: object) -> bool:
    cleaned = (text(value) or "").strip()
    return bool(cleaned) and cleaned.upper() != "NULL"


def collect(date_from: str, date_to: str, max_pages: int | None) -> dict[str, tuple[str, bool]]:
    found: dict[str, tuple[str, bool]] = {}
    for item in iter_records("notice", date_from, date_to, max_pages=max_pages):
        adam = text(item.get("referenceNumber"))
        key, _ = keyed(item.get("noticeType"))
        if adam and key:
            found[adam] = (key, has_award_ref(item.get("auctionRefNo")))
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    found = collect(args.date_from, args.date_to, args.max_pages or None)
    by_key: dict[str, int] = {}
    for key, _ in found.values():
        by_key[key] = by_key.get(key, 0) + 1
    with_ref = sum(1 for _, ref in found.values() if ref)
    print(f"notice types {args.date_from} -> {args.date_to}: {len(found)} notices, by key: {by_key}, with award ref: {with_ref}")

    if not args.write:
        print("Dry run - pass --write to update public.procurement_quality_flags")
        return

    expected_ref = os.environ.get("EXPECTED_DB_REF")
    url = os.environ["DATABASE_URL"]
    if expected_ref and expected_ref not in url:
        raise SystemExit("DATABASE_URL does not point at the expected Supabase project")

    with psycopg.connect(url) as conn, conn.cursor() as cursor:
        cursor.executemany(
            "update public.procurement_quality_flags set notice_type_key = %s, has_award_ref = %s where adam = %s",
            [(key, ref, adam) for adam, (key, ref) in found.items()],
        )
        print(f"updated up to {len(found)} flag rows")


if __name__ == "__main__":
    main()
