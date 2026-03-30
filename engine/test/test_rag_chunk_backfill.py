from __future__ import annotations

from app.rag.chunk_backfill import ChunkBackfillRowGroup, RagChunkBackfillWriter
from app.rag.chunk_policy import build_default_chunk_version
from app.rag.parse_contract import PaperBlockKind, SectionRole, SentenceSegmentationSource
from app.rag.rag_schema_contract import PaperBlockRow, PaperSentenceRow
from app.rag.write_repository import (
    RagWriteExecutionResult,
    RuntimeWriteStageResult,
    RuntimeWriteStatus,
    WriteStage,
)


def test_chunk_backfill_writer_builds_chunk_rows_and_surfaces_deferred_stages():
    class FakeBatchWriter:
        def __init__(self):
            self.batch = None

        def apply_write_batch(self, batch):
            self.batch = batch
            return RagWriteExecutionResult(
                total_rows=2,
                written_rows=0,
                stages=[
                    RuntimeWriteStageResult(
                        stage=WriteStage.CHUNKS,
                        logical_table_name="paper_chunks",
                        status=RuntimeWriteStatus.DEFERRED,
                        row_count=1,
                        reason="chunk tables not live",
                    ),
                    RuntimeWriteStageResult(
                        stage=WriteStage.CHUNK_MEMBERS,
                        logical_table_name="paper_chunk_members",
                        status=RuntimeWriteStatus.DEFERRED,
                        row_count=1,
                        reason="chunk tables not live",
                    ),
                ],
            )

    chunk_version = build_default_chunk_version(
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
    )
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

    repository = FakeBatchWriter()
    writer = RagChunkBackfillWriter(repository=repository)

    result = writer.backfill_rows(
        chunk_version=chunk_version,
        blocks=blocks,
        sentences=sentences,
    )

    assert repository.batch is not None
    assert repository.batch.chunk_versions == []
    assert len(repository.batch.chunks) == 1
    assert len(repository.batch.chunk_members) == 1
    assert result.chunk_version_key == "default-structural-v1"
    assert result.chunk_rows == 1
    assert result.chunk_member_rows == 1
    assert result.batch_total_rows == 2
    assert result.written_rows == 0
    assert result.papers[0].corpus_id == 12345
    assert result.papers[0].chunk_rows == 1
    assert result.deferred_stage_names == [WriteStage.CHUNKS, WriteStage.CHUNK_MEMBERS]


def test_chunk_backfill_writer_can_batch_multiple_corpus_groups_into_one_write_batch():
    class FakeBatchWriter:
        def __init__(self):
            self.batch = None

        def apply_write_batch(self, batch):
            self.batch = batch
            return RagWriteExecutionResult(
                total_rows=4,
                written_rows=4,
                stages=[
                    RuntimeWriteStageResult(
                        stage=WriteStage.CHUNKS,
                        logical_table_name="paper_chunks",
                        physical_table_name="paper_chunks",
                        status=RuntimeWriteStatus.EXECUTED,
                        row_count=2,
                    ),
                    RuntimeWriteStageResult(
                        stage=WriteStage.CHUNK_MEMBERS,
                        logical_table_name="paper_chunk_members",
                        physical_table_name="paper_chunk_members",
                        status=RuntimeWriteStatus.EXECUTED,
                        row_count=2,
                    ),
                ],
            )

    chunk_version = build_default_chunk_version(
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
    )
    repository = FakeBatchWriter()
    writer = RagChunkBackfillWriter(repository=repository)

    result = writer.backfill_row_groups(
        chunk_version=chunk_version,
        row_groups=[
            ChunkBackfillRowGroup(
                corpus_id=111,
                blocks=[
                    PaperBlockRow(
                        corpus_id=111,
                        block_ordinal=0,
                        section_ordinal=1,
                        section_role=SectionRole.RESULTS,
                        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
                        text="One.",
                    )
                ],
                sentences=[
                    PaperSentenceRow(
                        corpus_id=111,
                        block_ordinal=0,
                        sentence_ordinal=0,
                        section_ordinal=1,
                        segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
                        text="One.",
                    )
                ],
            ),
            ChunkBackfillRowGroup(
                corpus_id=222,
                blocks=[
                    PaperBlockRow(
                        corpus_id=222,
                        block_ordinal=0,
                        section_ordinal=1,
                        section_role=SectionRole.RESULTS,
                        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
                        text="Two.",
                    )
                ],
                sentences=[
                    PaperSentenceRow(
                        corpus_id=222,
                        block_ordinal=0,
                        sentence_ordinal=0,
                        section_ordinal=1,
                        segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
                        text="Two.",
                    )
                ],
            ),
        ],
    )

    assert repository.batch is not None
    assert repository.batch.chunk_versions == []
    assert len(repository.batch.chunks) == 2
    assert len(repository.batch.chunk_members) == 2
    assert result.written_rows == 4
    assert [paper.corpus_id for paper in result.papers] == [111, 222]
