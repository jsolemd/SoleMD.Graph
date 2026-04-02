"""Planner-only SQL profiling for slow runtime RAG cases."""

from __future__ import annotations

from app.pgvector_utils import format_vector_literal
from app.rag.query_embedding import RagQueryEmbedder
from app.rag.query_enrichment import normalize_entity_query_text, normalize_title_key
from app.rag.query_plan import plan_hash, plan_index_names, plan_node_names
from app.rag.repository import PostgresRagRepository, _SqlSpec
from app.rag_ingest.runtime_eval_models import (
    RuntimeEvalCaseResult,
    RuntimeEvalQueryCase,
    RuntimeEvalSqlPlanProfile,
)

_MAX_PROFILED_STAGES = 3


def _explain_sql_spec(
    repository: PostgresRagRepository,
    *,
    stage: str,
    sql_spec: _SqlSpec,
) -> RuntimeEvalSqlPlanProfile:
    with repository._connect() as conn:
        with conn.cursor() as cur:
            repository._configure_search_session(cur)
            cur.execute(f"EXPLAIN (FORMAT JSON) {sql_spec.sql}", sql_spec.params)
            plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]
    return RuntimeEvalSqlPlanProfile(
        stage=stage,
        route=sql_spec.route_name,
        plan_hash=plan_hash(plan),
        node_types=plan_node_names(plan),
        index_names=plan_index_names(plan),
    )


def profile_runtime_case_sql_plans(
    repository: PostgresRagRepository,
    *,
    graph_run_id: str,
    case: RuntimeEvalQueryCase,
    result: RuntimeEvalCaseResult,
    rerank_topn: int,
    query_embedder: RagQueryEmbedder | None = None,
) -> list[RuntimeEvalSqlPlanProfile]:
    """Return planner-only profiles for the dominant SQL stages in one slow case."""

    if not result.stage_durations_ms:
        return []

    profiles: list[RuntimeEvalSqlPlanProfile] = []
    for stage_name, _duration_ms in sorted(
        result.stage_durations_ms.items(),
        key=lambda item: item[1],
        reverse=True,
    ):
        sql_spec: _SqlSpec | None = None
        if stage_name == "search_papers":
            query_text = str(result.session_flags.get("paper_search_query_text") or case.query)
            if not query_text:
                continue
            use_title_similarity = bool(
                result.session_flags.get("paper_search_use_title_similarity", True)
            )
            sql_spec = repository._paper_search_sql_spec(
                graph_run_id=graph_run_id,
                query=query_text,
                normalized_title_query=normalize_title_key(query_text),
                limit=rerank_topn,
                scope_corpus_ids=None,
                use_title_similarity=use_title_similarity,
                use_exact_graph_search=repository._should_use_exact_graph_search(graph_run_id),
            )
        elif stage_name == "search_chunk_papers":
            chunk_query = str(result.session_flags.get("chunk_search_query_text") or case.query)
            if not chunk_query:
                continue
            normalized_query = chunk_query.strip()
            if not normalized_query:
                continue
            sql_spec = repository._chunk_search_sql_spec(
                graph_run_id=graph_run_id,
                normalized_query=normalized_query,
                normalized_exact_query=normalize_entity_query_text(normalized_query),
                limit=rerank_topn,
                scope_corpus_ids=None,
            )
        elif stage_name == "search_query_embedding_papers" and query_embedder is not None:
            route_name = result.session_flags.get("dense_query_route")
            if route_name == "dense_query_in_selection":
                continue
            try:
                query_embedding = query_embedder.encode(case.query)
            except Exception:  # pragma: no cover - profiling should never fail the eval
                continue
            sql_spec = repository._dense_query_sql_spec(
                graph_run_id=graph_run_id,
                vector_literal=format_vector_literal(query_embedding),
                limit=rerank_topn,
                scope_corpus_ids=None,
            )
        if sql_spec is None:
            continue
        profiles.append(
            _explain_sql_spec(
                repository,
                stage=stage_name,
                sql_spec=sql_spec,
            )
        )
        if len(profiles) >= _MAX_PROFILED_STAGES:
            break
    return profiles
