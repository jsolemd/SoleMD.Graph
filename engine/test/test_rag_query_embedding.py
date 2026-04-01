"""Unit tests for dense-query embedder health/status surfaces."""

from __future__ import annotations

from app.rag.query_embedding import NoopQueryEmbedder, Specter2AdhocQueryEmbedder


def test_noop_query_embedder_status_reports_no_active_adapter():
    status = NoopQueryEmbedder().runtime_status()

    assert status == {
        "enabled": False,
        "ready": True,
        "backend": "noop",
        "device": None,
        "active_adapters": None,
        "error": None,
    }


def test_specter2_query_embedder_status_exposes_active_adapters():
    class DummyModel:
        active_adapters = "Stack[[QRY]]"

    embedder = Specter2AdhocQueryEmbedder(
        base_model_name="allenai/specter2_base",
        adapter_name="allenai/specter2_adhoc_query",
        cache_dir="/tmp/hf-cache",
        max_length=512,
        use_gpu=True,
    )
    embedder._runtime = (object(), DummyModel(), "cuda:0")

    status = embedder.runtime_status()

    assert status["enabled"] is True
    assert status["ready"] is True
    assert status["backend"] == "specter2_adhoc_query"
    assert status["device"] == "cuda:0"
    assert status["active_adapters"] == "Stack[[QRY]]"
    assert status["error"] is None
