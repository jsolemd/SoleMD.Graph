"""Top-level runtime search execution orchestration."""

from __future__ import annotations


from app.langfuse_config import SPAN_RAG_EXECUTE, observe
from app.rag.biomedical_reranking import RagBiomedicalReranker
from app.rag.query_embedding import RagQueryEmbedder
from app.rag.repository import RagRepository
from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.schemas import RagSearchRequest
from app.rag.search_finalize import finalize_search_result
from app.rag.search_retrieval import retrieve_search_state


@observe(name=SPAN_RAG_EXECUTE)
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
    retrieval = trace.call(
        "retrieve_search_state",
        retrieve_search_state,
        request=request,
        repository=repository,
        query_embedder=query_embedder,
        trace=trace,
    )
    result = trace.call(
        "finalize_search_result",
        finalize_search_result,
        retrieval=retrieval,
        repository=repository,
        biomedical_reranker=biomedical_reranker,
        warehouse_grounder=warehouse_grounder,
        trace=trace,
        started=started,
    )
    if trace.enabled:
        result.debug_trace = trace.as_debug_trace()
    return result
