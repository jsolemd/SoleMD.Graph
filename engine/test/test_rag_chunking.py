from __future__ import annotations

from app.rag.chunking import assemble_structural_chunks
from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    PaperSentenceRecord,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
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


def _chunk_version() -> PaperChunkVersionRecord:
    return PaperChunkVersionRecord(
        chunk_version_key="v1",
        source_revision_keys=["s2orc:2026-03-10"],
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
        tokenizer_name="simple",
        target_token_budget=12,
        hard_max_tokens=16,
        sentence_overlap_policy=SentenceOverlapPolicy.NONE,
    )


def test_assemble_structural_chunks_merges_adjacent_narrative_blocks_within_budget():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=22,
            text="Melatonin reduced delirium.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=23,
            source_end_offset=51,
            text="Sleep quality also improved.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=0,
            source_end_offset=28,
            text="Melatonin reduced delirium.",
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=23,
            source_end_offset=51,
            text="Sleep quality also improved.",
            sentence_ordinal=0,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(), blocks=blocks, sentences=sentences
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].canonical_section_ordinal == 1
    assert len(result.members) == 2


def test_assemble_structural_chunks_keeps_captions_standalone():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=20,
            text="Figure 1. Trial flow.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.FIGURE_CAPTION,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=21,
            source_end_offset=45,
            text="Melatonin reduced delirium.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(), blocks=blocks, sentences=[]
    )

    assert len(result.chunks) == 2
    assert result.chunks[0].primary_block_kind == PaperBlockKind.FIGURE_CAPTION
    assert result.chunks[1].primary_block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH


def test_assemble_structural_chunks_respects_section_boundaries():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=22,
            text="Abstract finding here.",
            block_ordinal=0,
            section_ordinal=0,
            section_role=SectionRole.ABSTRACT,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=23,
            source_end_offset=50,
            text="Results finding here.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(), blocks=blocks, sentences=[]
    )

    assert len(result.chunks) == 2
    assert [chunk.canonical_section_ordinal for chunk in result.chunks] == [0, 1]
