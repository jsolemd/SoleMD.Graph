"""Service orchestration for the baseline evidence and RAG search."""

from __future__ import annotations

import logging
from functools import lru_cache
from time import perf_counter


from app.langfuse_config import (
    get_langfuse as _get_langfuse,
    SCORE_DURATION_MS,
    SCORE_EVIDENCE_BUNDLE_COUNT,
    SCORE_GROUNDED_ANSWER_PRESENT,
    SCORE_RETRIEVAL_PROFILE,
    SPAN_RAG_SEARCH,
    observe,
)

from app.rag.biomedical_reranking import (
    RagBiomedicalReranker,
    get_runtime_biomedical_reranker,
)
from app.rag.grounded_runtime import build_grounded_answer_from_runtime
from app.rag.query_embedding import RagQueryEmbedder, get_query_embedder
from app.rag.repository import PostgresRagRepository, RagRepository
from app.rag.response_serialization import serialize_search_result
from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.schemas import RagSearchRequest, RagSearchResponse
from app.rag.search_execution import execute_search
from app.rag.search_support import repository_search_session

def _update_langfuse_observation(request, result, trace):
    """Push the full pipeline state to the active Langfuse observation."""
    try:
        client = _get_langfuse()
        if client is None:
            return

        debug = trace.as_debug_trace()
        query = result.query
        grounded = result.grounded_answer

        # --- input: everything the runtime received ---
        client.update_current_generation(
            input={
                "query": request.query,
                "graph_release_id": request.graph_release_id,
                "scope_mode": request.scope_mode,
                "k": request.k,
                "use_lexical": request.use_lexical,
                "use_dense_query": request.use_dense_query,
                "generate_answer": request.generate_answer,
                "selected_paper_id": request.selected_paper_id,
                "evidence_intent": str(request.evidence_intent) if request.evidence_intent else None,
                "cited_corpus_ids": request.cited_corpus_ids,
                "selected_graph_paper_ref": request.selected_graph_paper_ref,
                "selection_graph_paper_refs": request.selection_graph_paper_refs,
            },
            output={
                # Answer
                "answer_model": result.answer_model,
                "answer": result.answer,
                "answer_corpus_ids": result.answer_corpus_ids,
                # Grounding
                "grounded_answer_present": grounded is not None,
                "grounded_answer_linked_corpus_ids": (
                    list(grounded.linked_corpus_ids) if grounded and hasattr(grounded, "linked_corpus_ids") else []
                ),
                "cited_span_count": grounded.cited_span_count if grounded and hasattr(grounded, "cited_span_count") else 0,
                "inline_citation_count": grounded.inline_citation_count if grounded and hasattr(grounded, "inline_citation_count") else 0,
                # Evidence bundles (top 5 with rank features)
                "evidence_bundle_count": len(result.bundles),
                "top_bundles": [
                    {
                        "corpus_id": b.paper.corpus_id,
                        "title": getattr(b.paper, "title", None),
                        "score": round(b.score, 4),
                        "rank": b.rank,
                        "matched_channels": [str(c) for c in b.matched_channels],
                        "match_reasons": b.match_reasons,
                        "rank_features": {k: round(v, 4) for k, v in b.rank_features.items()},
                        "snippet": (b.snippet[:200] + "...") if b.snippet and len(b.snippet) > 200 else b.snippet,
                    }
                    for b in result.bundles[:5]
                ],
                # Evidence flags
                "evidence_flags": result.evidence_flags,
                # Retrieval channels
                "retrieval_channels": {
                    str(ch.channel): len(ch.hits) for ch in result.channels
                },
            },
            metadata={
                # Query analysis
                "retrieval_profile": str(query.retrieval_profile),
                "clinical_intent": str(query.clinical_intent),
                "entity_terms": query.entity_terms[:10],
                "relation_terms": query.relation_terms[:10],
                "normalized_query": query.normalized_query,
                # Full RuntimeTraceCollector dump
                "stage_durations_ms": debug.get("stage_durations_ms", {}),
                "stage_call_counts": debug.get("stage_call_counts", {}),
                "candidate_counts": debug.get("candidate_counts", {}),
                "session_flags": debug.get("session_flags", {}),
                # Timing
                "duration_ms": result.duration_ms,
            },
        )

        # --- per-trace scores ---
        # route_signature is intentionally NOT a score: it's an arbitrary
        # high-cardinality string that can't fit a categorical config.
        # The full signature lives in observation metadata (session_flags).
        # For CATEGORICAL scores (retrieval_profile), always read
        # ``stringValue`` when querying the Langfuse API — the numeric
        # ``value`` field is always 0 because the SDK doesn't compute the
        # category index client-side.
        trace_id = client.get_current_trace_id()
        if trace_id:
            client.create_score(trace_id=trace_id, name=SCORE_DURATION_MS, value=result.duration_ms)
            client.create_score(trace_id=trace_id, name=SCORE_EVIDENCE_BUNDLE_COUNT, value=float(len(result.bundles)))
            client.create_score(trace_id=trace_id, name=SCORE_GROUNDED_ANSWER_PRESENT, value=1.0 if grounded else 0.0)
            client.create_score(
                trace_id=trace_id, name=SCORE_RETRIEVAL_PROFILE,
                value=str(query.retrieval_profile), data_type="CATEGORICAL",
            )

    except Exception:
        logger.debug("Langfuse observation update failed", exc_info=True)


_DENSE_QUERY_WARM_TEXT = "melatonin postoperative delirium"
_FULL_PATH_WARM_TEXT = (
    "Melatonin reduced postoperative delirium incidence in surgical patients."
)
logger = logging.getLogger(__name__)


class RagService:
    """Baseline evidence search over the canonical PostgreSQL substrate."""

    def __init__(
        self,
        repository: RagRepository | None = None,
        warehouse_grounder=None,
        query_embedder: RagQueryEmbedder | None = None,
        biomedical_reranker: RagBiomedicalReranker | None = None,
    ):
        self._repository = repository or PostgresRagRepository()
        self._query_embedder = query_embedder or get_query_embedder()
        self._biomedical_reranker = (
            biomedical_reranker or get_runtime_biomedical_reranker()
        )
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
        rerank_initialize = getattr(self._biomedical_reranker, "initialize", None)
        if callable(rerank_initialize):
            rerank_initialize()
        warm_rerank = getattr(self._biomedical_reranker, "score_pairs", None)
        if callable(warm_rerank):
            warm_rerank([[_DENSE_QUERY_WARM_TEXT, _FULL_PATH_WARM_TEXT]], batch_size=1)
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

    def biomedical_reranker_status(self) -> dict[str, object]:
        status = getattr(self._biomedical_reranker, "runtime_status", None)
        if callable(status):
            return status()
        return {"enabled": False, "ready": False, "backend": "unknown"}

    @property
    def query_embedder(self) -> RagQueryEmbedder:
        return self._query_embedder

    @observe(name=SPAN_RAG_SEARCH, as_type="generation")
    def search_result(
        self,
        request: RagSearchRequest,
        *,
        include_debug_trace: bool = False,
    ):
        # Always enable trace collector — overhead is negligible and data
        # feeds both the debug trace and Langfuse telemetry.
        started = perf_counter()
        trace = RuntimeTraceCollector(enabled=True)
        with repository_search_session(self._repository):
            result = execute_search(
                request=request,
                repository=self._repository,
                query_embedder=self._query_embedder,
                biomedical_reranker=self._biomedical_reranker,
                warehouse_grounder=self._warehouse_grounder,
                started=started,
                trace=trace,
            )

        if not include_debug_trace:
            result.debug_trace = {}

        _update_langfuse_observation(request, result, trace)
        return result

    def search(self, request: RagSearchRequest) -> RagSearchResponse:
        return serialize_search_result(self.search_result(request))


@lru_cache(maxsize=1)
def get_rag_service() -> RagService:
    """Dependency factory for the evidence service."""

    return RagService()
