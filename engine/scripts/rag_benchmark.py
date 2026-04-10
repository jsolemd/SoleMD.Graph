"""Run RAG benchmarks via Langfuse datasets.

Runs the RAG search against benchmark datasets, scores with structural
evaluators (hit@1, grounded_answer_rate, etc.), and links results to the
Langfuse dataset run UI.

Usage:
    cd engine

    # Run single benchmark
    uv run python scripts/rag_benchmark.py \
        --dataset benchmark-adversarial_router_v1 \
        --run baseline-2026-04-05

    # Run all benchmarks with diagnosis and quality gate
    uv run python scripts/rag_benchmark.py --all-benchmarks \
        --run baseline-2026-04-05 --diagnose \
        --quality-gate avg_hit_at_1=0.9,error_rate=0
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
_engine_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_engine_root))

# Load .env.local for Langfuse credentials
def _load_env_local() -> None:
    env_local = _engine_root.parent / ".env.local"
    if not env_local.exists():
        return
    for line in env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), value)


def _parse_quality_gates(raw: str | None) -> dict[str, float]:
    """Parse ``key=threshold`` pairs from the --quality-gate string."""
    if not raw:
        return {}
    gates = {}
    for pair in raw.split(","):
        pair = pair.strip()
        if "=" not in pair:
            continue
        key, _, val = pair.partition("=")
        gates[key.strip()] = float(val.strip())
    return gates


def _check_quality_gates(
    result,
    gates: dict[str, float],
    dataset_name: str = "",
    review: dict[str, float] | None = None,
    upper_bound_gates: set[str] | None = None,
) -> list[str]:
    """Check run-level evaluator scores against quality gate thresholds.

    Returns a list of failure messages (empty = all gates passed).
    """
    failures: list[str] = []
    run_scores: dict[str, float] = {}
    if hasattr(result, "run_evaluations"):
        for ev in result.run_evaluations:
            if hasattr(ev, "name") and isinstance(ev.value, (int, float)):
                run_scores[ev.name] = ev.value
    if hasattr(result, "scores") and isinstance(result.scores, dict):
        run_scores.update(result.scores)
    if review:
        run_scores.update(
            {
                key: float(value)
                for key, value in review.items()
                if isinstance(value, (int, float))
            }
        )
        run_scores.update(
            {
                "distinct_papers": float(review.get("distinct_papers") or 0),
                "distinct_titles": float(review.get("distinct_titles") or 0),
                "repeated_paper_cases": float(review.get("repeated_paper_cases") or 0),
                "repeated_title_cases": float(review.get("repeated_title_cases") or 0),
                "max_cases_per_paper": float(review.get("max_cases_per_paper") or 0),
                "max_cases_per_title": float(review.get("max_cases_per_title") or 0),
                "partition_bucket_count": float(
                    review.get("partition_bucket_count") or 0
                ),
                "source_bucket_count": float(review.get("source_bucket_count") or 0),
                "coverage_bucket_count": float(
                    review.get("coverage_bucket_count") or 0
                ),
            }
        )

    active_upper_bound_gates = {
        "error_rate",
        "repeated_paper_cases",
        "repeated_title_cases",
        "max_cases_per_paper",
        "max_cases_per_title",
    }
    if upper_bound_gates:
        active_upper_bound_gates.update(upper_bound_gates)

    for gate_name, threshold in gates.items():
        actual = run_scores.get(gate_name)
        if actual is None:
            failures.append(
                f"  GATE MISS [{dataset_name}]: {gate_name} not found in run scores"
            )
        elif gate_name in active_upper_bound_gates:
            if actual > threshold:
                failures.append(
                    f"  GATE FAIL [{dataset_name}]: {gate_name}={actual:.4f} > {threshold}"
                )
        else:
            if actual < threshold:
                failures.append(
                    f"  GATE FAIL [{dataset_name}]: {gate_name}={actual:.4f} < {threshold}"
                )
    return failures


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run RAG benchmarks via Langfuse datasets."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--dataset",
        help="Langfuse dataset name (e.g., benchmark-adversarial_router_v1)",
    )
    group.add_argument(
        "--all-benchmarks",
        action="store_true",
        help="Run all available benchmark datasets.",
    )
    parser.add_argument(
        "--run",
        required=True,
        dest="run_name",
        help="Run name (e.g., baseline-2026-04-05, post-fix-routing-v2).",
    )
    parser.add_argument("--graph-release-id", default="current")
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--rerank-topn", type=int, default=10)
    parser.add_argument("--no-lexical", action="store_true")
    parser.add_argument("--no-dense-query", action="store_true")
    parser.add_argument(
        "--max-concurrency",
        type=int,
        default=8,
        help="Max concurrent task executions per dataset (default 8).",
    )
    parser.add_argument(
        "--diagnose",
        action="store_true",
        help="Print failure diagnosis after each run.",
    )
    parser.add_argument(
        "--enqueue-failures",
        action="store_true",
        help="Add hit@1=0 traces to the rag-failure-review annotation queue.",
    )
    parser.add_argument(
        "--quality-gate",
        help=(
            "Regression gate: comma-separated key=threshold pairs. "
            "Exit 1 if any run-level score falls below its threshold. "
            "E.g. --quality-gate avg_hit_at_1=0.9,error_rate=0"
        ),
    )
    parser.add_argument(
        "--review-live",
        action="store_true",
        help="Print a live Langfuse-backed family breakdown and miss taxonomy.",
    )
    parser.add_argument(
        "--review-max-misses",
        type=int,
        default=10,
        help="Maximum miss examples to include in the live review output.",
    )
    parser.add_argument(
        "--use-suite-gates",
        action="store_true",
        help="Apply benchmark-specific default acceptance gates from the benchmark catalog.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    _load_env_local()

    from app import db
    from app.langfuse_config import ensure_score_configs
    from app.langfuse_config import flush as _langfuse_flush
    from app.rag_ingest.benchmark_catalog import (
        BenchmarkSuiteGateMode,
        benchmark_suite_gate_maps,
        get_benchmark_suite_spec,
    )
    from app.rag_ingest.experiment import (
        diagnose_experiment,
        enqueue_failures,
        ensure_annotation_queue,
        iter_all_benchmarks,
        run_benchmark,
    )
    from app.rag_ingest.langfuse_run_review import (
        format_experiment_review,
        review_experiment_result,
    )

    args = _parse_args(argv)
    gates = _parse_quality_gates(args.quality_gate)

    ensure_score_configs()
    db.get_pool(max_size=args.max_concurrency + 2)

    common_kwargs = dict(
        graph_release_id=args.graph_release_id,
        k=args.k,
        rerank_topn=args.rerank_topn,
        use_lexical=not args.no_lexical,
        use_dense_query=not args.no_dense_query,
        max_concurrency=args.max_concurrency,
        connect=db.pooled,
    )

    queue_id = None
    if args.enqueue_failures:
        queue_id = ensure_annotation_queue()
        if queue_id:
            print(f"Annotation queue ready: {queue_id}")
        else:
            print("Warning: could not create/find annotation queue")

    gate_failures: list[str] = []

    def _resolved_gates(dataset_name: str) -> tuple[dict[str, float], set[str]]:
        lower_bounds = dict(gates)
        upper_bounds: dict[str, float] = {}
        if args.use_suite_gates:
            suite_spec = get_benchmark_suite_spec(dataset_name)
            if suite_spec and suite_spec.gate_mode != BenchmarkSuiteGateMode.SHADOW:
                suite_lower, suite_upper = benchmark_suite_gate_maps(dataset_name)
                for key, value in suite_lower.items():
                    lower_bounds.setdefault(key, value)
                for key, value in suite_upper.items():
                    if key not in lower_bounds:
                        lower_bounds[key] = value
                    upper_bounds[key] = value
        return lower_bounds, set(upper_bounds)

    try:
        if args.all_benchmarks:
            completed = 0
            for name, result in iter_all_benchmarks(
                run_name=args.run_name, **common_kwargs,
            ):
                completed += 1
                review = None
                print(f"\n--- {name} ---", flush=True)
                print(result.format(), flush=True)
                if hasattr(result, "dataset_run_url") and result.dataset_run_url:
                    print(f"  Langfuse: {result.dataset_run_url}", flush=True)
                if args.diagnose:
                    print(diagnose_experiment(result), flush=True)
                if args.review_live or gates or args.use_suite_gates:
                    review = review_experiment_result(
                        result,
                        max_miss_examples=args.review_max_misses,
                    )
                if args.review_live and review is not None:
                    print(
                        format_experiment_review(review),
                        flush=True,
                    )
                if queue_id:
                    n = enqueue_failures(result, queue_id)
                    if n:
                        print(f"  Enqueued {n} failure(s) for review", flush=True)
                effective_gates, upper_bound_gates = _resolved_gates(name)
                if effective_gates:
                    gate_failures.extend(
                        _check_quality_gates(
                            result,
                            effective_gates,
                            name,
                            review=review,
                            upper_bound_gates=upper_bound_gates,
                        )
                    )
            print(f"\n{'=' * 60}")
            print(f"Completed {completed} benchmarks")
            print(f"{'=' * 60}")
        else:
            result = run_benchmark(
                dataset_name=args.dataset,
                run_name=args.run_name,
                **common_kwargs,
            )
            review = None
            print(result.format())
            if hasattr(result, "dataset_run_url") and result.dataset_run_url:
                print(f"\nLangfuse dataset run: {result.dataset_run_url}")
            if args.diagnose:
                print(f"\n{'=' * 60}")
                print("Failure Diagnosis")
                print(f"{'=' * 60}")
                print(diagnose_experiment(result))
            if args.review_live or gates or args.use_suite_gates:
                review = review_experiment_result(
                    result,
                    max_miss_examples=args.review_max_misses,
                )
            if args.review_live and review is not None:
                print(f"\n{'=' * 60}")
                print("Live Langfuse Review")
                print(f"{'=' * 60}")
                print(format_experiment_review(review))
            if queue_id:
                n = enqueue_failures(result, queue_id)
                if n:
                    print(f"\nEnqueued {n} failure(s) to annotation queue")
            effective_gates, upper_bound_gates = _resolved_gates(args.dataset or "")
            if effective_gates:
                gate_failures.extend(
                    _check_quality_gates(
                        result,
                        effective_gates,
                        args.dataset or "",
                        review=review,
                        upper_bound_gates=upper_bound_gates,
                    )
                )
    finally:
        _langfuse_flush()
        db.close_pool()

    if gate_failures:
        print(f"\n{'=' * 60}")
        print("QUALITY GATE FAILED")
        print(f"{'=' * 60}")
        for msg in gate_failures:
            print(msg)
        return 1

    if gates or args.use_suite_gates:
        gate_label = args.quality_gate or "suite-default"
        print(f"\nQuality gate passed: {gate_label}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
