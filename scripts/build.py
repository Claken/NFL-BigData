"""One command to validate inputs, analyze all source games and build the report."""

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=ROOT / "data/raw")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/multigame")
    parser.add_argument("--processed", type=Path, default=ROOT / "data/processed")
    parser.add_argument("--fetch", action="store_true")
    args = parser.parse_args()
    paths = ["--raw", str(args.raw), "--output", str(args.output),
             "--processed", str(args.processed)]
    subprocess.run([sys.executable, str(ROOT / "scripts/analyze.py"), *paths,
                    *(["--fetch"] if args.fetch else [])], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts/report.py"), *paths], check=True)


if __name__ == "__main__":
    main()
