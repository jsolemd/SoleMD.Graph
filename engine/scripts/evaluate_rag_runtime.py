"""Evaluate live RAG retrieval and grounding over a structural warehouse sample."""

from __future__ import annotations

import argparse
from pathlib import Path

from app import db
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval import (
    RuntimeEvalQueryFamily,
    run_rag_runtime_evaluation,
)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run a structural runtime evaluation over persisted warehouse papers "
            "using the live RagService."
        )
    )
    parser.add_argument("--graph-release-id", default="current")
    parser.add_argument("--chunk-version-key", default=DEFAULT_CHUNK_VERSION_KEY)
    parser.add_argument("--sample-size", type=int, default=96)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--rerank-topn", type=int, default=10)
    parser.add_argument(
        "--no-lexical",
        action="store_true",
        help="Disable lexical retrieval during the eval run.",
    )
    parser.add_argument(
        "--no-dense-query",
        action="store_true",
        help="Disable dense-query retrieval during the eval run.",
    )
    parser.add_argument(
        "--query-family",
        dest="query_families",
        action="append",
        choices=[family.value for family in RuntimeEvalQueryFamily],
        default=None,
    )
    parser.add_argument(
        "--corpus-id",
        dest="corpus_ids",
        action="append",
        type=int,
        default=None,
    )
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    query_families = (
        [RuntimeEvalQueryFamily(value) for value in args.query_families]
        if args.query_families
        else None
    )
    try:
        report = run_rag_runtime_evaluation(
            graph_release_id=args.graph_release_id,
            chunk_version_key=args.chunk_version_key,
            sample_size=args.sample_size,
            seed=args.seed,
            k=args.k,
            rerank_topn=args.rerank_topn,
            use_lexical=not args.no_lexical,
            use_dense_query=not args.no_dense_query,
            corpus_ids=args.corpus_ids,
            query_families=query_families,
            connect=db.pooled,
        )
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(report.model_dump_json(indent=2))
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
