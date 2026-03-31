from __future__ import annotations

from app.rag_ingest.tokenization import (
    build_chunk_token_budgeter,
    default_chunk_tokenizer_metadata,
    split_text_semantically,
)


def test_default_chunk_tokenizer_metadata_uses_embedding_tokenizer_when_supported():
    tokenizer_name, tokenizer_version = default_chunk_tokenizer_metadata(
        embedding_model="text-embedding-3-large"
    )

    assert tokenizer_name.startswith("tiktoken:")
    assert tokenizer_version is not None
    assert "text-embedding-3-large" in tokenizer_version


def test_build_chunk_token_budgeter_respects_explicit_stanza_tokenizer_name():
    budgeter = build_chunk_token_budgeter(
        tokenizer_name="stanza_biomedical_tokens",
        embedding_model="text-embedding-3-large",
    )

    assert budgeter.tokenizer_name == "stanza_biomedical_tokens"


def test_embedding_token_budgeter_split_text_respects_token_limit():
    budgeter = build_chunk_token_budgeter(embedding_model="text-embedding-3-large")
    text = (
        "Melatonin reduced postoperative delirium in older adults while improving sleep quality "
        "across follow-up visits without serious adverse events."
    )

    fragments = budgeter.split_text(text, max_tokens=10)

    assert len(fragments) >= 2
    assert all(budgeter.count_tokens(fragment) <= 10 for fragment in fragments)


def test_split_text_semantically_prefers_sentence_boundaries_when_they_fit():
    text = "Alpha beta gamma delta. Epsilon zeta eta theta. Iota kappa lambda mu."

    fragments = split_text_semantically(
        text,
        max_tokens=6,
        token_counter=lambda value: len(value.split()),
    )

    assert fragments == [
        "Alpha beta gamma delta.",
        "Epsilon zeta eta theta.",
        "Iota kappa lambda mu.",
    ]
