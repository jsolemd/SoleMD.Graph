"""API tests for the baseline evidence endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.rag.schemas import GraphContext, RagSearchResponse, ResponseMeta
from app.rag.service import get_rag_service


class FakeService:
    def search(self, request):
        return RagSearchResponse(
            meta=ResponseMeta(
                request_id="req-test",
                generated_at="2026-03-28T00:00:00Z",
                duration_ms=12,
                retrieval_version="baseline-postgres-v1",
            ),
            graph_context=GraphContext(
                graph_release_id=request.graph_release_id,
                selected_layer_key=request.selected_layer_key,
                selected_node_id=request.selected_node_id,
                selected_paper_id=request.selected_paper_id,
                selected_cluster_id=request.selected_cluster_id,
            ),
            query=request.query,
            answer=None,
            answer_model=None,
            evidence_bundles=[],
            graph_signals=[],
            retrieval_channels=[],
        )


def test_search_evidence_endpoint_returns_typed_response():
    app.dependency_overrides[get_rag_service] = lambda: FakeService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/evidence/search",
        json={
            "graph_release_id": "release-1",
            "query": "melatonin delirium",
            "selected_layer_key": "paper",
            "selected_node_id": "paper-1",
            "k": 4,
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["request_id"] == "req-test"
    assert payload["query"] == "melatonin delirium"
    assert payload["graph_context"]["selected_layer_key"] == "paper"
