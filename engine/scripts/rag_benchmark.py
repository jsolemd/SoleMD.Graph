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
_env_local = _engine_root.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), value)

from app import db
from app.langfuse_config import ensure_score_configs
from app.langfuse_config import flush as _langfuse_flush
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

    for gate_name, threshold in gates.items():
        actual = run_scores.get(gate_name)
        if actual is None:
            failures.append(
                f"  GATE MISS [{dataset_name}]: {gate_name} not found in run scores"
            )
        elif gate_name == "error_rate":
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
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
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

    try:
        if args.all_benchmarks:
            completed = 0
            for name, result in iter_all_benchmarks(
                run_name=args.run_name, **common_kwargs,
            ):
                completed += 1
                print(f"\n--- {name} ---", flush=True)
                print(result.format(), flush=True)
                if hasattr(result, "dataset_run_url") and result.dataset_run_url:
                    print(f"  Langfuse: {result.dataset_run_url}", flush=True)
                if args.diagnose:
                    print(diagnose_experiment(result), flush=True)
                if args.review_live:
                    print(
                        format_experiment_review(
                            review_experiment_result(
                                result,
                                max_miss_examples=args.review_max_misses,
                            )
                        ),
                        flush=True,
                    )
                if queue_id:
                    n = enqueue_failures(result, queue_id)
                    if n:
                        print(f"  Enqueued {n} failure(s) for review", flush=True)
                if gates:
                    gate_failures.extend(_check_quality_gates(result, gates, name))
            print(f"\n{'=' * 60}")
            print(f"Completed {completed} benchmarks")
            print(f"{'=' * 60}")
        else:
            result = run_benchmark(
                dataset_name=args.dataset,
                run_name=args.run_name,
                **common_kwargs,
            )
            print(result.format())
            if hasattr(result, "dataset_run_url") and result.dataset_run_url:
                print(f"\nLangfuse dataset run: {result.dataset_run_url}")
            if args.diagnose:
                print(f"\n{'=' * 60}")
                print("Failure Diagnosis")
                print(f"{'=' * 60}")
                print(diagnose_experiment(result))
            if args.review_live:
                print(f"\n{'=' * 60}")
                print("Live Langfuse Review")
                print(f"{'=' * 60}")
                print(
                    format_experiment_review(
                        review_experiment_result(
                            result,
                            max_miss_examples=args.review_max_misses,
                        )
                    )
                )
            if queue_id:
                n = enqueue_failures(result, queue_id)
                if n:
                    print(f"\nEnqueued {n} failure(s) to annotation queue")
            if gates:
                gate_failures.extend(
                    _check_quality_gates(result, gates, args.dataset or "")
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

    if gates:
        print(f"\nQuality gate passed: {args.quality_gate}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
