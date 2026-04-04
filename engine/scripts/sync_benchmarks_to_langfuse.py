#!/usr/bin/env python3
"""Sync frozen benchmark fixtures to Langfuse Datasets.

Reads engine/data/runtime_eval_benchmarks/*.json and creates/updates
matching Langfuse datasets. Each benchmark case becomes a dataset item
with input (query, query_family, evidence_intent) and expected output
(corpus_id, title).

Usage:
    cd engine && uv run python scripts/sync_benchmarks_to_langfuse.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Add engine to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    try:
        from langfuse import Langfuse
    except ImportError:
        print("langfuse not installed, skipping sync", file=sys.stderr)
        return

    try:
        client = Langfuse()
    except Exception as exc:
        print(f"Langfuse not configured: {exc}", file=sys.stderr)
        return

    from app.rag_ingest.runtime_eval_models import RagRuntimeEvalBenchmarkReport

    benchmark_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_eval_benchmarks"
    benchmark_paths = sorted(benchmark_dir.glob("*.json"))

    if not benchmark_paths:
        print("No benchmark files found", file=sys.stderr)
        return

    for path in benchmark_paths:
        report = RagRuntimeEvalBenchmarkReport.model_validate_json(path.read_text())
        dataset_name = f"benchmark-{report.benchmark_key}"

        print(f"Syncing {path.name} -> dataset '{dataset_name}' ({len(report.cases)} cases)")

        client.create_dataset(
            name=dataset_name,
            description=(
                f"Frozen benchmark: {report.benchmark_key}. "
                f"Source: {path.name}. "
                f"Graph: {report.graph_name}. "
                f"Cases: {report.selected_count}."
            ),
            metadata={"benchmark_key": report.benchmark_key, "source_file": path.name},
        )

        for case in report.cases:
            input_data = {
                "query": case.query,
                "query_family": str(case.query_family),
                "evidence_intent": str(case.evidence_intent) if case.evidence_intent else None,
                "benchmark_labels": case.benchmark_labels,
            }
            expected_output = {
                "corpus_id": case.corpus_id,
                "title": case.title,
            }
            client.create_dataset_item(
                dataset_name=dataset_name,
                input=input_data,
                expected_output=expected_output,
                metadata={
                    "primary_source_system": case.primary_source_system,
                    "stratum_key": case.stratum_key,
                    "benchmark_key": case.benchmark_key,
                },
            )

        print(f"  Done: {len(report.cases)} items synced")

    client.flush()
    print("Done.")


if __name__ == "__main__":
    main()
