"""Audit benchmark case warehouse coverage and emit sparse-target backfill inputs."""

from __future__ import annotations

import argparse
from pathlib import Path

from app.rag_ingest.benchmark_warehouse_audit import (
    audit_benchmark_warehouse_coverage,
)
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Audit a benchmark JSON snapshot against the live warehouse and optionally "
            "write the remaining sparse corpus ids for targeted backfill."
        )
    )
    parser.add_argument("--benchmark-path", type=Path, required=True)
    parser.add_argument("--output-path", type=Path, default=None)
    parser.add_argument("--sparse-corpus-ids-path", type=Path, default=None)
    parser.add_argument(
        "--chunk-version-key",
        default=DEFAULT_CHUNK_VERSION_KEY,
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = audit_benchmark_warehouse_coverage(
        args.benchmark_path,
        chunk_version_key=args.chunk_version_key,
    )
    output = report.model_dump_json(indent=2)
    if args.output_path is not None:
        args.output_path.parent.mkdir(parents=True, exist_ok=True)
        args.output_path.write_text(output)
    if args.sparse_corpus_ids_path is not None:
        args.sparse_corpus_ids_path.parent.mkdir(parents=True, exist_ok=True)
        args.sparse_corpus_ids_path.write_text(
            "".join(f"{case.corpus_id}\n" for case in report.sparse_cases)
        )
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
