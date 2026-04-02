"""Compatibility facade for runtime evaluation orchestration."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Sequence

from app import db
from app.rag.grounded_runtime import get_grounded_answer_runtime_status
from app.rag.repository import PostgresRagRepository
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_execution import (
    aggregate_case_results as _aggregate_case_results,
)
from app.rag_ingest.runtime_eval_execution import (
    attach_slow_case_plan_profiles,
    evaluate_runtime_query_cases,
    summarize_runtime_results,
)
from app.rag_ingest.runtime_eval_execution import (
    build_runtime_eval_request as _build_runtime_eval_request,
)
from app.rag_ingest.runtime_eval_execution import (
    build_runtime_service as _build_runtime_service,
)
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalBenchmarkReport,
    RagRuntimeEvalCohortReport,
    RagRuntimeEvaluationReport,
    RuntimeEvalAggregate,
    RuntimeEvalBenchmarkCase,
    RuntimeEvalCaseResult,
    RuntimeEvalCohortCandidate,
    RuntimeEvalFailureExample,
    RuntimeEvalLatencySummary,
    RuntimeEvalNumericProfile,
    RuntimeEvalPaperRecord,
    RuntimeEvalPopulationSummary,
    RuntimeEvalQueryCase,
    RuntimeEvalQueryFamily,
    RuntimeEvalSlowCase,
    RuntimeEvalSlowStage,
    RuntimeEvalSqlPlanProfile,
    RuntimeEvalSummary,
    RuntimeEvalTopHit,
    WarehouseQualitySummary,
)
from app.rag_ingest.runtime_eval_population import (
    build_runtime_eval_query_cases,
    fetch_runtime_eval_cohort_candidates,
    fetch_runtime_eval_population,
    prepare_runtime_eval_cohort,
    runtime_eval_cohort_stratum_key,
    runtime_eval_stratum_key,
    select_runtime_eval_cohort_sample,
    select_stratified_sample,
)
from app.rag_ingest.runtime_eval_population import (
    population_summary as _population_summary,
)
from app.rag_ingest.warehouse_quality import (
    PostgresWarehouseQualityLoader,
    RagWarehouseQualityReport,
    inspect_rag_warehouse_quality,
)


def summarize_warehouse_quality(
    report: RagWarehouseQualityReport,
) -> WarehouseQualitySummary:
    flag_counts = Counter()
    for paper in report.papers:
        flag_counts.update(paper.flags)
    return WarehouseQualitySummary(
        papers=len(report.papers),
        flagged_papers=len(report.flagged_corpus_ids),
        flag_counts=dict(sorted(flag_counts.items())),
    )


def _build_runtime_eval_report(
    *,
    repository: PostgresRagRepository,
    release,
    population: Sequence[RuntimeEvalPaperRecord],
    sample: Sequence[RuntimeEvalPaperRecord],
    cases: Sequence[RuntimeEvalQueryCase],
    requested_ids: Sequence[int] | None,
    missing_requested_ids: Sequence[int] | None,
    chunk_version_key: str,
    k: int,
    rerank_topn: int,
    use_lexical: bool,
    use_dense_query: bool,
    connect_fn,
) -> RagRuntimeEvaluationReport:
    case_list = list(cases)
    sample_corpus_ids = [paper.corpus_id for paper in sample]
    warehouse_quality = inspect_rag_warehouse_quality(
        corpus_ids=sample_corpus_ids,
        chunk_version_key=chunk_version_key,
        loader=PostgresWarehouseQualityLoader(connect=connect_fn),
    )
    runtime_status = get_grounded_answer_runtime_status(
        corpus_ids=sample_corpus_ids,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    service = _build_runtime_service(
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    warmup_duration_ms = service.warm()
    results = evaluate_runtime_query_cases(
        graph_release_id=release.graph_release_id,
        chunk_version_key=chunk_version_key,
        cases=case_list,
        k=k,
        rerank_topn=rerank_topn,
        use_lexical=use_lexical,
        use_dense_query=use_dense_query,
        connect=connect_fn,
        service=service,
    )
    summary = summarize_runtime_results(results)
    if isinstance(repository, PostgresRagRepository):
        summary = attach_slow_case_plan_profiles(
            summary=summary,
            cases=case_list,
            results=results,
            repository=repository,
            graph_run_id=release.graph_run_id,
            rerank_topn=rerank_topn,
            query_embedder=service.query_embedder,
        )
    query_families = list(dict.fromkeys(case.query_family for case in case_list))
    return RagRuntimeEvaluationReport(
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        use_lexical=use_lexical,
        use_dense_query=use_dense_query,
        query_families=query_families,
        population=_population_summary(
            population=population,
            sample=sample,
            requested_ids=requested_ids,
            missing_requested_ids=missing_requested_ids,
        ),
        warehouse_quality=summarize_warehouse_quality(warehouse_quality),
        grounding_runtime_status=runtime_status,
        warmup_duration_ms=warmup_duration_ms,
        query_embedder_status=service.query_embedder_status(),
        summary=summary,
        cases=results,
    )


def run_rag_runtime_evaluation(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    sample_size: int = 96,
    seed: int = 7,
    k: int = 5,
    rerank_topn: int = 10,
    use_lexical: bool = True,
    use_dense_query: bool = True,
    corpus_ids: Sequence[int] | None = None,
    query_families: Sequence[RuntimeEvalQueryFamily] | None = None,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvaluationReport:
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    requested_ids: list[int] = []
    if corpus_ids:
        requested_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        corpus_ids=requested_ids or None,
        connect=connect_fn,
    )
    missing_requested_ids: list[int] = []
    if requested_ids:
        papers_by_id = {paper.corpus_id: paper for paper in population}
        sample = [
            papers_by_id[corpus_id]
            for corpus_id in requested_ids
            if corpus_id in papers_by_id
        ]
        missing_requested_ids = [
            corpus_id for corpus_id in requested_ids if corpus_id not in papers_by_id
        ]
    else:
        sample = select_stratified_sample(
            population,
            sample_size=sample_size,
            seed=seed,
        )
    cases = build_runtime_eval_query_cases(
        sample,
        query_families=query_families,
    )
    return _build_runtime_eval_report(
        repository=repository,
        release=release,
        population=population,
        sample=sample,
        cases=cases,
        requested_ids=requested_ids,
        missing_requested_ids=missing_requested_ids,
        chunk_version_key=chunk_version_key,
        k=k,
        rerank_topn=rerank_topn,
        use_lexical=use_lexical,
        use_dense_query=use_dense_query,
        connect_fn=connect_fn,
    )


def run_rag_runtime_case_evaluation(
    *,
    cases: Sequence[RuntimeEvalQueryCase],
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    k: int = 5,
    rerank_topn: int = 10,
    use_lexical: bool = True,
    use_dense_query: bool = True,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvaluationReport:
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    case_list = list(cases)
    requested_ids = list(dict.fromkeys(case.corpus_id for case in case_list))
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        corpus_ids=requested_ids or None,
        connect=connect_fn,
    )
    papers_by_id = {paper.corpus_id: paper for paper in population}
    sample = [papers_by_id[corpus_id] for corpus_id in requested_ids if corpus_id in papers_by_id]
    missing_requested_ids = [
        corpus_id for corpus_id in requested_ids if corpus_id not in papers_by_id
    ]
    return _build_runtime_eval_report(
        repository=repository,
        release=release,
        population=population,
        sample=sample,
        cases=case_list,
        requested_ids=requested_ids,
        missing_requested_ids=missing_requested_ids,
        chunk_version_key=chunk_version_key,
        k=k,
        rerank_topn=rerank_topn,
        use_lexical=use_lexical,
        use_dense_query=use_dense_query,
        connect_fn=connect_fn,
    )


__all__ = [
    "RagRuntimeEvalCohortReport",
    "RagRuntimeEvalBenchmarkReport",
    "RagRuntimeEvaluationReport",
    "RuntimeEvalAggregate",
    "RuntimeEvalBenchmarkCase",
    "RuntimeEvalCaseResult",
    "RuntimeEvalCohortCandidate",
    "RuntimeEvalFailureExample",
    "RuntimeEvalLatencySummary",
    "RuntimeEvalNumericProfile",
    "RuntimeEvalPaperRecord",
    "RuntimeEvalPopulationSummary",
    "RuntimeEvalQueryCase",
    "RuntimeEvalQueryFamily",
    "RuntimeEvalSlowCase",
    "RuntimeEvalSlowStage",
    "RuntimeEvalSqlPlanProfile",
    "RuntimeEvalSummary",
    "RuntimeEvalTopHit",
    "WarehouseQualitySummary",
    "_aggregate_case_results",
    "_build_runtime_eval_request",
    "build_runtime_eval_query_cases",
    "evaluate_runtime_query_cases",
    "fetch_runtime_eval_cohort_candidates",
    "fetch_runtime_eval_population",
    "prepare_runtime_eval_cohort",
    "run_rag_runtime_case_evaluation",
    "run_rag_runtime_evaluation",
    "runtime_eval_cohort_stratum_key",
    "runtime_eval_stratum_key",
    "select_runtime_eval_cohort_sample",
    "select_stratified_sample",
    "summarize_runtime_results",
    "summarize_warehouse_quality",
]
