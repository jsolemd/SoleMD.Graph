from __future__ import annotations

from unittest.mock import MagicMock, call

from psycopg.types.json import Jsonb

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
from app.rag.write_repository import (
    PostgresRagWriteRepository,
    RuntimeWriteStatus,
    WriteMethod,
    WriteStage,
    _table_exists_with_cursor,
    build_runtime_write_stage_support_map,
    build_write_stage_specs,
    plan_write_batch,
    stage_rows,
)


def _sample_write_batch() -> RagWarehouseWriteBatch:
    return RagWarehouseWriteBatch(
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
        sentences=[
            PaperSentenceRow(
                corpus_id=12345,
                block_ordinal=0,
                sentence_ordinal=0,
                section_ordinal=1,
                segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
                text="Melatonin reduced delirium incidence.",
            )
        ],
        references=[
            PaperReferenceEntryRow(
                corpus_id=12345,
                reference_ordinal=0,
                source_reference_key="b1",
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
                source_reference_key="b1",
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
        chunks=[
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
        ],
        chunk_members=[
            PaperChunkMemberRecord(
                chunk_version_key="v1",
                corpus_id=12345,
                chunk_ordinal=0,
                member_ordinal=0,
                member_kind=ChunkMemberKind.SENTENCE,
                canonical_block_ordinal=0,
                canonical_sentence_ordinal=0,
            )
        ],
    )


def test_build_write_stage_specs_aligns_with_schema_contract():
    specs = {spec.stage: spec for spec in build_write_stage_specs()}

    assert specs[WriteStage.DOCUMENTS].table_name == "paper_documents"
    assert specs[WriteStage.CHUNK_MEMBERS].table_name == "paper_chunk_members"
    assert specs[WriteStage.CITATIONS].logical_dependencies == [
        WriteStage.BLOCKS,
        WriteStage.REFERENCES,
    ]


def test_plan_write_batch_uses_copy_stage_for_row_heavy_tables():
    plan = plan_write_batch(_sample_write_batch())

    assert [stage.stage for stage in plan.stages] == [
        WriteStage.DOCUMENTS,
        WriteStage.DOCUMENT_SOURCES,
        WriteStage.SECTIONS,
        WriteStage.BLOCKS,
        WriteStage.SENTENCES,
        WriteStage.REFERENCES,
        WriteStage.CITATIONS,
        WriteStage.CHUNK_VERSIONS,
        WriteStage.CHUNKS,
        WriteStage.CHUNK_MEMBERS,
    ]
    assert plan.total_rows == 10

    methods = {stage.stage: stage.write_method for stage in plan.stages}
    assert methods[WriteStage.DOCUMENTS] == WriteMethod.COPY_STAGE_UPSERT
    assert methods[WriteStage.REFERENCES] == WriteMethod.COPY_STAGE_UPSERT
    assert methods[WriteStage.CHUNK_VERSIONS] == WriteMethod.UPSERT_ROWS
    assert methods[WriteStage.CHUNK_MEMBERS] == WriteMethod.COPY_STAGE_UPSERT


def test_plan_write_batch_skips_empty_stages():
    batch = RagWarehouseWriteBatch(
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
        ]
    )

    plan = plan_write_batch(batch)

    assert [stage.stage for stage in plan.stages] == [WriteStage.CHUNK_VERSIONS]
    assert plan.stages[0].write_method == WriteMethod.UPSERT_ROWS
    assert plan.total_rows == 1


def test_stage_rows_reads_batch_components_by_stage_name():
    batch = _sample_write_batch()

    assert len(stage_rows(batch, WriteStage.DOCUMENTS)) == 1
    assert len(stage_rows(batch, WriteStage.CITATIONS)) == 1
    assert len(stage_rows(batch, WriteStage.ENTITIES)) == 0


def test_runtime_write_stage_support_only_enables_live_physical_tables():
    support = build_runtime_write_stage_support_map()

    assert support[WriteStage.DOCUMENTS].physical_table_name == "paper_documents"
    assert support[WriteStage.REFERENCES].physical_table_name == "paper_references"
    assert support[WriteStage.CITATIONS].physical_table_name == "paper_citation_mentions"
    assert WriteStage.CHUNK_VERSIONS not in support
    assert WriteStage.CHUNKS not in support


def test_postgres_rag_write_repository_applies_live_stages_and_defers_unmapped_ones():
    conn = MagicMock()
    cur = MagicMock()
    copy = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.copy.return_value.__enter__.return_value = copy
    cur.copy.return_value.__exit__.return_value = False

    repo = PostgresRagWriteRepository(connect=lambda: conn)
    result = repo.apply_write_batch(_sample_write_batch())

    assert result.total_rows == 10
    assert result.written_rows == 7

    stage_status = {stage.stage: stage for stage in result.stages}
    assert stage_status[WriteStage.DOCUMENTS].status == RuntimeWriteStatus.EXECUTED
    assert stage_status[WriteStage.REFERENCES].status == RuntimeWriteStatus.EXECUTED
    assert stage_status[WriteStage.REFERENCES].physical_table_name == "paper_references"
    assert stage_status[WriteStage.CITATIONS].status == RuntimeWriteStatus.EXECUTED
    assert stage_status[WriteStage.CHUNK_VERSIONS].status == RuntimeWriteStatus.DEFERRED


def test_postgres_rag_write_repository_can_enable_chunk_version_stage_when_table_exists():
    conn = MagicMock()
    cur = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagWriteRepository(
        connect=lambda: conn,
        table_exists_probe=lambda _cur, schema_name, table_name: (
            schema_name == "solemd" and table_name == "paper_chunk_versions"
        ),
    )
    batch = RagWarehouseWriteBatch(
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
        ]
    )

    result = repo.apply_write_batch(batch)

    assert result.total_rows == 1
    assert result.written_rows == 1
    assert result.stages[0].stage == WriteStage.CHUNK_VERSIONS
    assert result.stages[0].status == RuntimeWriteStatus.EXECUTED
    assert result.stages[0].physical_table_name == "paper_chunk_versions"
    cur.executemany.assert_called_once()
    conn.commit.assert_called_once()


def test_table_exists_with_cursor_accepts_mapping_rows():
    cur = MagicMock()
    cur.fetchone.return_value = {"to_regclass": "paper_chunk_versions"}

    assert _table_exists_with_cursor(cur, "solemd", "paper_chunk_versions") is True


def test_postgres_rag_write_repository_can_enable_chunk_content_stages_when_tables_exist():
    conn = MagicMock()
    cur = MagicMock()
    copy = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.copy.return_value.__enter__.return_value = copy
    cur.copy.return_value.__exit__.return_value = False

    repo = PostgresRagWriteRepository(
        connect=lambda: conn,
        table_exists_probe=lambda _cur, schema_name, table_name: (
            schema_name == "solemd"
            and table_name in {"paper_chunk_versions", "paper_chunks", "paper_chunk_members"}
        ),
    )

    result = repo.apply_write_batch(_sample_write_batch())

    stage_status = {stage.stage: stage for stage in result.stages}
    assert stage_status[WriteStage.CHUNK_VERSIONS].status == RuntimeWriteStatus.EXECUTED
    assert stage_status[WriteStage.CHUNKS].status == RuntimeWriteStatus.EXECUTED
    assert stage_status[WriteStage.CHUNK_MEMBERS].status == RuntimeWriteStatus.EXECUTED


def test_postgres_rag_write_repository_can_replace_existing_canonical_rows():
    conn = MagicMock()
    cur = MagicMock()
    copy = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.copy.return_value.__enter__.return_value = copy
    cur.copy.return_value.__exit__.return_value = False

    repo = PostgresRagWriteRepository(
        connect=lambda: conn,
        table_exists_probe=lambda _cur, schema_name, table_name: schema_name == "solemd",
    )

    result = repo.apply_write_batch(_sample_write_batch(), replace_existing=True)

    assert result.total_rows == 10
    delete_calls = [
        call("DELETE FROM solemd.paper_chunk_members WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_chunks WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_citation_mentions WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_entity_mentions WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_sentences WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_blocks WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_sections WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_document_sources WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_references WHERE corpus_id = ANY(%s)", ([12345],)),
        call("DELETE FROM solemd.paper_documents WHERE corpus_id = ANY(%s)", ([12345],)),
    ]
    for expected in delete_calls:
        assert expected in cur.execute.call_args_list
