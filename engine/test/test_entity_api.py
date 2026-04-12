from __future__ import annotations

from fastapi.testclient import TestClient

from app.entities.service import get_entity_service
from app.main import app


def test_match_entities_endpoint_returns_matches():
    class MatchEntityService:
        def match_entities(self, request):
            del request
            from app.entities.schemas import EntityMatchResponse, EntityTextMatch

            return EntityMatchResponse(
                matches=[
                    EntityTextMatch(
                        match_id="disease:MESH:D012559:0:14",
                        entity_type="disease",
                        concept_namespace="mesh",
                        concept_id="D012559",
                        source_identifier="MESH:D012559",
                        canonical_name="Schizophrenia",
                        matched_text="schizophrenia",
                        alias_text="schizophrenia",
                        alias_source="canonical_name",
                        is_canonical_alias=True,
                        paper_count=1200,
                        start=0,
                        end=14,
                        score=1.0,
                    )
                ]
            )

    app.dependency_overrides[get_entity_service] = lambda: MatchEntityService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/entities/match",
        json={"text": "schizophrenia"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["matches"][0]["canonical_name"] == "Schizophrenia"


def test_entity_detail_endpoint_maps_missing_entity_to_404():
    class MissingEntityService:
        def get_entity_detail(self, request):
            raise LookupError(
                f"Unknown entity detail target: {request.entity_type}:{request.source_identifier}"
            )

    app.dependency_overrides[get_entity_service] = lambda: MissingEntityService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/entities/detail",
        json={
            "entity_type": "disease",
            "source_identifier": "MESH:missing",
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown entity detail target: disease:MESH:missing"


def test_entity_overlay_endpoint_returns_graph_refs():
    class OverlayEntityService:
        def get_entity_overlay(self, request):
            del request
            from app.entities.schemas import EntityOverlayResponse

            return EntityOverlayResponse(
                graph_paper_refs=["paper:1", "corpus:2"],
            )

    app.dependency_overrides[get_entity_service] = lambda: OverlayEntityService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/entities/overlay",
        json={
            "entity_refs": [
                {
                    "entity_type": "disease",
                    "source_identifier": "MESH:D012559",
                }
            ],
            "graph_release_id": "current",
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "graph_paper_refs": ["paper:1", "corpus:2"],
    }
