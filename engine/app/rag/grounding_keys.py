"""Shared key helpers for grouping grounded-answer packets."""

from __future__ import annotations

from collections.abc import Mapping

type PacketKey = tuple[int, int, int | None]


def packet_key(
    *,
    corpus_id: int | None,
    block_ordinal: int | None,
    sentence_ordinal: int | None,
) -> PacketKey | None:
    if corpus_id is None or block_ordinal is None:
        return None
    return (
        int(corpus_id),
        int(block_ordinal),
        None if sentence_ordinal is None else int(sentence_ordinal),
    )


def row_packet_key(
    row: Mapping[str, object],
    *,
    corpus_id_key: str = "corpus_id",
    block_ordinal_key: str = "canonical_block_ordinal",
    sentence_ordinal_key: str = "canonical_sentence_ordinal",
) -> PacketKey | None:
    return packet_key(
        corpus_id=row.get(corpus_id_key),
        block_ordinal=row.get(block_ordinal_key),
        sentence_ordinal=row.get(sentence_ordinal_key),
    )
