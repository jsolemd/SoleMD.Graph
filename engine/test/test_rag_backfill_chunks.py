from __future__ import annotations

from app.rag.parse_contract import (
    PaperBlockKind,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag.rag_schema_contract import PaperBlockRow, PaperSentenceRow
from app.rag_ingest.chunk_backfill import ChunkBackfillPaperResult, ChunkBackfillResult
from db.scripts.backfill_structural_chunks import (
    CanonicalChunkRows,
    backfill_default_chunks,
    run_chunk_backfill,
)


def test_backfill_default_chunks_reports_execution_and_missing_corpus_ids():
    class FakeLoader:
        def load_rows(self, *, corpus_ids):
            assert corpus_ids == [12345, 67890]
            return {
                12345: CanonicalChunkRows(
                    corpus_id=12345,
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
                )
            }

    class FakeRunner:
        def backfill_row_groups(self, *, chunk_version, row_groups):
            assert chunk_version.chunk_version_key == "default-structural-v1"
            assert len(row_groups) == 1
            assert len(row_groups[0].blocks) == 1
            assert len(row_groups[0].sentences) == 1
            return ChunkBackfillResult(
                chunk_version_key=chunk_version.chunk_version_key,
                chunk_rows=1,
                chunk_member_rows=1,
                batch_total_rows=2,
                written_rows=2,
                papers=[
                    ChunkBackfillPaperResult(
                        corpus_id=row_groups[0].corpus_id,
                        chunk_rows=1,
                        chunk_member_rows=1,
                    )
                ],
                deferred_stage_names=[],
            )

    report = backfill_default_chunks(
        corpus_ids=[12345, 67890],
        source_revision_keys=["s2orc_v2:2026-03-10", "biocxml:2026-03-21"],
        parser_version="parser-v1",
        embedding_model="text-embedding-3-large",
        batch_size=100,
        loader=FakeLoader(),
        runner=FakeRunner(),
    )

    assert report.chunk_version_key == "default-structural-v1"
    assert report.corpus_ids == [12345, 67890]
    assert report.total_block_rows == 1
    assert report.total_sentence_rows == 1
    assert report.total_chunk_rows == 1
    assert report.total_chunk_member_rows == 1
    assert report.total_batch_rows == 2
    assert report.total_written_rows == 2
    assert report.missing_corpus_ids == [67890]
    assert report.executed is True
    assert [paper.corpus_id for paper in report.papers] == [12345, 67890]
    assert report.papers[0].executed is True
    assert report.papers[0].written_rows == 2
    assert report.papers[1].skipped_reason == "no_block_rows"


def test_backfill_default_chunks_allows_preview_key_override():
    class FakeLoader:
        def load_rows(self, *, corpus_ids):
            assert corpus_ids == [12345]
            return {
                12345: CanonicalChunkRows(
                    corpus_id=12345,
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
                    sentences=[],
                )
            }

    class FakeRunner:
        def backfill_row_groups(self, *, chunk_version, row_groups):
            assert chunk_version.chunk_version_key == "preview-stanza-hybrid-v1"
            return ChunkBackfillResult(
                chunk_version_key=chunk_version.chunk_version_key,
                chunk_rows=1,
                chunk_member_rows=1,
                batch_total_rows=2,
                written_rows=2,
                papers=[
                    ChunkBackfillPaperResult(
                        corpus_id=row_groups[0].corpus_id,
                        chunk_rows=1,
                        chunk_member_rows=1,
                    )
                ],
                deferred_stage_names=[],
            )

    report = backfill_default_chunks(
        corpus_ids=[12345],
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="mixed:parser-v1,parser-v2",
        chunk_version_key="preview-stanza-hybrid-v1",
        loader=FakeLoader(),
        runner=FakeRunner(),
    )

    assert report.chunk_version_key == "preview-stanza-hybrid-v1"


def test_backfill_default_chunks_surfaces_deferred_stage_names():
    class FakeLoader:
        def load_rows(self, *, corpus_ids):
            return {
                12345: CanonicalChunkRows(
                    corpus_id=12345,
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
                    sentences=[],
                )
            }

    class FakeRunner:
        def backfill_row_groups(self, *, chunk_version, row_groups):
            return ChunkBackfillResult(
                chunk_version_key=chunk_version.chunk_version_key,
                chunk_rows=1,
                chunk_member_rows=1,
                batch_total_rows=2,
                written_rows=0,
                papers=[
                    ChunkBackfillPaperResult(
                        corpus_id=row_groups[0].corpus_id,
                        chunk_rows=1,
                        chunk_member_rows=1,
                    )
                ],
                deferred_stage_names=["chunks", "chunk_members"],
            )

    report = backfill_default_chunks(
        corpus_ids=[12345],
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
        batch_size=100,
        loader=FakeLoader(),
        runner=FakeRunner(),
    )

    assert report.executed is False
    assert report.deferred_stage_names == ["chunk_members", "chunks"]
    assert report.papers[0].deferred_stage_names == ["chunks", "chunk_members"]
    assert report.papers[0].skipped_reason == "deferred_runtime_stage"


def test_backfill_default_chunks_batches_multiple_papers_into_one_runner_call():
    class FakeLoader:
        def load_rows(self, *, corpus_ids):
            return {
                corpus_id: CanonicalChunkRows(
                    corpus_id=corpus_id,
                    blocks=[
                        PaperBlockRow(
                            corpus_id=corpus_id,
                            block_ordinal=0,
                            section_ordinal=1,
                            section_role=SectionRole.RESULTS,
                            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
                            text=f"Paper {corpus_id}.",
                        )
                    ],
                    sentences=[
                        PaperSentenceRow(
                            corpus_id=corpus_id,
                            block_ordinal=0,
                            sentence_ordinal=0,
                            section_ordinal=1,
                            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
                            text=f"Paper {corpus_id}.",
                        )
                    ],
                )
                for corpus_id in corpus_ids
            }

    class FakeRunner:
        def __init__(self):
            self.calls = []

        def backfill_row_groups(self, *, chunk_version, row_groups):
            self.calls.append([group.corpus_id for group in row_groups])
            return ChunkBackfillResult(
                chunk_version_key=chunk_version.chunk_version_key,
                chunk_rows=len(row_groups),
                chunk_member_rows=len(row_groups),
                batch_total_rows=len(row_groups) * 2,
                written_rows=len(row_groups) * 2,
                papers=[
                    ChunkBackfillPaperResult(
                        corpus_id=group.corpus_id,
                        chunk_rows=1,
                        chunk_member_rows=1,
                    )
                    for group in row_groups
                ],
                deferred_stage_names=[],
            )

    runner = FakeRunner()
    report = backfill_default_chunks(
        corpus_ids=[1, 2, 3],
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
        batch_size=2,
        loader=FakeLoader(),
        runner=runner,
    )

    assert runner.calls == [[1, 2], [3]]
    assert report.total_chunk_rows == 3
    assert report.total_chunk_member_rows == 3
    assert [paper.written_rows for paper in report.papers] == [2, 2, 2]


def test_run_chunk_backfill_resumes_from_checkpoint_and_skips_completed_batches(tmp_path):
    class FakeLoader:
        def load_rows(self, *, corpus_ids):
            return {
                corpus_id: CanonicalChunkRows(
                    corpus_id=corpus_id,
                    blocks=[
                        PaperBlockRow(
                            corpus_id=corpus_id,
                            block_ordinal=0,
                            section_ordinal=1,
                            section_role=SectionRole.RESULTS,
                            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
                            text=f"Paper {corpus_id}.",
                        )
                    ],
                    sentences=[
                        PaperSentenceRow(
                            corpus_id=corpus_id,
                            block_ordinal=0,
                            sentence_ordinal=0,
                            section_ordinal=1,
                            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
                            text=f"Paper {corpus_id}.",
                        )
                    ],
                )
                for corpus_id in corpus_ids
            }

    class FakeRunner:
        def __init__(self):
            self.calls = []

        def backfill_row_groups(self, *, chunk_version, row_groups):
            self.calls.append([group.corpus_id for group in row_groups])
            return ChunkBackfillResult(
                chunk_version_key=chunk_version.chunk_version_key,
                chunk_rows=len(row_groups),
                chunk_member_rows=len(row_groups),
                batch_total_rows=len(row_groups) * 2,
                written_rows=len(row_groups) * 2,
                papers=[
                    ChunkBackfillPaperResult(
                        corpus_id=group.corpus_id,
                        chunk_rows=1,
                        chunk_member_rows=1,
                    )
                    for group in row_groups
                ],
                deferred_stage_names=[],
            )

    first_runner = FakeRunner()
    first_report = run_chunk_backfill(
        corpus_ids=[1, 2, 3],
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
        batch_size=2,
        run_id="resume-demo",
        checkpoint_root=tmp_path,
        loader=FakeLoader(),
        runner=first_runner,
    )

    assert first_runner.calls == [[1, 2], [3]]
    assert first_report.total_written_rows == 6

    resumed_runner = FakeRunner()
    resumed_report = run_chunk_backfill(
        corpus_ids=[1, 2, 3],
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
        batch_size=2,
        run_id="resume-demo",
        checkpoint_root=tmp_path,
        loader=FakeLoader(),
        runner=resumed_runner,
    )

    assert resumed_runner.calls == []
    assert resumed_report.resumed_from_checkpoint is True
    assert resumed_report.total_written_rows == 6
    assert resumed_report.checkpoint_run_id == "resume-demo"
