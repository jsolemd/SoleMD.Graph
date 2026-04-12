"""Tests for the wiki repository (mock queries)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.wiki.models import WikiPagePaperData
from app.wiki.repository import PostgresWikiRepository, _row_to_page, _row_to_summary


def _page_row(slug: str = "entities/melatonin", title: str = "Melatonin") -> dict:
    """Factory for a full page row dict."""
    return {
        "slug": slug,
        "title": title,
        "content_md": "# Melatonin\n\nA neurohormone.",
        "frontmatter": {},
        "entity_type": "Chemical",
        "concept_id": "MESH:D008550",
        "family_key": "neurohormones",
        "semantic_group": "CHEM",
        "tags": ["sleep", "circadian"],
        "outgoing_links": ["serotonin"],
        "paper_pmids": [28847293],
        "checksum": "abc123",
        "synced_at": None,
        "created_at": None,
        "updated_at": None,
    }


def _summary_row(slug: str = "entities/melatonin", title: str = "Melatonin") -> dict:
    """Factory for a summary row dict (no content_md)."""
    return {
        "slug": slug,
        "title": title,
        "entity_type": "Chemical",
        "family_key": "neurohormones",
        "tags": ["sleep", "circadian"],
    }


def test_row_to_page_converts_dict():
    row = _page_row()
    page = _row_to_page(row)
    assert page.slug == "entities/melatonin"
    assert page.title == "Melatonin"
    assert page.entity_type == "Chemical"
    assert page.semantic_group == "CHEM"
    assert page.tags == ["sleep", "circadian"]
    assert page.paper_pmids == [28847293]


def test_row_to_summary_converts_dict():
    row = _summary_row()
    summary = _row_to_summary(row)
    assert summary.slug == "entities/melatonin"
    assert summary.title == "Melatonin"
    assert summary.entity_type == "Chemical"
    assert summary.tags == ["sleep", "circadian"]


@patch("app.wiki.repository.db")
def test_get_page_returns_none_when_not_found(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchone.return_value = None
    mock_db.pooled.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.get_page(slug="nonexistent")
    assert result is None


@patch("app.wiki.repository.db")
def test_get_page_returns_page_when_found(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchone.return_value = _page_row()
    mock_db.pooled.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.get_page(slug="entities/melatonin")
    assert result is not None
    assert result.slug == "entities/melatonin"
    assert result.title == "Melatonin"


@patch("app.wiki.repository.db")
def test_list_page_summaries_returns_summaries(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchall.return_value = [_summary_row()]
    mock_db.pooled.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.list_page_summaries()
    assert len(result) == 1
    assert result[0].slug == "entities/melatonin"
    assert result[0].title == "Melatonin"


@patch("app.wiki.repository.db")
def test_get_backlink_summaries_uses_exact_slug(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchall.return_value = [
        _summary_row("entities/serotonin", "Serotonin")
    ]
    mock_db.pooled.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.get_backlink_summaries(slug="entities/melatonin")

    # Exact slug match only — sync resolves bare links to full slugs
    call_args = mock_conn.execute.call_args
    assert call_args[0][1]["slug"] == "entities/melatonin"
    assert "bare_name" not in call_args[0][1]
    assert len(result) == 1
    assert result[0].slug == "entities/serotonin"


def test_resolve_graph_run_id_returns_run_id():
    class FakeGraphRepository:
        def resolve_graph_release(self, graph_release_id: str):
            assert graph_release_id == "bundle-abc"
            return type("Release", (), {"graph_run_id": "run-42"})()

    repo = PostgresWikiRepository(graph_repository=FakeGraphRepository())
    result = repo.resolve_graph_run_id(graph_release_id="bundle-abc")
    assert result == "run-42"


def test_resolve_graph_run_id_returns_none_when_not_found():
    class FakeGraphRepository:
        def resolve_graph_release(self, graph_release_id: str):
            raise LookupError(graph_release_id)

    repo = PostgresWikiRepository(graph_repository=FakeGraphRepository())
    result = repo.resolve_graph_run_id(graph_release_id="missing")
    assert result is None


@patch("app.wiki.repository.db")
def test_resolve_paper_graph_refs_returns_empty_for_no_pmids(mock_db):
    repo = PostgresWikiRepository()
    result = repo.resolve_paper_graph_refs(pmids=[], graph_run_id="run-1")
    assert result == {}
    mock_db.pooled.assert_not_called()


def test_resolve_paper_graph_refs_maps_pmids():
    class FakeGraphRepository:
        def resolve_paper_graph_refs(self, *, pmids: list[int], graph_run_id: str):
            assert pmids == [28847293]
            assert graph_run_id == "run-1"
            return {28847293: "corpus:12345"}

    repo = PostgresWikiRepository(graph_repository=FakeGraphRepository())
    result = repo.resolve_paper_graph_refs(pmids=[28847293], graph_run_id="run-1")
    assert result == {28847293: "corpus:12345"}


def test_resolve_paper_nodes_for_graph_uses_graph_repository():
    class FakeGraphRepository:
        def resolve_paper_nodes_for_graph(self, *, pmids: list[int], graph_run_id: str):
            assert pmids == [28847293]
            assert graph_run_id == "run-1"
            return [
                {
                    "pmid": 28847293,
                    "graph_paper_ref": "paper:1",
                    "paper_title": "Melatonin paper",
                    "year": 2024,
                    "venue": "Nature",
                }
            ]

    repo = PostgresWikiRepository(graph_repository=FakeGraphRepository())
    rows = repo.resolve_paper_nodes_for_graph(pmids=[28847293], graph_run_id="run-1")

    assert len(rows) == 1
    assert rows[0].pmid == 28847293
    assert rows[0].graph_paper_ref == "paper:1"
    assert rows[0].paper_title == "Melatonin paper"


def test_get_entity_page_context_uses_shared_entity_graph_projection_repository():
    class FakeEntityGraphRepository:
        def __init__(self) -> None:
            self.count_requests: list[tuple[str, str, str]] = []
            self.top_paper_requests: list[tuple[str, str, str, int]] = []

        def fetch_page_context_counts(
            self,
            *,
            entity_type: str,
            source_identifier: str,
            graph_run_id: str,
        ):
            self.count_requests.append((entity_type, source_identifier, graph_run_id))
            return {
                "total_corpus_paper_count": 120,
                "total_graph_paper_count": 48,
            }

        def fetch_page_context_top_papers(
            self,
            *,
            entity_type: str,
            source_identifier: str,
            graph_run_id: str,
            limit: int = 8,
        ):
            self.top_paper_requests.append((entity_type, source_identifier, graph_run_id, limit))
            return [
                {
                    "pmid": 28847293,
                    "graph_paper_ref": "paper:1",
                    "paper_title": "Melatonin paper",
                    "year": 2024,
                    "venue": "Nature",
                    "citation_count": 77,
                }
            ]

    entity_graph_repository = FakeEntityGraphRepository()
    repo = PostgresWikiRepository(entity_graph_repository=entity_graph_repository)

    context = repo.get_entity_page_context(
        concept_id="MESH:D008550",
        entity_type="chemical",
        graph_run_id="run-1",
        limit=5,
    )

    assert entity_graph_repository.count_requests == [("chemical", "MESH:D008550", "run-1")]
    assert entity_graph_repository.top_paper_requests == [("chemical", "MESH:D008550", "run-1", 5)]
    assert context.total_corpus_paper_count == 120
    assert context.total_graph_paper_count == 48
    assert context.top_graph_papers == [
        WikiPagePaperData(
            pmid=28847293,
            graph_paper_ref="paper:1",
            title="Melatonin paper",
            year=2024,
            venue="Nature",
            citation_count=77,
        )
    ]
