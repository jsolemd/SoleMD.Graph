"""Run-scoped Langfuse benchmark review helpers."""

from __future__ import annotations

import os
from collections import Counter
from typing import Any

from app.langfuse_config import (
    SCORE_DURATION_MS,
    SCORE_GROUNDED_ANSWER_RATE,
    SCORE_HIT_AT_1,
    SCORE_HIT_AT_K,
    SCORE_ROUTING_MATCH,
    SCORE_TARGET_IN_CORPUS,
    langfuse_api,
)
from app.rag.query_enrichment import normalize_title_key

_TARGET_SIGNAL_FIELDS = (
    "lexical_score",
    "chunk_lexical_score",
    "dense_score",
    "entity_score",
    "relation_score",
    "citation_boost",
    "title_anchor_score",
    "passage_alignment_score",
    "selected_context_score",
    "cited_context_score",
    "fused_score",
)
_TITLE_QUERY_FAMILIES = frozenset({"title_global", "title_selected"})


def _evaluation_value(item_result, name: str) -> float | None:
    for evaluation in getattr(item_result, "evaluations", []) or []:
        if getattr(evaluation, "name", None) == name and isinstance(
            getattr(evaluation, "value", None),
            (int, float),
        ):
            return float(evaluation.value)
    return None


def _percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 3)
    rank = max(0, min(len(ordered) - 1, round((len(ordered) - 1) * q)))
    return round(float(ordered[rank]), 3)


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return round(sum(values) / len(values), 3)


def _new_metric_bucket(*, include_routes: bool = False) -> dict[str, Any]:
    bucket: dict[str, Any] = {
        "hit_at_1": [],
        "hit_at_k": [],
        "grounded_answer_rate": [],
        "target_in_answer_corpus": [],
        "target_cited_context_rate": [],
        "display_author_coverage": [],
        "display_journal_coverage": [],
        "display_year_coverage": [],
        "display_study_metadata_coverage": [],
        "routing_match": [],
        "duration_ms": [],
        "miss_category_counts": Counter(),
    }
    if include_routes:
        bucket["retrieval_profile_counts"] = Counter()
        bucket["warehouse_depth_counts"] = Counter()
        bucket["route_signature_counts"] = Counter()
    return bucket


def _append_metric_bucket(
    bucket: dict[str, Any],
    *,
    hit_at_1: float,
    hit_at_k: float,
    grounded: float,
    target_in_answer: float,
    target_cited_context: float,
    display_author_coverage: float,
    display_journal_coverage: float,
    display_year_coverage: float,
    display_study_metadata_coverage: float,
    routing_match: float | None,
    duration_ms: float,
    retrieval_profile: str | None = None,
    warehouse_depth: str | None = None,
    route_signature: str | None = None,
) -> None:
    bucket["hit_at_1"].append(hit_at_1)
    bucket["hit_at_k"].append(hit_at_k)
    bucket["grounded_answer_rate"].append(grounded)
    bucket["target_in_answer_corpus"].append(target_in_answer)
    bucket["target_cited_context_rate"].append(target_cited_context)
    bucket["display_author_coverage"].append(display_author_coverage)
    bucket["display_journal_coverage"].append(display_journal_coverage)
    bucket["display_year_coverage"].append(display_year_coverage)
    bucket["display_study_metadata_coverage"].append(display_study_metadata_coverage)
    bucket["duration_ms"].append(duration_ms)
    if routing_match is not None:
        bucket["routing_match"].append(float(routing_match))
    if "retrieval_profile_counts" in bucket:
        bucket["retrieval_profile_counts"][str(retrieval_profile or "unknown")] += 1
    if "warehouse_depth_counts" in bucket:
        bucket["warehouse_depth_counts"][str(warehouse_depth or "unknown")] += 1
    if "route_signature_counts" in bucket:
        bucket["route_signature_counts"][str(route_signature or "unknown")] += 1


def _summarize_metric_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    durations = bucket["duration_ms"]
    routing_values = bucket["routing_match"]
    summary = {
        "cases": len(bucket["hit_at_1"]),
        "hit_at_1": _mean(bucket["hit_at_1"]),
        "hit_at_k": _mean(bucket["hit_at_k"]),
        "grounded_answer_rate": _mean(bucket["grounded_answer_rate"]),
        "target_in_answer_corpus": _mean(bucket["target_in_answer_corpus"]),
        "target_cited_context_rate": _mean(bucket["target_cited_context_rate"]),
        "display_author_coverage": _mean(bucket["display_author_coverage"]),
        "display_journal_coverage": _mean(bucket["display_journal_coverage"]),
        "display_year_coverage": _mean(bucket["display_year_coverage"]),
        "display_study_metadata_coverage": _mean(bucket["display_study_metadata_coverage"]),
        "routing_match": _mean(routing_values) if routing_values else None,
        "routing_match_cases": len(routing_values),
        "p50_duration_ms": _percentile(durations, 0.5),
        "p95_duration_ms": _percentile(durations, 0.95),
        "miss_category_counts": dict(sorted(bucket["miss_category_counts"].items())),
    }
    if "retrieval_profile_counts" in bucket:
        summary["retrieval_profile_counts"] = dict(
            sorted(bucket["retrieval_profile_counts"].items())
        )
    if "warehouse_depth_counts" in bucket:
        summary["warehouse_depth_counts"] = dict(sorted(bucket["warehouse_depth_counts"].items()))
    if "route_signature_counts" in bucket:
        summary["route_signature_counts"] = dict(bucket["route_signature_counts"].most_common(5))
    return summary


def _normalized_title_key(expected_output: dict[str, Any]) -> str:
    explicit_key = str(expected_output.get("normalized_title_key") or "").strip()
    if explicit_key:
        return explicit_key
    return normalize_title_key(str(expected_output.get("title") or ""))


def _has_target_signal(output: dict[str, Any]) -> bool:
    target_signals = output.get("target_signals") or {}
    lane_count = float(target_signals.get("lane_count") or 0.0)
    if lane_count > 0:
        return True
    return any(float(target_signals.get(field) or 0.0) > 0 for field in _TARGET_SIGNAL_FIELDS)


def _classify_miss(
    *,
    output: dict[str, Any],
    hit_rank: int | None,
) -> str:
    if output.get("error"):
        return "error"
    if not output.get("top_corpus_ids"):
        return "zero_bundles"
    if hit_rank and hit_rank > 1:
        return "target_visible_not_top1"
    if _has_target_signal(output):
        return "target_scored_but_not_top1"
    if output.get("warehouse_depth") == "none":
        return "no_target_signal"
    return "top1_miss"


def _trace_url(trace_id: str) -> str | None:
    response = langfuse_api("GET", f"/traces/{trace_id}")
    if not response:
        return None
    html_path = response.get("htmlPath")
    if not html_path:
        return None
    if isinstance(html_path, str) and html_path.startswith("http"):
        return html_path
    base_url = (
        os.environ.get("LANGFUSE_PUBLIC_BASE_URL")
        or os.environ.get("LANGFUSE_BASE_URL")
        or "http://localhost:3100"
    ).rstrip("/")
    return f"{base_url}{html_path}"


def review_experiment_result(
    result,
    *,
    max_miss_examples: int = 10,
    max_slow_examples: int = 10,
    fetch_trace_urls: bool = True,
) -> dict[str, Any]:
    by_family_inputs: dict[str, dict[str, Any]] = {}
    by_focus_inputs: dict[str, dict[str, Any]] = {
        "non_title_queries": _new_metric_bucket(),
        "title_queries": _new_metric_bucket(),
    }
    by_partition_inputs: dict[str, dict[str, Any]] = {}
    by_source_inputs: dict[str, dict[str, Any]] = {}
    by_coverage_inputs: dict[str, dict[str, Any]] = {}
    miss_examples: list[dict[str, Any]] = []
    slow_examples: list[dict[str, Any]] = []
    miss_category_counts: Counter[str] = Counter()
    title_key_counts: Counter[str] = Counter()
    corpus_case_counts: Counter[int] = Counter()

    total_cases = 0
    global_hit_at_1: list[float] = []
    global_hit_at_k: list[float] = []
    global_grounded: list[float] = []
    global_target_in_answer: list[float] = []
    global_target_cited_context: list[float] = []
    global_display_author_coverage: list[float] = []
    global_display_journal_coverage: list[float] = []
    global_display_year_coverage: list[float] = []
    global_display_study_metadata_coverage: list[float] = []
    global_duration_ms: list[float] = []

    for item_result in getattr(result, "item_results", []) or []:
        total_cases += 1
        item = getattr(item_result, "item", None)
        item_input = getattr(item, "input", {}) or {}
        expected_output = getattr(item, "expected_output", {}) or {}
        output = getattr(item_result, "output", {}) or {}

        family = str(item_input.get("query_family") or "unknown")
        partition = str(expected_output.get("evaluation_partition") or "unknown")
        source_system = str(expected_output.get("primary_source_system") or "unknown")
        coverage_bucket = str(expected_output.get("coverage_bucket") or "unknown")
        title_key = _normalized_title_key(expected_output)
        corpus_id = int(expected_output.get("corpus_id") or 0)
        if title_key:
            title_key_counts[title_key] += 1
        if corpus_id:
            corpus_case_counts[corpus_id] += 1

        family_bucket = by_family_inputs.setdefault(
            family,
            _new_metric_bucket(include_routes=True),
        )
        partition_bucket = by_partition_inputs.setdefault(
            partition,
            _new_metric_bucket(),
        )
        focus_bucket = by_focus_inputs[
            "title_queries" if family in _TITLE_QUERY_FAMILIES else "non_title_queries"
        ]
        source_bucket = by_source_inputs.setdefault(
            source_system,
            _new_metric_bucket(),
        )
        coverage_metrics_bucket = by_coverage_inputs.setdefault(
            coverage_bucket,
            _new_metric_bucket(),
        )

        hit_at_1 = _evaluation_value(item_result, SCORE_HIT_AT_1) or 0.0
        hit_at_k = _evaluation_value(item_result, SCORE_HIT_AT_K) or 0.0
        grounded = _evaluation_value(item_result, SCORE_GROUNDED_ANSWER_RATE) or 0.0
        target_in_answer = _evaluation_value(item_result, SCORE_TARGET_IN_CORPUS) or 0.0
        routing_match = _evaluation_value(item_result, SCORE_ROUTING_MATCH)
        duration_ms = output.get("duration_ms")
        if not isinstance(duration_ms, (int, float)):
            duration_ms = _evaluation_value(item_result, SCORE_DURATION_MS) or 0.0
        duration_ms = float(duration_ms or 0.0)
        target_signals = output.get("target_signals") or {}
        target_cited_context = (
            1.0 if float(target_signals.get("cited_context_score") or 0.0) > 0 else 0.0
        )
        display_author_coverage = float(output.get("display_author_coverage") or 0.0)
        display_journal_coverage = float(output.get("display_journal_coverage") or 0.0)
        display_year_coverage = float(output.get("display_year_coverage") or 0.0)
        display_study_metadata_coverage = float(
            output.get("display_study_metadata_coverage") or 0.0
        )

        retrieval_profile = str(output.get("retrieval_profile") or "unknown")
        warehouse_depth = str(
            output.get("warehouse_depth") or expected_output.get("warehouse_depth") or "unknown"
        )
        route_signature = str(output.get("route_signature") or "unknown")
        _append_metric_bucket(
            family_bucket,
            hit_at_1=hit_at_1,
            hit_at_k=hit_at_k,
            grounded=grounded,
            target_in_answer=target_in_answer,
            target_cited_context=target_cited_context,
            display_author_coverage=display_author_coverage,
            display_journal_coverage=display_journal_coverage,
            display_year_coverage=display_year_coverage,
            display_study_metadata_coverage=display_study_metadata_coverage,
            routing_match=routing_match,
            duration_ms=duration_ms,
            retrieval_profile=retrieval_profile,
            warehouse_depth=warehouse_depth,
            route_signature=route_signature,
        )
        _append_metric_bucket(
            partition_bucket,
            hit_at_1=hit_at_1,
            hit_at_k=hit_at_k,
            grounded=grounded,
            target_in_answer=target_in_answer,
            target_cited_context=target_cited_context,
            display_author_coverage=display_author_coverage,
            display_journal_coverage=display_journal_coverage,
            display_year_coverage=display_year_coverage,
            display_study_metadata_coverage=display_study_metadata_coverage,
            routing_match=routing_match,
            duration_ms=duration_ms,
        )
        _append_metric_bucket(
            focus_bucket,
            hit_at_1=hit_at_1,
            hit_at_k=hit_at_k,
            grounded=grounded,
            target_in_answer=target_in_answer,
            target_cited_context=target_cited_context,
            display_author_coverage=display_author_coverage,
            display_journal_coverage=display_journal_coverage,
            display_year_coverage=display_year_coverage,
            display_study_metadata_coverage=display_study_metadata_coverage,
            routing_match=routing_match,
            duration_ms=duration_ms,
        )
        _append_metric_bucket(
            source_bucket,
            hit_at_1=hit_at_1,
            hit_at_k=hit_at_k,
            grounded=grounded,
            target_in_answer=target_in_answer,
            target_cited_context=target_cited_context,
            display_author_coverage=display_author_coverage,
            display_journal_coverage=display_journal_coverage,
            display_year_coverage=display_year_coverage,
            display_study_metadata_coverage=display_study_metadata_coverage,
            routing_match=routing_match,
            duration_ms=duration_ms,
        )
        _append_metric_bucket(
            coverage_metrics_bucket,
            hit_at_1=hit_at_1,
            hit_at_k=hit_at_k,
            grounded=grounded,
            target_in_answer=target_in_answer,
            target_cited_context=target_cited_context,
            display_author_coverage=display_author_coverage,
            display_journal_coverage=display_journal_coverage,
            display_year_coverage=display_year_coverage,
            display_study_metadata_coverage=display_study_metadata_coverage,
            routing_match=routing_match,
            duration_ms=duration_ms,
        )

        global_hit_at_1.append(hit_at_1)
        global_hit_at_k.append(hit_at_k)
        global_grounded.append(grounded)
        global_target_in_answer.append(target_in_answer)
        global_target_cited_context.append(target_cited_context)
        global_display_author_coverage.append(display_author_coverage)
        global_display_journal_coverage.append(display_journal_coverage)
        global_display_year_coverage.append(display_year_coverage)
        global_display_study_metadata_coverage.append(display_study_metadata_coverage)
        global_duration_ms.append(duration_ms)
        slow_examples.append(
            {
                "query_family": family,
                "corpus_id": expected_output.get("corpus_id"),
                "title": expected_output.get("title") or item_input.get("query"),
                "query": item_input.get("query"),
                "duration_ms": duration_ms,
                "trace_id": getattr(item_result, "trace_id", None),
            }
        )

        if hit_at_1 != 0.0:
            continue

        hit_rank = output.get("hit_rank")
        if not isinstance(hit_rank, int):
            hit_rank = None
        miss_category = _classify_miss(output=output, hit_rank=hit_rank)
        miss_category_counts[miss_category] += 1
        family_bucket["miss_category_counts"][miss_category] += 1

        miss_examples.append(
            {
                "query_family": family,
                "corpus_id": expected_output.get("corpus_id"),
                "title": expected_output.get("title") or item_input.get("query"),
                "query": item_input.get("query"),
                "hit_rank": hit_rank,
                "retrieval_profile": output.get("retrieval_profile"),
                "warehouse_depth": output.get("warehouse_depth"),
                "route_signature": output.get("route_signature"),
                "evaluation_partition": partition,
                "primary_source_system": source_system,
                "coverage_bucket": coverage_bucket,
                "miss_category": miss_category,
                "trace_id": getattr(item_result, "trace_id", None),
            }
        )

    miss_examples.sort(
        key=lambda example: (
            example["query_family"],
            example["miss_category"],
            example["hit_rank"] is None,
            example["hit_rank"] or 999,
            int(example["corpus_id"] or 0),
        )
    )
    selected_misses = miss_examples[:max_miss_examples]
    slow_examples.sort(
        key=lambda example: (-float(example["duration_ms"]), int(example["corpus_id"] or 0))
    )
    selected_slow = slow_examples[:max_slow_examples]
    if fetch_trace_urls:
        for example in selected_misses:
            trace_id = example.get("trace_id")
            example["trace_url"] = _trace_url(trace_id) if trace_id else None
        for example in selected_slow:
            trace_id = example.get("trace_id")
            example["trace_url"] = _trace_url(trace_id) if trace_id else None

    by_family = {
        family: _summarize_metric_bucket(bucket)
        for family, bucket in sorted(by_family_inputs.items())
    }
    by_partition = {
        partition: _summarize_metric_bucket(bucket)
        for partition, bucket in sorted(by_partition_inputs.items())
    }
    by_focus = {
        focus: _summarize_metric_bucket(bucket) for focus, bucket in sorted(by_focus_inputs.items())
    }
    by_source = {
        source: _summarize_metric_bucket(bucket)
        for source, bucket in sorted(by_source_inputs.items())
    }
    by_coverage = {
        coverage: _summarize_metric_bucket(bucket)
        for coverage, bucket in sorted(by_coverage_inputs.items())
    }

    return {
        "dataset_run_url": getattr(result, "dataset_run_url", None),
        "cases": total_cases,
        "hit_at_1": _mean(global_hit_at_1),
        "hit_at_k": _mean(global_hit_at_k),
        "grounded_answer_rate": _mean(global_grounded),
        "target_in_answer_corpus": _mean(global_target_in_answer),
        "target_cited_context_rate": _mean(global_target_cited_context),
        "display_author_coverage": _mean(global_display_author_coverage),
        "display_journal_coverage": _mean(global_display_journal_coverage),
        "display_year_coverage": _mean(global_display_year_coverage),
        "display_study_metadata_coverage": _mean(global_display_study_metadata_coverage),
        "p50_duration_ms": _percentile(global_duration_ms, 0.5),
        "p95_duration_ms": _percentile(global_duration_ms, 0.95),
        "distinct_papers": len(corpus_case_counts),
        "distinct_corpus_ids": len(corpus_case_counts),
        "distinct_titles": len(title_key_counts),
        "distinct_title_keys": len(title_key_counts),
        "repeated_paper_cases": sum(count for count in corpus_case_counts.values() if count > 1),
        "repeated_corpus_case_count": sum(
            count for count in corpus_case_counts.values() if count > 1
        ),
        "repeated_title_cases": sum(count for count in title_key_counts.values() if count > 1),
        "repeated_title_case_count": sum(count for count in title_key_counts.values() if count > 1),
        "max_cases_per_paper": max(corpus_case_counts.values(), default=0),
        "max_cases_per_corpus": max(corpus_case_counts.values(), default=0),
        "max_cases_per_title": max(title_key_counts.values(), default=0),
        "max_cases_per_title_key": max(title_key_counts.values(), default=0),
        "partition_bucket_count": len(by_partition),
        "focus_bucket_count": len(by_focus),
        "source_bucket_count": len(by_source),
        "coverage_bucket_count": len(by_coverage),
        "title_cases": by_focus["title_queries"]["cases"],
        "title_hit_at_1": by_focus["title_queries"]["hit_at_1"],
        "title_grounded_answer_rate": by_focus["title_queries"]["grounded_answer_rate"],
        "title_display_study_metadata_coverage": by_focus["title_queries"][
            "display_study_metadata_coverage"
        ],
        "title_p95_duration_ms": by_focus["title_queries"]["p95_duration_ms"],
        "non_title_cases": by_focus["non_title_queries"]["cases"],
        "non_title_hit_at_1": by_focus["non_title_queries"]["hit_at_1"],
        "non_title_grounded_answer_rate": by_focus["non_title_queries"]["grounded_answer_rate"],
        "non_title_display_study_metadata_coverage": by_focus["non_title_queries"][
            "display_study_metadata_coverage"
        ],
        "non_title_p95_duration_ms": by_focus["non_title_queries"]["p95_duration_ms"],
        "miss_category_counts": dict(sorted(miss_category_counts.items())),
        "by_family": by_family,
        "by_focus": by_focus,
        "by_partition": by_partition,
        "by_source": by_source,
        "by_coverage": by_coverage,
        "miss_examples": selected_misses,
        "slow_examples": selected_slow,
    }


def format_experiment_review(review: dict[str, Any]) -> str:
    lines = [
        "Live Langfuse review:",
        (
            f"  cases={review['cases']} hit@1={review['hit_at_1']:.3f} "
            f"hit@k={review['hit_at_k']:.3f} grounded={review['grounded_answer_rate']:.3f} "
            f"target_in_answer={review['target_in_answer_corpus']:.3f} "
            f"target_cited_context={review['target_cited_context_rate']:.3f} "
            f"display_study_metadata={review['display_study_metadata_coverage']:.3f} "
            f"p50={review['p50_duration_ms']:.1f}ms p95={review['p95_duration_ms']:.1f}ms"
        ),
        (
            f"  distinct_papers={review['distinct_corpus_ids']} "
            f"distinct_titles={review['distinct_title_keys']} "
            f"repeated_paper_cases={review['repeated_corpus_case_count']} "
            f"repeated_title_cases={review['repeated_title_case_count']} "
            f"max_cases_per_paper={review['max_cases_per_corpus']} "
            f"max_cases_per_title={review['max_cases_per_title_key']}"
        ),
    ]
    if review.get("dataset_run_url"):
        lines.append(f"  dataset_run={review['dataset_run_url']}")
    if review.get("by_partition"):
        lines.append(f"  partitions={review['by_partition']}")
    if review.get("by_focus"):
        lines.append(f"  focus={review['by_focus']}")
    if review.get("by_source"):
        lines.append(f"  sources={review['by_source']}")
    if review.get("by_coverage"):
        lines.append(f"  coverage={review['by_coverage']}")

    for family, family_review in review.get("by_family", {}).items():
        routing_match = family_review["routing_match"]
        routing_text = f"{routing_match:.3f}" if isinstance(routing_match, (int, float)) else "n/a"
        lines.append(
            f"\n[{family}] cases={family_review['cases']} "
            f"hit@1={family_review['hit_at_1']:.3f} "
            f"hit@k={family_review['hit_at_k']:.3f} "
            f"grounded={family_review['grounded_answer_rate']:.3f} "
            f"study_meta={family_review['display_study_metadata_coverage']:.3f} "
            f"routing_match={routing_text} "
            f"p50={family_review['p50_duration_ms']:.1f}ms "
            f"p95={family_review['p95_duration_ms']:.1f}ms"
        )
        lines.append(f"  retrieval_profiles={family_review['retrieval_profile_counts']}")
        lines.append(f"  warehouse_depth={family_review['warehouse_depth_counts']}")
        if family_review["miss_category_counts"]:
            lines.append(f"  miss_categories={family_review['miss_category_counts']}")

    miss_categories = review.get("miss_category_counts") or {}
    if miss_categories:
        lines.append(f"\nMiss taxonomy: {miss_categories}")

    miss_examples = review.get("miss_examples") or []
    if miss_examples:
        lines.append("\nMiss examples:")
        for example in miss_examples:
            lines.append(
                f"  [{example['query_family']}] corpus={example['corpus_id']} "
                f"category={example['miss_category']} rank={example['hit_rank']} "
                f"profile={example['retrieval_profile']} depth={example['warehouse_depth']} "
                f"partition={example['evaluation_partition']} "
                f"source={example['primary_source_system']} "
                f"coverage={example['coverage_bucket']}"
            )
            lines.append(f"    query={example['query']}")
            if example.get("trace_url"):
                lines.append(f"    trace={example['trace_url']}")

    slow_examples = review.get("slow_examples") or []
    if slow_examples:
        lines.append("\nSlowest examples:")
        for example in slow_examples:
            lines.append(
                f"  [{example['query_family']}] corpus={example['corpus_id']} "
                f"duration={example['duration_ms']:.1f}ms"
            )
            lines.append(f"    query={example['query']}")
            if example.get("trace_url"):
                lines.append(f"    trace={example['trace_url']}")

    return "\n".join(lines)
