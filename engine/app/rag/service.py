"""Service orchestration for the baseline evidence and RAG search."""

from __future__ import annotations

import logging
from contextlib import nullcontext
from dataclasses import asdict, replace
from datetime import UTC, datetime
from functools import lru_cache
from time import perf_counter
from uuid import uuid4

from app.rag.answer import build_baseline_answer_payload
from app.rag.bundle import assemble_evidence_bundles, merge_graph_signals
from app.rag.grounded_runtime import build_grounded_answer_from_runtime
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    EvidenceBundle,
    GraphSignal,
    PaperEvidenceHit,
    PaperReferenceRecord,
    PaperRetrievalQuery,
    RagSearchResult,
    RelationMatchedPaperHit,
    RetrievalChannelHit,
    RetrievalChannelResult,
)
from app.rag.query_embedding import RagQueryEmbedder, get_query_embedder
from app.rag.query_enrichment import (
    build_entity_query_phrases,
    build_query_phrases,
    derive_relation_terms,
    determine_query_retrieval_profile,
    normalize_query_text,
    should_seed_resolved_entity_term,
)
from app.rag.ranking import rank_paper_hits
from app.rag.repository import PostgresRagRepository, RagRepository
from app.rag.retrieval_fusion import (
    build_channel_rankings,
    build_entity_channel_hits,
    build_relation_channel_hits,
    derive_citation_seed_scores,
    merge_candidate_papers,
)
from app.rag.retrieval_policy import (
    chunk_search_queries,
    citation_context_candidate_ids,
    entity_relation_candidate_ids,
    has_selected_direct_anchor,
    should_expand_citation_frontier,
    should_fetch_semantic_neighbors,
    should_prefetch_citation_contexts,
    should_run_dense_query,
    should_skip_runtime_entity_enrichment,
)
from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.schemas import GraphContext, RagSearchRequest, RagSearchResponse, ResponseMeta
from app.rag.search_plan import build_search_plan
from app.rag.types import (
    DEFAULT_RETRIEVAL_VERSION,
    RETRIEVAL_CHANNEL_ORDER,
    QueryRetrievalProfile,
    RetrievalChannel,
    RetrievalScope,
)

_DENSE_QUERY_WARM_TEXT = "melatonin postoperative delirium"
_FULL_PATH_WARM_TEXT = (
    "Melatonin reduced postoperative delirium incidence in surgical patients."
)
logger = logging.getLogger(__name__)


def _normalize_terms(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        lowered = stripped.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(stripped)
    return normalized


def _normalize_relation_terms(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        canonical = stripped.lower().replace("-", "_").replace(" ", "_")
        if canonical in seen:
            continue
        seen.add(canonical)
        normalized.append(canonical)
    return normalized


def _normalize_refs(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped or stripped in seen:
            continue
        seen.add(stripped)
        normalized.append(stripped)
    return normalized


def _apply_query_enrichment(
    *,
    repository: RagRepository,
    query: PaperRetrievalQuery,
) -> PaperRetrievalQuery:
    if query.entity_terms:
        return query

    query_phrases = list(
        dict.fromkeys(
            [
                *build_entity_query_phrases(query.query),
                *build_query_phrases(query.normalized_query),
            ]
        )
    )
    if not query_phrases:
        return _apply_relation_enrichment(query)

    query.entity_terms = repository.resolve_query_entity_terms(
        query_phrases=query_phrases,
        limit=5,
    )
    return _apply_relation_enrichment(query)


def _apply_relation_enrichment(query: PaperRetrievalQuery) -> PaperRetrievalQuery:
    if not query.relation_terms:
        query.relation_terms = derive_relation_terms(query.normalized_query)
    return query


def _lexical_query_text(query: PaperRetrievalQuery) -> str:
    if query.use_title_similarity:
        return query.query
    return query.normalized_query or query.query


def _build_query(request: RagSearchRequest) -> PaperRetrievalQuery:
    selected_graph_paper_ref = request.selected_graph_paper_ref
    if selected_graph_paper_ref is None:
        selected_graph_paper_ref = request.selected_paper_id
    if selected_graph_paper_ref is None and request.selected_layer_key == "paper":
        selected_graph_paper_ref = request.selected_node_id

    selection_graph_paper_refs = _normalize_refs(request.selection_graph_paper_refs)
    if (
        request.scope_mode == RetrievalScope.SELECTION_ONLY
        and not selection_graph_paper_refs
        and selected_graph_paper_ref
    ):
        selection_graph_paper_refs = [selected_graph_paper_ref]

    retrieval_profile = determine_query_retrieval_profile(
        request.query,
        allow_terminal_title_punctuation=bool(selected_graph_paper_ref)
        or request.selected_layer_key == "paper",
    )

    return PaperRetrievalQuery(
        graph_release_id=request.graph_release_id,
        query=request.query,
        normalized_query=normalize_query_text(request.query),
        entity_terms=_normalize_terms(request.entity_terms),
        relation_terms=_normalize_relation_terms(request.relation_terms),
        selected_layer_key=request.selected_layer_key,
        selected_node_id=request.selected_node_id,
        selected_graph_paper_ref=selected_graph_paper_ref,
        selected_paper_id=request.selected_paper_id,
        selection_graph_paper_refs=selection_graph_paper_refs,
        selected_cluster_id=request.selected_cluster_id,
        scope_mode=request.scope_mode,
        retrieval_profile=retrieval_profile,
        evidence_intent=request.evidence_intent,
        k=request.k,
        rerank_topn=max(request.k, request.rerank_topn),
        use_lexical=request.use_lexical,
        use_title_similarity=retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP,
        use_dense_query=request.use_dense_query,
        generate_answer=request.generate_answer,
    )


def _entity_seed_terms_for_recall(
    *,
    explicit_entity_terms: list[str],
    resolved_entity_terms: list[str],
) -> list[str]:
    if explicit_entity_terms:
        return explicit_entity_terms
    return [
        term for term in resolved_entity_terms if should_seed_resolved_entity_term(term)
    ]


def _paper_id_for_corpus(corpus_id: int, paper_hits: list[PaperEvidenceHit]) -> str | None:
    for paper in paper_hits:
        if paper.corpus_id == corpus_id:
            return paper.paper_id
    return None


def _apply_selected_context_hits(
    *,
    repository: RagRepository,
    paper_hits: list[PaperEvidenceHit],
    selected_corpus_id: int | None,
    search_plan,
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


def _channel_result(
    channel: RetrievalChannel,
    hits: list[RetrievalChannelHit],
) -> RetrievalChannelResult:
    return RetrievalChannelResult(channel=channel, hits=hits)


def _empty_channel_results() -> list[RetrievalChannelResult]:
    return [_channel_result(channel, []) for channel in RETRIEVAL_CHANNEL_ORDER]


def _repository_search_session(repository: RagRepository):
    session_factory = getattr(repository, "search_session", None)
    if callable(session_factory):
        return session_factory()
    return nullcontext()


class RagService:
    """Baseline evidence search over the canonical PostgreSQL substrate."""

    def __init__(
        self,
        repository: RagRepository | None = None,
        warehouse_grounder=None,
        query_embedder: RagQueryEmbedder | None = None,
    ):
        self._repository = repository or PostgresRagRepository()
        self._query_embedder = query_embedder or get_query_embedder()
        if warehouse_grounder is not None:
            self._warehouse_grounder = warehouse_grounder
        elif isinstance(self._repository, PostgresRagRepository):
            self._warehouse_grounder = build_grounded_answer_from_runtime
        else:
            self._warehouse_grounder = None

    def warm(self) -> float:
        """Warm expensive runtime adapters before serving timed requests."""

        started = perf_counter()
        initialize = getattr(self._query_embedder, "initialize", None)
        if callable(initialize):
            initialize()
        warm_encode = getattr(self._query_embedder, "encode", None)
        if callable(warm_encode):
            warm_encode(_DENSE_QUERY_WARM_TEXT)
        if isinstance(self._repository, PostgresRagRepository):
            try:
                self.search(
                    RagSearchRequest(
                        graph_release_id="current",
                        query=_FULL_PATH_WARM_TEXT,
                        k=3,
                        rerank_topn=6,
                        generate_answer=True,
                        use_lexical=True,
                        use_dense_query=True,
                    )
                )
            except Exception:  # pragma: no cover - startup/runtime integration path
                logger.exception("rag_runtime_full_path_warm_failed")
        return (perf_counter() - started) * 1000

    def query_embedder_status(self) -> dict[str, object]:
        status = getattr(self._query_embedder, "runtime_status", None)
        if callable(status):
            return status()
        return {"enabled": False, "ready": False, "backend": "unknown"}

    def search_result(
        self,
        request: RagSearchRequest,
        *,
        include_debug_trace: bool = False,
    ) -> RagSearchResult:
        started = perf_counter()
        trace = RuntimeTraceCollector(enabled=include_debug_trace)
        with _repository_search_session(self._repository):
            return self._search(request, started=started, trace=trace)

    def search(self, request: RagSearchRequest) -> RagSearchResponse:
        return serialize_search_result(self.search_result(request))

    def _search(
        self,
        request: RagSearchRequest,
        *,
        started: float,
        trace: RuntimeTraceCollector,
    ) -> RagSearchResult:
        release = trace.call(
            "resolve_graph_release",
            self._repository.resolve_graph_release,
            request.graph_release_id,
        )
        query = trace.call("build_query", _build_query, request)
        search_plan = trace.call("build_search_plan", build_search_plan, query)
        explicit_entity_terms = list(query.entity_terms)
        query = trace.call("relation_enrichment", _apply_relation_enrichment, query)
        scope_corpus_ids = (
            trace.call(
                "resolve_scope_corpus_ids",
                self._repository.resolve_scope_corpus_ids,
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
        lexical_query_text = _lexical_query_text(query)
        selected_corpus_id = trace.call(
            "resolve_selected_corpus_id",
            self._repository.resolve_selected_corpus_id,
            graph_run_id=release.graph_run_id,
            selected_graph_paper_ref=query.selected_graph_paper_ref,
            selected_paper_id=query.selected_paper_id,
            selected_node_id=query.selected_node_id,
        )
        selected_title_hits = (
            trace.call(
                "search_selected_title_papers",
                self._repository.search_selected_title_papers,
                release.graph_run_id,
                query.query,
                selected_corpus_id=selected_corpus_id,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if query.use_lexical
            and search_plan.allow_exact_title_matches
            and query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
            and selected_corpus_id is not None
            and not selection_only_without_matches
            else []
        )
        trace.record_count("selected_title_hits", len(selected_title_hits))
        exact_title_hits = list(selected_title_hits)
        if (
            not exact_title_hits
            and query.use_lexical
            and search_plan.allow_exact_title_matches
            and not query.use_title_similarity
            and not selection_only_without_matches
        ):
            exact_title_hits = trace.call(
                "search_exact_title_papers",
                self._repository.search_exact_title_papers,
                release.graph_run_id,
                query.query,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
        trace.record_count("exact_title_hits", len(exact_title_hits))
        if exact_title_hits and query.retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
            query = replace(
                query,
                retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
            )
            search_plan = trace.call("rebuild_search_plan", build_search_plan, query)

        chunk_lexical_hits: list[PaperEvidenceHit] = []
        if (
            not exact_title_hits
            and
            query.use_lexical
            and not selection_only_without_matches
            and query.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
        ):
            for chunk_query in chunk_search_queries(query):
                chunk_lexical_hits = trace.call(
                    "search_chunk_papers",
                    self._repository.search_chunk_papers,
                    release.graph_run_id,
                    chunk_query,
                    limit=query.rerank_topn,
                    scope_corpus_ids=scope_corpus_ids or None,
                )
                if chunk_lexical_hits:
                    break
        trace.record_count("chunk_lexical_hits", len(chunk_lexical_hits))
        lexical_hits: list[PaperEvidenceHit] = list(exact_title_hits)
        should_run_paper_lexical = (
            not exact_title_hits
            and
            query.use_lexical
            and not selection_only_without_matches
            and (
                search_plan.use_paper_lexical
                or (
                    search_plan.fallback_to_paper_lexical_on_empty_chunk
                    and not chunk_lexical_hits
                )
            )
        )
        if should_run_paper_lexical:
            lexical_hits = trace.call(
                "search_papers",
                self._repository.search_papers,
                release.graph_run_id,
                lexical_query_text,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
                use_title_similarity=query.use_title_similarity,
            )
        trace.record_count("lexical_hits", len(lexical_hits))
        if not should_skip_runtime_entity_enrichment(
            query=query,
            lexical_hits=lexical_hits,
        ):
            query = trace.call(
                "query_entity_enrichment",
                _apply_query_enrichment,
                repository=self._repository,
                query=query,
            )
        entity_seed_terms = _entity_seed_terms_for_recall(
            explicit_entity_terms=explicit_entity_terms,
            resolved_entity_terms=query.entity_terms,
        )
        trace.record_count("entity_seed_terms", len(entity_seed_terms))
        entity_seed_hits = (
            trace.call(
                "search_entity_papers",
                self._repository.search_entity_papers,
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
                self._repository.search_relation_papers,
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
            trace.call("encode_dense_query", self._query_embedder.encode, query.query)
            if not selection_only_without_matches
            and should_run_dense_query(
                query=query,
                search_plan=search_plan,
                lexical_hits=lexical_hits,
                selected_direct_anchor=selected_direct_anchor,
            )
            else None
        )
        dense_query_hits = (
            trace.call(
                "search_query_embedding_papers",
                self._repository.search_query_embedding_papers,
                graph_run_id=release.graph_run_id,
                query_embedding=dense_query_embedding,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if dense_query_embedding
            else []
        )
        trace.record_count("dense_query_hits", len(dense_query_hits))
        semantic_neighbors = (
            trace.call(
                "fetch_semantic_neighbors",
                self._repository.fetch_semantic_neighbors,
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
            self._repository.fetch_known_scoped_papers_by_corpus_ids(
                semantic_seed_ids,
            )
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
            _apply_selected_context_hits,
            repository=self._repository,
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
                "session_jit_disabled": getattr(
                    self._repository,
                    "_disable_session_jit",
                    False,
                ),
            }
        )
        if trace.enabled:
            embedder_status = self.query_embedder_status()
            trace.record_flags(
                {
                    "query_embedder_enabled": embedder_status.get("enabled", False),
                    "query_embedder_ready": embedder_status.get("ready", False),
                    "query_embedder_backend": embedder_status.get("backend", "unknown"),
                }
            )
        if not initial_paper_hits:
            return RagSearchResult(
                request_id=str(uuid4()),
                generated_at=datetime.now(UTC),
                duration_ms=(perf_counter() - started) * 1000,
                retrieval_version=DEFAULT_RETRIEVAL_VERSION,
                query=query,
                graph_release=release,
                bundles=[],
                graph_signals=[],
                channels=_empty_channel_results(),
                answer=None,
                answer_model=None,
                debug_trace=trace.as_debug_trace(),
            )
        initial_corpus_ids = [hit.corpus_id for hit in initial_paper_hits]
        citation_context_ids = (
            citation_context_candidate_ids(
                paper_hits=initial_paper_hits,
                retrieval_profile=query.retrieval_profile,
            )
            if should_prefetch_citation_contexts(
                query=query,
                lexical_hits=lexical_hits,
            )
            else []
        )
        trace.record_count("citation_context_ids", len(citation_context_ids))
        citation_hits = (
            trace.call(
                "fetch_citation_contexts_initial",
                self._repository.fetch_citation_contexts,
                citation_context_ids,
                query=query.query,
            )
            if citation_context_ids
            else {}
        )
        trace.record_count("citation_hit_papers", len(citation_hits))
        allowed_scope_ids = (
            set(scope_corpus_ids)
            if query.scope_mode == RetrievalScope.SELECTION_ONLY
            else None
        )
        expand_citation_frontier = should_expand_citation_frontier(
            query_text=query.query,
            lexical_hits=lexical_hits,
            search_plan=search_plan,
        )
        citation_seed_scores = (
            trace.call(
                "derive_citation_seed_scores",
                derive_citation_seed_scores,
                citation_hits=citation_hits,
                existing_corpus_ids=set(initial_corpus_ids),
                allowed_corpus_ids=allowed_scope_ids,
                limit=query.rerank_topn,
            )
            if expand_citation_frontier
            else {}
        )
        citation_seed_hits = (
            trace.call(
                "fetch_citation_seed_papers",
                self._repository.fetch_papers_by_corpus_ids,
                release.graph_run_id,
                list(citation_seed_scores),
            )
            if citation_seed_scores
            else []
        )
        trace.record_count("citation_seed_hits", len(citation_seed_hits))
        for hit in citation_seed_hits:
            hit.citation_boost = max(
                hit.citation_boost,
                citation_seed_scores.get(hit.corpus_id, 0.0),
            )
        paper_hits = trace.call(
            "merge_final_candidates",
            merge_candidate_papers,
            lexical_hits=lexical_hits,
            chunk_lexical_hits=chunk_lexical_hits,
            selected_context_hits=[],
            dense_query_hits=dense_query_hits,
            entity_seed_hits=entity_seed_hits,
            relation_seed_hits=relation_seed_hits,
            citation_seed_hits=citation_seed_hits,
            semantic_seed_hits=semantic_seed_hits,
            semantic_neighbors=semantic_neighbors,
        )
        paper_hits = trace.call(
            "apply_selected_context_final",
            _apply_selected_context_hits,
            repository=self._repository,
            paper_hits=paper_hits,
            selected_corpus_id=selected_corpus_id,
            search_plan=search_plan,
        )
        trace.record_count("paper_hits", len(paper_hits))

        channel_rankings = trace.call(
            "build_channel_rankings",
            build_channel_rankings,
            lexical_hits=lexical_hits,
            chunk_lexical_hits=chunk_lexical_hits,
            dense_query_hits=dense_query_hits,
            entity_seed_hits=entity_seed_hits,
            relation_seed_hits=relation_seed_hits,
            semantic_neighbors=semantic_neighbors,
        )

        preliminary_ranked_hits = trace.call(
            "rank_preliminary_hits",
            rank_paper_hits,
            paper_hits,
            citation_hits=citation_hits,
            entity_hits={},
            relation_hits={},
            evidence_intent=query.evidence_intent,
            query_text=query.query,
            retrieval_profile=query.retrieval_profile,
            channel_rankings=channel_rankings,
        )
        enrichment_corpus_ids = entity_relation_candidate_ids(
            ranked_papers=preliminary_ranked_hits,
            retrieval_profile=query.retrieval_profile,
            k=query.k,
            rerank_topn=query.rerank_topn,
            selected_corpus_id=selected_corpus_id,
        )
        trace.record_count("preliminary_ranked_hits", len(preliminary_ranked_hits))
        trace.record_count("enrichment_corpus_ids", len(enrichment_corpus_ids))

        expanded_citation_hits = (
            trace.call(
                "fetch_citation_contexts_expanded",
                self._repository.fetch_citation_contexts,
                [hit.corpus_id for hit in citation_seed_hits],
                query=query.query,
            )
            if citation_seed_hits
            else {}
        )
        if expanded_citation_hits:
            citation_hits = {
                **citation_hits,
                **expanded_citation_hits,
            }

        entity_hits = trace.call(
            "fetch_entity_matches",
            self._repository.fetch_entity_matches,
            enrichment_corpus_ids,
            entity_terms=query.entity_terms,
        )
        relation_hits = trace.call(
            "fetch_relation_matches",
            self._repository.fetch_relation_matches,
            enrichment_corpus_ids,
            relation_terms=query.relation_terms,
        )
        trace.record_count("entity_hit_papers", len(entity_hits))
        trace.record_count("relation_hit_papers", len(relation_hits))

        ranked_hits = trace.call(
            "rank_final_hits",
            rank_paper_hits,
            paper_hits,
            citation_hits=citation_hits,
            entity_hits=entity_hits,
            relation_hits=relation_hits,
            evidence_intent=query.evidence_intent,
            query_text=query.query,
            retrieval_profile=query.retrieval_profile,
            channel_rankings=channel_rankings,
        )
        top_hits = ranked_hits[: query.k]
        top_corpus_ids = [hit.corpus_id for hit in top_hits]
        trace.record_count("ranked_hits", len(ranked_hits))
        trace.record_count("top_hits", len(top_hits))

        missing_citation_context_ids = [
            corpus_id for corpus_id in top_corpus_ids if corpus_id not in citation_hits
        ]
        if missing_citation_context_ids:
            citation_hits = {
                **citation_hits,
                **trace.call(
                    "fetch_citation_contexts_missing_top_hits",
                    self._repository.fetch_citation_contexts,
                    missing_citation_context_ids,
                    query=query.query,
                ),
            }

        references = trace.call(
            "fetch_references",
            self._repository.fetch_references,
            top_corpus_ids,
        )
        assets = trace.call(
            "fetch_assets",
            self._repository.fetch_assets,
            top_corpus_ids,
        )

        bundles = trace.call(
            "assemble_evidence_bundles",
            assemble_evidence_bundles,
            top_hits,
            citation_hits=citation_hits,
            entity_hits=entity_hits,
            relation_hits=relation_hits,
            references=references,
            assets=assets,
        )
        graph_signals = trace.call(
            "merge_graph_signals",
            merge_graph_signals,
            bundles,
            evidence_intent=query.evidence_intent,
            semantic_neighbors=semantic_neighbors,
        )
        trace.record_count("bundle_count", len(bundles))
        trace.record_count("graph_signal_count", len(graph_signals))
        answer_payload = (
            trace.call(
                "build_answer_payload",
                build_baseline_answer_payload,
                bundles,
                evidence_intent=query.evidence_intent,
                query_text=query.normalized_query,
                query_profile=query.retrieval_profile,
                selected_corpus_id=selected_corpus_id,
            )
            if query.generate_answer
            else None
        )
        answer = answer_payload.text if answer_payload else None
        answer_model = answer_payload.model if answer_payload else None
        answer_corpus_ids = (
            list(answer_payload.grounding_corpus_ids)
            if answer_payload is not None
            else []
        )
        trace.record_count("answer_corpus_ids", len(answer_corpus_ids))
        grounded_answer = None
        if self._warehouse_grounder and answer and answer_corpus_ids:
            grounded_answer = trace.call(
                "build_grounded_answer",
                self._warehouse_grounder,
                corpus_ids=answer_corpus_ids,
                segment_texts=(
                    list(answer_payload.segment_texts)
                    if answer_payload and answer_payload.segment_texts
                    else [answer]
                ),
                segment_corpus_ids=(
                    list(answer_payload.segment_corpus_ids)
                    if answer_payload and answer_payload.segment_corpus_ids
                    else None
                ),
            )

        channels = [
            _channel_result(
                RetrievalChannel.LEXICAL,
                [
                    RetrievalChannelHit(
                        corpus_id=paper.corpus_id,
                        paper_id=paper.paper_id,
                        score=paper.lexical_score,
                        reasons=["Matched title/abstract query terms"],
                    )
                    for paper in lexical_hits[: query.k]
                ],
            ),
            _channel_result(
                RetrievalChannel.CHUNK_LEXICAL,
                [
                    RetrievalChannelHit(
                        corpus_id=paper.corpus_id,
                        paper_id=paper.paper_id,
                        score=paper.chunk_lexical_score,
                        reasons=[paper.chunk_snippet or "Matched retrieval-default chunk text"],
                    )
                    for paper in chunk_lexical_hits[: query.k]
                ],
            ),
            _channel_result(
                RetrievalChannel.DENSE_QUERY,
                [
                    RetrievalChannelHit(
                        corpus_id=paper.corpus_id,
                        paper_id=paper.paper_id,
                        score=paper.dense_score,
                        reasons=["Matched SPECTER2 ad-hoc dense query"],
                    )
                    for paper in dense_query_hits[: query.k]
                ],
            ),
            _channel_result(
                RetrievalChannel.ENTITY_MATCH,
                build_entity_channel_hits(
                    entity_seed_hits=entity_seed_hits,
                    entity_hits=entity_hits,
                    paper_hits=paper_hits,
                    entity_terms=query.entity_terms,
                ),
            ),
            _channel_result(
                RetrievalChannel.RELATION_MATCH,
                build_relation_channel_hits(
                    relation_seed_hits=relation_seed_hits,
                    relation_hits=relation_hits,
                    paper_hits=paper_hits,
                    relation_terms=query.relation_terms,
                ),
            ),
            _channel_result(
                RetrievalChannel.CITATION_CONTEXT,
                [
                    RetrievalChannelHit(
                        corpus_id=item.corpus_id,
                        paper_id=_paper_id_for_corpus(item.corpus_id, paper_hits),
                        score=item.score,
                        reasons=[item.context_text[:120]],
                    )
                    for hits in citation_hits.values()
                    for item in hits
                ],
            ),
            _channel_result(
                RetrievalChannel.SEMANTIC_NEIGHBOR,
                [
                    RetrievalChannelHit(
                        corpus_id=item.corpus_id,
                        paper_id=item.paper_id,
                        score=item.score,
                        reasons=[item.reason or "Semantic neighbor"],
                    )
                    for item in semantic_neighbors
                ],
            ),
        ]

        result = RagSearchResult(
            request_id=str(uuid4()),
            generated_at=datetime.now(UTC),
            duration_ms=(perf_counter() - started) * 1000,
            retrieval_version=DEFAULT_RETRIEVAL_VERSION,
            query=query,
            graph_release=release,
            bundles=bundles,
            graph_signals=graph_signals,
            channels=channels,
            answer_corpus_ids=answer_corpus_ids,
            answer=answer,
            answer_model=answer_model,
            grounded_answer=grounded_answer,
            debug_trace=trace.as_debug_trace(),
        )
        return result


def serialize_search_result(result: RagSearchResult) -> RagSearchResponse:
    """Convert the internal result object into the API response schema."""

    return RagSearchResponse.model_validate(
        {
            "meta": ResponseMeta(
                request_id=result.request_id,
                generated_at=result.generated_at,
                duration_ms=round(result.duration_ms),
                retrieval_version=result.retrieval_version,
            ).model_dump(),
            "graph_context": GraphContext(
                graph_release_id=result.graph_release.graph_release_id,
                graph_run_id=result.graph_release.graph_run_id,
                bundle_checksum=result.graph_release.bundle_checksum,
                graph_name=result.graph_release.graph_name,
                is_current=result.graph_release.is_current,
                selected_layer_key=result.query.selected_layer_key,
                selected_node_id=result.query.selected_node_id,
                selected_graph_paper_ref=result.query.selected_graph_paper_ref,
                selected_paper_id=result.query.selected_paper_id,
                selection_graph_paper_refs=result.query.selection_graph_paper_refs,
                selected_cluster_id=result.query.selected_cluster_id,
                scope_mode=result.query.scope_mode,
            ).model_dump(),
            "query": result.query.query,
            "answer": result.answer,
            "answer_model": result.answer_model,
            "answer_corpus_ids": result.answer_corpus_ids,
            "grounded_answer": (
                result.grounded_answer.model_dump()
                if result.grounded_answer is not None
                else None
            ),
            "evidence_bundles": [_serialize_bundle(bundle) for bundle in result.bundles],
            "graph_signals": [_serialize_graph_signal(signal) for signal in result.graph_signals],
            "retrieval_channels": [
                _serialize_channel_result(channel) for channel in result.channels
            ],
        }
    )


@lru_cache(maxsize=1)
def get_rag_service() -> RagService:
    """Dependency factory for the evidence service."""
    return RagService()


def _serialize_paper_hit(paper: PaperEvidenceHit) -> dict[str, object]:
    return {
        "corpus_id": paper.corpus_id,
        "paper_id": paper.paper_id,
        "semantic_scholar_paper_id": paper.semantic_scholar_paper_id,
        "title": paper.title,
        "journal_name": paper.journal_name,
        "year": paper.year,
        "doi": paper.doi,
        "pmid": paper.pmid,
        "pmcid": paper.pmcid,
        "abstract": paper.abstract,
        "tldr": paper.tldr,
        "text_availability": paper.text_availability,
        "is_open_access": paper.is_open_access,
        "citation_count": paper.citation_count,
        "reference_count": paper.reference_count,
    }


def _serialize_citation_hit(hit: CitationContextHit) -> dict[str, object]:
    return {
        "corpus_id": hit.corpus_id,
        "citation_id": hit.citation_id,
        "direction": hit.direction,
        "neighbor_corpus_id": hit.neighbor_corpus_id,
        "neighbor_paper_id": hit.neighbor_paper_id,
        "context_text": hit.context_text,
        "intents": hit.intents,
        "score": hit.score,
    }


def _serialize_entity_hit(hit: EntityMatchedPaperHit) -> dict[str, object]:
    return {
        "corpus_id": hit.corpus_id,
        "entity_type": hit.entity_type,
        "concept_id": hit.concept_id,
        "matched_terms": hit.matched_terms,
        "mention_count": hit.mention_count,
        "structural_span_count": hit.structural_span_count,
        "retrieval_default_mention_count": hit.retrieval_default_mention_count,
        "score": hit.score,
    }


def _serialize_relation_hit(hit: RelationMatchedPaperHit) -> dict[str, object]:
    return {
        "corpus_id": hit.corpus_id,
        "relation_type": hit.relation_type,
        "subject_type": hit.subject_type,
        "subject_id": hit.subject_id,
        "object_type": hit.object_type,
        "object_id": hit.object_id,
        "score": hit.score,
    }


def _serialize_reference(reference: PaperReferenceRecord) -> dict[str, object]:
    return asdict(reference)


def _serialize_graph_signal(signal: GraphSignal) -> dict[str, object]:
    return {
        "corpus_id": signal.corpus_id,
        "paper_id": signal.paper_id,
        "signal_kind": signal.signal_kind,
        "channel": signal.channel,
        "score": signal.score,
        "rank": signal.rank,
        "reason": signal.reason,
        "matched_terms": signal.matched_terms,
    }


def _serialize_channel_result(channel: RetrievalChannelResult) -> dict[str, object]:
    return {
        "channel": channel.channel,
        "hits": [asdict(hit) for hit in channel.hits],
    }


def _serialize_bundle(bundle: EvidenceBundle) -> dict[str, object]:
    return {
        "paper": _serialize_paper_hit(bundle.paper),
        "score": bundle.score,
        "rank": bundle.rank,
        "snippet": bundle.snippet,
        "matched_channels": bundle.matched_channels,
        "match_reasons": bundle.match_reasons,
        "rank_features": bundle.rank_features,
        "citation_contexts": [
            _serialize_citation_hit(hit) for hit in bundle.citation_contexts
        ],
        "entity_hits": [_serialize_entity_hit(hit) for hit in bundle.entity_hits],
        "relation_hits": [
            _serialize_relation_hit(hit) for hit in bundle.relation_hits
        ],
        "references": [_serialize_reference(reference) for reference in bundle.references],
        "assets": [asdict(asset) for asset in bundle.assets],
    }
