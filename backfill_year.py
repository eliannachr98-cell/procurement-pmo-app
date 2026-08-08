import argparse
import subprocess
import sys
from datetime import date, timedelta

MAX_WINDOW_DAYS = 179

def windows_for_year(year: int):
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    cur = start
    while cur <= end:
        nxt = min(cur + timedelta(days=MAX_WINDOW_DAYS), end)
        yield cur, nxt
        cur = nxt + timedelta(days=1)

def run_window(date_from, date_to, source):
    cmd = [
        sys.executable,
        "sync_khmdhs.py",
        "--date-from", date_from.isoformat(),
        "--date-to", date_to.isoformat(),
        "--source", source,
    ]
    print("=" * 80)
    print("Running:", " ".join(cmd))
    print("=" * 80)
    subprocess.run(cmd, check=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--source", choices=["all", "notice", "auction", "contract"], default="all")
    args = parser.parse_args()

    if args.year < 2022 or args.year > date.today().year:
        raise SystemExit("Year must be between 2022 and the current year.")

    for d1, d2 in windows_for_year(args.year):
        run_window(d1, d2, args.source)

    print(f"Historical backfill completed for {args.year}.")

if __name__ == "__main__":
    main()
