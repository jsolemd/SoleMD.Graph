from __future__ import annotations

from app.rag_ingest.benchmark_catalog import (
    BenchmarkSuiteGateMode,
    benchmark_suite_gate_maps,
    get_benchmark_suite_spec,
)


def test_benchmark_suite_catalog_resolves_new_dataset_specs():
    spec = get_benchmark_suite_spec("benchmark-biomedical_narrative_v1")

    assert spec is not None
    assert spec.benchmark_key == "biomedical_narrative_v1"
    assert spec.target_case_count == 36
    assert spec.gate_mode == BenchmarkSuiteGateMode.SHADOW
    assert spec.dataset_name == "benchmark-biomedical_narrative_v1"


def test_benchmark_suite_gate_maps_split_lower_and_upper_bounds():
    lower_bounds, upper_bounds = benchmark_suite_gate_maps(
        "benchmark-biomedical_citation_context_v1"
    )

    assert lower_bounds["target_cited_context_rate"] == 0.99
    assert lower_bounds["hit_at_1"] == 0.99
    assert upper_bounds["p95_duration_ms"] == 150.0
