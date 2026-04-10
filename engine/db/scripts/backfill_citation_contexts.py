"""Backfill historical citation contexts into the runtime serving table."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app import db
from app.corpus.citation_context_backfill import (
    run_citation_context_backfill,
    run_citation_context_target_refresh,
)


def _load_corpus_ids(path: Path) -> list[int]:
    corpus_ids: list[int] = []
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        corpus_ids.append(int(line))
    return corpus_ids


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill solemd.citation_contexts from the historical "
            "solemd.citations table in resumable batches, or refresh "
            "the citation-context surface for a selected corpus set."
        ),
    )
    parser.add_argument(
        "--after-corpus-id",
        type=int,
        default=0,
        help="Resume strictly after this corpus id cursor.",
    )
    parser.add_argument(
        "--max-corpus-id",
        type=int,
        default=None,
        help="Optional upper bound for the corpus id cursor.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Number of distinct citing corpus ids to process per batch.",
    )
    parser.add_argument(
        "--limit-batches",
        type=int,
        default=None,
        help="Optional maximum number of batches to process in this run.",
    )
    parser.add_argument(
        "--report-path",
        type=Path,
        default=None,
        help="Optional JSON progress report path.",
    )
    parser.add_argument(
        "--reset-report",
        action="store_true",
        help="Ignore any existing report file and start from the explicit cursor.",
    )
    parser.add_argument(
        "--corpus-ids-file",
        type=Path,
        default=None,
        help=(
            "Optional newline-delimited corpus id file. When provided, refresh "
            "citation contexts for those papers on either the citing or cited side."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect batch boundaries without writing citation_context rows.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        if args.corpus_ids_file is not None:
            summary = run_citation_context_target_refresh(
                corpus_ids=_load_corpus_ids(args.corpus_ids_file),
                after_corpus_id=args.after_corpus_id,
                max_corpus_id=args.max_corpus_id,
                batch_size=args.batch_size,
                limit_batches=args.limit_batches,
                report_path=args.report_path,
                reset_report=args.reset_report,
                dry_run=args.dry_run,
            )
        else:
            summary = run_citation_context_backfill(
                after_corpus_id=args.after_corpus_id,
                max_corpus_id=args.max_corpus_id,
                batch_size=args.batch_size,
                limit_batches=args.limit_batches,
                report_path=args.report_path,
                reset_report=args.reset_report,
                dry_run=args.dry_run,
            )
        print(json.dumps(asdict(summary), indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
