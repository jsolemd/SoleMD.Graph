from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace


def _load_rag_benchmark_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "rag_benchmark.py"
    spec = importlib.util.spec_from_file_location("rag_benchmark_script", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_check_quality_gates_accepts_review_metrics():
    module = _load_rag_benchmark_module()
    result = SimpleNamespace(
        run_evaluations=[SimpleNamespace(name="avg_hit_at_1", value=1.0)],
        scores={},
    )
    failures = module._check_quality_gates(
        result,
        {
            "avg_hit_at_1": 1.0,
            "repeated_paper_cases": 0.0,
            "distinct_papers": 5.0,
        },
        "benchmark-biomedical_holdout_v1",
        review={
            "distinct_papers": 48,
            "repeated_paper_cases": 0,
        },
    )

    assert failures == []


def test_check_quality_gates_fail_on_review_upper_bound_regression():
    module = _load_rag_benchmark_module()
    result = SimpleNamespace(run_evaluations=[], scores={})
    failures = module._check_quality_gates(
        result,
        {"repeated_paper_cases": 0.0},
        "benchmark-biomedical_holdout_v1",
        review={"repeated_paper_cases": 2},
    )

    assert failures == [
        "  GATE FAIL [benchmark-biomedical_holdout_v1]: repeated_paper_cases=2.0000 > 0.0"
    ]
