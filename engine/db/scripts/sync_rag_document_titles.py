"""Synchronize warehouse document titles from canonical paper metadata."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app import db
from app.rag_ingest.document_title_sync import sync_rag_document_titles


def _load_corpus_ids_file(path: Path) -> list[int]:
    values: list[int] = []
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        values.append(int(stripped))
    return list(dict.fromkeys(values))


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync warehouse document titles from solemd.papers.title.",
    )
    parser.add_argument(
        "--corpus-id",
        dest="corpus_ids",
        action="append",
        type=int,
        help="Corpus ID to sync. Repeat for multiple papers.",
    )
    parser.add_argument(
        "--corpus-ids-file",
        dest="corpus_ids_file",
        type=Path,
        default=None,
        help="Optional newline-delimited corpus-id file.",
    )
    parser.add_argument(
        "--report-path",
        type=Path,
        default=None,
        help="Optional JSON report output path.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = list(
        dict.fromkeys(
            (args.corpus_ids or [])
            + (_load_corpus_ids_file(args.corpus_ids_file) if args.corpus_ids_file else [])
        )
    )
    try:
        report = sync_rag_document_titles(corpus_ids=corpus_ids or None)
        report_json = report.model_dump_json(indent=2)
        print(report_json)
        if args.report_path is not None:
            args.report_path.write_text(report_json + "\n")
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
