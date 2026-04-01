"""Inspect and optionally prune stale repo-local temporary artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.tmp_cleanup import inspect_temp_artifacts


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect and optionally prune stale repo-local temp artifacts."
    )
    parser.add_argument("--min-age-hours", type=float, default=24.0)
    parser.add_argument("--delete", action="store_true")
    parser.add_argument("--include-pycache", action="store_true")
    parser.add_argument("--include-graph-tmp", action="store_true")
    parser.add_argument("--largest-limit", type=int, default=20)
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = inspect_temp_artifacts(
        min_age_hours=args.min_age_hours,
        delete=args.delete,
        include_pycache=args.include_pycache,
        include_graph_tmp=args.include_graph_tmp,
        largest_limit=args.largest_limit,
    )
    payload = json.dumps(report.to_dict(), indent=2)
    if args.report_path is not None:
        args.report_path.parent.mkdir(parents=True, exist_ok=True)
        args.report_path.write_text(payload + "\n")
    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
