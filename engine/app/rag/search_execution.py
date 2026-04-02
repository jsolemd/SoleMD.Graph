"""Top-level runtime search execution orchestration."""

from __future__ import annotations

from app.rag.biomedical_reranking import RagBiomedicalReranker
from app.rag.query_embedding import RagQueryEmbedder
from app.rag.repository import RagRepository
from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.schemas import RagSearchRequest
from app.rag.search_finalize import finalize_search_result
from app.rag.search_retrieval import retrieve_search_state


def execute_search(
    *,
    request: RagSearchRequest,
    repository: RagRepository,
    query_embedder: RagQueryEmbedder,
    biomedical_reranker: RagBiomedicalReranker,
    warehouse_grounder: object | None,
    started: float,
    trace: RuntimeTraceCollector,
):
    retrieval = retrieve_search_state(
        request=request,
        repository=repository,
        query_embedder=query_embedder,
        trace=trace,
    )
    return finalize_search_result(
        retrieval=retrieval,
        repository=repository,
        biomedical_reranker=biomedical_reranker,
        warehouse_grounder=warehouse_grounder,
        trace=trace,
        started=started,
    )
