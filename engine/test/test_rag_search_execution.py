from __future__ import annotations

from types import SimpleNamespace

from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.schemas import RagSearchRequest
from app.rag.search_execution import execute_search


def test_execute_search_refreshes_debug_trace_after_finalize(monkeypatch):
    def fake_retrieve_search_state(*, request, repository, query_embedder, trace):
        trace.record_count("scope_corpus_ids", 0)
        return SimpleNamespace()

    def fake_finalize_search_result(
        *,
        retrieval,
        repository,
        biomedical_reranker,
        warehouse_grounder,
        trace,
        started,
    ):
        return SimpleNamespace(debug_trace=trace.as_debug_trace())

    monkeypatch.setattr(
        "app.rag.search_execution.retrieve_search_state",
        fake_retrieve_search_state,
    )
    monkeypatch.setattr(
        "app.rag.search_execution.finalize_search_result",
        fake_finalize_search_result,
    )

    result = execute_search(
        request=RagSearchRequest(graph_release_id="current", query="melatonin delirium"),
        repository=SimpleNamespace(),
        query_embedder=SimpleNamespace(),
        biomedical_reranker=SimpleNamespace(),
        warehouse_grounder=None,
        started=0.0,
        trace=RuntimeTraceCollector(enabled=True),
    )

    assert "retrieve_search_state" in result.debug_trace["stage_durations_ms"]
    assert "finalize_search_result" in result.debug_trace["stage_durations_ms"]
    assert result.debug_trace["stage_call_counts"]["finalize_search_result"] == 1
