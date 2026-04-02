"""Read-side helpers for building grounded answers from persisted warehouse rows."""

from __future__ import annotations

from collections.abc import Sequence
from contextlib import nullcontext

from app import db
from app.rag.grounding_keys import PacketKey, row_packet_key
from app.rag.grounding_packets import build_cited_span_packet, build_structural_span_packet
from app.rag.query_enrichment import normalize_query_text
from app.rag.rag_schema_contract import PaperBlockRow, PaperSentenceRow
from app.rag.runtime_trace import RuntimeTraceCollector
from app.rag.serving_contract import GroundedAnswerRecord
from app.rag.source_grounding import build_grounded_answer_from_packets
from app.rag.text_alignment import score_text_alignment
from app.rag.warehouse_contract import PaperCitationMentionRow, PaperEntityMentionRow
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY

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
        e.source_end_offset
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
        CASE e.alignment_status
            WHEN 'exact' THEN 0
            WHEN 'bounded' THEN 1
            ELSE 2
        END AS alignment_rank,
        CASE WHEN e.canonical_sentence_ordinal IS NULL THEN 1 ELSE 0 END AS sentence_rank,
        e.source_start_offset
    FROM solemd.paper_entity_mentions e
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
                candidate.canonical_block_ordinal,
                candidate.source_start_offset
        ) AS packet_rank
    FROM fallback_packet_candidates candidate
),
fallback_packet_entities AS (
    SELECT
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
)
SELECT *
FROM exact_packet_entities
UNION ALL
SELECT *
FROM fallback_packet_entities
ORDER BY
    corpus_id,
    packet_rank,
    canonical_block_ordinal,
    canonical_sentence_ordinal NULLS LAST,
    source_start_offset
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


def _trace_stage(trace: RuntimeTraceCollector | None, name: str):
    if trace is None:
        return nullcontext()
    return trace.stage(name)


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
        WAREHOUSE_ENTITY_PACKET_SQL,
        (
            packet_corpus_ids,
            packet_block_ordinals,
            packet_sentence_ordinals,
            normalized_corpus_ids,
            limit_per_paper,
        ),
    )
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


def _group_entity_packet_entries(
    entity_rows: Sequence[dict],
) -> dict[tuple[int, int, int | None], dict[str, object]]:
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
    return grouped_entities


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


def _normalized_segment_text_by_corpus(
    *,
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None,
) -> dict[int, str]:
    if not segment_corpus_ids:
        return {}
    segment_text_by_corpus: dict[int, str] = {}
    for index, corpus_id in enumerate(segment_corpus_ids):
        if corpus_id is None or index >= len(segment_texts):
            continue
        normalized = normalize_query_text(segment_texts[index])
        if normalized:
            segment_text_by_corpus[int(corpus_id)] = normalized
    return segment_text_by_corpus


def _structural_packet_score(
    *,
    row_text: str,
    segment_text: str | None,
) -> tuple[int, int, float]:
    alignment = score_text_alignment(row_text, segment_text)
    if not alignment.normalized_candidate:
        return (0, 0, 0.0)
    if not alignment.normalized_query:
        return (0, len(alignment.normalized_candidate.split()), 0.0)
    return (
        alignment.containment,
        alignment.token_overlap,
        alignment.candidate_focus,
    )


def _build_structural_packets_from_rows(
    *,
    structural_rows: Sequence[dict],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None,
    covered_corpus_ids: set[int],
) -> list:
    if not structural_rows:
        return []

    segment_text_by_corpus = _normalized_segment_text_by_corpus(
        segment_texts=segment_texts,
        segment_corpus_ids=segment_corpus_ids,
    )
    best_rows_by_corpus: dict[int, dict] = {}
    for row in structural_rows:
        corpus_id = int(row["corpus_id"])
        if corpus_id in covered_corpus_ids:
            continue
        candidate_text = row.get("sentence_text") or row.get("block_text") or row.get("chunk_text")
        if not candidate_text:
            continue
        best_row = best_rows_by_corpus.get(corpus_id)
        segment_text = segment_text_by_corpus.get(corpus_id)
        candidate_score = _structural_packet_score(
            row_text=candidate_text,
            segment_text=segment_text,
        )
        if best_row is None:
            best_rows_by_corpus[corpus_id] = row | {"_score": candidate_score}
            continue
        if candidate_score > best_row["_score"]:
            best_rows_by_corpus[corpus_id] = row | {"_score": candidate_score}
            continue
        if candidate_score == best_row["_score"]:
            candidate_order = (
                int(row.get("chunk_ordinal") or 0),
                int(row.get("member_ordinal") or 0),
            )
            best_order = (
                int(best_row.get("chunk_ordinal") or 0),
                int(best_row.get("member_ordinal") or 0),
            )
            if candidate_order < best_order:
                best_rows_by_corpus[corpus_id] = row | {"_score": candidate_score}

    packets = []
    for corpus_id, row in sorted(best_rows_by_corpus.items()):
        block, sentence = _build_block_and_sentence_from_row(
            row,
            block_ordinal_key="canonical_block_ordinal",
            sentence_ordinal_key="canonical_sentence_ordinal",
        )
        packets.append(
            build_structural_span_packet(
                block=block,
                sentence=sentence,
                packet_suffix=f"chunk{int(row.get('chunk_ordinal') or 0)}",
            )
        )
    return packets


def build_grounded_answer_from_warehouse_rows(
    *,
    citation_rows: Sequence[dict],
    entity_rows: Sequence[dict],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    corpus_order: Sequence[int] | None = None,
    structural_rows: Sequence[dict] = (),
    trace: RuntimeTraceCollector | None = None,
) -> GroundedAnswerRecord | None:
    """Build a grounded answer from already-fetched warehouse rows."""

    if not citation_rows and not entity_rows and not structural_rows:
        return None

    if trace is not None:
        trace.record_counts(
            {
                "grounded_answer_citation_rows": len(citation_rows),
                "grounded_answer_entity_rows": len(entity_rows),
                "grounded_answer_structural_rows": len(structural_rows),
            }
        )

    with _trace_stage(trace, "grounded_answer_group_entities"):
        grouped_entities = _group_entity_packet_entries(entity_rows)
    if trace is not None:
        trace.record_count("grounded_answer_grouped_entity_packets", len(grouped_entities))

    packets = []
    packet_keys_with_packets: set[tuple[int, int, int | None]] = set()
    with _trace_stage(trace, "grounded_answer_build_citation_packets"):
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
            packet_keys_with_packets.add(packet_key)
            packets.append(
                build_cited_span_packet(
                    block=block,
                    sentence=sentence,
                    citation_rows=[citation],
                    entity_rows=grouped_entities.get(packet_key, {}).get("entities", []),
                )
            )

    if grouped_entities:
        with _trace_stage(trace, "grounded_answer_build_entity_only_packets"):
            for packet_key, entry in grouped_entities.items():
                if packet_key in packet_keys_with_packets:
                    continue
                packets.append(
                    build_cited_span_packet(
                        block=entry["block"],
                        sentence=entry["sentence"],
                        citation_rows=[],
                        entity_rows=entry["entities"],
                    )
                )

    if structural_rows:
        with _trace_stage(trace, "grounded_answer_build_structural_packets"):
            packets.extend(
                _build_structural_packets_from_rows(
                    structural_rows=structural_rows,
                    segment_texts=segment_texts,
                    segment_corpus_ids=segment_corpus_ids,
                    covered_corpus_ids={packet.corpus_id for packet in packets},
                )
            )

    if not packets:
        return None

    if trace is not None:
        trace.record_count("grounded_answer_packet_count", len(packets))

    with _trace_stage(trace, "grounded_answer_sort_packets"):
        sorted_packets = _sort_packets_by_corpus_order(
            packets,
            corpus_order=corpus_order,
        )
    with _trace_stage(trace, "grounded_answer_build_from_packets"):
        return build_grounded_answer_from_packets(
            segment_texts=segment_texts,
            segment_corpus_ids=segment_corpus_ids,
            packets=sorted_packets,
        )


def build_grounded_answer_from_warehouse(
    *,
    corpus_ids: Sequence[int],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    limit_per_paper: int = 1,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    connect=None,
    trace: RuntimeTraceCollector | None = None,
) -> GroundedAnswerRecord | None:
    """Build a structured grounded answer from persisted warehouse spans if available."""

    normalized_corpus_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
    if not normalized_corpus_ids:
        return None

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        with _trace_stage(trace, "grounded_answer_fetch_warehouse_packets"):
            citation_rows, entity_rows = fetch_warehouse_grounding_rows(
                corpus_ids=normalized_corpus_ids,
                limit_per_paper=limit_per_paper,
                cursor=cur,
            )
        packet_corpus_ids = {
            int(row["corpus_id"])
            for row in [*citation_rows, *entity_rows]
            if row.get("corpus_id") is not None
        }
        structural_rows = []
        if packet_corpus_ids != set(normalized_corpus_ids):
            from app.rag.chunk_grounding import fetch_chunk_structural_rows

            with _trace_stage(trace, "grounded_answer_fetch_warehouse_structural"):
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
        trace=trace,
    )
