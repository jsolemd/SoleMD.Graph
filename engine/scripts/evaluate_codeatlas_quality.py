"""Run the SoleMD.Graph CodeAtlas dogfood benchmark."""

from __future__ import annotations

import argparse
from pathlib import Path

from app.codeatlas_eval import (
    CodeAtlasClient,
    build_solemd_graph_foundation_benchmark,
    evaluate_benchmark,
    sync_required_doc_libraries,
)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run the repo-owned CodeAtlas benchmark for SoleMD.Graph across "
            "repo search, graph context, and critical external docs coverage."
        )
    )
    parser.add_argument("--base-url", default="http://localhost:8100")
    parser.add_argument("--project", default="solemd.graph")
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument(
        "--lane",
        dest="lanes",
        action="append",
        default=None,
        help="Optional benchmark lane filter. Repeat to include multiple lanes.",
    )
    parser.add_argument(
        "--sync-required-docs",
        action="store_true",
        help="Queue any missing repo-critical docs libraries before running the benchmark.",
    )
    parser.add_argument(
        "--allow-failures",
        action="store_true",
        help="Exit with code 0 even when benchmark cases fail.",
    )
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    benchmark = build_solemd_graph_foundation_benchmark(lanes=args.lanes)
    with CodeAtlasClient(
        base_url=args.base_url,
        project=args.project,
        timeout_seconds=args.timeout_seconds,
    ) as client:
        required_doc_sync = None
        if args.sync_required_docs:
            required_doc_sync = sync_required_doc_libraries(
                client=client,
                libraries=benchmark.required_doc_libraries,
            )
        report = evaluate_benchmark(
            client=client,
            benchmark=benchmark,
            required_doc_sync=required_doc_sync,
        )
    if args.report_path is not None:
        args.report_path.parent.mkdir(parents=True, exist_ok=True)
        args.report_path.write_text(report.model_dump_json(indent=2))
    print(report.model_dump_json(indent=2))
    if args.allow_failures:
        return 0
    return 0 if report.summary.failed_cases == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
