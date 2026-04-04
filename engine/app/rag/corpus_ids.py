"""Shared corpus-id normalization used across RAG runtime modules."""

from __future__ import annotations

from collections.abc import Sequence


def normalize_corpus_ids(corpus_ids: Sequence[int]) -> list[int]:
    """Deduplicate and coerce corpus IDs to int, preserving insertion order."""

    return list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
