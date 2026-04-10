"""API tests for wiki endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.wiki.schemas import (
    WikiBacklinksResponse,
    WikiPageResponse,
    WikiPageSummary,
    WikiSearchHitResponse,
    WikiSearchResponse,
)
from app.wiki.service import get_wiki_service


class FakeWikiService:
    def get_page(self, slug, *, graph_release_id=None, graph_run_id=None):
        if slug == "entities/melatonin":
            return WikiPageResponse(
                slug="entities/melatonin",
                title="Melatonin",
                content_md="# Melatonin\n\nA neurohormone.",
                entity_type="Chemical",
                concept_id="MESH:D008550",
                tags=["sleep"],
                outgoing_links=["serotonin"],
                paper_pmids=[28847293],
                paper_graph_refs={28847293: "corpus:12345"},
            )
        return None

    def list_pages(self):
        return [
            WikiPageSummary(
                slug="entities/melatonin",
                title="Melatonin",
                entity_type="Chemical",
                tags=["sleep"],
            )
        ]

    def search(self, request):
        return WikiSearchResponse(
            hits=[
                WikiSearchHitResponse(
                    slug="entities/melatonin",
                    title="Melatonin",
                    rank=0.9,
                    headline="**Melatonin** is a neurohormone.",
                )
            ],
            total=1,
        )

    def get_backlinks(self, slug):
        return WikiBacklinksResponse(slug=slug, backlinks=[])


def test_get_wiki_page_returns_page():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/pages/entities/melatonin")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["slug"] == "entities/melatonin"
    assert payload["title"] == "Melatonin"
    assert payload["paper_graph_refs"]["28847293"] == "corpus:12345"


def test_get_wiki_page_passes_graph_release_id():
    """Verify graph_release_id query param is forwarded to the service."""
    received_args: dict = {}

    class CapturingService(FakeWikiService):
        def get_page(self, slug, *, graph_release_id=None, graph_run_id=None):
            received_args["graph_release_id"] = graph_release_id
            received_args["graph_run_id"] = graph_run_id
            return super().get_page(slug, graph_release_id=graph_release_id, graph_run_id=graph_run_id)

    app.dependency_overrides[get_wiki_service] = lambda: CapturingService()
    client = TestClient(app)

    response = client.get(
        "/api/v1/wiki/pages/entities/melatonin?graph_release_id=bundle-abc"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert received_args["graph_release_id"] == "bundle-abc"


def test_get_wiki_page_returns_404_for_missing():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/pages/nonexistent")

    app.dependency_overrides.clear()

    assert response.status_code == 404


def test_list_wiki_pages():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/pages")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["slug"] == "entities/melatonin"


def test_search_wiki():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiService()
    client = TestClient(app)

    response = client.post("/api/v1/wiki/search", json={"query": "melatonin"})

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["hits"][0]["slug"] == "entities/melatonin"


def test_get_wiki_backlinks():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/backlinks/entities/melatonin")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["slug"] == "entities/melatonin"
    assert payload["backlinks"] == []
