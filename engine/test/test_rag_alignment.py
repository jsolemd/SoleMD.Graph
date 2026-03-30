from __future__ import annotations

from app.rag.alignment import align_span_to_canonical_ordinals
from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    PaperSentenceRecord,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)
from app.rag.warehouse_contract import AlignmentStatus


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


def test_align_span_to_canonical_ordinals_returns_exact_sentence_match():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=100,
            source_end_offset=160,
            text="Sentence one. Sentence two.",
            block_ordinal=2,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        )
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=100,
            source_end_offset=113,
            text="Sentence one.",
            sentence_ordinal=0,
            block_ordinal=2,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=114,
            source_end_offset=127,
            text="Sentence two.",
            sentence_ordinal=1,
            block_ordinal=2,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]

    result = align_span_to_canonical_ordinals(
        start_offset=116,
        end_offset=124,
        canonical_blocks=blocks,
        canonical_sentences=sentences,
    )

    assert result.alignment_status == AlignmentStatus.EXACT
    assert result.canonical_block_ordinal == 2
    assert result.canonical_sentence_ordinal == 1


def test_align_span_to_canonical_ordinals_returns_bounded_when_only_block_matches():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=100,
            source_end_offset=160,
            text="Sentence one. Sentence two.",
            block_ordinal=2,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        )
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=100,
            source_end_offset=113,
            text="Sentence one.",
            sentence_ordinal=0,
            block_ordinal=2,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        )
    ]

    result = align_span_to_canonical_ordinals(
        start_offset=120,
        end_offset=140,
        canonical_blocks=blocks,
        canonical_sentences=sentences,
    )

    assert result.alignment_status == AlignmentStatus.BOUNDED
    assert result.canonical_block_ordinal == 2
    assert result.canonical_sentence_ordinal is None


def test_align_span_to_canonical_ordinals_returns_source_local_only_when_unresolved():
    result = align_span_to_canonical_ordinals(
        start_offset=500,
        end_offset=510,
        canonical_blocks=[],
        canonical_sentences=[],
    )

    assert result.alignment_status == AlignmentStatus.SOURCE_LOCAL_ONLY
    assert result.canonical_block_ordinal is None
