from __future__ import annotations

from app.rag.parse_contract import (
    PaperBlockKind,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)
from app.rag.rag_schema_contract import (
    PartitionKind,
    PaperBlockRow,
    PaperDocumentSourceRow,
    PaperReferenceEntryRow,
    PaperSentenceRow,
    build_warehouse_table_specs,
)


def test_build_warehouse_table_specs_marks_high_volume_tables_as_hash_partitioned():
    specs = {spec.table_name: spec for spec in build_warehouse_table_specs()}

    assert specs["paper_blocks"].partition_kind == PartitionKind.HASH
    assert specs["paper_sentences"].partition_kind == PartitionKind.HASH
    assert specs["paper_entity_mentions"].partition_kind == PartitionKind.HASH
    assert specs["paper_citation_mentions"].partition_kind == PartitionKind.HASH
    assert specs["paper_chunks"].partition_kind == PartitionKind.HASH
    assert specs["paper_chunk_members"].partition_kind == PartitionKind.HASH


def test_document_source_row_requires_source_identity():
    row = PaperDocumentSourceRow(
        corpus_id=12345,
        document_source_ordinal=0,
        source_system=ParseSourceSystem.S2ORC_V2,
        source_revision="2026-03-10",
        source_document_key="12345",
        source_plane=SourcePlane.BODY,
        parser_version="parser-v1",
        is_primary_text_source=True,
    )

    assert row.source_document_key == "12345"
    assert row.is_primary_text_source is True


def test_block_sentence_and_reference_rows_validate_core_fields():
    block = PaperBlockRow(
        corpus_id=12345,
        block_ordinal=0,
        section_ordinal=1,
        section_role=SectionRole.RESULTS,
        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        text="Melatonin reduced delirium incidence.",
        is_retrieval_default=True,
    )
    sentence = PaperSentenceRow(
        corpus_id=12345,
        block_ordinal=0,
        sentence_ordinal=0,
        section_ordinal=1,
        segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        text="Melatonin reduced delirium incidence.",
    )
    reference = PaperReferenceEntryRow(
        corpus_id=12345,
        reference_ordinal=0,
        source_reference_key="b1",
        text="1. Example reference.",
        matched_corpus_id=67890,
    )

    assert block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
    assert sentence.sentence_ordinal == 0
    assert reference.source_reference_key == "b1"
