from __future__ import annotations

import pytest

from app.rag.parse_contract import (
    PaperBlockKind,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag.serving_contract import (
    AnswerSegment,
    CaptionMergePolicy,
    ChunkMemberKind,
    CitedEntityPacket,
    CitedSpanPacket,
    GroundedAnswerRecord,
    InlineCitationAnchor,
    PaperChunkMemberRecord,
    PaperChunkRecord,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
    derive_answer_linked_corpus_ids,
)
from app.rag.warehouse_contract import AlignmentStatus, SpanOrigin


def test_chunk_version_requires_consistent_token_budget():
    version = PaperChunkVersionRecord(
        chunk_version_key="v1",
        source_revision_keys=["s2orc:2026-03-10", "biocxml:2026-03-21"],
        parser_version="parser-v1",
        text_normalization_version="norm-v1",
        sentence_source_policy=[
            SentenceSegmentationSource.S2ORC_ANNOTATION,
            SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ],
        included_section_roles=[SectionRole.ABSTRACT, SectionRole.RESULTS],
        included_block_kinds=[
            PaperBlockKind.NARRATIVE_PARAGRAPH,
            PaperBlockKind.FIGURE_CAPTION,
        ],
        caption_merge_policy=CaptionMergePolicy.STANDALONE,
        tokenizer_name="cl100k_base",
        target_token_budget=384,
        hard_max_tokens=512,
        sentence_overlap_policy=SentenceOverlapPolicy.EDGE_SENTENCE,
        embedding_model="text-embedding-model",
    )

    assert version.chunk_version_key == "v1"
    assert version.hard_max_tokens == 512


def test_sentence_chunk_members_require_sentence_ordinals():
    with pytest.raises(
        ValueError,
        match="canonical_sentence_ordinal must be present for sentence chunk members",
    ):
        PaperChunkMemberRecord(
            chunk_version_key="v1",
            corpus_id=12345,
            chunk_ordinal=0,
            member_ordinal=0,
            member_kind=ChunkMemberKind.SENTENCE,
            canonical_block_ordinal=2,
        )


def test_derive_answer_linked_corpus_ids_uses_inline_anchors():
    cited_spans = [
        CitedSpanPacket(
            packet_id="span:1",
            corpus_id=12345,
            canonical_section_ordinal=1,
            canonical_block_ordinal=2,
            canonical_sentence_ordinal=0,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
            span_origin=SpanOrigin.PRIMARY_TEXT,
            alignment_status=AlignmentStatus.EXACT,
            alignment_confidence=1.0,
            text="Melatonin reduced delirium incidence.",
            quote_text="Melatonin reduced delirium incidence.",
            source_citation_keys=["b1"],
            source_reference_keys=["b1"],
            entity_mentions=[
                CitedEntityPacket(
                    entity_type="Chemical",
                    text="Melatonin",
                    concept_namespace="mesh",
                    concept_id="D008550",
                    source_identifier="MESH:D008550",
                )
            ],
        ),
        CitedSpanPacket(
            packet_id="span:2",
            corpus_id=67890,
            canonical_section_ordinal=1,
            canonical_block_ordinal=5,
            section_role=SectionRole.DISCUSSION,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
            span_origin=SpanOrigin.PRIMARY_TEXT,
            alignment_status=AlignmentStatus.BOUNDED,
            alignment_confidence=0.7,
            text="Null findings were also reported.",
        ),
    ]
    inline_citations = [
        InlineCitationAnchor(
            anchor_id="a1",
            label="[1]",
            cited_span_ids=["span:1"],
            cited_corpus_ids=[],
            short_evidence_label="Results",
        ),
        InlineCitationAnchor(
            anchor_id="a2",
            label="[2]",
            cited_span_ids=["span:2"],
            cited_corpus_ids=[67890],
        ),
    ]
    segment = AnswerSegment(
        segment_ordinal=0,
        text="Evidence is mixed but includes a positive trial.",
        citation_anchor_ids=["a1", "a2"],
    )

    assert segment.segment_ordinal == 0
    assert derive_answer_linked_corpus_ids(
        cited_spans=cited_spans, inline_citations=inline_citations
    ) == [12345, 67890]


def test_chunk_record_requires_text_and_positive_tokens():
    with pytest.raises(ValueError, match="token_count_estimate must be positive"):
        PaperChunkRecord(
            chunk_version_key="v1",
            corpus_id=12345,
            chunk_ordinal=0,
            canonical_section_ordinal=1,
            section_role=SectionRole.RESULTS,
            primary_block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
            text="Chunk text",
            token_count_estimate=0,
        )


def test_grounded_answer_requires_defined_anchor_and_span_references():
    packet = CitedSpanPacket(
        packet_id="span:1",
        corpus_id=12345,
        canonical_section_ordinal=1,
        canonical_block_ordinal=2,
        section_role=SectionRole.RESULTS,
        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        span_origin=SpanOrigin.PRIMARY_TEXT,
        alignment_status=AlignmentStatus.EXACT,
        alignment_confidence=1.0,
        text="Melatonin reduced delirium incidence.",
    )
    anchor = InlineCitationAnchor(
        anchor_id="anchor:1",
        label="[1]",
        cited_span_ids=["span:1"],
        cited_corpus_ids=[12345],
    )

    with pytest.raises(
        ValueError,
        match="citation_anchor_ids must reference defined inline citations",
    ):
        GroundedAnswerRecord(
            segments=[
                AnswerSegment(
                    segment_ordinal=0,
                    text="Grounded statement",
                    citation_anchor_ids=["anchor:missing"],
                )
            ],
            inline_citations=[anchor],
            cited_spans=[packet],
            answer_linked_corpus_ids=[12345],
        )
