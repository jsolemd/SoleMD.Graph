from __future__ import annotations

import json

from app.rag.orchestrator import (
    RagRefreshReport,
    RagTargetCorpusRow,
    run_rag_refresh,
)
from app.rag.warehouse_writer import (
    RagWarehouseBulkIngestPaperResult,
    RagWarehouseBulkIngestResult,
)


def _s2_row(corpus_id: int, *, title: str = "Example trial") -> dict:
    body_text = "Results\nMelatonin reduced delirium incidence [1]."
    bibliography_text = "1. Example paper."
    citation_start = body_text.index("[1]")
    citation_end = citation_start + 3
    return {
        "corpusid": corpus_id,
        "title": title,
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [{"start": 0, "end": len("Results"), "attributes": {"n": "1."}}]
                ),
                "paragraph": json.dumps(
                    [{"start": len("Results\n"), "end": len(body_text), "attributes": {}}]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": len("Results\n"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "bib_ref": json.dumps(
                    [
                        {
                            "start": citation_start,
                            "end": citation_end,
                            "attributes": {"ref_id": "b1", "matched_paper_id": "S2:paper-1"},
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


def _bioc_xml(document_id: str) -> str:
    return f"""
    <collection>
      <document>
        <id>{document_id}</id>
        <passage>
          <infon key=\"type\">title_1</infon>
          <infon key=\"section_type\">RESULTS</infon>
          <offset>0</offset>
          <text>Results</text>
        </passage>
        <passage>
          <infon key=\"type\">paragraph</infon>
          <infon key=\"section_type\">RESULTS</infon>
          <offset>8</offset>
          <text>Resolved through BioC fallback.</text>
        </passage>
      </document>
    </collection>
    """


def test_run_rag_refresh_ingests_s2_then_bioc_fallback_and_calls_chunk_backfill(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids is None
            assert limit is None
            return [
                RagTargetCorpusRow(corpus_id=12345, pmid=12345),
                RagTargetCorpusRow(corpus_id=67890, pmc_id="PMC67890"),
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            assert corpus_ids == [12345, 67890]
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(12345)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return [tmp_path / "BioCXML.0.tar.gz"]

        def iter_documents(self, archive_path):
            yield "PMC67890", _bioc_xml("PMC67890")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups):
            self.calls.append([group[0].document.corpus_id for group in source_groups])
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=group[0].document.corpus_id,
                        primary_source_system=group[0].document.source_system,
                        primary_reason="test",
                        annotation_source_systems=[],
                    )
                    for group in source_groups
                ],
                batch_total_rows=len(source_groups) * 3,
                written_rows=len(source_groups) * 3,
                deferred_stage_names=[],
            )

    class FakeChunkBackfill:
        def __init__(self):
            self.calls = []

        def __call__(self, **kwargs):
            self.calls.append(kwargs)

            class _Result:
                def model_dump(self, mode="python"):
                    return {"executed": False, "corpus_ids": kwargs["corpus_ids"]}

            return _Result()

    writer = FakeWriter()
    chunk_backfill = FakeChunkBackfill()
    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="refresh-demo",
        batch_size=10,
        backfill_chunks=True,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        chunk_backfill_runner=chunk_backfill,
    )

    assert isinstance(report, RagRefreshReport)
    assert writer.calls == [[12345], [67890]]
    assert report.s2_stage.ingested_papers == 1
    assert report.s2_stage.ingested_corpus_ids == [12345]
    assert report.bioc_fallback_stage.ingested_papers == 1
    assert report.bioc_fallback_stage.ingested_corpus_ids == [67890]
    assert chunk_backfill.calls[0]["corpus_ids"] == [12345, 67890]
    assert report.checkpoint_dir is not None


def test_run_rag_refresh_resumes_completed_units_from_checkpoint(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [RagTargetCorpusRow(corpus_id=12345, pmid=12345)]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(12345)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups):
            self.calls.append([group[0].document.corpus_id for group in source_groups])
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=12345,
                        primary_source_system=source_groups[0][0].document.source_system,
                        primary_reason="test",
                        annotation_source_systems=[],
                    )
                ],
                batch_total_rows=3,
                written_rows=3,
                deferred_stage_names=[],
            )

    first_writer = FakeWriter()
    first_report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="resume-refresh",
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=first_writer,
    )

    assert first_writer.calls == [[12345]]
    assert first_report.s2_stage.completed_units == ["s2orc_v2-000.jsonl.gz"]

    resumed_writer = FakeWriter()
    resumed_report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="resume-refresh",
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=resumed_writer,
    )

    assert resumed_writer.calls == []
    assert resumed_report.resumed_from_checkpoint is True
    assert resumed_report.s2_stage.completed_units == ["s2orc_v2-000.jsonl.gz"]
