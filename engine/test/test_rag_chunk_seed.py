from __future__ import annotations

import json

from app.rag_ingest.chunk_seed import RagChunkSeeder
from app.rag_ingest.source_parsers import parse_biocxml_document, parse_s2orc_row
from app.rag_ingest.write_repository import (
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
                            "attributes": {"id": "b1"},
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
          <infon key="type">paragraph</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>8</offset>
          <text>Melatonin reduced delirium incidence.</text>
        </passage>
      </document>
    </collection>
    """
    return parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )


def test_chunk_seeder_builds_default_batch_for_sources():
    class FakeBatchWriter:
        def __init__(self):
            self.batch = None

        def apply_write_batch(self, batch):
            self.batch = batch
            return RagWriteExecutionResult(
                total_rows=1,
                written_rows=0,
                stages=[
                    RuntimeWriteStageResult(
                        stage=WriteStage.CHUNK_VERSIONS,
                        logical_table_name="paper_chunk_versions",
                        status=RuntimeWriteStatus.DEFERRED,
                        row_count=1,
                        reason="table missing",
                    )
                ],
            )

    repository = FakeBatchWriter()
    seeder = RagChunkSeeder(repository=repository)

    result = seeder.seed_default_for_sources(
        [_build_bioc_overlay(), _build_s2orc_source()],
        embedding_model="text-embedding-3-large",
    )

    assert repository.batch is not None
    assert [row.chunk_version_key for row in repository.batch.chunk_versions] == [
        "default-structural-v1"
    ]
    assert result.chunk_version_key == "default-structural-v1"
    assert result.source_revision_keys == [
        "biocxml:2026-03-21",
        "s2orc_v2:2026-03-10",
    ]
    assert result.batch_total_rows == 1
    assert result.written_rows == 0
    assert result.deferred_stage_names == [WriteStage.CHUNK_VERSIONS]


def test_chunk_seeder_allows_preview_key_override():
    class FakeBatchWriter:
        def __init__(self):
            self.batch = None

        def apply_write_batch(self, batch):
            self.batch = batch
            return RagWriteExecutionResult(
                total_rows=1,
                written_rows=1,
                stages=[
                    RuntimeWriteStageResult(
                        stage=WriteStage.CHUNK_VERSIONS,
                        logical_table_name="paper_chunk_versions",
                        physical_table_name="paper_chunk_versions",
                        status=RuntimeWriteStatus.EXECUTED,
                        row_count=1,
                    )
                ],
            )

    repository = FakeBatchWriter()
    seeder = RagChunkSeeder(repository=repository)

    result = seeder.seed_default(
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="mixed:parser-v1,parser-v2",
        chunk_version_key="preview-stanza-hybrid-v1",
    )

    assert repository.batch is not None
    assert [row.chunk_version_key for row in repository.batch.chunk_versions] == [
        "preview-stanza-hybrid-v1"
    ]
    assert result.chunk_version_key == "preview-stanza-hybrid-v1"
