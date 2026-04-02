"""Prepare a frozen sentence-style hard benchmark from dense-audit failures."""

from __future__ import annotations

import argparse
from pathlib import Path

from app import db
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.corpus_ids import write_corpus_ids_file
from app.rag_ingest.runtime_eval_benchmarks import (
    build_dense_audit_sentence_hard_benchmark,
)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Prepare a frozen sentence-style runtime benchmark from recurrent "
            "dense-audit failures."
        )
    )
    parser.add_argument("--graph-release-id", default="current")
    parser.add_argument("--chunk-version-key", default=DEFAULT_CHUNK_VERSION_KEY)
    parser.add_argument("--dense-audit-report-path", type=Path, required=True)
    parser.add_argument("--benchmark-key", default="sentence_hard_v1")
    parser.add_argument("--max-cases", type=int, default=24)
    parser.add_argument("--min-failure-count", type=int, default=2)
    parser.add_argument("--min-max-rank", type=int, default=4)
    parser.add_argument("--high-recurrence-count", type=int, default=4)
    parser.add_argument("--deep-miss-rank", type=int, default=20)
    parser.add_argument("--report-path", type=Path, default=None)
    parser.add_argument("--corpus-ids-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = build_dense_audit_sentence_hard_benchmark(
            dense_audit_report_path=args.dense_audit_report_path,
            graph_release_id=args.graph_release_id,
            chunk_version_key=args.chunk_version_key,
            benchmark_key=args.benchmark_key,
            max_cases=args.max_cases,
            min_failure_count=args.min_failure_count,
            min_max_rank=args.min_max_rank,
            high_recurrence_count=args.high_recurrence_count,
            deep_miss_rank=args.deep_miss_rank,
            connect=db.pooled,
        )
        report_json = report.model_dump_json(indent=2)
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(report_json)
        if args.corpus_ids_path is not None:
            write_corpus_ids_file(
                args.corpus_ids_path,
                corpus_ids=[case.corpus_id for case in report.cases],
            )
        print(report_json)
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
