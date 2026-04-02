"""Prepare a graph-aware runtime-eval cohort for warehouse expansion and scoring."""

from __future__ import annotations

import argparse
from pathlib import Path

from app import db
from app.rag_ingest.corpus_ids import write_corpus_ids_file
from app.rag_ingest.runtime_eval import prepare_runtime_eval_cohort


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Prepare a graph-aware runtime-eval cohort, typically for missing "
            "warehouse coverage on the current graph release."
        )
    )
    parser.add_argument("--graph-release-id", default="current")
    parser.add_argument("--sample-size", type=int, default=192)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--min-citation-count", type=int, default=5)
    parser.add_argument(
        "--text-profile",
        dest="text_profiles",
        action="append",
        choices=["fulltext", "abstract", "unknown"],
        default=None,
        help=(
            "Allowed runtime-eval cohort text profiles. Repeat to include multiple. "
            "Defaults to fulltext + abstract."
        ),
    )
    parser.add_argument(
        "--include-existing-documents",
        action="store_true",
        help="Include graph papers that already have warehouse documents.",
    )
    parser.add_argument("--report-path", type=Path, default=None)
    parser.add_argument("--corpus-ids-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    text_profiles = args.text_profiles or ["fulltext", "abstract"]
    try:
        report = prepare_runtime_eval_cohort(
            graph_release_id=args.graph_release_id,
            sample_size=args.sample_size,
            seed=args.seed,
            missing_documents_only=not args.include_existing_documents,
            min_citation_count=args.min_citation_count,
            allowed_text_profiles=text_profiles,
            connect=db.pooled,
        )
        report_json = report.model_dump_json(indent=2)
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(report_json)
        if args.corpus_ids_path is not None:
            write_corpus_ids_file(
                args.corpus_ids_path,
                corpus_ids=[candidate.corpus_id for candidate in report.candidates],
            )
        print(report_json)
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
