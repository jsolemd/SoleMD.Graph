"""Helpers for assembling cited-span packets and inline citation anchors."""

from __future__ import annotations

from collections import OrderedDict

from app.rag.parse_contract import PaperBlockRecord, PaperSentenceRecord
from app.rag.serving_contract import (
    AnswerSegment,
    CitedEntityPacket,
    CitedSpanPacket,
    GroundedAnswerRecord,
    InlineCitationAnchor,
    derive_answer_linked_corpus_ids,
)
from app.rag.warehouse_contract import (
    AlignmentStatus,
    PaperCitationMentionRow,
    PaperEntityMentionRow,
    SpanOrigin,
)


def build_packet_id(
    *, corpus_id: int, block_ordinal: int, sentence_ordinal: int | None = None
) -> str:
    if sentence_ordinal is None:
        return f"span:{corpus_id}:b{block_ordinal}"
    return f"span:{corpus_id}:b{block_ordinal}:s{sentence_ordinal}"


def build_cited_span_packet(
    *,
    block: PaperBlockRecord,
    sentence: PaperSentenceRecord | None,
    citation_rows: list[PaperCitationMentionRow],
    entity_rows: list[PaperEntityMentionRow],
) -> CitedSpanPacket:
    if not citation_rows and not entity_rows:
        raise ValueError("build_cited_span_packet requires citation rows or entity rows")
    packet_id = build_packet_id(
        corpus_id=block.corpus_id,
        block_ordinal=block.block_ordinal,
        sentence_ordinal=None if sentence is None else sentence.sentence_ordinal,
    )
    text = block.text if sentence is None else sentence.text
    source_citation_keys = [
        row.source_citation_key for row in citation_rows if row.source_citation_key
    ]
    source_reference_keys = [
        row.source_reference_key
        for row in citation_rows
        if row.source_reference_key
    ]
    entity_mentions = [
        CitedEntityPacket(
            entity_type=row.entity_type,
            text=row.text,
            concept_namespace=row.concept_namespace,
            concept_id=row.concept_id,
            source_identifier=row.source_identifier,
        )
        for row in entity_rows
    ]
    anchor_source = citation_rows[0] if citation_rows else None
    return CitedSpanPacket(
        packet_id=packet_id,
        corpus_id=block.corpus_id,
        canonical_section_ordinal=block.section_ordinal,
        canonical_block_ordinal=block.block_ordinal,
        canonical_sentence_ordinal=None if sentence is None else sentence.sentence_ordinal,
        section_role=block.section_role,
        block_kind=block.block_kind,
        span_origin=anchor_source.span_origin if anchor_source else entity_rows[0].span_origin,
        alignment_status=(
            anchor_source.alignment_status if anchor_source else entity_rows[0].alignment_status
        ),
        alignment_confidence=(
            anchor_source.alignment_confidence
            if anchor_source
            else entity_rows[0].alignment_confidence
        ),
        text=text,
        quote_text=text,
        source_citation_keys=list(OrderedDict.fromkeys(source_citation_keys)),
        source_reference_keys=list(OrderedDict.fromkeys(source_reference_keys)),
        entity_mentions=entity_mentions,
    )


def build_structural_span_packet(
    *,
    block: PaperBlockRecord,
    sentence: PaperSentenceRecord | None,
    packet_suffix: str | None = None,
) -> CitedSpanPacket:
    packet_id = build_packet_id(
        corpus_id=block.corpus_id,
        block_ordinal=block.block_ordinal,
        sentence_ordinal=None if sentence is None else sentence.sentence_ordinal,
    )
    if packet_suffix:
        packet_id = f"{packet_id}:{packet_suffix}"
    text = block.text if sentence is None else sentence.text
    return CitedSpanPacket(
        packet_id=packet_id,
        corpus_id=block.corpus_id,
        canonical_section_ordinal=block.section_ordinal,
        canonical_block_ordinal=block.block_ordinal,
        canonical_sentence_ordinal=None if sentence is None else sentence.sentence_ordinal,
        section_role=block.section_role,
        block_kind=block.block_kind,
        span_origin=SpanOrigin.PRIMARY_TEXT,
        alignment_status=AlignmentStatus.EXACT,
        alignment_confidence=1.0,
        text=text,
        quote_text=text,
        source_citation_keys=[],
        source_reference_keys=[],
        entity_mentions=[],
    )


def build_inline_citation_anchors(
    packets: list[CitedSpanPacket],
) -> list[InlineCitationAnchor]:
    anchors: list[InlineCitationAnchor] = []
    for ordinal, packet in enumerate(packets, start=1):
        anchors.append(
            InlineCitationAnchor(
                anchor_id=f"anchor:{ordinal}",
                label=f"[{ordinal}]",
                cited_span_ids=[packet.packet_id],
                cited_corpus_ids=[packet.corpus_id],
                short_evidence_label=packet.quote_text,
            )
        )
    return anchors


def build_grounded_answer_record(
    *,
    segments: list[AnswerSegment],
    cited_spans: list[CitedSpanPacket],
    inline_citations: list[InlineCitationAnchor],
) -> GroundedAnswerRecord:
    return GroundedAnswerRecord(
        segments=segments,
        inline_citations=inline_citations,
        cited_spans=cited_spans,
        answer_linked_corpus_ids=derive_answer_linked_corpus_ids(
            cited_spans=cited_spans,
            inline_citations=inline_citations,
        ),
    )
