from __future__ import annotations

from io import BytesIO

import pyarrow.ipc as pa_ipc

from app.graph.attachment import (
    GraphPointAttachmentRequest,
    GraphPointAttachmentService,
)
from app.rag.models import GraphRelease


class FakeAttachmentRepository:
    def __init__(self) -> None:
        self.resolve_scope_calls: list[tuple[str, list[str]]] = []

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease:
        return GraphRelease(
            graph_release_id=graph_release_id,
            graph_run_id="run-1",
            bundle_checksum="bundle-1",
            graph_name="cosmograph",
            is_current=True,
        )

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: list[str],
    ) -> list[int]:
        self.resolve_scope_calls.append((graph_run_id, graph_paper_refs))
        return [101, 303]


class FakeAttachmentService(GraphPointAttachmentService):
    def __init__(self, repository: FakeAttachmentRepository) -> None:
        super().__init__(repository=repository)
        self.fetch_calls: list[tuple[str, list[int]]] = []

    def _fetch_point_rows(
        self,
        *,
        graph_run_id: str,
        corpus_ids: list[int],
    ) -> list[dict[str, object]]:
        self.fetch_calls.append((graph_run_id, corpus_ids))
        return [
            {
                "point_index": 42,
                "id": "paper:101",
                "paper_id": "paper:101",
                "hex_color": "#555555",
                "hex_color_light": "#999999",
                "x": 1.25,
                "y": -2.5,
                "cluster_id": 0,
                "cluster_label": None,
                "title": "First paper",
                "citekey": None,
                "journal": "J1",
                "year": 2022,
                "display_label": "First paper",
                "semantic_groups_csv": "CHEMICAL",
                "relation_categories_csv": "treats",
                "is_in_base": False,
                "base_rank": 0.0,
                "text_availability": "abstract",
                "paper_author_count": 2,
                "paper_reference_count": 5,
                "paper_entity_count": 3,
                "paper_relation_count": 1,
            }
        ]


def test_graph_point_attachment_request_normalizes_and_dedupes_refs():
    request = GraphPointAttachmentRequest(
        graph_release_id="  release-1  ",
        graph_paper_refs=["paper:101", "paper:101", " corpus:303 ", ""],
    )

    assert request.graph_release_id == "release-1"
    assert request.graph_paper_refs == ["paper:101", "corpus:303"]


def test_graph_point_attachment_service_returns_arrow_ipc_rows():
    repository = FakeAttachmentRepository()
    service = FakeAttachmentService(repository)

    payload = service.attach_points(
        GraphPointAttachmentRequest(
            graph_release_id="release-1",
            graph_paper_refs=["paper:101", "corpus:303"],
        )
    )

    assert repository.resolve_scope_calls == [
        ("run-1", ["paper:101", "corpus:303"])
    ]
    assert service.fetch_calls == [("run-1", [101, 303])]

    reader = pa_ipc.open_stream(BytesIO(payload))
    table = reader.read_all()
    assert table.num_rows == 1
    assert table.column("paper_id").to_pylist() == ["paper:101"]
    assert table.column("point_index").to_pylist() == [42]


def test_graph_point_attachment_service_returns_empty_stream_when_nothing_resolves():
    class EmptyRepository(FakeAttachmentRepository):
        def resolve_scope_corpus_ids(
            self,
            *,
            graph_run_id: str,
            graph_paper_refs: list[str],
        ) -> list[int]:
            return []

    service = FakeAttachmentService(EmptyRepository())
    payload = service.attach_points(
        GraphPointAttachmentRequest(
            graph_release_id="release-1",
            graph_paper_refs=["paper:404"],
        )
    )

    table = pa_ipc.open_stream(BytesIO(payload)).read_all()
    assert table.num_rows == 0
