"""Execution and reporting helpers for runtime evaluation."""

from __future__ import annotations

import sys
from collections.abc import Callable, Sequence
from functools import partial
from time import perf_counter

from app import db
from app.rag.grounded_runtime import build_grounded_answer_from_runtime
from app.rag.repository import PostgresRagRepository
from app.rag.response_serialization import serialize_search_result
from app.rag.runtime_profile import profile_runtime_case_sql_plans
from app.rag.schemas import RagSearchRequest
from app.rag.service import RagService
from app.rag_ingest import runtime_eval_summary as _runtime_eval_summary
from app.rag_ingest.runtime_eval_models import (
    RuntimeEvalCaseResult,
    RuntimeEvalQueryCase,
    RuntimeEvalSummary,
    RuntimeEvalTopHit,
)

_route_signature = _runtime_eval_summary._route_signature
aggregate_case_results = _runtime_eval_summary.aggregate_case_results
summarize_runtime_results = _runtime_eval_summary.summarize_runtime_results


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
    return RagService(
        repository=repository,
        graph_repository=repository.graph_repository,
        warehouse_grounder=warehouse_grounder,
    )


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
        selection_graph_paper_refs=case.selection_graph_paper_refs,
        cited_corpus_ids=case.cited_corpus_ids,
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
                stage_call_counts=debug_trace.get("stage_call_counts", {}),
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
