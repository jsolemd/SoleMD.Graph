"""Tests for the wiki repository (mock queries)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

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
    mock_db.connect.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.get_page(slug="nonexistent")
    assert result is None


@patch("app.wiki.repository.db")
def test_get_page_returns_page_when_found(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchone.return_value = _page_row()
    mock_db.connect.return_value = mock_conn

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
    mock_db.connect.return_value = mock_conn

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
    mock_conn.execute.return_value.fetchall.return_value = [_summary_row("entities/serotonin", "Serotonin")]
    mock_db.connect.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.get_backlink_summaries(slug="entities/melatonin")

    # Exact slug match only — sync resolves bare links to full slugs
    call_args = mock_conn.execute.call_args
    assert call_args[0][1]["slug"] == "entities/melatonin"
    assert "bare_name" not in call_args[0][1]
    assert len(result) == 1
    assert result[0].slug == "entities/serotonin"


@patch("app.wiki.repository.db")
def test_resolve_graph_run_id_returns_run_id(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchone.return_value = {"graph_run_id": "run-42"}
    mock_db.connect.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.resolve_graph_run_id(graph_release_id="bundle-abc")
    assert result == "run-42"


@patch("app.wiki.repository.db")
def test_resolve_graph_run_id_returns_none_when_not_found(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchone.return_value = None
    mock_db.connect.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.resolve_graph_run_id(graph_release_id="missing")
    assert result is None


@patch("app.wiki.repository.db")
def test_resolve_paper_graph_refs_returns_empty_for_no_pmids(mock_db):
    repo = PostgresWikiRepository()
    result = repo.resolve_paper_graph_refs(pmids=[], graph_run_id="run-1")
    assert result == {}
    mock_db.connect.assert_not_called()


@patch("app.wiki.repository.db")
def test_resolve_paper_graph_refs_maps_pmids(mock_db):
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchall.return_value = [
        {"pmid": 28847293, "graph_paper_ref": "corpus:12345"},
    ]
    mock_db.connect.return_value = mock_conn

    repo = PostgresWikiRepository()
    result = repo.resolve_paper_graph_refs(pmids=[28847293], graph_run_id="run-1")
    assert result == {28847293: "corpus:12345"}
