"""Unit tests for the baseline evidence repository."""

from __future__ import annotations

from app.rag.repository import PostgresRagRepository


def test_search_papers_maps_rows(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 101,
                "paper_id": "paper-101",
                "title": "Melatonin and delirium",
                "abstract": "Abstract text",
                "tldr": "TLDR text",
                "journal_name": "JAMA",
                "year": 2024,
                "doi": "10.1/example",
                "pmid": 12345,
                "pmcid": "PMC123",
                "text_availability": "fulltext",
                "is_open_access": True,
                "citation_count": 7,
                "reference_count": 11,
                "lexical_score": 0.82,
                "title_similarity": 0.33,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.search_papers("melatonin delirium", limit=5)

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-101"
    assert hits[0].semantic_scholar_paper_id == "paper-101"
    assert hits[0].journal_name == "JAMA"
    assert hits[0].reference_count == 11


def test_fetch_entity_matches_normalizes_mentions(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 101,
                "entity_type": "chemical",
                "concept_id": "MESH:D008874",
                "mentions": "melatonin|Melatonin receptor agonist",
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_entity_matches([101], entity_terms=["melatonin"])

    assert 101 in hits
    assert hits[101][0].concept_id == "MESH:D008874"
    assert hits[101][0].matched_terms == ["melatonin"]
