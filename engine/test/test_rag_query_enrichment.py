"""Unit tests for backend-owned query enrichment."""

from __future__ import annotations

from app.rag.query_enrichment import build_query_phrases, derive_relation_terms


def test_build_query_phrases_builds_bounded_contiguous_spans():
    phrases = build_query_phrases("What evidence links melatonin to postoperative delirium?")

    assert "melatonin" in phrases
    assert "postoperative delirium" in phrases
    assert "what evidence links melatonin to" not in phrases
    assert len(phrases) <= 48


def test_derive_relation_terms_normalizes_spaces_and_hyphens():
    relation_terms = derive_relation_terms(
        "Does melatonin positive correlate with delirium and drug interact with SSRIs?"
    )

    assert relation_terms == ["positive_correlate", "drug_interact"]
