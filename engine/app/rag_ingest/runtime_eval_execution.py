"""Execution and reporting helpers for runtime evaluation."""

from __future__ import annotations

import sys
from collections import Counter
from collections.abc import Callable, Sequence
from functools import partial
from math import ceil
from time import perf_counter

from app import db
from app.rag.grounded_runtime import build_grounded_answer_from_runtime
from app.rag.repository import PostgresRagRepository
from app.rag.runtime_profile import profile_runtime_case_sql_plans
from app.rag.schemas import RagSearchRequest
from app.rag.service import RagService, serialize_search_result
from app.rag_ingest.runtime_eval_models import (
    RuntimeEvalAggregate,
    RuntimeEvalCaseResult,
    RuntimeEvalFailureExample,
    RuntimeEvalLatencySummary,
    RuntimeEvalNumericProfile,
    RuntimeEvalQueryCase,
    RuntimeEvalSlowCase,
    RuntimeEvalSlowStage,
    RuntimeEvalSummary,
    RuntimeEvalTopHit,
)


def build_runtime_service(
    *,
    chunk_version_key: str,
    connect: Callable[..., object] | None = None,
) -> RagService:
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    warehouse_grounder = partial(
        build_grounded_answer_from_runtime,
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    return RagService(repository=repository, warehouse_grounder=warehouse_grounder)


def build_runtime_eval_request(
    *,
    graph_release_id: str,
    case: RuntimeEvalQueryCase,
    k: int,
    rerank_topn: int,
    use_lexical: bool,
    use_dense_query: bool,
) -> RagSearchRequest:
    return RagSearchRequest(
        graph_release_id=graph_release_id,
        query=case.query,
        selected_layer_key=case.selected_layer_key,
        selected_node_id=case.selected_node_id,
        evidence_intent=case.evidence_intent,
        k=k,
        rerank_topn=max(k, rerank_topn),
        generate_answer=True,
        use_lexical=use_lexical,
        use_dense_query=use_dense_query,
    )


def _warm_runtime_eval_service(
    *,
    graph_release_id: str,
    case: RuntimeEvalQueryCase,
    service: RagService,
    k: int,
    rerank_topn: int,
    use_lexical: bool,
    use_dense_query: bool,
) -> None:
    service.search(
        build_runtime_eval_request(
            graph_release_id=graph_release_id,
            case=case,
            k=k,
            rerank_topn=rerank_topn,
            use_lexical=use_lexical,
            use_dense_query=use_dense_query,
        )
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
    ordered_keys = (
        "retrieval_profile",
        "title_anchor_route",
        "paper_search_route",
        "paper_search_use_title_similarity",
        "paper_search_use_title_candidate_lookup",
        "chunk_search_route",
        "dense_query_route",
    )
    parts = [
        f"{key}={session_flags[key]}"
        for key in ordered_keys
        if key in session_flags and session_flags.get(key) not in (None, "")
    ]
    return "|".join(parts) if parts else None


def _case_route_signature(result: RuntimeEvalCaseResult) -> str | None:
    if result.route_signature:
        return result.route_signature
    return _route_signature(result.session_flags)


def evaluate_runtime_query_cases(
    *,
    graph_release_id: str,
    chunk_version_key: str,
    cases: Sequence[RuntimeEvalQueryCase],
    k: int = 5,
    rerank_topn: int = 10,
    use_lexical: bool = True,
    use_dense_query: bool = True,
    connect: Callable[..., object] | None = None,
    service: RagService | None = None,
) -> list[RuntimeEvalCaseResult]:
    active_service = service or build_runtime_service(
        chunk_version_key=chunk_version_key,
        connect=connect,
    )
    results: list[RuntimeEvalCaseResult] = []
    total_cases = len(cases)
    if cases:
        try:
            _warm_runtime_eval_service(
                graph_release_id=graph_release_id,
                case=cases[0],
                service=active_service,
                k=k,
                rerank_topn=rerank_topn,
                use_lexical=use_lexical,
                use_dense_query=use_dense_query,
            )
        except Exception:  # pragma: no cover - warmup failure falls back to measured path
            pass
    for index, case in enumerate(cases, start=1):
        if index % 25 == 0 or index == total_cases:
            print(
                f"[runtime-eval] evaluated {index}/{total_cases} cases",
                file=sys.stderr,
                flush=True,
            )
        started = perf_counter()
        request = build_runtime_eval_request(
            graph_release_id=graph_release_id,
            case=case,
            k=k,
            rerank_topn=rerank_topn,
            use_lexical=use_lexical,
            use_dense_query=use_dense_query,
        )
        try:
            internal_result = None
            if isinstance(active_service, RagService):
                internal_result = active_service.search_result(
                    request,
                    include_debug_trace=True,
                )
                response = serialize_search_result(internal_result)
                service_duration_ms = float(internal_result.duration_ms)
            else:
                response = active_service.search(request)
                service_duration_ms = float(response.meta.duration_ms)
            duration_ms = (perf_counter() - started) * 1000
        except Exception as exc:  # pragma: no cover - exercised in integration runs
            duration_ms = (perf_counter() - started) * 1000
            results.append(
                RuntimeEvalCaseResult(
                    corpus_id=case.corpus_id,
                    title=case.title,
                    primary_source_system=case.primary_source_system,
                    query_family=case.query_family,
                    query=case.query,
                    stratum_key=case.stratum_key,
                    evidence_intent=case.evidence_intent,
                    benchmark_labels=case.benchmark_labels,
                    representative_section_role=case.representative_section_role,
                    duration_ms=duration_ms,
                    error=str(exc),
                )
            )
            continue

        debug_trace = internal_result.debug_trace if internal_result is not None else {}
        session_flags = debug_trace.get("session_flags", {})
        route_signature = _route_signature(session_flags)
        top_corpus_ids = [bundle.paper.corpus_id for bundle in response.evidence_bundles]
        hit_rank = None
        for rank, corpus_id in enumerate(top_corpus_ids, start=1):
            if corpus_id == case.corpus_id:
                hit_rank = rank
                break
        grounded_answer = response.grounded_answer
        grounded_ids = grounded_answer.answer_linked_corpus_ids if grounded_answer else []
        results.append(
            RuntimeEvalCaseResult(
                corpus_id=case.corpus_id,
                title=case.title,
                primary_source_system=case.primary_source_system,
                query_family=case.query_family,
                query=case.query,
                stratum_key=case.stratum_key,
                evidence_intent=case.evidence_intent,
                benchmark_labels=case.benchmark_labels,
                representative_section_role=case.representative_section_role,
                evidence_bundle_count=len(response.evidence_bundles),
                top_corpus_ids=top_corpus_ids,
                hit_rank=hit_rank,
                answer_present=bool(response.answer),
                answer_corpus_ids=response.answer_corpus_ids,
                target_in_answer_corpus=case.corpus_id in response.answer_corpus_ids,
                grounded_answer_present=grounded_answer is not None,
                grounded_answer_linked_corpus_ids=grounded_ids,
                target_in_grounded_answer=case.corpus_id in grounded_ids,
                cited_span_count=(len(grounded_answer.cited_spans) if grounded_answer else 0),
                inline_citation_count=(
                    len(grounded_answer.inline_citations) if grounded_answer else 0
                ),
                answer_segment_count=(len(grounded_answer.segments) if grounded_answer else 0),
                retrieval_channel_hit_counts={
                    channel.channel: len(channel.hits)
                    for channel in response.retrieval_channels
                },
                stage_durations_ms=debug_trace.get("stage_durations_ms", {}),
                candidate_counts=debug_trace.get("candidate_counts", {}),
                session_flags=session_flags,
                route_signature=route_signature,
                duration_ms=duration_ms,
                service_duration_ms=service_duration_ms,
                overhead_duration_ms=max(duration_ms - service_duration_ms, 0.0),
                top_hits=[
                    RuntimeEvalTopHit(
                        corpus_id=bundle.paper.corpus_id,
                        title=bundle.paper.title,
                        rank=bundle.rank,
                        score=bundle.score,
                        matched_channels=[str(channel) for channel in bundle.matched_channels],
                        match_reasons=list(bundle.match_reasons),
                        rank_features=dict(bundle.rank_features),
                    )
                    for bundle in response.evidence_bundles[:3]
                ],
            )
        )
    return results


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

    stage_values: dict[str, list[float]] = {}
    candidate_values: dict[str, list[float]] = {}
    route_values: dict[str, list[float]] = {}
    for result in results:
        for stage_name, duration_ms in result.stage_durations_ms.items():
            stage_values.setdefault(stage_name, []).append(float(duration_ms))
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

    return RuntimeEvalLatencySummary(
        stage_profiles_ms={
            stage_name: _numeric_profile(values)
            for stage_name, values in sorted(
                stage_values.items(),
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
        slow_cases=[
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
                top_stages=[
                    RuntimeEvalSlowStage(stage=stage_name, duration_ms=duration_ms)
                    for stage_name, duration_ms in sorted(
                        result.stage_durations_ms.items(),
                        key=lambda item: item[1],
                        reverse=True,
                    )[:5]
                ],
                candidate_counts=dict(
                    sorted(
                        result.candidate_counts.items(),
                        key=lambda item: (-item[1], item[0]),
                    )
                ),
                session_flags=dict(sorted(result.session_flags.items())),
                route_signature=_case_route_signature(result),
                top_hits=result.top_hits,
            )
            for result in sorted_slow_cases
        ],
        route_profiles_ms={
            route_name: _numeric_profile(values)
            for route_name, values in sorted(
                route_values.items(),
                key=lambda item: (-max(item[1]), item[0]),
            )
        },
    )


def attach_slow_case_plan_profiles(
    *,
    summary: RuntimeEvalSummary,
    cases: Sequence[RuntimeEvalQueryCase],
    results: Sequence[RuntimeEvalCaseResult],
    repository: PostgresRagRepository,
    graph_run_id: str,
    rerank_topn: int,
    query_embedder=None,
) -> RuntimeEvalSummary:
    """Attach planner-only SQL profiles to the slowest runtime cases."""

    if not summary.latency.slow_cases:
        return summary

    case_lookup = {
        (case.corpus_id, str(case.query_family), case.query): case
        for case in cases
    }
    result_lookup = {
        (result.corpus_id, str(result.query_family), result.query): result
        for result in results
    }

    for slow_case in summary.latency.slow_cases:
        key = (slow_case.corpus_id, str(slow_case.query_family), slow_case.query)
        query_case = case_lookup.get(key)
        case_result = result_lookup.get(key)
        if query_case is None or case_result is None:
            continue
        slow_case.plan_profiles = profile_runtime_case_sql_plans(
            repository,
            graph_run_id=graph_run_id,
            case=query_case,
            result=case_result,
            rerank_topn=rerank_topn,
            query_embedder=query_embedder,
        )
    return summary


def summarize_runtime_results(
    results: Sequence[RuntimeEvalCaseResult],
    *,
    failure_example_limit: int = 20,
) -> RuntimeEvalSummary:
    overall = aggregate_case_results(results)
    by_query_family: dict[str, RuntimeEvalAggregate] = {}
    by_source_system: dict[str, RuntimeEvalAggregate] = {}
    by_stratum_key: dict[str, RuntimeEvalAggregate] = {}
    failure_theme_counts: Counter[str] = Counter()
    failure_examples: list[RuntimeEvalFailureExample] = []

    family_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    source_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    stratum_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    for result in results:
        family_groups.setdefault(str(result.query_family), []).append(result)
        source_groups.setdefault(result.primary_source_system, []).append(result)
        stratum_groups.setdefault(result.stratum_key, []).append(result)
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

    return RuntimeEvalSummary(
        overall=overall,
        by_query_family=by_query_family,
        by_source_system=by_source_system,
        by_stratum_key=by_stratum_key,
        failure_theme_counts=dict(failure_theme_counts.most_common()),
        failure_examples=failure_examples,
        latency=_summarize_latency(results),
    )
