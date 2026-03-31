"""Read-side helpers for chunk-backed grounded answers."""

from __future__ import annotations

from collections.abc import Sequence

from app import db
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag.serving_contract import GroundedAnswerRecord
from app.rag.warehouse_grounding import build_grounded_answer_from_warehouse_rows

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
        (m.canonical_sentence_ordinal IS NOT NULL AND cm.canonical_sentence_ordinal = m.canonical_sentence_ordinal)
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
SELECT DISTINCT ON (
    e.corpus_id,
    e.source_start_offset,
    e.source_end_offset
)
    e.*
FROM solemd.paper_entity_mentions e
JOIN solemd.paper_chunk_members cm
  ON cm.chunk_version_key = %s
 AND cm.corpus_id = e.corpus_id
 AND cm.canonical_block_ordinal = e.canonical_block_ordinal
 AND (
    (e.canonical_sentence_ordinal IS NOT NULL AND cm.canonical_sentence_ordinal = e.canonical_sentence_ordinal)
    OR (e.canonical_sentence_ordinal IS NULL AND cm.canonical_sentence_ordinal IS NULL)
 )
JOIN solemd.paper_chunks c
  ON c.chunk_version_key = cm.chunk_version_key
 AND c.corpus_id = cm.corpus_id
 AND c.chunk_ordinal = cm.chunk_ordinal
WHERE
    e.corpus_id = ANY(%s)
    AND e.canonical_block_ordinal IS NOT NULL
ORDER BY
    e.corpus_id,
    e.source_start_offset,
    e.source_end_offset,
    c.chunk_ordinal
"""


def fetch_chunk_grounding_rows(
    *,
    corpus_ids: Sequence[int],
    cursor,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    limit_per_paper: int = 1,
) -> tuple[list[dict], list[dict]]:
    normalized_corpus_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
    if not normalized_corpus_ids:
        return [], []

    cursor.execute(
        CHUNK_CITATION_PACKET_SQL,
        (chunk_version_key, normalized_corpus_ids, limit_per_paper),
    )
    citation_rows = cursor.fetchall()
    cursor.execute(
        CHUNK_ENTITY_PACKET_SQL,
        (chunk_version_key, normalized_corpus_ids),
    )
    entity_rows = cursor.fetchall()
    return citation_rows, entity_rows


def build_grounded_answer_from_chunks(
    *,
    corpus_ids: Sequence[int],
    segment_texts: Sequence[str],
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    limit_per_paper: int = 1,
    connect=None,
) -> GroundedAnswerRecord | None:
    normalized_corpus_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
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

    return build_grounded_answer_from_warehouse_rows(
        citation_rows=citation_rows,
        entity_rows=entity_rows,
        segment_texts=segment_texts,
    )
