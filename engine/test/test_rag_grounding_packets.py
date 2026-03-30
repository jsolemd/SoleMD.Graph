from __future__ import annotations

import pytest

from app.rag.grounding_packets import (
    build_cited_span_packet,
    build_inline_citation_anchors,
)
from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    PaperSentenceRecord,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)
from app.rag.warehouse_contract import (
    AlignmentStatus,
    PaperCitationMentionRow,
    PaperEntityMentionRow,
    SpanOrigin,
)


def _common_identity() -> dict[str, object]:
    return {
        "corpus_id": 12345,
        "source_system": ParseSourceSystem.S2ORC_V2,
        "source_revision": "2026-03-10",
        "source_document_key": "12345",
        "source_plane": SourcePlane.BODY,
        "parser_version": "parser-v1",
        "raw_attrs_json": {},
    }


def test_build_cited_span_packet_from_aligned_sentence_and_mentions():
    common = _common_identity()
    block = PaperBlockRecord(
        **common,
        source_start_offset=100,
        source_end_offset=180,
        text="Melatonin reduced delirium incidence.",
        block_ordinal=2,
        section_ordinal=1,
        section_role=SectionRole.RESULTS,
        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
    )
    sentence = PaperSentenceRecord(
        **common,
        source_start_offset=100,
        source_end_offset=137,
        text="Melatonin reduced delirium incidence.",
        sentence_ordinal=0,
        block_ordinal=2,
        section_ordinal=1,
        segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
    )
    citation_rows = [
        PaperCitationMentionRow(
            **common,
            span_origin=SpanOrigin.PRIMARY_TEXT,
            alignment_status=AlignmentStatus.EXACT,
            alignment_confidence=1.0,
            source_start_offset=132,
            source_end_offset=135,
            text="[1]",
            canonical_section_ordinal=1,
            canonical_block_ordinal=2,
            canonical_sentence_ordinal=0,
            source_citation_key="b1",
            source_reference_key="b1",
            matched_paper_id="S2:paper-1",
            matched_corpus_id=67890,
        )
    ]
    entity_rows = [
        PaperEntityMentionRow(
            **common,
            span_origin=SpanOrigin.PRIMARY_TEXT,
            alignment_status=AlignmentStatus.EXACT,
            alignment_confidence=1.0,
            source_start_offset=100,
            source_end_offset=109,
            text="Melatonin",
            canonical_section_ordinal=1,
            canonical_block_ordinal=2,
            canonical_sentence_ordinal=0,
            entity_type="Chemical",
            source_identifier="MESH:D008550",
            concept_namespace="mesh",
            concept_id="D008550",
        )
    ]

    packet = build_cited_span_packet(
        block=block,
        sentence=sentence,
        citation_rows=citation_rows,
        entity_rows=entity_rows,
    )

    assert packet.packet_id == "span:12345:b2:s0"
    assert packet.source_reference_keys == ["b1"]
    assert packet.entity_mentions[0].concept_id == "D008550"


def test_build_inline_citation_anchors_derives_anchor_per_packet():
    common = _common_identity()
    block = PaperBlockRecord(
        **common,
        source_start_offset=100,
        source_end_offset=180,
        text="Melatonin reduced delirium incidence.",
        block_ordinal=2,
        section_ordinal=1,
        section_role=SectionRole.RESULTS,
        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
    )
    entity_row = PaperEntityMentionRow(
        **common,
        span_origin=SpanOrigin.PRIMARY_TEXT,
        alignment_status=AlignmentStatus.BOUNDED,
        alignment_confidence=0.7,
        source_start_offset=100,
        source_end_offset=109,
        text="Melatonin",
        canonical_section_ordinal=1,
        canonical_block_ordinal=2,
        entity_type="Chemical",
        source_identifier="MESH:D008550",
        concept_namespace="mesh",
        concept_id="D008550",
    )
    packet = build_cited_span_packet(
        block=block,
        sentence=None,
        citation_rows=[],
        entity_rows=[entity_row],
    )

    anchors = build_inline_citation_anchors([packet])

    assert anchors[0].label == "[1]"
    assert anchors[0].cited_span_ids == [packet.packet_id]
    assert anchors[0].cited_corpus_ids == [12345]


def test_build_cited_span_packet_requires_some_grounding_rows():
    common = _common_identity()
    block = PaperBlockRecord(
        **common,
        source_start_offset=100,
        source_end_offset=180,
        text="Melatonin reduced delirium incidence.",
        block_ordinal=2,
        section_ordinal=1,
        section_role=SectionRole.RESULTS,
        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
    )

    with pytest.raises(
        ValueError, match="build_cited_span_packet requires citation rows or entity rows"
    ):
        build_cited_span_packet(
            block=block,
            sentence=None,
            citation_rows=[],
            entity_rows=[],
        )
