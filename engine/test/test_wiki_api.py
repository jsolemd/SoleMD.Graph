"""API tests for wiki endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.wiki.schemas import (
    WikiBacklinksResponse,
    WikiPageContextResponse,
    WikiPageResponse,
    WikiPageSummary,
    WikiSearchHitResponse,
    WikiSearchResponse,
)
from app.wiki.service import get_wiki_service


class FakeWikiService:
    def get_page(self, slug, *, graph_release_id=None):
        if slug == "entities/melatonin":
            return WikiPageResponse(
                slug="entities/melatonin",
                title="Melatonin",
                content_md="# Melatonin\n\nA neurohormone.",
                entity_type="Chemical",
                concept_id="MESH:D008550",
                page_kind="entity",
                section_slug="sections/core-biology",
                graph_focus="cited_papers",
                tags=["sleep"],
                outgoing_links=["serotonin"],
                paper_pmids=[28847293],
                paper_graph_refs={28847293: "corpus:12345"},
            )
        return None

    def get_page_context(self, slug, *, graph_release_id=None):
        if slug == "entities/melatonin":
            return WikiPageContextResponse(
                total_corpus_paper_count=120,
                total_graph_paper_count=48,
                top_graph_papers=[],
            )
        raise KeyError(slug)

    def list_pages(self):
        return [
            WikiPageSummary(
                slug="entities/melatonin",
                title="Melatonin",
                entity_type="Chemical",
                tags=["sleep"],
            )
        ]

    def search(self, *, query, limit):
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
    assert payload["page_kind"] == "entity"
    assert payload["section_slug"] == "sections/core-biology"
    assert payload["graph_focus"] == "cited_papers"
    assert payload["paper_graph_refs"]["28847293"] == "corpus:12345"


def test_get_wiki_page_passes_graph_release_id():
    """Verify graph_release_id query param is forwarded to the service."""
    received_args: dict = {}

    class CapturingService(FakeWikiService):
        def get_page(self, slug, *, graph_release_id=None):
            received_args["graph_release_id"] = graph_release_id
            return super().get_page(slug, graph_release_id=graph_release_id)

    app.dependency_overrides[get_wiki_service] = lambda: CapturingService()
    client = TestClient(app)

    response = client.get(
        "/api/v1/wiki/pages/entities/melatonin?graph_release_id=bundle-abc"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert received_args["graph_release_id"] == "bundle-abc"
    assert "graph_run_id" not in received_args


def test_get_wiki_page_context_returns_context():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/page-context/entities/melatonin")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_corpus_paper_count"] == 120
    assert payload["total_graph_paper_count"] == 48


def test_get_wiki_page_context_passes_graph_release_id():
    received_args: dict = {}

    class CapturingService(FakeWikiService):
        def get_page_context(self, slug, *, graph_release_id=None):
            received_args["graph_release_id"] = graph_release_id
            return super().get_page_context(slug, graph_release_id=graph_release_id)

    app.dependency_overrides[get_wiki_service] = lambda: CapturingService()
    client = TestClient(app)

    response = client.get(
        "/api/v1/wiki/page-context/entities/melatonin?graph_release_id=bundle-abc"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert received_args["graph_release_id"] == "bundle-abc"
    assert "graph_run_id" not in received_args


def test_get_wiki_page_context_returns_404_for_missing():
    app.dependency_overrides[get_wiki_service] = lambda: FakeWikiService()
    client = TestClient(app)

    response = client.get("/api/v1/wiki/page-context/nonexistent")

    app.dependency_overrides.clear()

    assert response.status_code == 404


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

    response = client.get("/api/v1/wiki/search?query=melatonin")

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
