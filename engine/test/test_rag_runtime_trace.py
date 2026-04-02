from __future__ import annotations

from app.rag.runtime_trace import RuntimeTraceCollector


def test_runtime_trace_collector_accumulates_repeated_stage_durations(monkeypatch):
    perf_values = iter([1.0, 1.01, 2.0, 2.025])
    monkeypatch.setattr(
        "app.rag.runtime_trace.perf_counter",
        lambda: next(perf_values),
    )

    collector = RuntimeTraceCollector(enabled=True)
    with collector.stage("search_chunk_papers"):
        pass
    with collector.stage("search_chunk_papers"):
        pass

    trace = collector.as_debug_trace()

    assert trace["stage_durations_ms"]["search_chunk_papers"] == 35.0
    assert trace["stage_call_counts"]["search_chunk_papers"] == 2
