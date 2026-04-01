"""Non-DB grounding adapters from parsed sources into cited-span payloads."""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Sequence

from app.rag.alignment import align_span_to_canonical_ordinals
from app.rag.grounding_packets import (
    build_cited_span_packet,
    build_grounded_answer_record,
    build_inline_citation_anchors,
)
from app.rag.serving_contract import AnswerSegment, CitedSpanPacket, GroundedAnswerRecord
from app.rag.source_selection import GroundingSourcePlan
from app.rag.warehouse_contract import (
    AlignmentStatus,
    PaperCitationMentionRow,
    PaperEntityMentionRow,
    SpanOrigin,
    citation_row_from_parse,
    entity_row_from_parse,
)
from app.rag_ingest.source_parsers import ParsedPaperSource


def _align_primary_citations(
    primary_source: ParsedPaperSource,
    *,
    source_citation_keys: Sequence[str] | None = None,
) -> list[PaperCitationMentionRow]:
    allowed_keys = (
        set(item for item in source_citation_keys if item)
        if source_citation_keys is not None
        else None
    )
    rows: list[PaperCitationMentionRow] = []
    for citation in primary_source.citations:
        if allowed_keys is not None and citation.source_citation_key not in allowed_keys:
            continue
        alignment = align_span_to_canonical_ordinals(
            start_offset=citation.source_start_offset,
            end_offset=citation.source_end_offset,
            canonical_blocks=primary_source.blocks,
            canonical_sentences=primary_source.sentences,
        )
        rows.append(
            citation_row_from_parse(
                citation,
                span_origin=SpanOrigin.PRIMARY_TEXT,
                alignment_status=alignment.alignment_status,
                alignment_confidence=alignment.alignment_confidence,
                canonical_section_ordinal=alignment.canonical_section_ordinal,
                canonical_block_ordinal=alignment.canonical_block_ordinal,
                canonical_sentence_ordinal=alignment.canonical_sentence_ordinal,
            )
        )
    return rows


def _align_overlay_entities(
    primary_source: ParsedPaperSource,
    annotation_sources: Sequence[ParsedPaperSource],
) -> list[PaperEntityMentionRow]:
    rows: list[PaperEntityMentionRow] = []
    for source in annotation_sources:
        if source.document.corpus_id != primary_source.document.corpus_id:
            continue
        for entity in source.entities:
            alignment = align_span_to_canonical_ordinals(
                start_offset=entity.source_start_offset,
                end_offset=entity.source_end_offset,
                canonical_blocks=primary_source.blocks,
                canonical_sentences=primary_source.sentences,
            )
            rows.append(
                entity_row_from_parse(
                    entity,
                    span_origin=SpanOrigin.ANNOTATION_OVERLAY,
                    alignment_status=alignment.alignment_status,
                    alignment_confidence=alignment.alignment_confidence,
                    canonical_section_ordinal=alignment.canonical_section_ordinal,
                    canonical_block_ordinal=alignment.canonical_block_ordinal,
                    canonical_sentence_ordinal=alignment.canonical_sentence_ordinal,
                )
            )
    return rows


def _align_primary_entities(
    primary_source: ParsedPaperSource,
) -> list[PaperEntityMentionRow]:
    rows: list[PaperEntityMentionRow] = []
    for entity in primary_source.entities:
        alignment = align_span_to_canonical_ordinals(
            start_offset=entity.source_start_offset,
            end_offset=entity.source_end_offset,
            canonical_blocks=primary_source.blocks,
            canonical_sentences=primary_source.sentences,
        )
        rows.append(
            entity_row_from_parse(
                entity,
                span_origin=SpanOrigin.PRIMARY_TEXT,
                alignment_status=alignment.alignment_status,
                alignment_confidence=alignment.alignment_confidence,
                canonical_section_ordinal=alignment.canonical_section_ordinal,
                canonical_block_ordinal=alignment.canonical_block_ordinal,
                canonical_sentence_ordinal=alignment.canonical_sentence_ordinal,
            )
        )
    return rows


def _citation_group_key(row: PaperCitationMentionRow) -> tuple[int, int, int | None] | None:
    if row.canonical_section_ordinal is None or row.canonical_block_ordinal is None:
        return None
    return (
        row.canonical_section_ordinal,
        row.canonical_block_ordinal,
        row.canonical_sentence_ordinal,
    )


def _entity_group_key(row: PaperEntityMentionRow) -> tuple[int, int, int | None] | None:
    if row.canonical_section_ordinal is None or row.canonical_block_ordinal is None:
        return None
    return (
        row.canonical_section_ordinal,
        row.canonical_block_ordinal,
        row.canonical_sentence_ordinal,
    )


def build_cited_span_packets_from_sources(
    *,
    primary_source: ParsedPaperSource,
    annotation_sources: Sequence[ParsedPaperSource] = (),
    source_citation_keys: Sequence[str] | None = None,
) -> list[CitedSpanPacket]:
    citation_rows = _align_primary_citations(
        primary_source,
        source_citation_keys=source_citation_keys,
    )
    entity_rows = build_aligned_entity_rows_from_sources(
        primary_source=primary_source,
        annotation_sources=annotation_sources,
    )

    grouped: OrderedDict[
        tuple[int, int, int | None],
        dict[str, list[PaperCitationMentionRow] | list[PaperEntityMentionRow]],
    ] = OrderedDict()
    for row in citation_rows:
        if row.alignment_status == AlignmentStatus.SOURCE_LOCAL_ONLY:
            continue
        key = _citation_group_key(row)
        if key is None:
            continue
        entry = grouped.setdefault(key, {"citations": [], "entities": []})
        entry["citations"].append(row)
    for row in entity_rows:
        if row.alignment_status == AlignmentStatus.SOURCE_LOCAL_ONLY:
            continue
        key = _entity_group_key(row)
        if key is None:
            continue
        entry = grouped.get(key)
        if entry is None:
            continue
        entry["entities"].append(row)

    packets: list[CitedSpanPacket] = []
    block_by_ordinal = {block.block_ordinal: block for block in primary_source.blocks}
    sentence_by_key = {
        (sentence.block_ordinal, sentence.sentence_ordinal): sentence
        for sentence in primary_source.sentences
    }

    for (section_ordinal, block_ordinal, sentence_ordinal), grouped_rows in grouped.items():
        if not grouped_rows["citations"]:
            continue
        block = block_by_ordinal.get(block_ordinal)
        if block is None:
            continue
        sentence = (
            None
            if sentence_ordinal is None
            else sentence_by_key.get((block_ordinal, sentence_ordinal))
        )
        packets.append(
            build_cited_span_packet(
                block=block,
                sentence=sentence,
                citation_rows=list(grouped_rows["citations"]),
                entity_rows=list(grouped_rows["entities"]),
            )
        )

    packets.sort(
        key=lambda packet: (
            packet.canonical_section_ordinal,
            packet.canonical_block_ordinal,
            packet.canonical_sentence_ordinal or -1,
        )
    )
    return packets


def build_aligned_entity_rows_from_sources(
    *,
    primary_source: ParsedPaperSource,
    annotation_sources: Sequence[ParsedPaperSource] = (),
) -> list[PaperEntityMentionRow]:
    return [
        *_align_primary_entities(primary_source),
        *_align_overlay_entities(primary_source, annotation_sources),
    ]


def build_aligned_mention_rows_from_sources(
    *,
    primary_source: ParsedPaperSource,
    annotation_sources: Sequence[ParsedPaperSource] = (),
    source_citation_keys: Sequence[str] | None = None,
) -> tuple[list[PaperCitationMentionRow], list[PaperEntityMentionRow]]:
    return (
        _align_primary_citations(
            primary_source,
            source_citation_keys=source_citation_keys,
        ),
        build_aligned_entity_rows_from_sources(
            primary_source=primary_source,
            annotation_sources=annotation_sources,
        ),
    )


def build_aligned_mention_rows_from_plan(
    plan: GroundingSourcePlan,
    *,
    source_citation_keys: Sequence[str] | None = None,
) -> tuple[list[PaperCitationMentionRow], list[PaperEntityMentionRow]]:
    return build_aligned_mention_rows_from_sources(
        primary_source=plan.primary_source,
        annotation_sources=plan.annotation_sources,
        source_citation_keys=source_citation_keys,
    )


def build_cited_span_packets_from_plan(
    plan: GroundingSourcePlan,
    *,
    source_citation_keys: Sequence[str] | None = None,
) -> list[CitedSpanPacket]:
    return build_cited_span_packets_from_sources(
        primary_source=plan.primary_source,
        annotation_sources=plan.annotation_sources,
        source_citation_keys=source_citation_keys,
    )


def build_grounded_answer_from_packets(
    *,
    segment_texts: Sequence[str],
    packets: Sequence[CitedSpanPacket],
    segment_corpus_ids: Sequence[int | None] | None = None,
) -> GroundedAnswerRecord:
    cited_spans = list(packets)
    inline_citations = build_inline_citation_anchors(cited_spans)
    if not cited_spans:
        return build_grounded_answer_record(
            segments=[
                AnswerSegment(segment_ordinal=index, text=text)
                for index, text in enumerate(segment_texts)
                if text
            ],
            cited_spans=[],
            inline_citations=[],
        )

    segments: list[AnswerSegment] = []
    if segment_corpus_ids is not None and len(segment_corpus_ids) != len(segment_texts):
        raise ValueError("segment_corpus_ids must match segment_texts length")

    if len(segment_texts) <= 1 and segment_corpus_ids is None:
        text = (
            segment_texts[0]
            if segment_texts
            else cited_spans[0].quote_text or cited_spans[0].text
        )
        segments.append(
            AnswerSegment(
                segment_ordinal=0,
                text=text,
                citation_anchor_ids=[anchor.anchor_id for anchor in inline_citations],
            )
        )
    else:
        anchor_ids_by_corpus_id: dict[int, list[str]] = {}
        if segment_corpus_ids is not None:
            for anchor in inline_citations:
                for corpus_id in anchor.cited_corpus_ids:
                    anchor_ids_by_corpus_id.setdefault(corpus_id, []).append(anchor.anchor_id)
        for index, text in enumerate(segment_texts):
            if not text:
                continue
            anchor_ids: list[str] = []
            if segment_corpus_ids is not None:
                corpus_id = segment_corpus_ids[index]
                if corpus_id is not None:
                    anchor_ids = anchor_ids_by_corpus_id.get(corpus_id, [])
            elif index < len(inline_citations):
                anchor_ids = [inline_citations[index].anchor_id]
            segments.append(
                AnswerSegment(
                    segment_ordinal=index,
                    text=text,
                    citation_anchor_ids=anchor_ids,
                )
            )

    return build_grounded_answer_record(
        segments=segments,
        cited_spans=cited_spans,
        inline_citations=inline_citations,
    )


def build_grounded_answer_from_plan(
    plan: GroundingSourcePlan,
    *,
    segment_texts: Sequence[str],
    source_citation_keys: Sequence[str] | None = None,
) -> GroundedAnswerRecord:
    packets = build_cited_span_packets_from_plan(
        plan,
        source_citation_keys=source_citation_keys,
    )
    return build_grounded_answer_from_packets(
        segment_texts=segment_texts,
        packets=packets,
    )
