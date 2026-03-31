from __future__ import annotations

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
    PaperSectionRow,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
)
from app.rag_ingest.write_contract import RagWarehouseWriteBatch
from app.rag_ingest.write_preview import build_write_preview
from app.rag_ingest.write_repository import WriteMethod, WriteStage


def test_build_write_preview_joins_plan_and_sql_templates():
    batch = RagWarehouseWriteBatch(
        documents=[PaperDocumentRow(corpus_id=12345, title="Example paper")],
        document_sources=[
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
        ],
        sections=[
            PaperSectionRow(
                corpus_id=12345,
                section_ordinal=1,
                section_role=SectionRole.RESULTS,
                text="Results",
            )
        ],
        blocks=[
            PaperBlockRow(
                corpus_id=12345,
                block_ordinal=0,
                section_ordinal=1,
                section_role=SectionRole.RESULTS,
                block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
                text="Melatonin reduced delirium incidence.",
            )
        ],
        chunk_versions=[
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
        ],
    )

    preview = build_write_preview(batch)

    assert preview.total_rows == 5
    assert [stage.stage for stage in preview.stages] == [
        WriteStage.DOCUMENTS,
        WriteStage.DOCUMENT_SOURCES,
        WriteStage.SECTIONS,
        WriteStage.BLOCKS,
        WriteStage.CHUNK_VERSIONS,
    ]

    document_stage = preview.stages[0]
    assert document_stage.write_method == WriteMethod.COPY_STAGE_UPSERT
    assert document_stage.staging_table_name == "_stg_paper_documents"
    assert "INSERT INTO solemd.paper_documents" in document_stage.merge_sql

    chunk_version_stage = preview.stages[-1]
    assert chunk_version_stage.write_method == WriteMethod.UPSERT_ROWS
    assert chunk_version_stage.staging_table_name is None
    assert "%(chunk_version_key)s" in chunk_version_stage.merge_sql
