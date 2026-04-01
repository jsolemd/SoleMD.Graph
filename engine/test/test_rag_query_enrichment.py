"""Unit tests for backend-owned query enrichment."""

from __future__ import annotations

from app.rag.query_enrichment import (
    build_query_phrases,
    derive_relation_terms,
    determine_query_retrieval_profile,
    is_title_like_query,
    should_use_chunk_lexical_query,
)
from app.rag.types import QueryRetrievalProfile


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


def test_is_title_like_query_accepts_paper_title_but_not_sentence():
    assert is_title_like_query("Motor Performance Is not Enhanced by Daytime Naps in Older Adults")
    assert not is_title_like_query(
        "This is a representative discussion sentence with a concluding period."
    )


def test_determine_query_retrieval_profile_allows_terminal_punctuation_for_selected_titles():
    assert (
        determine_query_retrieval_profile(
            "Trauma deepens trauma: the consequences of recurrent combat stress reaction.",
            allow_terminal_title_punctuation=True,
        )
        == QueryRetrievalProfile.TITLE_LOOKUP
    )
    assert (
        determine_query_retrieval_profile(
            "This is a representative discussion sentence with a concluding period."
        )
        == QueryRetrievalProfile.PASSAGE_LOOKUP
    )


def test_should_use_chunk_lexical_query_routes_longer_free_text():
    assert should_use_chunk_lexical_query(
        "Does melatonin reduce postoperative delirium in older adults?"
    )
    assert not should_use_chunk_lexical_query(
        "Motor Performance Is not Enhanced by Daytime Naps in Older Adults"
    )
