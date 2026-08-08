import argparse, calendar, subprocess, sys
from datetime import date

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--month", type=int, required=True)
    p.add_argument("--source", choices=["all","notice","auction","contract"], default="all")
    a = p.parse_args()

    last_day = calendar.monthrange(a.year, a.month)[1]
    d1 = date(a.year, a.month, 1).isoformat()
    d2 = date(a.year, a.month, last_day).isoformat()

    print(f"Backfill {d1} -> {d2} | source={a.source}", flush=True)

    cmd = [
        sys.executable, "-u", "sync_khmdhs.py",
        "--date-from", d1,
        "--date-to", d2,
        "--source", a.source
    ]
    subprocess.run(cmd, check=True)
    print("MONTHLY BACKFILL COMPLETED", flush=True)

if __name__ == "__main__":
    main()
