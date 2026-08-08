import os
import sys
import psycopg

def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL secret is missing.")
        sys.exit(1)

    try:
        with psycopg.connect(database_url, connect_timeout=20) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    select
                        current_database(),
                        current_user,
                        to_regclass('public.notices'),
                        to_regclass('public.auctions'),
                        to_regclass('public.contracts'),
                        to_regclass('public.cpv_items'),
                        to_regclass('public.sync_log');
                """)
                row = cur.fetchone()

        print("SUCCESS: GitHub can connect to Supabase.")
        print(f"Database: {row[0]}")
        print(f"User: {row[1]}")
        print("Tables:")
        print(f"  notices:   {row[2]}")
        print(f"  auctions:  {row[3]}")
        print(f"  contracts: {row[4]}")
        print(f"  cpv_items: {row[5]}")
        print(f"  sync_log:  {row[6]}")

        missing = [name for name, value in {
            "notices": row[2],
            "auctions": row[3],
            "contracts": row[4],
            "cpv_items": row[5],
            "sync_log": row[6],
        }.items() if value is None]

        if missing:
            print("ERROR: Missing tables:", ", ".join(missing))
            sys.exit(2)

        print("SUCCESS: All required procurement tables exist.")

    except Exception as exc:
        print("ERROR: Database connection failed.")
        print(type(exc).__name__ + ":", str(exc))
        sys.exit(3)

if __name__ == "__main__":
    main()
