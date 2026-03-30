"""Read-side helpers for building grounded answers from live warehouse tables."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from app import db
from app.rag.grounding_packets import build_cited_span_packet
from app.rag.rag_schema_contract import PaperBlockRow, PaperSentenceRow
from app.rag.serving_contract import GroundedAnswerRecord
from app.rag.source_grounding import build_grounded_answer_from_packets
from app.rag.warehouse_contract import PaperCitationMentionRow, PaperEntityMentionRow

WAREHOUSE_CITATION_PACKET_SQL = """
WITH ranked_mentions AS (
    SELECT
        m.*,
        ROW_NUMBER() OVER (
            PARTITION BY m.corpus_id
            ORDER BY
                CASE m.alignment_status
                    WHEN 'exact' THEN 0
                    WHEN 'bounded' THEN 1
                    ELSE 2
                END,
                CASE WHEN m.canonical_sentence_ordinal IS NULL THEN 1 ELSE 0 END,
                m.source_start_offset
        ) AS packet_rank
    FROM solemd.paper_citation_mentions m
    WHERE
        m.corpus_id = ANY(%s)
        AND m.canonical_block_ordinal IS NOT NULL
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

WAREHOUSE_ENTITY_PACKET_SQL = """
SELECT
    e.*
FROM solemd.paper_entity_mentions e
WHERE
    e.corpus_id = ANY(%s)
    AND e.canonical_block_ordinal IS NOT NULL
ORDER BY
    e.corpus_id,
    e.canonical_block_ordinal,
    e.canonical_sentence_ordinal NULLS LAST,
    e.source_start_offset
"""


def build_grounded_answer_from_warehouse(
    *,
    corpus_ids: Sequence[int],
    segment_texts: Sequence[str],
    limit_per_paper: int = 1,
    connect=None,
) -> GroundedAnswerRecord | None:
    """Build a structured grounded answer from persisted warehouse spans if available."""

    normalized_corpus_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
    if not normalized_corpus_ids:
        return None

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(WAREHOUSE_CITATION_PACKET_SQL, (normalized_corpus_ids, limit_per_paper))
        citation_rows = cur.fetchall()
        cur.execute(WAREHOUSE_ENTITY_PACKET_SQL, (normalized_corpus_ids,))
        entity_rows = cur.fetchall()

    if not citation_rows:
        return None

    entity_by_packet: dict[tuple[int, int, int | None], list[PaperEntityMentionRow]] = defaultdict(list)
    for row in entity_rows:
        entity = PaperEntityMentionRow.model_validate(row)
        packet_key = (
            entity.corpus_id,
            entity.canonical_block_ordinal,
            entity.canonical_sentence_ordinal,
        )
        entity_by_packet[packet_key].append(entity)

    packets = []
    for row in citation_rows:
        citation = PaperCitationMentionRow.model_validate(
            {
                key: row[key]
                for key in PaperCitationMentionRow.model_fields
            }
        )
        block = PaperBlockRow(
            corpus_id=int(row["corpus_id"]),
            block_ordinal=int(row["canonical_block_ordinal"]),
            section_ordinal=int(row["block_section_ordinal"]),
            section_role=row["block_section_role"],
            block_kind=row["block_kind"],
            text=row["block_text"],
            is_retrieval_default=bool(row.get("block_is_retrieval_default", True)),
            linked_asset_ref=row.get("block_linked_asset_ref"),
        )
        sentence = None
        if row.get("canonical_sentence_ordinal") is not None and row.get("sentence_text"):
            sentence = PaperSentenceRow(
                corpus_id=int(row["corpus_id"]),
                block_ordinal=int(row["canonical_block_ordinal"]),
                sentence_ordinal=int(row["canonical_sentence_ordinal"]),
                section_ordinal=int(row.get("sentence_section_ordinal") or row["block_section_ordinal"]),
                segmentation_source=row.get("sentence_segmentation_source") or "deterministic_fallback",
                text=row["sentence_text"],
            )
        packet_key = (
            citation.corpus_id,
            citation.canonical_block_ordinal,
            citation.canonical_sentence_ordinal,
        )
        packets.append(
            build_cited_span_packet(
                block=block,
                sentence=sentence,
                citation_rows=[citation],
                entity_rows=entity_by_packet.get(packet_key, []),
            )
        )

    if not packets:
        return None

    return build_grounded_answer_from_packets(
        segment_texts=segment_texts,
        packets=packets,
    )
