"""Service orchestration for the baseline evidence and RAG search."""

from __future__ import annotations

import logging
from functools import lru_cache
from time import perf_counter

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

    def search_result(
        self,
        request: RagSearchRequest,
        *,
        include_debug_trace: bool = False,
    ):
        started = perf_counter()
        trace = RuntimeTraceCollector(enabled=include_debug_trace)
        with repository_search_session(self._repository):
            return execute_search(
                request=request,
                repository=self._repository,
                query_embedder=self._query_embedder,
                biomedical_reranker=self._biomedical_reranker,
                warehouse_grounder=self._warehouse_grounder,
                started=started,
                trace=trace,
            )

    def search(self, request: RagSearchRequest) -> RagSearchResponse:
        return serialize_search_result(self.search_result(request))


@lru_cache(maxsize=1)
def get_rag_service() -> RagService:
    """Dependency factory for the evidence service."""

    return RagService()
