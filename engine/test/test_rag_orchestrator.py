from __future__ import annotations

import json
import tarfile
from io import BytesIO
from unittest.mock import ANY

from app.rag_ingest.corpus_ids import load_corpus_ids_file
from app.rag_ingest.orchestrator import (
    LocalBioCArchiveReader,
    RagRefreshReport,
    _parse_args,
    run_rag_refresh,
)
from app.rag_ingest.orchestrator_units import (
    RagRefreshUnitClaim,
    RagRefreshUnitStatus,
)
from app.rag_ingest.source_locator import RagSourceLocatorLookup
from app.rag_ingest.target_corpus import RagTargetCorpusRow
from app.rag_ingest.warehouse_writer import (
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


def _bioc_title_only_xml(document_id: str, *, title: str = "Title only") -> str:
    return f"""
    <collection>
      <document>
        <id>{document_id}</id>
        <passage>
          <infon key=\"type\">title_1</infon>
          <offset>0</offset>
          <text>{title}</text>
        </passage>
      </document>
    </collection>
    """


def test_local_bioc_archive_reader_skips_malformed_members(tmp_path, caplog):
    archive_path = tmp_path / "BioCXML.test.tar.gz"
    valid_xml = _bioc_xml("12345").encode("utf-8")
    invalid_xml = b"<collection><document><id>bad</id><passage>"
    with tarfile.open(archive_path, "w:gz") as archive:
        valid_info = tarfile.TarInfo("valid.xml")
        valid_info.size = len(valid_xml)
        archive.addfile(valid_info, BytesIO(valid_xml))
        invalid_info = tarfile.TarInfo("invalid.xml")
        invalid_info.size = len(invalid_xml)
        archive.addfile(invalid_info, BytesIO(invalid_xml))

    reader = LocalBioCArchiveReader()
    with caplog.at_level("WARNING"):
        records = list(reader.iter_documents(archive_path))

    assert len(records) == 1
    assert records[0][0] == "12345"
    assert records[0][1] == "valid.xml"
    assert "<id>12345</id>" in records[0][2]
    assert "Skipping malformed BioC XML member invalid.xml" in caplog.text


def test_local_bioc_archive_reader_expands_multi_document_members(tmp_path):
    archive_path = tmp_path / "BioCXML.multi.tar.gz"
    payload = (
        b"<collection>"
        b"<document><id>100</id><passage><text>First.</text></passage></document>"
        b"<document><id>200</id><passage><text>Second.</text></passage></document>"
        b"</collection>"
    )
    with tarfile.open(archive_path, "w:gz") as archive:
        info = tarfile.TarInfo("batch.xml")
        info.size = len(payload)
        archive.addfile(info, BytesIO(payload))

    reader = LocalBioCArchiveReader()
    records = list(reader.iter_documents(archive_path))

    assert [(document_id, member_name) for document_id, member_name, _ in records] == [
        ("100", "batch.xml"),
        ("200", "batch.xml"),
    ]
    assert "<id>100</id>" in records[0][2]
    assert "<id>200</id>" in records[1][2]


class FakeUnitStore:
    def __init__(self):
        self._units: dict[tuple[str, str, str], dict[str, object]] = {}
        self._runs: dict[str, dict[str, object]] = {}
        self._selected_targets: dict[str, list[int]] = {}

    def reset_run(self, *, run_id: str) -> None:
        self._units = {
            key: value
            for key, value in self._units.items()
            if key[0] != run_id
        }
        self._runs.pop(run_id, None)
        self._selected_targets.pop(run_id, None)

    def ensure_source_driven_run(self, *, run_id: str, worker, requested_limit: int | None):
        payload = self._runs.setdefault(
            run_id,
            {
                "run_id": run_id,
                "source_driven": True,
                "worker_count": worker.worker_count,
                "requested_limit": requested_limit,
                "selected_target_count": 0,
            },
        )
        if payload["worker_count"] != worker.worker_count:
            raise ValueError(
                "source-driven refresh run worker_count does not match existing run state"
            )
        if payload["requested_limit"] != requested_limit:
            raise ValueError("source-driven refresh run limit does not match existing run state")
        return self.get_source_driven_run_state(run_id=run_id)

    def get_source_driven_run_state(self, *, run_id: str):
        state = self._runs.get(run_id)
        if state is None:
            return None

        class _State:
            def __init__(self, payload):
                self.run_id = payload["run_id"]
                self.source_driven = payload["source_driven"]
                self.worker_count = payload["worker_count"]
                self.requested_limit = payload["requested_limit"]
                self.selected_target_count = payload["selected_target_count"]

            @property
            def limit_reached(self):
                return (
                    self.requested_limit is not None
                    and self.selected_target_count >= self.requested_limit
                )

        return _State(state)

    def reserve_source_driven_targets(
        self,
        *,
        run_id: str,
        worker,
        source_kind,
        unit_name: str,
        candidate_ids: list[int],
    ):
        state = self._runs[run_id]
        selected = self._selected_targets.setdefault(run_id, [])
        reserved: list[int] = []
        for corpus_id in candidate_ids:
            if corpus_id in selected:
                continue
            if (
                state["requested_limit"] is not None
                and state["selected_target_count"] >= state["requested_limit"]
            ):
                break
            selected.append(corpus_id)
            reserved.append(corpus_id)
            state["selected_target_count"] += 1
        return reserved

    def list_source_driven_targets(self, *, run_id: str):
        return sorted(self._selected_targets.get(run_id, []))

    def ensure_units(self, *, run_id: str, source_kind, unit_paths, worker) -> None:
        for index, path in enumerate(sorted(unit_paths, key=lambda value: value.name)):
            key = (run_id, source_kind.value, path.name)
            self._units.setdefault(
                key,
                {
                    "run_id": run_id,
                    "source_kind": source_kind.value,
                    "unit_name": path.name,
                    "unit_path": str(path),
                    "assigned_worker_index": index % worker.worker_count,
                    "worker_count": worker.worker_count,
                    "status": RagRefreshUnitStatus.PENDING.value,
                    "claim_attempts": 0,
                    "metadata": {},
                },
            )

    def claim_next_unit(self, *, run_id: str, source_kind, worker):
        candidates = [
            value
            for (candidate_run_id, candidate_kind, _), value in self._units.items()
            if candidate_run_id == run_id
            and candidate_kind == source_kind.value
            and value["assigned_worker_index"] == worker.worker_index
            and value["worker_count"] == worker.worker_count
            and value["status"] in {
                RagRefreshUnitStatus.PENDING.value,
                RagRefreshUnitStatus.FAILED.value,
                RagRefreshUnitStatus.RUNNING.value,
            }
        ]
        if not candidates:
            return None
        candidate = sorted(
            candidates,
            key=lambda value: (
                0 if value["status"] == RagRefreshUnitStatus.RUNNING.value else 1,
                value["unit_name"],
            ),
        )[0]
        candidate["status"] = RagRefreshUnitStatus.RUNNING.value
        candidate["claim_attempts"] += 1
        claim_payload = {
            key: value
            for key, value in candidate.items()
            if key != "error_message"
        }
        return RagRefreshUnitClaim.model_validate(claim_payload)

    def mark_completed(self, *, run_id: str, source_kind, unit_name: str, worker) -> None:
        self._units[(run_id, source_kind.value, unit_name)]["status"] = (
            RagRefreshUnitStatus.COMPLETED.value
        )

    def mark_failed(
        self,
        *,
        run_id: str,
        source_kind,
        unit_name: str,
        worker,
        error_message: str,
    ) -> None:
        self._units[(run_id, source_kind.value, unit_name)]["status"] = (
            RagRefreshUnitStatus.FAILED.value
        )
        self._units[(run_id, source_kind.value, unit_name)]["error_message"] = error_message

    def get_unit_progress_ordinal(self, *, run_id: str, source_kind, unit_name: str) -> int:
        unit = self._units.get((run_id, source_kind.value, unit_name))
        if unit is None:
            return 0
        return int(unit["metadata"].get("last_processed_ordinal", 0))

    def save_unit_progress_ordinal(
        self,
        *,
        run_id: str,
        source_kind,
        unit_name: str,
        worker,
        processed_ordinal: int,
        last_corpus_id: int | None = None,
    ) -> None:
        unit = self._units[(run_id, source_kind.value, unit_name)]
        unit["metadata"]["last_processed_ordinal"] = int(processed_ordinal)
        if last_corpus_id is None:
            unit["metadata"].pop("last_corpus_id", None)
        else:
            unit["metadata"]["last_corpus_id"] = int(last_corpus_id)

    def list_completed_units(self, *, run_id: str, source_kind, worker=None):
        return sorted(
            value["unit_name"]
            for (candidate_run_id, candidate_kind, _), value in self._units.items()
            if candidate_run_id == run_id
            and candidate_kind == source_kind.value
            and value["status"] == RagRefreshUnitStatus.COMPLETED.value
            and (
                worker is None
                or (
                    value["assigned_worker_index"] == worker.worker_index
                    and value["worker_count"] == worker.worker_count
                )
            )
        )


class FakeSourceLocatorRepository:
    def __init__(self):
        self._entries: dict[tuple[int, str, str], dict[str, object]] = {}

    def upsert_entries(self, entries):
        for entry in entries:
            if isinstance(entry, dict):
                payload = dict(entry)
            else:
                payload = {
                    "corpus_id": int(entry.corpus_id),
                    "source_system": str(entry.source_system),
                    "source_revision": entry.source_revision,
                    "source_kind": str(entry.source_kind),
                    "unit_name": entry.unit_name,
                    "unit_ordinal": int(entry.unit_ordinal),
                    "source_document_key": entry.source_document_key,
                }
            self._entries[
                (
                    int(payload["corpus_id"]),
                    str(payload["source_system"]),
                    payload["source_revision"],
                )
            ] = payload
        return len(entries)

    def fetch_entries(self, *, corpus_ids, source_system, source_revision):
        normalized = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
        entries = [
            row
            for key, row in self._entries.items()
            if key[0] in normalized
            and key[1] == str(source_system)
            and key[2] == source_revision
        ]
        return RagSourceLocatorLookup.model_validate({"entries": entries})


def test_run_rag_refresh_ingests_s2_then_bioc_fallback_and_calls_chunk_backfill(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345, 67890]
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

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                {
                    "corpus_ids": [group[0].document.corpus_id for group in source_groups],
                    "replace_existing": replace_existing,
                }
            )
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
        corpus_ids=[12345, 67890],
        batch_size=10,
        backfill_chunks=True,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        chunk_backfill_runner=chunk_backfill,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert isinstance(report, RagRefreshReport)
    assert writer.calls == [
        {"corpus_ids": [12345], "replace_existing": False},
        {"corpus_ids": [67890], "replace_existing": False},
    ]
    assert report.s2_stage.ingested_papers == 1
    assert report.s2_stage.ingested_corpus_ids == [12345]
    assert report.bioc_fallback_stage.ingested_papers == 1
    assert report.bioc_fallback_stage.ingested_corpus_ids == [67890]
    assert chunk_backfill.calls[0]["corpus_ids"] == [12345, 67890]
    assert chunk_backfill.calls[0]["checkpoint_root"] == tmp_path
    assert report.checkpoint_dir is not None


def test_run_rag_refresh_can_inspect_quality_for_ingested_papers(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
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
        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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

    quality_calls: list[list[int]] = []

    class FakeQualityReport:
        def model_dump(self, mode="python"):
            return {
                "requested_corpus_ids": [12345],
                "flagged_corpus_ids": [],
                "papers": [{"corpus_id": 12345, "flags": []}],
            }

    def fake_quality_inspector(*, corpus_ids):
        quality_calls.append(list(corpus_ids))
        return FakeQualityReport()

    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="quality-demo",
        corpus_ids=[12345],
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=FakeWriter(),
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        inspect_quality=True,
        quality_inspector=fake_quality_inspector,
    )

    assert quality_calls == [[12345]]
    assert report.quality_report == {
        "requested_corpus_ids": [12345],
        "flagged_corpus_ids": [],
        "papers": [{"corpus_id": 12345, "flags": []}],
    }


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

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                {
                    "corpus_ids": [group[0].document.corpus_id for group in source_groups],
                    "replace_existing": replace_existing,
                }
            )
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

    shared_unit_store = FakeUnitStore()
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
        unit_store=shared_unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert first_writer.calls == [{"corpus_ids": [12345], "replace_existing": False}]
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
        unit_store=shared_unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert resumed_writer.calls == []
    assert resumed_report.resumed_from_checkpoint is True
    assert resumed_report.s2_stage.completed_units == ["s2orc_v2-000.jsonl.gz"]


def test_run_rag_refresh_explicit_target_uses_locator_and_merges_bioc_overlay(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [RagTargetCorpusRow(corpus_id=12345, pmid=12345)]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def __init__(self):
            self.shards_seen = []

        def shard_paths(self, *, max_shards=None):
            return [
                tmp_path / "s2orc_v2-000.jsonl.gz",
                tmp_path / "s2orc_v2-001.jsonl.gz",
            ]

        def iter_rows(self, shard_path):
            self.shards_seen.append(shard_path.name)
            if shard_path.name == "s2orc_v2-001.jsonl.gz":
                yield _s2_row(12345)

    class FakeBioCReader:
        def __init__(self):
            self.archives_seen = []

        def archive_paths(self, *, max_archives=None):
            return [
                tmp_path / "BioCXML.0.tar.gz",
                tmp_path / "BioCXML.9.tar.gz",
            ]

        def iter_documents(self, archive_path):
            self.archives_seen.append(archive_path.name)
            if archive_path.name == "BioCXML.9.tar.gz":
                yield "12345", _bioc_xml("12345")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [
                    [source.document.source_system for source in group]
                    for group in source_groups
                ]
            )
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=group[0].document.corpus_id,
                        primary_source_system=group[0].document.source_system,
                        primary_reason="test",
                        annotation_source_systems=[
                            source.document.source_system for source in group[1:]
                        ],
                    )
                    for group in source_groups
                ],
                batch_total_rows=len(source_groups) * 5,
                written_rows=len(source_groups) * 5,
                deferred_stage_names=[],
            )

    locator_repository = FakeSourceLocatorRepository()
    locator_repository.upsert_entries(
        [
            {
                "corpus_id": 12345,
                "source_system": "s2orc_v2",
                "source_revision": "2026-03-10",
                "source_kind": "s2_shard",
                "unit_name": "s2orc_v2-001.jsonl.gz",
                "unit_ordinal": 1,
                "source_document_key": "12345",
            },
            {
                "corpus_id": 12345,
                "source_system": "biocxml",
                "source_revision": "2026-03-21",
                "source_kind": "bioc_archive",
                "unit_name": "BioCXML.9.tar.gz",
                "unit_ordinal": 1,
                "source_document_key": "12345",
            },
        ]
    )

    s2_reader = FakeS2Reader()
    bioc_reader = FakeBioCReader()
    writer = FakeWriter()

    report = run_rag_refresh(
        parser_version="parser-v2",
        run_id="explicit-locator-overlay",
        corpus_ids=[12345],
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=s2_reader,
        bioc_reader=bioc_reader,
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=locator_repository,
    )

    assert s2_reader.shards_seen == ["s2orc_v2-001.jsonl.gz"]
    assert bioc_reader.archives_seen == ["BioCXML.9.tar.gz"]
    assert writer.calls == [[["s2orc_v2", "biocxml"]]]
    assert report.s2_stage.ingested_corpus_ids == [12345]
    assert report.bioc_fallback_stage.ingested_corpus_ids == [12345]


def test_run_rag_refresh_prefers_corpus_metadata_title_for_explicit_overlay(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [
                RagTargetCorpusRow(
                    corpus_id=12345,
                    pmid=12345,
                    paper_title="Canonical Corpus Title",
                )
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-001.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(12345, title="Results")

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return [tmp_path / "BioCXML.9.tar.gz"]

        def iter_documents(self, archive_path):
            yield "12345", _bioc_xml("12345")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [
                    {
                        "titles": [source.document.title for source in group],
                        "metadata_titles": [
                            source.document.raw_attrs_json.get("corpus_metadata_title")
                            for source in group
                        ],
                    }
                    for group in source_groups
                ]
            )
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=group[0].document.corpus_id,
                        primary_source_system=group[0].document.source_system,
                        primary_reason="test",
                        annotation_source_systems=[
                            source.document.source_system for source in group[1:]
                        ],
                    )
                    for group in source_groups
                ],
                batch_total_rows=len(source_groups) * 5,
                written_rows=len(source_groups) * 5,
                deferred_stage_names=[],
            )

    locator_repository = FakeSourceLocatorRepository()
    locator_repository.upsert_entries(
        [
            {
                "corpus_id": 12345,
                "source_system": "s2orc_v2",
                "source_revision": "2026-03-10",
                "source_kind": "s2_shard",
                "unit_name": "s2orc_v2-001.jsonl.gz",
                "unit_ordinal": 1,
                "source_document_key": "12345",
            },
            {
                "corpus_id": 12345,
                "source_system": "biocxml",
                "source_revision": "2026-03-21",
                "source_kind": "bioc_archive",
                "unit_name": "BioCXML.9.tar.gz",
                "unit_ordinal": 1,
                "source_document_key": "12345",
            },
        ]
    )

    writer = FakeWriter()
    run_rag_refresh(
        parser_version="parser-v4",
        run_id="metadata-title-overlay",
        corpus_ids=[12345],
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=locator_repository,
    )

    assert writer.calls == [
        [
            {
                "titles": ["Canonical Corpus Title", "Canonical Corpus Title"],
                "metadata_titles": ["Canonical Corpus Title", "Canonical Corpus Title"],
            }
        ]
    ]


def test_run_rag_refresh_can_refresh_source_locators_inline_for_explicit_targets(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [RagTargetCorpusRow(corpus_id=12345, pmid=12345)]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-001.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(12345)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return [tmp_path / "BioCXML.9.tar.gz"]

        def iter_documents(self, archive_path):
            yield "12345", _bioc_xml("12345")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [
                    [source.document.source_system for source in group]
                    for group in source_groups
                ]
            )
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=group[0].document.corpus_id,
                        primary_source_system=group[0].document.source_system,
                        primary_reason="test",
                        annotation_source_systems=[
                            source.document.source_system for source in group[1:]
                        ],
                    )
                    for group in source_groups
                ],
                batch_total_rows=len(source_groups) * 5,
                written_rows=len(source_groups) * 5,
                deferred_stage_names=[],
            )

    class FakeSourceLocatorRefresher:
        def __init__(self):
            self.calls = []

        def __call__(
            self,
            *,
            run_id=None,
            corpus_ids=None,
            limit=None,
            max_s2_shards=None,
            max_bioc_archives=None,
            skip_s2=False,
            skip_bioc=False,
            reset=False,
            reset_run=False,
            checkpoint_root=None,
            repository=None,
        ):
            self.calls.append(
                {
                    "run_id": run_id,
                    "corpus_ids": corpus_ids,
                    "limit": limit,
                    "max_s2_shards": max_s2_shards,
                    "max_bioc_archives": max_bioc_archives,
                    "skip_s2": skip_s2,
                    "skip_bioc": skip_bioc,
                    "reset": reset,
                    "reset_run": reset_run,
                    "checkpoint_root": checkpoint_root,
                }
            )
            assert repository is not None
            repository.upsert_entries(
                [
                    {
                        "corpus_id": 12345,
                        "source_system": "s2orc_v2",
                        "source_revision": "2026-03-10",
                        "source_kind": "s2_shard",
                        "unit_name": "s2orc_v2-001.jsonl.gz",
                        "unit_ordinal": 1,
                        "source_document_key": "12345",
                    },
                    {
                        "corpus_id": 12345,
                        "source_system": "biocxml",
                        "source_revision": "2026-03-21",
                        "source_kind": "bioc_archive",
                        "unit_name": "BioCXML.9.tar.gz",
                        "unit_ordinal": 1,
                        "source_document_key": "12345",
                    },
                ]
            )

            class _Report:
                def model_dump(self, mode="python"):
                    return {
                        "requested_corpus_ids": [12345],
                        "s2_stage": {"located_corpus_ids": [12345]},
                        "bioc_stage": {"located_corpus_ids": [12345]},
                    }

            return _Report()

    writer = FakeWriter()
    refresher = FakeSourceLocatorRefresher()
    report = run_rag_refresh(
        parser_version="parser-v2",
        run_id="explicit-inline-locator-refresh",
        corpus_ids=[12345],
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        source_locator_refresher=refresher,
        refresh_source_locators=True,
        reset_source_locators=True,
        max_s2_shards=3,
        max_bioc_archives=4,
    )

    assert refresher.calls == [
        {
            "run_id": "explicit-inline-locator-refresh-source-locator-s2",
            "corpus_ids": [12345],
            "limit": None,
            "max_s2_shards": 3,
            "max_bioc_archives": 4,
            "skip_s2": False,
            "skip_bioc": True,
            "reset": True,
            "reset_run": False,
            "checkpoint_root": tmp_path,
        },
        {
            "run_id": "explicit-inline-locator-refresh-source-locator-bioc",
            "corpus_ids": [12345],
            "limit": None,
            "max_s2_shards": 3,
            "max_bioc_archives": 4,
            "skip_s2": True,
            "skip_bioc": False,
            "reset": True,
            "reset_run": False,
            "checkpoint_root": tmp_path,
        }
    ]
    assert writer.calls == [[["s2orc_v2", "biocxml"]]]
    assert report.source_locator_refresh == {
        "s2": {
            "requested_corpus_ids": [12345],
            "s2_stage": {"located_corpus_ids": [12345]},
            "bioc_stage": {"located_corpus_ids": [12345]},
        },
        "bioc": {
            "requested_corpus_ids": [12345],
            "s2_stage": {"located_corpus_ids": [12345]},
            "bioc_stage": {"located_corpus_ids": [12345]},
        },
    }


def test_run_rag_refresh_skips_low_value_bioc_shell_documents(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [RagTargetCorpusRow(corpus_id=12345, pmid=12345)]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return []

        def iter_rows(self, shard_path):
            yield from ()

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return [tmp_path / "BioCXML.9.tar.gz"]

        def iter_documents(self, archive_path):
            yield "12345", _bioc_title_only_xml("12345", title="Friends.")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(source_groups)
            return RagWarehouseBulkIngestResult(
                papers=[],
                batch_total_rows=0,
                written_rows=0,
                deferred_stage_names=[],
            )

    locator_repository = FakeSourceLocatorRepository()
    locator_repository.upsert_entries(
        [
            {
                "corpus_id": 12345,
                "source_system": "biocxml",
                "source_revision": "2026-03-21",
                "source_kind": "bioc_archive",
                "unit_name": "BioCXML.9.tar.gz",
                "unit_ordinal": 1,
                "source_document_key": "12345",
            },
        ]
    )

    writer = FakeWriter()
    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="skip-low-value-bioc",
        corpus_ids=[12345],
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=locator_repository,
        skip_s2_primary=True,
    )

    assert writer.calls == []
    assert report.bioc_fallback_stage.discovered_papers == 1
    assert report.bioc_fallback_stage.ingested_papers == 0
    assert report.bioc_fallback_stage.ingested_corpus_ids == []
    assert report.bioc_fallback_stage.skipped_low_value_papers == 1
    assert report.bioc_fallback_stage.skipped_low_value_corpus_ids == [12345]


def test_run_rag_refresh_skip_s2_primary_does_not_preload_metadata_abstracts(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [
                RagTargetCorpusRow(
                    corpus_id=12345,
                    pmid=12345,
                    paper_title="Canonical Corpus Title",
                    paper_abstract=(
                        "Melatonin reduced delirium incidence in the randomized cohort."
                    ),
                    paper_id="S2:paper-12345",
                    text_availability="fulltext",
                )
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            raise AssertionError("skip_s2_primary should avoid S2 shard scans")

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return [tmp_path / "BioCXML.9.tar.gz"]

        def iter_documents(self, archive_path):
            yield "12345", _bioc_xml("12345")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [
                    {
                        "corpus_id": group[0].document.corpus_id,
                        "source_system": group[0].document.source_system,
                        "replace_existing": replace_existing,
                    }
                    for group in source_groups
                ]
            )
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

    locator_repository = FakeSourceLocatorRepository()
    locator_repository.upsert_entries(
        [
            {
                "corpus_id": 12345,
                "source_system": "biocxml",
                "source_revision": "2026-03-21",
                "source_kind": "bioc_archive",
                "unit_name": "BioCXML.9.tar.gz",
                "unit_ordinal": 1,
                "source_document_key": "12345",
            },
        ]
    )

    writer = FakeWriter()
    report = run_rag_refresh(
        parser_version="parser-v5",
        run_id="skip-s2-primary-no-abstract-bootstrap",
        corpus_ids=[12345],
        batch_size=8,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=locator_repository,
        skip_s2_primary=True,
        refresh_existing=True,
    )

    assert report.s2_stage.ingested_corpus_ids == []
    assert report.bioc_fallback_stage.ingested_corpus_ids == [12345]
    assert writer.calls == [
        [
            {
                "corpus_id": 12345,
                "source_system": "biocxml",
                "replace_existing": True,
            }
        ]
    ]


def test_run_rag_refresh_rejects_stage_row_budget_mismatch_on_resume(tmp_path):
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
        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=12345,
                        primary_source_system=source_groups[0][0].document.source_system,
                        primary_reason="test",
                        annotation_source_systems=[],
                    )
                ],
                batch_total_rows=7,
                written_rows=7,
                deferred_stage_names=[],
            )

    shared_unit_store = FakeUnitStore()
    run_rag_refresh(
        parser_version="parser-v1",
        run_id="resume-row-budget-mismatch",
        stage_row_budget=100,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=FakeWriter(),
        unit_store=shared_unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    try:
        run_rag_refresh(
            parser_version="parser-v1",
            run_id="resume-row-budget-mismatch",
            stage_row_budget=200,
            checkpoint_root=tmp_path,
            target_loader=FakeTargetLoader(),
            existing_loader=FakeExistingLoader(),
            s2_reader=FakeS2Reader(),
            bioc_reader=FakeBioCReader(),
            writer=FakeWriter(),
            unit_store=shared_unit_store,
            source_locator_repository=FakeSourceLocatorRepository(),
        )
    except ValueError as exc:
        assert (
            str(exc)
            == "checkpoint run stage_row_budget does not match requested stage_row_budget"
        )
    else:
        raise AssertionError("expected checkpoint validation to reject stage_row_budget mismatch")


def test_run_rag_refresh_rejects_stage_byte_budget_mismatch_on_resume(tmp_path):
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
        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=12345,
                        primary_source_system=source_groups[0][0].document.source_system,
                        primary_reason="test",
                        annotation_source_systems=[],
                    )
                ],
                batch_total_rows=7,
                written_rows=7,
                deferred_stage_names=[],
            )

    shared_unit_store = FakeUnitStore()
    run_rag_refresh(
        parser_version="parser-v1",
        run_id="resume-byte-budget-mismatch",
        stage_byte_budget=4096,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=FakeWriter(),
        unit_store=shared_unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    try:
        run_rag_refresh(
            parser_version="parser-v1",
            run_id="resume-byte-budget-mismatch",
            stage_byte_budget=8192,
            checkpoint_root=tmp_path,
            target_loader=FakeTargetLoader(),
            existing_loader=FakeExistingLoader(),
            s2_reader=FakeS2Reader(),
            bioc_reader=FakeBioCReader(),
            writer=FakeWriter(),
            unit_store=shared_unit_store,
            source_locator_repository=FakeSourceLocatorRepository(),
        )
    except ValueError as exc:
        assert (
            str(exc)
            == "checkpoint run stage_byte_budget does not match requested stage_byte_budget"
        )
    else:
        raise AssertionError("expected checkpoint validation to reject stage_byte_budget mismatch")


def test_parse_args_accepts_checkpoint_root_and_corpus_ids_file(tmp_path):
    ids_file = tmp_path / "corpus_ids.txt"
    ids_file.write_text("12345\n# comment\n67890\n12345\n")

    args = _parse_args(
        [
            "--run-id",
            "refresh-demo",
            "--parser-version",
            "parser-v1",
            "--corpus-ids-file",
            str(ids_file),
            "--checkpoint-root",
            str(tmp_path / "checkpoints"),
            "--report-path",
            str(tmp_path / "report.json"),
            "--skip-s2-primary",
        ]
    )

    assert args.corpus_ids_file == ids_file
    assert args.checkpoint_root == tmp_path / "checkpoints"
    assert args.report_path == tmp_path / "report.json"
    assert args.skip_s2_primary is True
    assert load_corpus_ids_file(args.corpus_ids_file) == [12345, 67890]


def test_parse_args_uses_canonical_operator_flags(tmp_path):
    ids_file = tmp_path / "targets.txt"
    ids_file.write_text("12345\n")

    args = _parse_args(
        [
            "--run-id",
            "refresh-demo",
            "--parser-version",
            "parser-v1",
            "--corpus-id",
            "67890",
            "--corpus-ids-file",
            str(ids_file),
            "--skip-s2-primary",
            "--skip-bioc-fallback",
            "--metadata-abstract-only",
            "--seed-chunk-version",
            "--backfill-chunks",
            "--stage-row-budget",
            "1234",
            "--stage-byte-budget",
            "5678",
            "--worker-count",
            "2",
            "--worker-index",
            "1",
            "--checkpoint-root",
            str(tmp_path / "state"),
            "--report-path",
            str(tmp_path / "report.json"),
        ]
    )

    assert args.corpus_ids == [67890]
    assert args.corpus_ids_file == ids_file
    assert args.skip_s2_primary is True
    assert args.skip_bioc_fallback is True
    assert args.metadata_abstract_only is True
    assert args.seed_chunk_version is True
    assert args.backfill_chunks is True
    assert args.stage_row_budget == 1234
    assert args.stage_byte_budget == 5678
    assert args.worker_count == 2
    assert args.worker_index == 1
    assert args.checkpoint_root == tmp_path / "state"
    assert args.report_path == tmp_path / "report.json"


def test_run_rag_refresh_forwards_refresh_existing_to_writer(tmp_path):
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

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(replace_existing)
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

    writer = FakeWriter()
    run_rag_refresh(
        parser_version="parser-v1",
        run_id="refresh-existing-demo",
        refresh_existing=True,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert writer.calls == [True]


def test_run_rag_refresh_without_explicit_ids_uses_source_driven_s2_selection(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert limit is None
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
                if corpus_id != 77777
            ]

    class FakeExistingLoader:
        def __init__(self):
            self.calls = []

        def load_existing(self, *, corpus_ids):
            self.calls.append(list(corpus_ids))
            return {12345}

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(12345)
            yield _s2_row(67890)
            yield _s2_row(77777)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [group[0].document.corpus_id for group in source_groups]
            )
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

    existing_loader = FakeExistingLoader()
    writer = FakeWriter()

    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="source-driven-refresh",
        limit=2,
        batch_size=2,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=existing_loader,
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert report.source_driven is True
    assert report.target_corpus_ids == [67890]
    assert existing_loader.calls == [[12345, 67890]]
    assert writer.calls == [[67890]]
    assert report.s2_stage.ingested_papers == 1
    assert report.s2_stage.skipped_existing_papers == 1
    assert report.s2_stage.completed_units == ["s2orc_v2-000.jsonl.gz"]


def test_run_rag_refresh_source_driven_prefers_corpus_metadata_title(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert limit is None
            return [
                RagTargetCorpusRow(
                    corpus_id=corpus_id,
                    pmid=corpus_id,
                    paper_title="Canonical Corpus Title",
                )
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(12345, title="Methods")

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [
                    {
                        "title": group[0].document.title,
                        "metadata_title": group[0].document.raw_attrs_json.get(
                            "corpus_metadata_title"
                        ),
                    }
                    for group in source_groups
                ]
            )
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

    writer = FakeWriter()
    report = run_rag_refresh(
        parser_version="parser-v4",
        run_id="source-driven-metadata-title",
        limit=1,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert report.target_corpus_ids == [12345]
    assert writer.calls == [
        [{"title": "Canonical Corpus Title", "metadata_title": "Canonical Corpus Title"}]
    ]


def test_run_rag_refresh_explicit_bootstraps_metadata_abstract_without_s2_scan(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [
                RagTargetCorpusRow(
                    corpus_id=12345,
                    pmid=12345,
                    paper_title="Canonical Corpus Title",
                    paper_abstract=(
                        "Melatonin reduced delirium incidence in the randomized cohort. "
                        "No serious adverse events were observed."
                    ),
                    paper_id="S2:paper-12345",
                    text_availability="fulltext",
                )
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            raise AssertionError("metadata abstract bootstrap should avoid S2 shard scans")

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [
                    {
                        "corpus_id": group[0].document.corpus_id,
                        "title": group[0].document.title,
                        "availability": group[0].document.source_availability,
                        "ingest_lane": group[0].document.raw_attrs_json.get("ingest_lane"),
                    }
                    for group in source_groups
                ]
            )
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

    class FakeSourceLocatorRefresher:
        def __init__(self):
            self.calls = []

        def __call__(self, **kwargs):
            self.calls.append(kwargs)
            raise AssertionError("metadata abstract bootstrap should avoid locator refresh calls")

    writer = FakeWriter()
    refresher = FakeSourceLocatorRefresher()

    report = run_rag_refresh(
        parser_version="parser-v4",
        run_id="explicit-metadata-abstract",
        corpus_ids=[12345],
        batch_size=8,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        source_locator_refresher=refresher,
        refresh_source_locators=True,
        skip_bioc_fallback=True,
    )

    assert refresher.calls == []
    assert report.source_locator_refresh is None
    assert report.s2_stage.discovered_papers == 1
    assert report.s2_stage.ingested_corpus_ids == [12345]
    assert writer.calls == [
        [
            {
                "corpus_id": 12345,
                "title": "Canonical Corpus Title",
                "availability": "abstract",
                "ingest_lane": "s2_papers_abstract",
            }
        ]
    ]


def test_run_rag_refresh_metadata_abstract_only_skips_locator_refresh_and_bioc_overlay(
    tmp_path,
):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [
                RagTargetCorpusRow(
                    corpus_id=12345,
                    pmid=12345,
                    pmc_id="PMC12345",
                    paper_title="Canonical Corpus Title",
                    paper_abstract=(
                        "Melatonin reduced delirium incidence in the randomized cohort. "
                        "No serious adverse events were observed."
                    ),
                    paper_id="S2:paper-12345",
                    text_availability="fulltext",
                )
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            raise AssertionError("metadata_abstract_only should avoid S2 shard scans")

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return [tmp_path / "BioCXML.0.tar.gz"]

        def iter_documents(self, archive_path):
            raise AssertionError("metadata_abstract_only should avoid BioC archive scans")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                [
                    {
                        "corpus_id": group[0].document.corpus_id,
                        "availability": group[0].document.source_availability,
                        "ingest_lane": group[0].document.raw_attrs_json.get("ingest_lane"),
                    }
                    for group in source_groups
                ]
            )
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

    class FakeSourceLocatorRefresher:
        def __call__(self, **kwargs):
            raise AssertionError("metadata_abstract_only should avoid locator refresh calls")

    writer = FakeWriter()

    report = run_rag_refresh(
        parser_version="parser-v4",
        run_id="explicit-metadata-abstract-only",
        corpus_ids=[12345],
        batch_size=8,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        source_locator_refresher=FakeSourceLocatorRefresher(),
        refresh_source_locators=True,
        metadata_abstract_only=True,
        skip_bioc_fallback=False,
    )

    assert report.metadata_abstract_only is True
    assert report.source_locator_refresh is None
    assert report.s2_stage.ingested_corpus_ids == [12345]
    assert report.bioc_fallback_stage.ingested_corpus_ids == []
    assert writer.calls == [
        [
            {
                "corpus_id": 12345,
                "availability": "abstract",
                "ingest_lane": "s2_papers_abstract",
            }
        ]
    ]


def test_run_rag_refresh_explicit_preloads_metadata_abstracts_before_locator_refresh(
    tmp_path,
):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [
                RagTargetCorpusRow(
                    corpus_id=12345,
                    pmid=12345,
                    paper_title="Canonical Corpus Title",
                    paper_abstract=(
                        "Melatonin reduced delirium incidence in the randomized cohort. "
                        "No serious adverse events were observed."
                    ),
                    paper_id="S2:paper-12345",
                    text_availability="fulltext",
                )
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            raise AssertionError("preloaded metadata abstracts should avoid S2 shard discovery")

        def iter_rows(self, shard_path):
            raise AssertionError("preloaded metadata abstracts should avoid S2 shard scans")

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            self.calls.append(
                {
                    "replace_existing": replace_existing,
                    "groups": [
                        {
                            "corpus_id": group[0].document.corpus_id,
                            "availability": group[0].document.source_availability,
                            "ingest_lane": group[0].document.raw_attrs_json.get("ingest_lane"),
                        }
                        for group in source_groups
                    ],
                }
            )
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

    class FakeSourceLocatorRefresher:
        def __init__(self, writer):
            self.writer = writer
            self.calls = []

        def __call__(self, **kwargs):
            assert self.writer.calls, "metadata abstracts should be written before locator refresh"
            self.calls.append(kwargs)
            return {
                "run_id": kwargs["run_id"],
                "corpus_ids": list(kwargs["corpus_ids"]),
                "skip_s2": kwargs["skip_s2"],
                "skip_bioc": kwargs["skip_bioc"],
            }

    writer = FakeWriter()
    refresher = FakeSourceLocatorRefresher(writer)

    report = run_rag_refresh(
        parser_version="parser-v4",
        run_id="explicit-metadata-abstract-preload",
        corpus_ids=[12345],
        batch_size=8,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        source_locator_refresher=refresher,
        refresh_source_locators=True,
        skip_bioc_fallback=False,
    )

    assert writer.calls == [
        {
            "replace_existing": False,
            "groups": [
                {
                    "corpus_id": 12345,
                    "availability": "abstract",
                    "ingest_lane": "s2_papers_abstract",
                }
            ],
        }
    ]
    assert refresher.calls == [
        {
            "checkpoint_root": tmp_path,
            "corpus_ids": [12345],
            "limit": None,
            "max_bioc_archives": None,
            "max_s2_shards": None,
            "repository": ANY,
            "reset": False,
            "reset_run": False,
            "run_id": "explicit-metadata-abstract-preload-source-locator-bioc",
            "skip_bioc": False,
            "skip_s2": True,
        }
    ]
    assert report.source_locator_refresh == {
        "bioc": {
            "run_id": "explicit-metadata-abstract-preload-source-locator-bioc",
            "corpus_ids": [12345],
            "skip_s2": True,
            "skip_bioc": False,
        }
    }


def test_run_rag_refresh_metadata_abstract_only_skips_locator_refresh_for_bootstrapped_ids(
    tmp_path,
):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [12345]
            return [
                RagTargetCorpusRow(
                    corpus_id=12345,
                    pmid=12345,
                    paper_title="Canonical Corpus Title",
                    paper_abstract=(
                        "Melatonin reduced delirium incidence in the randomized cohort. "
                        "No serious adverse events were observed."
                    ),
                    paper_id="S2:paper-12345",
                    text_availability="abstract",
                )
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            raise AssertionError("metadata-abstract-only should avoid S2 discovery")

        def iter_rows(self, shard_path):
            raise AssertionError("metadata-abstract-only should avoid S2 scans")

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            raise AssertionError("metadata-abstract-only should avoid BioC discovery")

        def iter_documents(self, archive_path):
            raise AssertionError("metadata-abstract-only should avoid BioC scans")

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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

    class FakeSourceLocatorRefresher:
        def __init__(self):
            self.calls = []

        def __call__(self, **kwargs):
            self.calls.append(kwargs)
            raise AssertionError(
                "metadata-abstract-only should not call source locator refresh"
            )

    writer = FakeWriter()
    refresher = FakeSourceLocatorRefresher()

    report = run_rag_refresh(
        parser_version="parser-v5",
        run_id="metadata-abstract-only",
        corpus_ids=[12345],
        batch_size=8,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        source_locator_refresher=refresher,
        refresh_source_locators=True,
        metadata_abstract_only=True,
    )

    assert writer.calls == [[12345]]
    assert refresher.calls == []
    assert report.source_locator_refresh is None


def test_run_rag_refresh_source_driven_backfill_uses_selected_target_ids(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(111)
            yield _s2_row(222)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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

    captured: dict[str, object] = {}

    def fake_chunk_backfill(**kwargs):
        captured.update(kwargs)

        class _Report:
            def model_dump(self, mode="python"):
                return {
                    "corpus_ids": list(kwargs["corpus_ids"]),
                    "executed": True,
                }

        return _Report()

    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="source-driven-refresh-backfill",
        limit=2,
        batch_size=2,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=FakeWriter(),
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        backfill_chunks=True,
        chunk_backfill_runner=fake_chunk_backfill,
    )

    assert report.target_corpus_ids == [111, 222]
    assert captured["corpus_ids"] == [111, 222]
    assert report.chunk_backfill == {"corpus_ids": [111, 222], "executed": True}


def test_run_rag_refresh_quality_uses_chunk_backfill_ids_when_no_new_sources_written(
    tmp_path,
):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return {111, 222}

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return []

        def iter_rows(self, shard_path):
            yield from ()

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def ingest_source_groups(self, source_groups, *, replace_existing=False):
            raise AssertionError("no new source groups should be written")

    def fake_chunk_backfill(**kwargs):
        class _Report:
            def model_dump(self, mode="python"):
                return {"corpus_ids": list(kwargs["corpus_ids"]), "executed": True}

        return _Report()

    captured_quality: dict[str, object] = {}

    def fake_quality_inspector(*, corpus_ids):
        captured_quality["corpus_ids"] = list(corpus_ids)
        return {"inspected": list(corpus_ids)}

    report = run_rag_refresh(
        parser_version="parser-v5",
        run_id="existing-only-backfill-quality",
        corpus_ids=[111, 222],
        batch_size=8,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=FakeWriter(),
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
        backfill_chunks=True,
        inspect_quality=True,
        chunk_backfill_runner=fake_chunk_backfill,
        quality_inspector=fake_quality_inspector,
    )

    assert captured_quality["corpus_ids"] == [111, 222]
    assert report.quality_report == {"inspected": [111, 222]}


def test_run_rag_refresh_parallel_workers_partition_source_units(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [
                tmp_path / "s2orc_v2-000.jsonl.gz",
                tmp_path / "s2orc_v2-001.jsonl.gz",
                tmp_path / "s2orc_v2-002.jsonl.gz",
                tmp_path / "s2orc_v2-003.jsonl.gz",
            ]

        def iter_rows(self, shard_path):
            corpus_by_shard = {
                "s2orc_v2-000.jsonl.gz": 111,
                "s2orc_v2-001.jsonl.gz": 222,
                "s2orc_v2-002.jsonl.gz": 333,
                "s2orc_v2-003.jsonl.gz": 444,
            }
            yield _s2_row(corpus_by_shard[shard_path.name])

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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

    unit_store = FakeUnitStore()
    writer0 = FakeWriter()
    report0 = run_rag_refresh(
        parser_version="parser-v1",
        run_id="parallel-refresh",
        checkpoint_root=tmp_path,
        worker_count=2,
        worker_index=0,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer0,
        unit_store=unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )
    writer1 = FakeWriter()
    report1 = run_rag_refresh(
        parser_version="parser-v1",
        run_id="parallel-refresh",
        checkpoint_root=tmp_path,
        worker_count=2,
        worker_index=1,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer1,
        unit_store=unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert writer0.calls == [[111], [333]]
    assert writer1.calls == [[222], [444]]
    assert report0.s2_stage.completed_units == ["s2orc_v2-000.jsonl.gz", "s2orc_v2-002.jsonl.gz"]
    assert report1.s2_stage.completed_units == ["s2orc_v2-001.jsonl.gz", "s2orc_v2-003.jsonl.gz"]
    assert report0.checkpoint_dir != report1.checkpoint_dir


def test_run_rag_refresh_parallel_source_driven_limit_uses_global_budget(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [
                tmp_path / "s2orc_v2-000.jsonl.gz",
                tmp_path / "s2orc_v2-001.jsonl.gz",
            ]

        def iter_rows(self, shard_path):
            corpus_by_shard = {
                "s2orc_v2-000.jsonl.gz": 111,
                "s2orc_v2-001.jsonl.gz": 222,
            }
            yield _s2_row(corpus_by_shard[shard_path.name])

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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

    unit_store = FakeUnitStore()
    writer0 = FakeWriter()
    report0 = run_rag_refresh(
        parser_version="parser-v1",
        run_id="parallel-source-driven-limit",
        checkpoint_root=tmp_path,
        worker_count=2,
        worker_index=0,
        limit=1,
        batch_size=1,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer0,
        unit_store=unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )
    writer1 = FakeWriter()
    report1 = run_rag_refresh(
        parser_version="parser-v1",
        run_id="parallel-source-driven-limit",
        checkpoint_root=tmp_path,
        worker_count=2,
        worker_index=1,
        limit=1,
        batch_size=1,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer1,
        unit_store=unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert report0.selected_target_count == 1
    assert report1.selected_target_count == 1
    assert sorted(report0.target_corpus_ids) == [111]
    assert sorted(report1.target_corpus_ids) == [111]
    assert writer0.calls == [[111]]
    assert writer1.calls == []


def test_run_rag_refresh_stage_row_budget_flushes_before_batch_size_limit(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(111)
            yield _s2_row(222)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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
                batch_total_rows=len(source_groups) * 7,
                written_rows=len(source_groups) * 7,
                deferred_stage_names=[],
            )

    writer = FakeWriter()
    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="row-budget-refresh",
        batch_size=10,
        stage_row_budget=8,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert writer.calls == [[111], [222]]
    assert report.stage_row_budget == 8
    assert report.s2_stage.write_batches_executed == 2
    assert report.s2_stage.max_batch_total_rows == 7


def test_run_rag_refresh_resumes_within_s2_shard_from_unit_progress(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FailingS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(111)
            raise RuntimeError("simulated shard interruption")

    class HealthyS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(111)
            yield _s2_row(222)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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

    unit_store = FakeUnitStore()
    first_writer = FakeWriter()
    try:
        run_rag_refresh(
            parser_version="parser-v1",
            run_id="resume-mid-shard",
            checkpoint_root=tmp_path,
            batch_size=1,
            target_loader=FakeTargetLoader(),
            existing_loader=FakeExistingLoader(),
            s2_reader=FailingS2Reader(),
            bioc_reader=FakeBioCReader(),
            writer=first_writer,
            unit_store=unit_store,
            source_locator_repository=FakeSourceLocatorRepository(),
        )
    except RuntimeError as exc:
        assert str(exc) == "simulated shard interruption"
    else:
        raise AssertionError("expected first refresh run to fail mid-shard")

    assert first_writer.calls == [[111]]

    resumed_writer = FakeWriter()
    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="resume-mid-shard",
        checkpoint_root=tmp_path,
        batch_size=1,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=HealthyS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=resumed_writer,
        unit_store=unit_store,
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert resumed_writer.calls == [[222]]
    assert report.resumed_from_checkpoint is True
    assert report.s2_stage.completed_units == ["s2orc_v2-000.jsonl.gz"]


def test_run_rag_refresh_stage_byte_budget_flushes_before_batch_size_limit(tmp_path):
    class FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            return [
                RagTargetCorpusRow(corpus_id=corpus_id, pmid=corpus_id)
                for corpus_id in corpus_ids
            ]

    class FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class FakeS2Reader:
        def shard_paths(self, *, max_shards=None):
            return [tmp_path / "s2orc_v2-000.jsonl.gz"]

        def iter_rows(self, shard_path):
            yield _s2_row(111, title="a" * 600)
            yield _s2_row(222, title="b" * 600)

    class FakeBioCReader:
        def archive_paths(self, *, max_archives=None):
            return []

        def iter_documents(self, archive_path):
            yield from ()

    class FakeWriter:
        def __init__(self):
            self.calls = []

        def ingest_source_groups(self, source_groups, *, replace_existing=False):
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
                batch_total_rows=len(source_groups) * 7,
                written_rows=len(source_groups) * 7,
                deferred_stage_names=[],
            )

    writer = FakeWriter()
    report = run_rag_refresh(
        parser_version="parser-v1",
        run_id="byte-budget-refresh",
        batch_size=10,
        stage_row_budget=0,
        stage_byte_budget=1500,
        checkpoint_root=tmp_path,
        target_loader=FakeTargetLoader(),
        existing_loader=FakeExistingLoader(),
        s2_reader=FakeS2Reader(),
        bioc_reader=FakeBioCReader(),
        writer=writer,
        unit_store=FakeUnitStore(),
        source_locator_repository=FakeSourceLocatorRepository(),
    )

    assert writer.calls == [[111], [222]]
    assert report.stage_byte_budget == 1500
    assert report.s2_stage.write_batches_executed == 2
    assert report.s2_stage.max_batch_estimated_bytes >= 1500
