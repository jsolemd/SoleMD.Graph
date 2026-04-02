"""Summary and route-signature helpers for runtime evaluation."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from math import ceil

from app.rag_ingest.runtime_eval_models import (
    RuntimeEvalAggregate,
    RuntimeEvalCaseResult,
    RuntimeEvalFailureExample,
    RuntimeEvalLatencySummary,
    RuntimeEvalNumericProfile,
    RuntimeEvalSlowCase,
    RuntimeEvalSlowStage,
    RuntimeEvalStageHotspot,
    RuntimeEvalSummary,
)

_TOP_LEVEL_RUNTIME_PHASES = frozenset(
    {
        "retrieve_search_state",
        "finalize_search_result",
    }
)

_ROUTE_SIGNATURE_KEYS = (
    "retrieval_profile",
    "title_anchor_route",
    "paper_search_route",
    "paper_search_sparse_passage_fallback",
    "paper_search_use_title_similarity",
    "paper_search_use_title_candidate_lookup",
    "chunk_search_route",
    "dense_query_route",
)

_ROUTE_SIGNATURE_TRUE_ONLY_FLAGS = frozenset(
    {
        "paper_search_sparse_passage_fallback",
    }
)


def _runtime_percentile_ms(values: Sequence[float], percentile: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = max(ceil(len(sorted_values) * percentile) - 1, 0)
    return round(sorted_values[index], 3)


def _numeric_profile(values: Sequence[float]) -> RuntimeEvalNumericProfile:
    if not values:
        return RuntimeEvalNumericProfile()
    return RuntimeEvalNumericProfile(
        cases=len(values),
        mean=round(sum(values) / len(values), 3),
        p50=_runtime_percentile_ms(values, 0.5),
        p95=_runtime_percentile_ms(values, 0.95),
        p99=_runtime_percentile_ms(values, 0.99),
        max=round(max(values), 3),
    )


def _route_signature(session_flags: dict[str, object]) -> str | None:
    if not session_flags:
        return None
    parts = [
        f"{key}={session_flags[key]}"
        for key in _ROUTE_SIGNATURE_KEYS
        if key in session_flags
        and session_flags.get(key) not in (None, "")
        and (
            key not in _ROUTE_SIGNATURE_TRUE_ONLY_FLAGS
            or session_flags.get(key) is True
        )
    ]
    return "|".join(parts) if parts else None


def _case_route_signature(result: RuntimeEvalCaseResult) -> str | None:
    if result.route_signature:
        return result.route_signature
    return _route_signature(result.session_flags)


def _round_rate(value: float) -> float:
    return round(value, 4)


def aggregate_case_results(results: Sequence[RuntimeEvalCaseResult]) -> RuntimeEvalAggregate:
    if not results:
        return RuntimeEvalAggregate()
    cases = len(results)
    channel_presence: Counter[str] = Counter()
    bundle_count_total = 0
    cited_span_total = 0
    hit_at_1 = 0
    hit_at_k = 0
    answer_present = 0
    answer_target = 0
    grounded = 0
    grounded_target = 0
    errors = 0
    durations: list[float] = []
    service_durations: list[float] = []
    overhead_durations: list[float] = []
    for result in results:
        if result.error:
            errors += 1
        if result.hit_rank == 1:
            hit_at_1 += 1
        if result.hit_rank is not None:
            hit_at_k += 1
        if result.answer_present:
            answer_present += 1
        if result.target_in_answer_corpus:
            answer_target += 1
        if result.grounded_answer_present:
            grounded += 1
        if result.target_in_grounded_answer:
            grounded_target += 1
        bundle_count_total += result.evidence_bundle_count
        cited_span_total += result.cited_span_count
        durations.append(result.duration_ms)
        service_durations.append(result.service_duration_ms)
        overhead_durations.append(result.overhead_duration_ms)
        for channel_name, hit_count in result.retrieval_channel_hit_counts.items():
            if hit_count > 0:
                channel_presence[channel_name] += 1
    return RuntimeEvalAggregate(
        cases=cases,
        hit_at_1_rate=_round_rate(hit_at_1 / cases),
        hit_at_k_rate=_round_rate(hit_at_k / cases),
        answer_present_rate=_round_rate(answer_present / cases),
        target_in_answer_corpus_rate=_round_rate(answer_target / cases),
        grounded_answer_rate=_round_rate(grounded / cases),
        target_in_grounded_answer_rate=_round_rate(grounded_target / cases),
        mean_bundle_count=round(bundle_count_total / cases, 3),
        mean_cited_span_count=round(cited_span_total / cases, 3),
        mean_duration_ms=round(sum(durations) / cases, 3),
        p50_duration_ms=_runtime_percentile_ms(durations, 0.5),
        p95_duration_ms=_runtime_percentile_ms(durations, 0.95),
        p99_duration_ms=_runtime_percentile_ms(durations, 0.99),
        max_duration_ms=round(max(durations), 3),
        mean_service_duration_ms=round(sum(service_durations) / cases, 3),
        p50_service_duration_ms=_runtime_percentile_ms(service_durations, 0.5),
        p95_service_duration_ms=_runtime_percentile_ms(service_durations, 0.95),
        p99_service_duration_ms=_runtime_percentile_ms(service_durations, 0.99),
        max_service_duration_ms=round(max(service_durations), 3),
        mean_overhead_duration_ms=round(sum(overhead_durations) / cases, 3),
        over_250ms_count=sum(1 for value in service_durations if value > 250.0),
        over_500ms_count=sum(1 for value in service_durations if value > 500.0),
        over_1000ms_count=sum(1 for value in service_durations if value > 1000.0),
        over_5000ms_count=sum(1 for value in service_durations if value > 5000.0),
        over_30000ms_count=sum(1 for value in service_durations if value > 30000.0),
        error_count=errors,
        retrieval_channel_presence_rates={
            channel_name: _round_rate(count / cases)
            for channel_name, count in sorted(channel_presence.items())
        },
    )


def _failure_reasons(result: RuntimeEvalCaseResult) -> list[str]:
    reasons: list[str] = []
    if result.error:
        reasons.append("error")
        return reasons
    if result.hit_rank is None:
        reasons.append("target_miss")
    elif result.evidence_intent is not None and result.hit_rank != 1:
        reasons.append("intent_target_not_top")
    if result.answer_present and not result.target_in_answer_corpus:
        reasons.append("answer_missing_target")
    if not result.grounded_answer_present:
        reasons.append("ungrounded_answer")
    elif not result.target_in_grounded_answer:
        reasons.append("grounded_answer_missing_target")
    return reasons


def _summarize_latency(
    results: Sequence[RuntimeEvalCaseResult],
) -> RuntimeEvalLatencySummary:
    if not results:
        return RuntimeEvalLatencySummary()

    phase_values: dict[str, list[float]] = {}
    stage_values: dict[str, list[float]] = {}
    stage_call_values: dict[str, list[float]] = {}
    candidate_values: dict[str, list[float]] = {}
    route_values: dict[str, list[float]] = {}
    for result in results:
        for stage_name, duration_ms in result.stage_durations_ms.items():
            if stage_name in _TOP_LEVEL_RUNTIME_PHASES:
                phase_values.setdefault(stage_name, []).append(float(duration_ms))
                continue
            stage_values.setdefault(stage_name, []).append(float(duration_ms))
        for stage_name, call_count in result.stage_call_counts.items():
            if stage_name in _TOP_LEVEL_RUNTIME_PHASES:
                continue
            stage_call_values.setdefault(stage_name, []).append(float(call_count))
        for candidate_name, count in result.candidate_counts.items():
            candidate_values.setdefault(candidate_name, []).append(float(count))
        route_signature = _case_route_signature(result)
        if route_signature:
            route_values.setdefault(route_signature, []).append(float(result.service_duration_ms))

    slow_case_limit = min(10, max(3, ceil(len(results) * 0.01)))
    sorted_slow_cases = sorted(
        results,
        key=lambda result: (
            result.service_duration_ms,
            result.duration_ms,
            result.overhead_duration_ms,
        ),
        reverse=True,
    )[:slow_case_limit]

    slow_route_counts: Counter[str] = Counter()
    slow_stage_durations: dict[str, list[float]] = {}
    slow_stage_dominance: Counter[str] = Counter()
    slow_case_payloads: list[RuntimeEvalSlowCase] = []
    for result in sorted_slow_cases:
        top_stages = [
            RuntimeEvalSlowStage(
                stage=stage_name,
                duration_ms=duration_ms,
                call_count=result.stage_call_counts.get(stage_name, 1),
            )
            for stage_name, duration_ms in sorted(
                (
                    (stage_name, duration_ms)
                    for stage_name, duration_ms in result.stage_durations_ms.items()
                    if stage_name not in _TOP_LEVEL_RUNTIME_PHASES
                ),
                key=lambda item: item[1],
                reverse=True,
            )[:5]
        ]
        route_signature = _case_route_signature(result)
        if route_signature:
            slow_route_counts[route_signature] += 1
        if top_stages:
            slow_stage_dominance[top_stages[0].stage] += 1
        for stage in top_stages:
            slow_stage_durations.setdefault(stage.stage, []).append(stage.duration_ms)
        slow_case_payloads.append(
            RuntimeEvalSlowCase(
                corpus_id=result.corpus_id,
                title=result.title,
                primary_source_system=result.primary_source_system,
                query_family=result.query_family,
                query=result.query,
                stratum_key=result.stratum_key,
                evidence_intent=result.evidence_intent,
                benchmark_labels=result.benchmark_labels,
                service_duration_ms=result.service_duration_ms,
                duration_ms=result.duration_ms,
                overhead_duration_ms=result.overhead_duration_ms,
                hit_rank=result.hit_rank,
                grounded_answer_present=result.grounded_answer_present,
                target_in_grounded_answer=result.target_in_grounded_answer,
                top_stages=top_stages,
                candidate_counts=dict(
                    sorted(
                        result.candidate_counts.items(),
                        key=lambda item: (-item[1], item[0]),
                    )
                ),
                session_flags=dict(sorted(result.session_flags.items())),
                route_signature=route_signature,
                top_hits=result.top_hits,
            )
        )

    return RuntimeEvalLatencySummary(
        phase_profiles_ms={
            stage_name: _numeric_profile(values)
            for stage_name, values in sorted(
                phase_values.items(),
                key=lambda item: (-max(item[1]), item[0]),
            )
        },
        stage_profiles_ms={
            stage_name: _numeric_profile(values)
            for stage_name, values in sorted(
                stage_values.items(),
                key=lambda item: (-max(item[1]), item[0]),
            )
        },
        stage_call_profiles={
            stage_name: _numeric_profile(values)
            for stage_name, values in sorted(
                stage_call_values.items(),
                key=lambda item: (-max(item[1]), item[0]),
            )
        },
        candidate_profiles={
            candidate_name: _numeric_profile(values)
            for candidate_name, values in sorted(
                candidate_values.items(),
                key=lambda item: (-max(item[1]), item[0]),
            )
        },
        route_profiles_ms={
            route_name: _numeric_profile(values)
            for route_name, values in sorted(
                route_values.items(),
                key=lambda item: (-max(item[1]), item[0]),
            )
        },
        slow_route_counts=dict(slow_route_counts.most_common()),
        slow_stage_hotspots=[
            RuntimeEvalStageHotspot(
                stage=stage_name,
                cases=len(values),
                dominant_cases=slow_stage_dominance.get(stage_name, 0),
                total_duration_ms=round(sum(values), 3),
                mean_duration_ms=round(sum(values) / len(values), 3),
                max_duration_ms=round(max(values), 3),
            )
            for stage_name, values in sorted(
                slow_stage_durations.items(),
                key=lambda item: (-sum(item[1]), -max(item[1]), item[0]),
            )
        ],
        slow_cases=slow_case_payloads,
    )


def summarize_runtime_results(
    results: Sequence[RuntimeEvalCaseResult],
    *,
    failure_example_limit: int = 20,
) -> RuntimeEvalSummary:
    overall = aggregate_case_results(results)
    by_query_family: dict[str, RuntimeEvalAggregate] = {}
    by_source_system: dict[str, RuntimeEvalAggregate] = {}
    by_stratum_key: dict[str, RuntimeEvalAggregate] = {}
    by_evidence_intent: dict[str, RuntimeEvalAggregate] = {}
    by_benchmark_label: dict[str, RuntimeEvalAggregate] = {}
    failure_theme_counts: Counter[str] = Counter()
    failure_examples: list[RuntimeEvalFailureExample] = []

    family_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    source_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    stratum_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    evidence_intent_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    benchmark_label_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    for result in results:
        family_groups.setdefault(str(result.query_family), []).append(result)
        source_groups.setdefault(result.primary_source_system, []).append(result)
        stratum_groups.setdefault(result.stratum_key, []).append(result)
        if result.evidence_intent is not None:
            evidence_intent_groups.setdefault(str(result.evidence_intent), []).append(result)
        for label in result.benchmark_labels:
            benchmark_label_groups.setdefault(label, []).append(result)
        reasons = _failure_reasons(result)
        for reason in reasons:
            failure_theme_counts[f"{result.query_family}:{reason}"] += 1
        if reasons and len(failure_examples) < failure_example_limit:
            failure_examples.append(
                RuntimeEvalFailureExample(
                    corpus_id=result.corpus_id,
                    title=result.title,
                    primary_source_system=result.primary_source_system,
                    query_family=result.query_family,
                    query=result.query,
                    stratum_key=result.stratum_key,
                    evidence_intent=result.evidence_intent,
                    benchmark_labels=result.benchmark_labels,
                    failure_reasons=reasons,
                    top_hits=result.top_hits,
                )
            )

    for key, grouped in family_groups.items():
        by_query_family[key] = aggregate_case_results(grouped)
    for key, grouped in source_groups.items():
        by_source_system[key] = aggregate_case_results(grouped)
    for key, grouped in sorted(stratum_groups.items()):
        by_stratum_key[key] = aggregate_case_results(grouped)
    for key, grouped in sorted(evidence_intent_groups.items()):
        by_evidence_intent[key] = aggregate_case_results(grouped)
    for key, grouped in sorted(benchmark_label_groups.items()):
        by_benchmark_label[key] = aggregate_case_results(grouped)

    return RuntimeEvalSummary(
        overall=overall,
        by_query_family=by_query_family,
        by_source_system=by_source_system,
        by_stratum_key=by_stratum_key,
        by_evidence_intent=by_evidence_intent,
        by_benchmark_label=by_benchmark_label,
        failure_theme_counts=dict(failure_theme_counts.most_common()),
        failure_examples=failure_examples,
        latency=_summarize_latency(results),
    )


__all__ = [
    "_route_signature",
    "aggregate_case_results",
    "summarize_runtime_results",
]
