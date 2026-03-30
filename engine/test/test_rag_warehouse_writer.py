from __future__ import annotations

import json

from app.rag.parse_contract import (
    PaperBlockKind,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
)
from app.rag.source_parsers import parse_biocxml_document, parse_s2orc_row
from app.rag.warehouse_writer import RagWarehouseWriter
from app.rag.write_repository import (
    RagWriteExecutionResult,
    RuntimeWriteStageResult,
    RuntimeWriteStatus,
    WriteStage,
)


def _build_s2orc_source():
    body_text = (
        "Results\n"
        "Melatonin reduced delirium incidence [1]. Sleep quality improved."
    )
    bibliography_text = "1. Example trial paper."
    row = {
        "corpusid": 12345,
        "title": "Example trial",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len("Results"),
                            "attributes": {"n": "1."},
                        }
                    ]
                ),
                "paragraph": json.dumps(
                    [{"start": 8, "end": len(body_text), "attributes": {}}]
                ),
                "sentence": json.dumps(
                    [
                        {"start": 8, "end": 48, "attributes": {}},
                        {"start": 49, "end": len(body_text), "attributes": {}},
                    ]
                ),
                "bib_ref": json.dumps(
                    [
                        {
                            "start": 45,
                            "end": 48,
                            "attributes": {
                                "ref_id": "b1",
                                "matched_paper_id": "S2:paper-1",
                            },
                        }
                    ]
                ),
            },
        },
        "bibliography": {
            "text": bibliography_text,
            "annotations": {
                "bib_entry": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len(bibliography_text),
                            "attributes": {"id": "b1", "matched_paper_id": "S2:paper-1"},
                        }
                    ]
                )
            },
        },
    }
    return parse_s2orc_row(
        row, source_revision="2026-03-10", parser_version="parser-v1"
    )


def _build_bioc_overlay():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>0</offset>
          <text>Results</text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>8</offset>
          <text>Melatonin reduced delirium incidence.</text>
          <annotation>
            <infon key="type">Chemical</infon>
            <infon key="identifier">MESH:D008550</infon>
            <location offset="8" length="10" />
            <text>Melatonin</text>
          </annotation>
        </passage>
      </document>
    </collection>
    """
    return parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )


def test_rag_warehouse_writer_builds_batch_and_reports_deferred_stage_names():
    class FakeBatchWriter:
        def __init__(self):
            self.batch = None

        def apply_write_batch(self, batch):
            self.batch = batch
            return RagWriteExecutionResult(
                total_rows=7,
                written_rows=6,
                stages=[
                    RuntimeWriteStageResult(
                        stage=WriteStage.DOCUMENTS,
                        logical_table_name="paper_documents",
                        physical_table_name="paper_documents",
                        status=RuntimeWriteStatus.EXECUTED,
                        row_count=1,
                    ),
                    RuntimeWriteStageResult(
                        stage=WriteStage.REFERENCES,
                        logical_table_name="paper_reference_entries",
                        status=RuntimeWriteStatus.DEFERRED,
                        row_count=1,
                        reason="paper_references adapter pending",
                    ),
                ],
            )

    repository = FakeBatchWriter()
    writer = RagWarehouseWriter(repository=repository)

    result = writer.ingest_sources(
        [_build_s2orc_source(), _build_bioc_overlay()],
        source_citation_keys=["b1"],
    )

    assert repository.batch is not None
    assert repository.batch.documents[0].primary_source_system == ParseSourceSystem.S2ORC_V2
    assert result.corpus_id == 12345
    assert result.primary_source_system == ParseSourceSystem.S2ORC_V2
    assert result.annotation_source_systems == [ParseSourceSystem.BIOCXML]
    assert result.batch_total_rows == 7
    assert result.written_rows == 6
    assert result.deferred_stage_names == [WriteStage.REFERENCES]


def test_rag_warehouse_writer_can_include_structural_chunk_rows():
    class FakeBatchWriter:
        def __init__(self):
            self.batch = None

        def apply_write_batch(self, batch):
            self.batch = batch
            return RagWriteExecutionResult(
                total_rows=10,
                written_rows=7,
                stages=[
                    RuntimeWriteStageResult(
                        stage=WriteStage.DOCUMENTS,
                        logical_table_name="paper_documents",
                        physical_table_name="paper_documents",
                        status=RuntimeWriteStatus.EXECUTED,
                        row_count=1,
                    ),
                    RuntimeWriteStageResult(
                        stage=WriteStage.CHUNK_VERSIONS,
                        logical_table_name="paper_chunk_versions",
                        status=RuntimeWriteStatus.DEFERRED,
                        row_count=1,
                        reason="Chunk-version writes are not enabled yet.",
                    ),
                ],
            )

    repository = FakeBatchWriter()
    writer = RagWarehouseWriter(repository=repository)
    chunk_version = PaperChunkVersionRecord(
        chunk_version_key="default-v1",
        source_revision_keys=["s2orc_v2:2026-03-10", "biocxml:2026-03-21"],
        parser_version="parser-v1",
        text_normalization_version="norm-v1",
        sentence_source_policy=[
            SentenceSegmentationSource.S2ORC_ANNOTATION,
            SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ],
        included_section_roles=[SectionRole.RESULTS],
        included_block_kinds=[PaperBlockKind.NARRATIVE_PARAGRAPH],
        caption_merge_policy=CaptionMergePolicy.STANDALONE,
        tokenizer_name="simple",
        target_token_budget=256,
        hard_max_tokens=384,
        sentence_overlap_policy=SentenceOverlapPolicy.NONE,
    )

    result = writer.ingest_sources(
        [_build_s2orc_source(), _build_bioc_overlay()],
        source_citation_keys=["b1"],
        chunk_version=chunk_version,
    )

    assert repository.batch is not None
    assert [row.chunk_version_key for row in repository.batch.chunk_versions] == ["default-v1"]
    assert len(repository.batch.chunks) == 1
    assert len(repository.batch.chunk_members) == 2
    assert result.deferred_stage_names == [WriteStage.CHUNK_VERSIONS]


def test_rag_warehouse_writer_can_merge_multiple_grounding_plans_into_one_batch():
    class FakeBatchWriter:
        def __init__(self):
            self.batch = None

        def apply_write_batch(self, batch):
            self.batch = batch
            return RagWriteExecutionResult(
                total_rows=12,
                written_rows=12,
                stages=[
                    RuntimeWriteStageResult(
                        stage=WriteStage.DOCUMENTS,
                        logical_table_name="paper_documents",
                        physical_table_name="paper_documents",
                        status=RuntimeWriteStatus.EXECUTED,
                        row_count=2,
                    )
                ],
            )

    second_row = {
        "corpusid": 67890,
        "title": "Second trial",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": "Results\nDexmedetomidine improved sleep.",
            "annotations": {
                "section_header": json.dumps(
                    [{"start": 0, "end": len("Results"), "attributes": {}}]
                ),
                "paragraph": json.dumps(
                    [{"start": 8, "end": len("Results\nDexmedetomidine improved sleep."), "attributes": {}}]
                ),
                "sentence": json.dumps(
                    [{"start": 8, "end": len("Results\nDexmedetomidine improved sleep."), "attributes": {}}]
                ),
                "bib_ref": json.dumps([]),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }
    second_source = parse_s2orc_row(
        second_row, source_revision="2026-03-10", parser_version="parser-v1"
    )

    repository = FakeBatchWriter()
    writer = RagWarehouseWriter(repository=repository)
    result = writer.ingest_source_groups(
        [
            [_build_s2orc_source(), _build_bioc_overlay()],
            [second_source],
        ],
        source_citation_keys_by_corpus={12345: ["b1"]},
    )

    assert repository.batch is not None
    assert sorted(row.corpus_id for row in repository.batch.documents) == [12345, 67890]
    assert len(result.papers) == 2
    assert result.written_rows == 12
