"""Tests for the wiki graph endpoint and service."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.wiki.schemas import WikiGraphResponse
from app.wiki.service import get_wiki_service


class FakeWikiGraphService:
    """Minimal fake that implements only the graph method."""

    def get_graph(self, graph_release_id: str) -> WikiGraphResponse:
        if graph_release_id == "empty":
            return WikiGraphResponse(nodes=[], edges=[], signature="empty")

        from app.wiki.schemas import WikiGraphEdge, WikiGraphNode

        nodes = [
            WikiGraphNode(
                id="page:index",
                kind="page",
                label="Index",
                slug="index",
                tags=["root"],
            ),
            WikiGraphNode(
                id="page:entities/melatonin",
                kind="page",
                label="Melatonin",
                slug="entities/melatonin",
                entity_type="Chemical",
                concept_id="MESH:D008550",
                tags=["sleep"],
            ),
            WikiGraphNode(
                id="paper:S2:abc123",
                kind="paper",
                label="Melatonin and Sleep",
                paper_id="S2:abc123",
                year=2020,
                venue="Sleep Medicine",
            ),
        ]
        edges = [
            WikiGraphEdge(
                source="page:index",
                target="page:entities/melatonin",
                kind="wikilink",
            ),
            WikiGraphEdge(
                source="page:entities/melatonin",
                target="paper:S2:abc123",
                kind="paper_reference",
            ),
        ]
        return WikiGraphResponse(
            nodes=nodes,
            edges=edges,
            signature="test-sig-abc",
        )

    # Stubs for other methods the router may need
    def get_page(self, slug, **kw):
        return None

    def list_pages(self):
        return []

    def search(self, request):
        from app.wiki.schemas import WikiSearchResponse

        return WikiSearchResponse(hits=[], total=0)

    def get_backlinks(self, slug):
        from app.wiki.schemas import WikiBacklinksResponse

        return WikiBacklinksResponse(slug=slug, backlinks=[])


def test_get_wiki_graph_returns_nodes_and_edges():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiGraphService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/graph?graph_release_id=current")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["nodes"]) == 3
    assert len(payload["edges"]) == 2
    assert payload["signature"] == "test-sig-abc"

    page_nodes = [n for n in payload["nodes"] if n["kind"] == "page"]
    paper_nodes = [n for n in payload["nodes"] if n["kind"] == "paper"]
    assert len(page_nodes) == 2
    assert len(paper_nodes) == 1

    wikilink_edges = [e for e in payload["edges"] if e["kind"] == "wikilink"]
    paper_edges = [e for e in payload["edges"] if e["kind"] == "paper_reference"]
    assert len(wikilink_edges) == 1
    assert len(paper_edges) == 1


def test_get_wiki_graph_empty_release():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiGraphService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/graph?graph_release_id=empty")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["nodes"] == []
    assert payload["edges"] == []
    assert payload["signature"] == "empty"


def test_get_wiki_graph_requires_release_id():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiGraphService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/graph")

    app.dependency_overrides.clear()

    assert response.status_code == 422


def test_wiki_graph_node_shapes():
    """Verify page and paper node shapes have correct fields."""
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiGraphService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/graph?graph_release_id=current")

    app.dependency_overrides.clear()

    payload = response.json()
    page_node = next(n for n in payload["nodes"] if n["id"] == "page:entities/melatonin")
    assert page_node["slug"] == "entities/melatonin"
    assert page_node["concept_id"] == "MESH:D008550"
    assert page_node["entity_type"] == "Chemical"
    assert page_node["semantic_group"] is None  # fake bypasses mapping

    paper_node = next(n for n in payload["nodes"] if n["kind"] == "paper")
    assert paper_node["paper_id"] == "S2:abc123"
    assert paper_node["year"] == 2020
    assert paper_node["venue"] == "Sleep Medicine"
    assert paper_node["semantic_group"] is None  # papers have no semantic group


def test_entity_type_to_semantic_group_mapping():
    """Verify the entity_type → semantic_group interim bridge."""
    from app.wiki.service import _entity_type_to_semantic_group

    assert _entity_type_to_semantic_group("Disease") == "DISO"
    assert _entity_type_to_semantic_group("Chemical") == "CHEM"
    assert _entity_type_to_semantic_group("Gene") == "GENE"
    assert _entity_type_to_semantic_group("Receptor") == "GENE"
    assert _entity_type_to_semantic_group("Anatomy") == "ANAT"
    assert _entity_type_to_semantic_group("Network") == "PHYS"
    assert _entity_type_to_semantic_group("Biological Process") == "PHYS"
    assert _entity_type_to_semantic_group("disease") == "DISO"
    assert _entity_type_to_semantic_group("chemical") == "CHEM"
    assert _entity_type_to_semantic_group(None) is None
    assert _entity_type_to_semantic_group("UnknownType") is None
