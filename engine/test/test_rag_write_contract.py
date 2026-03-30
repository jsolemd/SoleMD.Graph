from __future__ import annotations

import pytest

from app.rag.parse_contract import (
    PaperBlockKind,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)
from app.rag.rag_schema_contract import (
    PaperBlockRow,
    PaperDocumentRow,
    PaperDocumentSourceRow,
    PaperReferenceEntryRow,
    PaperSectionRow,
    PaperSentenceRow,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    ChunkMemberKind,
    PaperChunkMemberRecord,
    PaperChunkRecord,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
)
from app.rag.warehouse_contract import AlignmentStatus, PaperCitationMentionRow, SpanOrigin
from app.rag.write_contract import RagWarehouseWriteBatch


def test_write_batch_accepts_consistent_parent_child_rows():
    documents = [PaperDocumentRow(corpus_id=12345, title="Example paper")]
    document_sources = [
        PaperDocumentSourceRow(
            corpus_id=12345,
            document_source_ordinal=0,
            source_system=ParseSourceSystem.S2ORC_V2,
            source_revision="2026-03-10",
            source_document_key="12345",
            source_plane=SourcePlane.BODY,
            parser_version="parser-v1",
            is_primary_text_source=True,
        )
    ]
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            text="Results",
        )
    ]
    blocks = [
        PaperBlockRow(
            corpus_id=12345,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
            text="Melatonin reduced delirium incidence.",
        )
    ]
    sentences = [
        PaperSentenceRow(
            corpus_id=12345,
            block_ordinal=0,
            sentence_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
            text="Melatonin reduced delirium incidence.",
        )
    ]
    references = [
        PaperReferenceEntryRow(
            corpus_id=12345,
            reference_ordinal=0,
            source_reference_key="b1",
            text="1. Example reference.",
        )
    ]
    citations = [
        PaperCitationMentionRow(
            corpus_id=12345,
            source_system=ParseSourceSystem.S2ORC_V2,
            source_revision="2026-03-10",
            source_document_key="12345",
            source_plane=SourcePlane.BODY,
            parser_version="parser-v1",
            raw_attrs_json={},
            span_origin=SpanOrigin.PRIMARY_TEXT,
            alignment_status=AlignmentStatus.EXACT,
            alignment_confidence=1.0,
            source_start_offset=100,
            source_end_offset=103,
            text="[1]",
            canonical_section_ordinal=1,
            canonical_block_ordinal=0,
            canonical_sentence_ordinal=0,
            source_citation_key="b1",
            source_reference_key="b1",
        )
    ]
    chunk_versions = [
        PaperChunkVersionRecord(
            chunk_version_key="v1",
            source_revision_keys=["s2orc:2026-03-10"],
            parser_version="parser-v1",
            text_normalization_version="norm-v1",
            sentence_source_policy=[SentenceSegmentationSource.S2ORC_ANNOTATION],
            included_section_roles=[SectionRole.RESULTS],
            included_block_kinds=[PaperBlockKind.NARRATIVE_PARAGRAPH],
            caption_merge_policy=CaptionMergePolicy.STANDALONE,
            tokenizer_name="simple",
            target_token_budget=256,
            hard_max_tokens=384,
            sentence_overlap_policy=SentenceOverlapPolicy.NONE,
        )
    ]
    chunks = [
        PaperChunkRecord(
            chunk_version_key="v1",
            corpus_id=12345,
            chunk_ordinal=0,
            canonical_section_ordinal=1,
            section_role=SectionRole.RESULTS,
            primary_block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
            text="Melatonin reduced delirium incidence.",
            token_count_estimate=4,
        )
    ]
    chunk_members = [
        PaperChunkMemberRecord(
            chunk_version_key="v1",
            corpus_id=12345,
            chunk_ordinal=0,
            member_ordinal=0,
            member_kind=ChunkMemberKind.SENTENCE,
            canonical_block_ordinal=0,
            canonical_sentence_ordinal=0,
        )
    ]

    batch = RagWarehouseWriteBatch(
        documents=documents,
        document_sources=document_sources,
        sections=sections,
        blocks=blocks,
        sentences=sentences,
        references=references,
        citations=citations,
        chunk_versions=chunk_versions,
        chunks=chunks,
        chunk_members=chunk_members,
    )

    assert batch.documents[0].corpus_id == 12345


def test_write_batch_rejects_citation_with_unknown_reference():
    with pytest.raises(ValueError, match="citations must reference a known source reference key"):
        RagWarehouseWriteBatch(
            documents=[PaperDocumentRow(corpus_id=12345, title="Example paper")],
            references=[
                PaperReferenceEntryRow(
                    corpus_id=12345,
                    reference_ordinal=0,
                    source_reference_key="known",
                    text="1. Example reference.",
                )
            ],
            citations=[
                PaperCitationMentionRow(
                    corpus_id=12345,
                    source_system=ParseSourceSystem.S2ORC_V2,
                    source_revision="2026-03-10",
                    source_document_key="12345",
                    source_plane=SourcePlane.BODY,
                    parser_version="parser-v1",
                    raw_attrs_json={},
                    span_origin=SpanOrigin.PRIMARY_TEXT,
                    alignment_status=AlignmentStatus.EXACT,
                    alignment_confidence=1.0,
                    source_start_offset=100,
                    source_end_offset=103,
                    text="[1]",
                    canonical_section_ordinal=1,
                    canonical_block_ordinal=0,
                    canonical_sentence_ordinal=0,
                    source_citation_key="b1",
                    source_reference_key="missing",
                )
            ],
        )
