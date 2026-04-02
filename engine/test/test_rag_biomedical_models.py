"""Unit tests for biomedical encoder input normalization."""

from __future__ import annotations

from app.rag.biomedical_models import _normalize_tokenizer_batch_item


def test_normalize_tokenizer_batch_item_keeps_plain_string_queries():
    assert _normalize_tokenizer_batch_item("melatonin delirium") == "melatonin delirium"


def test_normalize_tokenizer_batch_item_turns_title_abstract_lists_into_pairs():
    assert _normalize_tokenizer_batch_item(
        ["Neural dopamine signaling", "Signals reward prediction error."]
    ) == (
        "Neural dopamine signaling",
        "Signals reward prediction error.",
    )


def test_normalize_tokenizer_batch_item_collapses_extra_segments_into_second_field():
    assert _normalize_tokenizer_batch_item(
        ["Title", "Abstract sentence one.", "Abstract sentence two."]
    ) == (
        "Title",
        "Abstract sentence one. Abstract sentence two.",
    )
