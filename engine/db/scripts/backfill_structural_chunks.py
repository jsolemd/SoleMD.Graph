"""Backfill default structural chunks from canonical block and sentence rows."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app import db
from app.rag.chunk_backfill_runtime import (
    CanonicalChunkRows,
    backfill_default_chunks,
    run_chunk_backfill,
)


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
        description="Backfill default structural chunks from canonical block/sentence rows.",
    )
    parser.add_argument(
        "--corpus-id",
        dest="corpus_ids",
        action="append",
        type=int,
        help="Corpus ID to backfill. Repeat for multiple papers.",
    )
    parser.add_argument(
        "--corpus-ids-file",
        dest="corpus_ids_file",
        type=Path,
        default=None,
        help="Optional newline-delimited corpus-id file.",
    )
    parser.add_argument(
        "--source-revision-key",
        dest="source_revision_keys",
        action="append",
        required=True,
        help="Source revision key, e.g. s2orc_v2:2026-03-10",
    )
    parser.add_argument(
        "--parser-version",
        required=True,
        help="Parser version used for the canonical span parse.",
    )
    parser.add_argument(
        "--embedding-model",
        default=None,
        help="Optional embedding model to record on the chunk version row.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=250,
        help="Number of corpus IDs to backfill per staged write batch.",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional checkpoint run id for resumable chunk backfill.",
    )
    parser.add_argument(
        "--reset-run",
        action="store_true",
        help="Reset any existing checkpoint metadata for --run-id before backfilling.",
    )
    parser.add_argument(
        "--checkpoint-root",
        type=Path,
        default=None,
        help="Optional checkpoint root directory override.",
    )
    args = parser.parse_args(argv)
    if not args.corpus_ids and args.corpus_ids_file is None:
        parser.error("one of --corpus-id or --corpus-ids-file is required")
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = list(
        dict.fromkeys(
            (args.corpus_ids or [])
            + (
                _load_corpus_ids_file(args.corpus_ids_file)
                if args.corpus_ids_file
                else []
            )
        )
    )
    try:
        report = run_chunk_backfill(
            corpus_ids=corpus_ids,
            source_revision_keys=args.source_revision_keys,
            parser_version=args.parser_version,
            embedding_model=args.embedding_model,
            batch_size=args.batch_size,
            run_id=args.run_id,
            reset_run=args.reset_run,
            checkpoint_root=args.checkpoint_root,
        )
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
