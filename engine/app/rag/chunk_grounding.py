"""Read-side helpers for chunk-backed grounded answers."""

from __future__ import annotations

from collections.abc import Sequence

from app import db
from app.rag.corpus_ids import normalize_corpus_ids
from app.rag.grounding_keys import PacketKey, row_packet_key
from app.rag.serving_contract import GroundedAnswerRecord
from app.rag.warehouse_grounding import build_grounded_answer_from_warehouse_rows
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY

CHUNK_CITATION_PACKET_SQL = """
WITH matched_mentions AS (
    SELECT DISTINCT ON (
        m.corpus_id,
        m.source_start_offset,
        m.source_end_offset
    )
        m.*,
        c.chunk_ordinal
    FROM solemd.paper_citation_mentions m
    JOIN solemd.paper_chunk_members cm
      ON cm.chunk_version_key = %s
     AND cm.corpus_id = m.corpus_id
     AND cm.canonical_block_ordinal = m.canonical_block_ordinal
     AND (
        (
            m.canonical_sentence_ordinal IS NOT NULL
            AND cm.canonical_sentence_ordinal = m.canonical_sentence_ordinal
        )
        OR (m.canonical_sentence_ordinal IS NULL AND cm.canonical_sentence_ordinal IS NULL)
     )
    JOIN solemd.paper_chunks c
      ON c.chunk_version_key = cm.chunk_version_key
     AND c.corpus_id = cm.corpus_id
     AND c.chunk_ordinal = cm.chunk_ordinal
    WHERE
        m.corpus_id = ANY(%s)
        AND m.canonical_block_ordinal IS NOT NULL
    ORDER BY
        m.corpus_id,
        m.source_start_offset,
        m.source_end_offset,
        c.chunk_ordinal
),
ranked_mentions AS (
    SELECT
        mm.*,
        ROW_NUMBER() OVER (
            PARTITION BY mm.corpus_id
            ORDER BY
                CASE mm.alignment_status
                    WHEN 'exact' THEN 0
                    WHEN 'bounded' THEN 1
                    ELSE 2
                END,
                CASE WHEN mm.canonical_sentence_ordinal IS NULL THEN 1 ELSE 0 END,
                mm.chunk_ordinal,
                mm.source_start_offset
        ) AS packet_rank
    FROM matched_mentions mm
)
SELECT
    rm.*,
    b.section_ordinal AS block_section_ordinal,
    b.section_role AS block_section_role,
    b.block_kind AS block_kind,
    b.text AS block_text,
    b.is_retrieval_default AS block_is_retrieval_default,
    b.linked_asset_ref AS block_linked_asset_ref,
    s.section_ordinal AS sentence_section_ordinal,
    s.segmentation_source AS sentence_segmentation_source,
    s.text AS sentence_text
FROM ranked_mentions rm
JOIN solemd.paper_blocks b
  ON b.corpus_id = rm.corpus_id
 AND b.block_ordinal = rm.canonical_block_ordinal
LEFT JOIN solemd.paper_sentences s
  ON s.corpus_id = rm.corpus_id
 AND s.block_ordinal = rm.canonical_block_ordinal
 AND s.sentence_ordinal = rm.canonical_sentence_ordinal
WHERE rm.packet_rank <= %s
ORDER BY rm.corpus_id, rm.packet_rank, rm.source_start_offset
"""

CHUNK_ENTITY_PACKET_SQL = """
WITH requested_packets AS (
    SELECT *
    FROM unnest(%s::BIGINT[], %s::INTEGER[], %s::INTEGER[])
        AS requested(corpus_id, canonical_block_ordinal, canonical_sentence_ordinal)
),
exact_packet_entities AS (
    SELECT DISTINCT ON (
        e.corpus_id,
        e.source_start_offset,
        e.source_end_offset
    )
        e.*,
        0 AS packet_rank,
        b.section_ordinal AS block_section_ordinal,
        b.section_role AS block_section_role,
        b.block_kind AS block_kind,
        b.text AS block_text,
        b.is_retrieval_default AS block_is_retrieval_default,
        b.linked_asset_ref AS block_linked_asset_ref,
        s.section_ordinal AS sentence_section_ordinal,
        s.segmentation_source AS sentence_segmentation_source,
        s.text AS sentence_text
    FROM requested_packets rp
    JOIN solemd.paper_entity_mentions e
      ON e.corpus_id = rp.corpus_id
     AND e.canonical_block_ordinal = rp.canonical_block_ordinal
     AND (
        (
            rp.canonical_sentence_ordinal IS NOT NULL
            AND e.canonical_sentence_ordinal = rp.canonical_sentence_ordinal
        )
        OR (
            rp.canonical_sentence_ordinal IS NULL
            AND e.canonical_sentence_ordinal IS NULL
        )
     )
    JOIN solemd.paper_chunk_members cm
      ON cm.chunk_version_key = %s
     AND cm.corpus_id = e.corpus_id
     AND cm.canonical_block_ordinal = e.canonical_block_ordinal
     AND (
        (
            e.canonical_sentence_ordinal IS NOT NULL
            AND cm.canonical_sentence_ordinal = e.canonical_sentence_ordinal
        )
        OR (e.canonical_sentence_ordinal IS NULL AND cm.canonical_sentence_ordinal IS NULL)
     )
    JOIN solemd.paper_chunks c
      ON c.chunk_version_key = cm.chunk_version_key
     AND c.corpus_id = cm.corpus_id
     AND c.chunk_ordinal = cm.chunk_ordinal
    JOIN solemd.paper_blocks b
      ON b.corpus_id = e.corpus_id
     AND b.block_ordinal = e.canonical_block_ordinal
    LEFT JOIN solemd.paper_sentences s
      ON s.corpus_id = e.corpus_id
     AND s.block_ordinal = e.canonical_block_ordinal
     AND s.sentence_ordinal = e.canonical_sentence_ordinal
    ORDER BY
        e.corpus_id,
        e.source_start_offset,
        e.source_end_offset,
        c.chunk_ordinal
),
fallback_packet_candidates AS (
    SELECT DISTINCT ON (
        e.corpus_id,
        e.canonical_block_ordinal,
        e.canonical_sentence_ordinal
    )
        e.corpus_id,
        e.canonical_block_ordinal,
        e.canonical_sentence_ordinal,
        c.chunk_ordinal,
        CASE e.alignment_status
            WHEN 'exact' THEN 0
            WHEN 'bounded' THEN 1
            ELSE 2
        END AS alignment_rank,
        CASE WHEN e.canonical_sentence_ordinal IS NULL THEN 1 ELSE 0 END AS sentence_rank,
        e.source_start_offset
    FROM solemd.paper_entity_mentions e
    JOIN solemd.paper_chunk_members cm
      ON cm.chunk_version_key = %s
     AND cm.corpus_id = e.corpus_id
     AND cm.canonical_block_ordinal = e.canonical_block_ordinal
     AND (
        (
            e.canonical_sentence_ordinal IS NOT NULL
            AND cm.canonical_sentence_ordinal = e.canonical_sentence_ordinal
        )
        OR (e.canonical_sentence_ordinal IS NULL AND cm.canonical_sentence_ordinal IS NULL)
     )
    JOIN solemd.paper_chunks c
      ON c.chunk_version_key = cm.chunk_version_key
     AND c.corpus_id = cm.corpus_id
     AND c.chunk_ordinal = cm.chunk_ordinal
    LEFT JOIN requested_packets rp
      ON rp.corpus_id = e.corpus_id
     AND rp.canonical_block_ordinal = e.canonical_block_ordinal
     AND (
        (
            rp.canonical_sentence_ordinal IS NOT NULL
            AND e.canonical_sentence_ordinal = rp.canonical_sentence_ordinal
        )
        OR (
            rp.canonical_sentence_ordinal IS NULL
            AND e.canonical_sentence_ordinal IS NULL
        )
     )
    WHERE
        e.corpus_id = ANY(%s)
        AND e.canonical_block_ordinal IS NOT NULL
        AND rp.corpus_id IS NULL
    ORDER BY
        e.corpus_id,
        e.canonical_block_ordinal,
        e.canonical_sentence_ordinal,
        c.chunk_ordinal,
        e.source_start_offset
),
ranked_fallback_packets AS (
    SELECT
        candidate.*,
        ROW_NUMBER() OVER (
            PARTITION BY candidate.corpus_id
            ORDER BY
                candidate.alignment_rank,
                candidate.sentence_rank,
                candidate.chunk_ordinal,
                candidate.source_start_offset
        ) AS packet_rank
    FROM fallback_packet_candidates candidate
),
fallback_packet_entities AS (
    SELECT DISTINCT ON (
        e.corpus_id,
        e.source_start_offset,
        e.source_end_offset
    )
        e.*,
        rp.packet_rank,
        b.section_ordinal AS block_section_ordinal,
        b.section_role AS block_section_role,
        b.block_kind AS block_kind,
        b.text AS block_text,
        b.is_retrieval_default AS block_is_retrieval_default,
        b.linked_asset_ref AS block_linked_asset_ref,
        s.section_ordinal AS sentence_section_ordinal,
        s.segmentation_source AS sentence_segmentation_source,
        s.text AS sentence_text
    FROM ranked_fallback_packets rp
    JOIN solemd.paper_entity_mentions e
      ON e.corpus_id = rp.corpus_id
     AND e.canonical_block_ordinal = rp.canonical_block_ordinal
     AND (
        (
            rp.canonical_sentence_ordinal IS NOT NULL
            AND e.canonical_sentence_ordinal = rp.canonical_sentence_ordinal
        )
        OR (
            rp.canonical_sentence_ordinal IS NULL
            AND e.canonical_sentence_ordinal IS NULL
        )
     )
    JOIN solemd.paper_blocks b
      ON b.corpus_id = e.corpus_id
     AND b.block_ordinal = e.canonical_block_ordinal
    LEFT JOIN solemd.paper_sentences s
      ON s.corpus_id = e.corpus_id
     AND s.block_ordinal = e.canonical_block_ordinal
     AND s.sentence_ordinal = e.canonical_sentence_ordinal
    WHERE rp.packet_rank <= %s
    ORDER BY
        e.corpus_id,
        e.source_start_offset,
        e.source_end_offset,
        rp.packet_rank
)
SELECT *
FROM exact_packet_entities
UNION ALL
SELECT *
FROM fallback_packet_entities
ORDER BY corpus_id, packet_rank, source_start_offset
"""


CHUNK_STRUCTURAL_PACKET_SQL = """
SELECT
    cm.corpus_id,
    cm.chunk_ordinal,
    cm.member_ordinal,
    cm.canonical_block_ordinal,
    cm.canonical_sentence_ordinal,
    c.text AS chunk_text,
    b.section_ordinal AS block_section_ordinal,
    b.section_role AS block_section_role,
    b.block_kind AS block_kind,
    b.text AS block_text,
    b.is_retrieval_default AS block_is_retrieval_default,
    b.linked_asset_ref AS block_linked_asset_ref,
    s.section_ordinal AS sentence_section_ordinal,
    s.segmentation_source AS sentence_segmentation_source,
    s.text AS sentence_text
FROM solemd.paper_chunk_members cm
JOIN solemd.paper_chunks c
  ON c.chunk_version_key = cm.chunk_version_key
 AND c.corpus_id = cm.corpus_id
 AND c.chunk_ordinal = cm.chunk_ordinal
JOIN solemd.paper_blocks b
  ON b.corpus_id = cm.corpus_id
 AND b.block_ordinal = cm.canonical_block_ordinal
LEFT JOIN solemd.paper_sentences s
  ON s.corpus_id = cm.corpus_id
 AND s.block_ordinal = cm.canonical_block_ordinal
 AND s.sentence_ordinal = cm.canonical_sentence_ordinal
WHERE
    cm.chunk_version_key = %s
    AND cm.corpus_id = ANY(%s)
    AND c.is_retrieval_default = true
ORDER BY
    cm.corpus_id,
    cm.chunk_ordinal,
    cm.member_ordinal
"""


def _packet_key_arrays(
    packet_keys: Sequence[PacketKey],
) -> tuple[list[int], list[int], list[int | None]]:
    corpus_ids: list[int] = []
    block_ordinals: list[int] = []
    sentence_ordinals: list[int | None] = []
    for corpus_id, block_ordinal, sentence_ordinal in packet_keys:
        corpus_ids.append(corpus_id)
        block_ordinals.append(block_ordinal)
        sentence_ordinals.append(sentence_ordinal)
    return corpus_ids, block_ordinals, sentence_ordinals


def fetch_chunk_grounding_rows(
    *,
    corpus_ids: Sequence[int],
    cursor,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    limit_per_paper: int = 1,
) -> tuple[list[dict], list[dict]]:
    normalized_corpus_ids = normalize_corpus_ids(corpus_ids)
    if not normalized_corpus_ids:
        return [], []

    cursor.execute(
        CHUNK_CITATION_PACKET_SQL,
        (chunk_version_key, normalized_corpus_ids, limit_per_paper),
    )
    citation_rows = cursor.fetchall()
    citation_packet_keys = list(
        dict.fromkeys(
            packet_key
            for row in citation_rows
            if (packet_key := row_packet_key(row)) is not None
        )
    )
    packet_corpus_ids, packet_block_ordinals, packet_sentence_ordinals = _packet_key_arrays(
        citation_packet_keys
    )
    cursor.execute(
        CHUNK_ENTITY_PACKET_SQL,
        (
            packet_corpus_ids,
            packet_block_ordinals,
            packet_sentence_ordinals,
            chunk_version_key,
            chunk_version_key,
            normalized_corpus_ids,
            limit_per_paper,
        ),
    )
    entity_rows = cursor.fetchall()
    return citation_rows, entity_rows


def fetch_chunk_structural_rows(
    *,
    corpus_ids: Sequence[int],
    cursor,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
) -> list[dict]:
    normalized_corpus_ids = normalize_corpus_ids(corpus_ids)
    if not normalized_corpus_ids:
        return []

    cursor.execute(
        CHUNK_STRUCTURAL_PACKET_SQL,
        (chunk_version_key, normalized_corpus_ids),
    )
    return cursor.fetchall()


def build_grounded_answer_from_chunks(
    *,
    corpus_ids: Sequence[int],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    limit_per_paper: int = 1,
    connect=None,
) -> GroundedAnswerRecord | None:
    normalized_corpus_ids = normalize_corpus_ids(corpus_ids)
    if not normalized_corpus_ids:
        return None

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        citation_rows, entity_rows = fetch_chunk_grounding_rows(
            corpus_ids=normalized_corpus_ids,
            cursor=cur,
            chunk_version_key=chunk_version_key,
            limit_per_paper=limit_per_paper,
        )
        packet_corpus_ids = {
            int(row["corpus_id"])
            for row in [*citation_rows, *entity_rows]
            if row.get("corpus_id") is not None
        }
        structural_rows = fetch_chunk_structural_rows(
            corpus_ids=[
                corpus_id
                for corpus_id in normalized_corpus_ids
                if corpus_id not in packet_corpus_ids
            ],
            cursor=cur,
            chunk_version_key=chunk_version_key,
        )

    return build_grounded_answer_from_warehouse_rows(
        citation_rows=citation_rows,
        entity_rows=entity_rows,
        segment_texts=segment_texts,
        segment_corpus_ids=segment_corpus_ids,
        corpus_order=normalized_corpus_ids,
        structural_rows=structural_rows,
    )
