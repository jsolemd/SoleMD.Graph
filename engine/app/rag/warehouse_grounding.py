"""Read-side helpers for building grounded answers from persisted warehouse rows."""

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
    e.*,
    b.section_ordinal AS block_section_ordinal,
    b.section_role AS block_section_role,
    b.block_kind AS block_kind,
    b.text AS block_text,
    b.is_retrieval_default AS block_is_retrieval_default,
    b.linked_asset_ref AS block_linked_asset_ref,
    s.section_ordinal AS sentence_section_ordinal,
    s.segmentation_source AS sentence_segmentation_source,
    s.text AS sentence_text
FROM solemd.paper_entity_mentions e
JOIN solemd.paper_blocks b
  ON b.corpus_id = e.corpus_id
 AND b.block_ordinal = e.canonical_block_ordinal
LEFT JOIN solemd.paper_sentences s
  ON s.corpus_id = e.corpus_id
 AND s.block_ordinal = e.canonical_block_ordinal
 AND s.sentence_ordinal = e.canonical_sentence_ordinal
WHERE
    e.corpus_id = ANY(%s)
    AND e.canonical_block_ordinal IS NOT NULL
ORDER BY
    e.corpus_id,
    e.canonical_block_ordinal,
    e.canonical_sentence_ordinal NULLS LAST,
    e.source_start_offset
"""


def fetch_warehouse_grounding_rows(
    *,
    corpus_ids: Sequence[int],
    limit_per_paper: int = 1,
    cursor,
) -> tuple[list[dict], list[dict]]:
    """Fetch persisted citation/entity rows for grounded answer assembly."""

    normalized_corpus_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
    if not normalized_corpus_ids:
        return [], []

    cursor.execute(WAREHOUSE_CITATION_PACKET_SQL, (normalized_corpus_ids, limit_per_paper))
    citation_rows = cursor.fetchall()
    cursor.execute(WAREHOUSE_ENTITY_PACKET_SQL, (normalized_corpus_ids,))
    entity_rows = cursor.fetchall()
    return citation_rows, entity_rows


def _build_block_and_sentence_from_row(
    row: dict,
    *,
    block_ordinal_key: str,
    sentence_ordinal_key: str,
) -> tuple[PaperBlockRow, PaperSentenceRow | None]:
    block = PaperBlockRow(
        corpus_id=int(row["corpus_id"]),
        block_ordinal=int(row[block_ordinal_key]),
        section_ordinal=int(row["block_section_ordinal"]),
        section_role=row["block_section_role"],
        block_kind=row["block_kind"],
        text=row["block_text"],
        is_retrieval_default=bool(row.get("block_is_retrieval_default", True)),
        linked_asset_ref=row.get("block_linked_asset_ref"),
    )
    sentence = None
    if row.get(sentence_ordinal_key) is not None and row.get("sentence_text"):
        sentence = PaperSentenceRow(
            corpus_id=int(row["corpus_id"]),
            block_ordinal=int(row[block_ordinal_key]),
            sentence_ordinal=int(row[sentence_ordinal_key]),
            section_ordinal=int(
                row.get("sentence_section_ordinal") or row["block_section_ordinal"]
            ),
            segmentation_source=row.get("sentence_segmentation_source")
            or "deterministic_fallback",
            text=row["sentence_text"],
        )
    return block, sentence


def _build_entity_from_row(row: dict) -> PaperEntityMentionRow:
    return PaperEntityMentionRow.model_validate(
        {
            key: row[key]
            for key in PaperEntityMentionRow.model_fields
        }
    )


def _sort_packets_by_corpus_order(
    packets,
    *,
    corpus_order: Sequence[int] | None,
):
    if not packets:
        return []
    if not corpus_order:
        return sorted(
            packets,
            key=lambda packet: (
                packet.corpus_id,
                packet.canonical_section_ordinal,
                packet.canonical_block_ordinal,
                packet.canonical_sentence_ordinal or -1,
            ),
        )
    rank_by_corpus = {int(corpus_id): index for index, corpus_id in enumerate(corpus_order)}
    return sorted(
        packets,
        key=lambda packet: (
            rank_by_corpus.get(packet.corpus_id, len(rank_by_corpus)),
            packet.canonical_section_ordinal,
            packet.canonical_block_ordinal,
            packet.canonical_sentence_ordinal or -1,
        ),
    )


def build_grounded_answer_from_warehouse_rows(
    *,
    citation_rows: Sequence[dict],
    entity_rows: Sequence[dict],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    corpus_order: Sequence[int] | None = None,
) -> GroundedAnswerRecord | None:
    """Build a grounded answer from already-fetched warehouse rows."""

    if not citation_rows and not entity_rows:
        return None

    entity_by_packet: dict[
        tuple[int, int, int | None],
        list[PaperEntityMentionRow],
    ] = defaultdict(list)
    for row in entity_rows:
        entity = _build_entity_from_row(row)
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
        block, sentence = _build_block_and_sentence_from_row(
            row,
            block_ordinal_key="canonical_block_ordinal",
            sentence_ordinal_key="canonical_sentence_ordinal",
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

    if not packets and entity_rows:
        grouped_entities: dict[
            tuple[int, int, int | None],
            dict[str, object],
        ] = {}
        for row in entity_rows:
            entity = _build_entity_from_row(row)
            packet_key = (
                entity.corpus_id,
                entity.canonical_block_ordinal,
                entity.canonical_sentence_ordinal,
            )
            entry = grouped_entities.get(packet_key)
            if entry is None:
                block, sentence = _build_block_and_sentence_from_row(
                    row,
                    block_ordinal_key="canonical_block_ordinal",
                    sentence_ordinal_key="canonical_sentence_ordinal",
                )
                entry = {
                    "block": block,
                    "sentence": sentence,
                    "entities": [],
                }
                grouped_entities[packet_key] = entry
            entry["entities"].append(entity)

        for packet_key, entry in grouped_entities.items():
            packets.append(
                build_cited_span_packet(
                    block=entry["block"],
                    sentence=entry["sentence"],
                    citation_rows=[],
                    entity_rows=entry["entities"],
                )
            )

    if not packets:
        return None

    return build_grounded_answer_from_packets(
        segment_texts=segment_texts,
        segment_corpus_ids=segment_corpus_ids,
        packets=_sort_packets_by_corpus_order(
            packets,
            corpus_order=corpus_order,
        ),
    )


def build_grounded_answer_from_warehouse(
    *,
    corpus_ids: Sequence[int],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    limit_per_paper: int = 1,
    connect=None,
) -> GroundedAnswerRecord | None:
    """Build a structured grounded answer from persisted warehouse spans if available."""

    normalized_corpus_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
    if not normalized_corpus_ids:
        return None

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        citation_rows, entity_rows = fetch_warehouse_grounding_rows(
            corpus_ids=normalized_corpus_ids,
            limit_per_paper=limit_per_paper,
            cursor=cur,
        )

    return build_grounded_answer_from_warehouse_rows(
        citation_rows=citation_rows,
        entity_rows=entity_rows,
        segment_texts=segment_texts,
        segment_corpus_ids=segment_corpus_ids,
        corpus_order=normalized_corpus_ids,
    )
