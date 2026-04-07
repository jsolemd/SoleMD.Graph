"""Initial runtime retrieval stage for RAG search execution."""

from __future__ import annotations

from dataclasses import dataclass, replace


from app.langfuse_config import get_langfuse as _get_langfuse, SPAN_RAG_RETRIEVE, observe

from app.rag.models import GraphRelease, GraphSignal, PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_embedding import RagQueryEmbedder
from app.rag.query_enrichment import (
    build_runtime_entity_resolution_phrases,
    derive_relation_terms,
    should_seed_resolved_entity_term,
    should_use_exact_title_precheck,
)
from app.rag.repository import RagRepository
from app.rag.retrieval_fusion import merge_candidate_papers
from app.rag.retrieval_policy import (
    chunk_search_queries,
    has_selected_direct_anchor,
    should_fetch_semantic_neighbors,
    should_run_dense_query,
    should_run_paper_lexical_fallback,
    should_skip_runtime_entity_enrichment,
)
from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.schemas import RagSearchRequest
from app.rag.search_plan import RetrievalSearchPlan, build_search_plan
from app.rag.search_support import build_query, callable_supports_kwarg
from app.rag.types import QueryRetrievalProfile, RetrievalScope


@dataclass(slots=True)
class SearchRetrievalState:
    release: GraphRelease
    query: PaperRetrievalQuery
    search_plan: RetrievalSearchPlan
    scope_corpus_ids: list[int]
    selected_corpus_id: int | None
    lexical_hits: list[PaperEvidenceHit]
    chunk_lexical_hits: list[PaperEvidenceHit]
    entity_seed_hits: list[PaperEvidenceHit]
    relation_seed_hits: list[PaperEvidenceHit]
    dense_query_hits: list[PaperEvidenceHit]
    semantic_neighbors: list[GraphSignal]
    semantic_seed_hits: list[PaperEvidenceHit]
    initial_paper_hits: list[PaperEvidenceHit]


def _apply_query_enrichment(
    *,
    repository: RagRepository,
    query: PaperRetrievalQuery,
) -> PaperRetrievalQuery:
    if query.entity_terms:
        return query

    query_phrases = build_runtime_entity_resolution_phrases(
        query.query,
        retrieval_profile=query.retrieval_profile,
        normalized_query=query.normalized_query,
    )
    if not query_phrases:
        return _apply_relation_enrichment(query)

    terms, high_confidence = repository.resolve_query_entity_terms(
        query_phrases=query_phrases,
        limit=5,
    )
    query.entity_terms = terms
    query.high_confidence_entity_terms = high_confidence
    return _apply_relation_enrichment(query)


def _apply_relation_enrichment(query: PaperRetrievalQuery) -> PaperRetrievalQuery:
    if not query.relation_terms:
        query.relation_terms = derive_relation_terms(query.normalized_query)
    return query


def _lexical_query_text(query: PaperRetrievalQuery) -> str:
    if query.use_title_similarity or query.use_title_candidate_lookup:
        return query.query
    return query.normalized_query or query.query


def _paper_lexical_query_text(
    query: PaperRetrievalQuery,
    *,
    passage_fallback: bool,
) -> str:
    if passage_fallback and query.retrieval_profile in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
        return query.query
    return _lexical_query_text(query)


def _entity_seed_terms_for_recall(
    *,
    explicit_entity_terms: list[str],
    resolved_entity_terms: list[str],
    high_confidence_entity_terms: set[str] | None = None,
) -> list[str]:
    if explicit_entity_terms:
        return explicit_entity_terms
    high_conf = high_confidence_entity_terms or set()
    return [
        term
        for term in resolved_entity_terms
        if should_seed_resolved_entity_term(
            term,
            entity_confidence="high" if term in high_conf else None,
        )
    ]


def apply_selected_context_hits(
    *,
    repository: RagRepository,
    paper_hits: list[PaperEvidenceHit],
    selected_corpus_id: int | None,
    search_plan: RetrievalSearchPlan,
) -> list[PaperEvidenceHit]:
    if selected_corpus_id is None or search_plan.selected_context_bonus <= 0:
        return paper_hits

    for hit in paper_hits:
        if hit.corpus_id == selected_corpus_id:
            hit.selected_context_score = max(
                hit.selected_context_score,
                search_plan.selected_context_bonus,
            )
            return paper_hits

    if not search_plan.preserve_selected_candidate:
        return paper_hits

    selected_context_hits = repository.fetch_known_scoped_papers_by_corpus_ids(
        [selected_corpus_id]
    )
    for hit in selected_context_hits:
        hit.selected_context_score = max(
            hit.selected_context_score,
            search_plan.selected_context_bonus,
        )
    return merge_candidate_papers(
        lexical_hits=paper_hits,
        chunk_lexical_hits=[],
        selected_context_hits=selected_context_hits,
        dense_query_hits=[],
        entity_seed_hits=[],
        relation_seed_hits=[],
        citation_seed_hits=[],
        semantic_seed_hits=[],
        semantic_neighbors=[],
    )


@observe(name=SPAN_RAG_RETRIEVE)
def retrieve_search_state(
    *,
    request: RagSearchRequest,
    repository: RagRepository,
    query_embedder: RagQueryEmbedder,
    trace: RuntimeTraceCollector,
) -> SearchRetrievalState:
    release = trace.call(
        "resolve_graph_release",
        repository.resolve_graph_release,
        request.graph_release_id,
    )
    query = trace.call("build_query", build_query, request)
    search_plan = trace.call("build_search_plan", build_search_plan, query)
    explicit_entity_terms = list(query.entity_terms)
    query = trace.call("relation_enrichment", _apply_relation_enrichment, query)
    scope_corpus_ids = (
        trace.call(
            "resolve_scope_corpus_ids",
            repository.resolve_scope_corpus_ids,
            graph_run_id=release.graph_run_id,
            graph_paper_refs=query.selection_graph_paper_refs,
        )
        if query.scope_mode == RetrievalScope.SELECTION_ONLY
        else []
    )
    trace.record_count("scope_corpus_ids", len(scope_corpus_ids))
    selection_only_without_matches = (
        query.scope_mode == RetrievalScope.SELECTION_ONLY and not scope_corpus_ids
    )
    selected_corpus_id = trace.call(
        "resolve_selected_corpus_id",
        repository.resolve_selected_corpus_id,
        graph_run_id=release.graph_run_id,
        selected_graph_paper_ref=query.selected_graph_paper_ref,
        selected_paper_id=query.selected_paper_id,
        selected_node_id=query.selected_node_id,
    )
    selected_title_hits = (
        trace.call(
            "search_selected_title_papers",
            repository.search_selected_title_papers,
            release.graph_run_id,
            query.query,
            selected_corpus_id=selected_corpus_id,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )
        if query.use_lexical
        and search_plan.allow_exact_title_matches
        and selected_corpus_id is not None
        and not selection_only_without_matches
        else []
    )
    trace.record_count("selected_title_hits", len(selected_title_hits))
    if selected_title_hits:
        trace.record_flag("title_anchor_route", "selected_title")
    exact_title_hits = list(selected_title_hits)
    if (
        not exact_title_hits
        and query.use_lexical
        and search_plan.allow_exact_title_matches
        and should_use_exact_title_precheck(query.query)
        and not selection_only_without_matches
    ):
        exact_title_hits = trace.call(
            "search_exact_title_papers",
            repository.search_exact_title_papers,
            release.graph_run_id,
            query.query,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )
        if exact_title_hits:
            trace.record_flag("title_anchor_route", "exact_title")
    trace.record_count("exact_title_hits", len(exact_title_hits))
    if exact_title_hits and query.retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
        query = replace(
            query,
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        )
        search_plan = trace.call("rebuild_search_plan", build_search_plan, query)

    chunk_lexical_hits: list[PaperEvidenceHit] = []
    chunk_queries = chunk_search_queries(query)
    chunk_attempts_executed = 0
    trace.record_count("chunk_search_attempt_candidates", len(chunk_queries))
    if (
        not exact_title_hits
        and query.use_lexical
        and not selection_only_without_matches
        and query.retrieval_profile
        in (QueryRetrievalProfile.PASSAGE_LOOKUP, QueryRetrievalProfile.QUESTION_LOOKUP)
    ):
        describe_chunk_route = getattr(repository, "describe_chunk_search_route", None)
        trace.record_flag("chunk_search_queries", chunk_queries)
        for chunk_query in chunk_queries:
            chunk_attempts_executed += 1
            trace.record_flag("chunk_search_query_text", chunk_query)
            if callable(describe_chunk_route):
                trace.record_flag(
                    "chunk_search_route",
                    describe_chunk_route(
                        graph_run_id=release.graph_run_id,
                        query=chunk_query,
                        limit=query.rerank_topn,
                        scope_corpus_ids=scope_corpus_ids or None,
                    ),
                )
            chunk_lexical_hits = trace.call(
                "search_chunk_papers",
                repository.search_chunk_papers,
                release.graph_run_id,
                chunk_query,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if chunk_lexical_hits:
                break
    trace.record_count(
        "chunk_search_attempts_executed",
        chunk_attempts_executed,
    )
    trace.record_count("chunk_lexical_hits", len(chunk_lexical_hits))

    lexical_hits: list[PaperEvidenceHit] = list(exact_title_hits)
    sparse_passage_paper_fallback = (
        search_plan.retrieval_profile
        in (QueryRetrievalProfile.PASSAGE_LOOKUP, QueryRetrievalProfile.QUESTION_LOOKUP)
        and should_run_paper_lexical_fallback(
            query=query,
            search_plan=search_plan,
            lexical_hits=lexical_hits,
            chunk_lexical_hits=chunk_lexical_hits,
        )
    )
    should_run_paper_lexical = (
        not exact_title_hits
        and query.use_lexical
        and not selection_only_without_matches
        and (search_plan.use_paper_lexical or sparse_passage_paper_fallback)
    )
    if should_run_paper_lexical:
        paper_search_query_text = _paper_lexical_query_text(
            query,
            passage_fallback=sparse_passage_paper_fallback,
        )
        paper_search_use_title_similarity = (
            False if sparse_passage_paper_fallback else query.use_title_similarity
        )
        paper_search_use_title_candidate_lookup = (
            False
            if sparse_passage_paper_fallback
            else query.use_title_candidate_lookup
        )
        trace.record_flags(
            {
                "paper_search_query_text": paper_search_query_text,
                "paper_search_sparse_passage_fallback": (
                    sparse_passage_paper_fallback
                ),
                "paper_search_use_title_similarity": (
                    paper_search_use_title_similarity
                ),
                "paper_search_use_title_candidate_lookup": (
                    paper_search_use_title_candidate_lookup
                ),
            }
        )
        describe_paper_route = getattr(repository, "describe_paper_search_route", None)
        paper_search_kwargs = {
            "limit": query.rerank_topn,
            "scope_corpus_ids": scope_corpus_ids or None,
            "use_title_similarity": paper_search_use_title_similarity,
        }
        if (
            paper_search_use_title_candidate_lookup != paper_search_use_title_similarity
            and callable_supports_kwarg(
                repository.search_papers,
                "use_title_candidate_lookup",
            )
        ):
            paper_search_kwargs["use_title_candidate_lookup"] = (
                paper_search_use_title_candidate_lookup
            )
        if callable(describe_paper_route):
            describe_paper_kwargs = dict(paper_search_kwargs)
            if (
                "use_title_candidate_lookup" not in describe_paper_kwargs
                and paper_search_use_title_candidate_lookup
                != paper_search_use_title_similarity
                and callable_supports_kwarg(
                    describe_paper_route,
                    "use_title_candidate_lookup",
                )
            ):
                describe_paper_kwargs["use_title_candidate_lookup"] = (
                    paper_search_use_title_candidate_lookup
                )
            trace.record_flag(
                "paper_search_route",
                describe_paper_route(
                    graph_run_id=release.graph_run_id,
                    query=paper_search_query_text,
                    **describe_paper_kwargs,
                ),
            )
        lexical_hits = trace.call(
            "search_papers",
            repository.search_papers,
            release.graph_run_id,
            paper_search_query_text,
            **paper_search_kwargs,
        )
    trace.record_count("lexical_hits", len(lexical_hits))

    if not should_skip_runtime_entity_enrichment(query=query):
        query = trace.call(
            "query_entity_enrichment",
            _apply_query_enrichment,
            repository=repository,
            query=query,
        )
    entity_seed_terms = _entity_seed_terms_for_recall(
        explicit_entity_terms=explicit_entity_terms,
        resolved_entity_terms=query.entity_terms,
        high_confidence_entity_terms=query.high_confidence_entity_terms,
    )
    trace.record_count("entity_seed_terms", len(entity_seed_terms))
    entity_seed_hits = (
        trace.call(
            "search_entity_papers",
            repository.search_entity_papers,
            release.graph_run_id,
            entity_terms=entity_seed_terms,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )
        if entity_seed_terms and not selection_only_without_matches
        else []
    )
    trace.record_count("entity_seed_hits", len(entity_seed_hits))
    relation_seed_hits = (
        trace.call(
            "search_relation_papers",
            repository.search_relation_papers,
            release.graph_run_id,
            relation_terms=query.relation_terms,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )
        if query.relation_terms and not selection_only_without_matches
        else []
    )
    trace.record_count("relation_seed_hits", len(relation_seed_hits))
    selected_direct_anchor = has_selected_direct_anchor(
        selected_corpus_id=selected_corpus_id,
        retrieval_profile=query.retrieval_profile,
        paper_hits=[*lexical_hits, *chunk_lexical_hits],
    )
    dense_query_embedding = (
        trace.call("encode_dense_query", query_embedder.encode, query.query)
        if not selection_only_without_matches
        and should_run_dense_query(
            query=query,
            search_plan=search_plan,
            selected_direct_anchor=selected_direct_anchor,
        )
        else None
    )
    dense_query_hits = (
        trace.call(
            "search_query_embedding_papers",
            repository.search_query_embedding_papers,
            graph_run_id=release.graph_run_id,
            query_embedding=dense_query_embedding,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )
        if dense_query_embedding
        else []
    )
    if dense_query_embedding:
        describe_dense_route = getattr(repository, "describe_dense_query_route", None)
        if callable(describe_dense_route):
            dense_route = describe_dense_route(
                graph_run_id=release.graph_run_id,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            trace.record_flags(
                {
                    "dense_query_route": dense_route["route"],
                    "dense_query_candidate_limit": dense_route["candidate_limit"],
                    "dense_query_search_mode": dense_route["search_mode"],
                }
            )
    trace.record_count("dense_query_hits", len(dense_query_hits))
    semantic_neighbors = (
        trace.call(
            "fetch_semantic_neighbors",
            repository.fetch_semantic_neighbors,
            graph_run_id=release.graph_run_id,
            selected_corpus_id=selected_corpus_id,
            limit=query.rerank_topn,
            scope_corpus_ids=scope_corpus_ids or None,
        )
        if not selection_only_without_matches
        and should_fetch_semantic_neighbors(
            query=query,
            search_plan=search_plan,
            selected_corpus_id=selected_corpus_id,
            lexical_hits=lexical_hits,
            selected_direct_anchor=selected_direct_anchor,
        )
        else []
    )
    semantic_seed_ids = [
        item.corpus_id
        for item in semantic_neighbors
        if item.corpus_id
        not in {
            hit.corpus_id
            for hit in [
                *lexical_hits,
                *dense_query_hits,
                *entity_seed_hits,
                *relation_seed_hits,
            ]
        }
    ]
    semantic_seed_hits = (
        repository.fetch_known_scoped_papers_by_corpus_ids(semantic_seed_ids)
        if semantic_seed_ids
        else []
    )
    trace.record_count("semantic_neighbors", len(semantic_neighbors))
    trace.record_count("semantic_seed_hits", len(semantic_seed_hits))
    initial_paper_hits = trace.call(
        "merge_initial_candidates",
        merge_candidate_papers,
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
        selected_context_hits=[],
        dense_query_hits=dense_query_hits,
        entity_seed_hits=entity_seed_hits,
        relation_seed_hits=relation_seed_hits,
        citation_seed_hits=[],
        semantic_seed_hits=semantic_seed_hits,
        semantic_neighbors=semantic_neighbors,
    )
    initial_paper_hits = trace.call(
        "apply_selected_context_initial",
        apply_selected_context_hits,
        repository=repository,
        paper_hits=initial_paper_hits,
        selected_corpus_id=selected_corpus_id,
        search_plan=search_plan,
    )
    trace.record_count("initial_paper_hits", len(initial_paper_hits))
    trace.record_flags(
        {
            "graph_run_id": release.graph_run_id,
            "retrieval_profile": str(query.retrieval_profile),
            "scope_mode": str(query.scope_mode),
            "selected_corpus_id_present": selected_corpus_id is not None,
            "selection_only_without_matches": selection_only_without_matches,
            "selected_direct_anchor": selected_direct_anchor,
            "use_lexical": query.use_lexical,
            "use_dense_query": query.use_dense_query,
            "session_jit_disabled": getattr(repository, "_disable_session_jit", False),
        }
    )

    state = SearchRetrievalState(
        release=release,
        query=query,
        search_plan=search_plan,
        scope_corpus_ids=list(scope_corpus_ids),
        selected_corpus_id=selected_corpus_id,
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
        entity_seed_hits=entity_seed_hits,
        relation_seed_hits=relation_seed_hits,
        dense_query_hits=dense_query_hits,
        semantic_neighbors=semantic_neighbors,
        semantic_seed_hits=semantic_seed_hits,
        initial_paper_hits=initial_paper_hits,
    )

    try:
        debug = trace.as_debug_trace()
        client = _get_langfuse()
        client.update_current_span(
            input={
                "query": query.text,
                "retrieval_profile": str(query.retrieval_profile),
                "scope_mode": str(query.scope_mode),
                "selected_corpus_id": selected_corpus_id,
            },
            output={
                "candidate_count": len(initial_paper_hits),
                "lexical_hits": len(lexical_hits),
                "chunk_lexical_hits": len(chunk_lexical_hits),
                "entity_seed_hits": len(entity_seed_hits),
                "relation_seed_hits": len(relation_seed_hits),
                "dense_query_hits": len(dense_query_hits),
                "semantic_neighbor_hits": len(semantic_neighbors),
            },
            metadata={
                "stage_durations_ms": debug.get("stage_durations_ms", {}),
                "candidate_counts": debug.get("candidate_counts", {}),
            },
        )
    except Exception:
        pass

    return state
