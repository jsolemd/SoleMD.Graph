from __future__ import annotations

from io import BytesIO

import pyarrow.ipc as pa_ipc
from fastapi.testclient import TestClient

from app.graph.attachment import (
    GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
    get_graph_point_attachment_service,
)
from app.main import app


class FakeAttachmentService:
    def attach_points(self, request):
        del request
        return b"placeholder"


def test_attach_graph_points_endpoint_returns_arrow_payload():
    class ArrowAttachmentService:
        def attach_points(self, request):
            del request
            from app.graph.attachment import encode_point_rows_arrow_ipc

            return encode_point_rows_arrow_ipc(
                [
                    {
                        "point_index": 7,
                        "id": "paper:7",
                        "paper_id": "paper:7",
                        "hex_color": "#555555",
                        "hex_color_light": "#999999",
                        "x": 0.5,
                        "y": 1.5,
                        "cluster_id": 0,
                        "cluster_label": None,
                        "title": "Attached paper",
                        "citekey": None,
                        "journal": "J",
                        "year": 2024,
                        "display_label": "Attached paper",
                        "semantic_groups_csv": None,
                        "relation_categories_csv": None,
                        "is_in_base": False,
                        "base_rank": 0.0,
                        "text_availability": "abstract",
                        "paper_author_count": 1,
                        "paper_reference_count": 0,
                        "paper_entity_count": 0,
                        "paper_relation_count": 0,
                    }
                ]
            )

    app.dependency_overrides[get_graph_point_attachment_service] = lambda: ArrowAttachmentService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/graph/attach-points",
        json={
            "graph_release_id": "release-1",
            "graph_paper_refs": ["paper:7"],
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(GRAPH_POINT_ATTACHMENT_MEDIA_TYPE)
    table = pa_ipc.open_stream(BytesIO(response.content)).read_all()
    assert table.column("paper_id").to_pylist() == ["paper:7"]


def test_attach_graph_points_endpoint_maps_unknown_release_to_404():
    class MissingReleaseService(FakeAttachmentService):
        def attach_points(self, request):
            raise LookupError(f"Unknown graph release: {request.graph_release_id}")

    app.dependency_overrides[get_graph_point_attachment_service] = lambda: MissingReleaseService()
    client = TestClient(app)

    response = client.post(
        "/api/v1/graph/attach-points",
        json={
            "graph_release_id": "missing-release",
            "graph_paper_refs": ["paper:9"],
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown graph release: missing-release"
