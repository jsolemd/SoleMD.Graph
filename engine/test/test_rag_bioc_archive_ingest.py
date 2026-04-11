from __future__ import annotations

from pathlib import Path

from app.rag_ingest.chunk_backfill_runtime import ChunkBackfillExecutionReport
from app.rag_ingest.chunk_seed import ChunkSeedResult
from app.rag_ingest.bioc_archive_ingest import run_bioc_archive_ingest
from app.rag_ingest.target_corpus import RagTargetCorpusRow
from app.rag_ingest.warehouse_writer import RagWarehouseBulkIngestPaperResult, RagWarehouseBulkIngestResult


def test_bioc_archive_ingest_seeds_locators_and_refreshes():
    def _archive_target_discoverer(**kwargs):
        class _Candidate:
            def __init__(self, corpus_id, document_id, ordinal):
                self.corpus_id = corpus_id
                self.document_id = document_id
                self.archive_name = kwargs["archive_name"]
                self.document_ordinal = ordinal

        class _Result:
            @property
            def selected_corpus_ids(self):
                return [101, 202]

            @property
            def candidates(self):
                return [
                    _Candidate(101, "doc-101", 4),
                    _Candidate(202, "doc-202", 9),
                ]

            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [101, 202],
                    "scanned_documents": 321,
                }

        assert kwargs["skip_existing_documents"] is True
        assert kwargs["skip_existing_bioc"] is True
        assert kwargs["start_document_ordinal"] == 501
        return _Result()

    class _FakeLocatorRepository:
        def __init__(self):
            self.entries = []

        def upsert_entries(self, entries):
            self.entries.extend(entries)
            return len(entries)

    class _FakeManifestRepository:
        def __init__(self):
            self.entries = []

        def mark_skipped(self, entries):
            self.entries.extend(entries)
            return len(entries)

    def _refresh_runner(**kwargs):
        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "requested_corpus_ids": kwargs["corpus_ids"],
                    "bioc_fallback_stage": {
                        "ingested_corpus_ids": list(kwargs["corpus_ids"]),
                        "skipped_low_value_corpus_ids": [],
                    },
                    "skip_s2_primary": kwargs["skip_s2_primary"],
                    "seed_chunk_version": kwargs["seed_chunk_version"],
                    "backfill_chunks": kwargs["backfill_chunks"],
                    "chunk_backfill_batch_size": kwargs["chunk_backfill_batch_size"],
                    "embedding_model": kwargs["embedding_model"],
                }

        return _Result()

    def _quality_inspector(*, corpus_ids):
        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "requested_corpus_ids": corpus_ids,
                    "flagged_corpus_ids": [],
                    "papers": [],
                }

        return _Result()

    repository = _FakeLocatorRepository()
    manifest_repository = _FakeManifestRepository()
    report = run_bioc_archive_ingest(
        run_id="bioc-archive-ingest-test",
        parser_version="parser-v1",
        archive_name="BioCXML.1.tar.gz",
        start_document_ordinal=501,
        limit=2,
        archive_target_discoverer=_archive_target_discoverer,
        locator_repository=repository,
        manifest_repository=manifest_repository,
        refresh_runner=_refresh_runner,
        quality_inspector=_quality_inspector,
        seed_chunk_version=True,
        backfill_chunks=True,
        chunk_backfill_batch_size=42,
        embedding_model="medcpt-chunk-v1",
        inspect_quality=True,
    )

    assert report.seeded_locator_entries == 2
    assert report.manifest_skips_marked == 0
    assert report.skipped_low_value_corpus_ids == []
    assert len(repository.entries) == 2
    assert report.discovery_report == {
        "archive_name": "BioCXML.1.tar.gz",
        "selected_corpus_ids": [101, 202],
        "scanned_documents": 321,
    }
    assert report.warehouse_refresh == {
        "requested_corpus_ids": [101, 202],
        "bioc_fallback_stage": {
            "ingested_corpus_ids": [101, 202],
            "skipped_low_value_corpus_ids": [],
        },
        "skip_s2_primary": True,
        "seed_chunk_version": True,
        "backfill_chunks": True,
        "chunk_backfill_batch_size": 42,
        "embedding_model": "medcpt-chunk-v1",
    }
    assert report.quality_report == {
        "requested_corpus_ids": [101, 202],
        "flagged_corpus_ids": [],
        "papers": [],
    }


def test_bioc_archive_ingest_skips_refresh_when_no_candidates():
    def _archive_target_discoverer(**kwargs):
        class _Result:
            @property
            def selected_corpus_ids(self):
                return []

            @property
            def candidates(self):
                return []

            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [],
                    "scanned_documents": 50,
                }

        return _Result()

    class _FakeLocatorRepository:
        def upsert_entries(self, entries):
            return len(entries)

    class _FakeManifestRepository:
        def mark_skipped(self, entries):
            return len(entries)

    def _refresh_runner(**kwargs):
        raise AssertionError("refresh runner should not be called when no candidates were discovered")

    report = run_bioc_archive_ingest(
        run_id="bioc-archive-ingest-empty",
        parser_version="parser-v1",
        archive_name="BioCXML.0.tar.gz",
        archive_target_discoverer=_archive_target_discoverer,
        locator_repository=_FakeLocatorRepository(),
        manifest_repository=_FakeManifestRepository(),
        refresh_runner=_refresh_runner,
    )

    assert report.seeded_locator_entries == 0
    assert report.warehouse_refresh == {
        "run_id": "bioc-archive-ingest-empty",
        "requested_corpus_ids": [],
        "target_corpus_ids": [],
        "source_driven": False,
        "skipped_reason": "no_discovered_candidates",
    }
    assert report.manifest_skips_marked == 0
    assert report.skipped_low_value_corpus_ids == []


def test_bioc_archive_ingest_marks_low_value_manifest_skips_and_inspects_ingested_only():
    def _archive_target_discoverer(**kwargs):
        class _Candidate:
            def __init__(self, corpus_id, document_id, ordinal):
                self.corpus_id = corpus_id
                self.document_id = document_id
                self.archive_name = kwargs["archive_name"]
                self.document_ordinal = ordinal

        class _Result:
            @property
            def selected_corpus_ids(self):
                return [101, 202]

            @property
            def candidates(self):
                return [
                    _Candidate(101, "doc-101", 4),
                    _Candidate(202, "doc-202", 9),
                ]

            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [101, 202],
                }

        return _Result()

    class _FakeLocatorRepository:
        def upsert_entries(self, entries):
            return len(entries)

    class _FakeManifestRepository:
        def __init__(self):
            self.entries = []

        def mark_skipped(self, entries):
            self.entries.extend(entries)
            return len(entries)

    def _refresh_runner(**kwargs):
        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "requested_corpus_ids": kwargs["corpus_ids"],
                    "bioc_fallback_stage": {
                        "ingested_corpus_ids": [202],
                        "skipped_low_value_corpus_ids": [101],
                    },
                }

        return _Result()

    captured_quality_ids: list[int] = []

    def _quality_inspector(*, corpus_ids):
        captured_quality_ids[:] = list(corpus_ids)

        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "requested_corpus_ids": list(corpus_ids),
                    "flagged_corpus_ids": [],
                    "papers": [],
                }

        return _Result()

    manifest_repository = _FakeManifestRepository()
    report = run_bioc_archive_ingest(
        run_id="bioc-archive-low-value-skip",
        parser_version="parser-v1",
        archive_name="BioCXML.4.tar.gz",
        archive_target_discoverer=_archive_target_discoverer,
        locator_repository=_FakeLocatorRepository(),
        manifest_repository=manifest_repository,
        refresh_runner=_refresh_runner,
        quality_inspector=_quality_inspector,
        inspect_quality=True,
    )

    assert report.manifest_skips_marked == 1
    assert report.skipped_low_value_corpus_ids == [101]
    assert captured_quality_ids == [202]
    assert len(manifest_repository.entries) == 1
    assert manifest_repository.entries[0].archive_name == "BioCXML.4.tar.gz"
    assert manifest_repository.entries[0].document_ordinal == 4
    assert manifest_repository.entries[0].document_id == "doc-101"
    assert manifest_repository.entries[0].skip_reason == "low_value_shell_document"


def test_bioc_archive_ingest_can_use_precomputed_discovery_report(tmp_path: Path):
    discovery_report_path = tmp_path / "discovery.json"
    discovery_report_path.write_text(
        """
        {
          "archive_name": "BioCXML.4.tar.gz",
          "start_document_ordinal": 1001,
          "resolver_batch_size": 120,
          "limit": 12,
          "max_documents": 250,
          "scanned_documents": 124,
          "last_document_ordinal_scanned": 1242,
          "manifest_entries_used": 4,
          "manifest_entries_written": 120,
          "resolved_corpus_ids": [40, 50, 60],
          "selected_corpus_ids": [40, 50, 60],
          "candidates": [
            {
              "corpus_id": 40,
              "document_id": "doc-40",
              "archive_name": "BioCXML.4.tar.gz",
              "document_ordinal": 1122,
              "existing_document": false,
              "existing_s2_source": false,
              "existing_bioc_source": false
            },
            {
              "corpus_id": 50,
              "document_id": "doc-50",
              "archive_name": "BioCXML.4.tar.gz",
              "document_ordinal": 1123,
              "existing_document": false,
              "existing_s2_source": false,
              "existing_bioc_source": false
            },
            {
              "corpus_id": 60,
              "document_id": "doc-60",
              "archive_name": "BioCXML.4.tar.gz",
              "document_ordinal": 1124,
              "existing_document": false,
              "existing_s2_source": false,
              "existing_bioc_source": false
            }
          ]
        }
        """
    )

    def _archive_target_discoverer(**kwargs):
        raise AssertionError("archive discovery should not run when a discovery report is supplied")

    class _FakeLocatorRepository:
        def __init__(self):
            self.entries = []

        def upsert_entries(self, entries):
            self.entries.extend(entries)
            return len(entries)

    class _FakeManifestRepository:
        def mark_skipped(self, entries):
            return len(entries)

    def _refresh_runner(**kwargs):
        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "requested_corpus_ids": kwargs["corpus_ids"],
                    "bioc_fallback_stage": {
                        "ingested_corpus_ids": list(kwargs["corpus_ids"]),
                        "skipped_low_value_corpus_ids": [],
                    },
                }

        return _Result()

    repository = _FakeLocatorRepository()
    report = run_bioc_archive_ingest(
        run_id="bioc-archive-ingest-precomputed",
        parser_version="parser-v1",
        archive_name="BioCXML.4.tar.gz",
        discovery_report_path=discovery_report_path,
        limit=2,
        archive_target_discoverer=_archive_target_discoverer,
        locator_repository=repository,
        manifest_repository=_FakeManifestRepository(),
        refresh_runner=_refresh_runner,
    )

    assert report.discovery_report_path == str(discovery_report_path)
    assert [entry.corpus_id for entry in repository.entries] == [40, 50]
    assert [entry.member_name for entry in repository.entries] == [None, None]
    assert report.discovery_report["selected_corpus_ids"] == [40, 50]
    assert report.warehouse_refresh["requested_corpus_ids"] == [40, 50]


def test_bioc_archive_ingest_uses_direct_archive_member_path_by_default():
    def _archive_target_discoverer(**kwargs):
        class _Candidate:
            def __init__(self, corpus_id, document_id, ordinal, member_name):
                self.corpus_id = corpus_id
                self.document_id = document_id
                self.archive_name = kwargs["archive_name"]
                self.document_ordinal = ordinal
                self.member_name = member_name

        class _Result:
            @property
            def selected_corpus_ids(self):
                return [101, 202]

            @property
            def candidates(self):
                return [
                    _Candidate(101, "doc-101", 4, "output/BioCXML/101.BioC.XML"),
                    _Candidate(202, "doc-202", 9, "output/BioCXML/202.BioC.XML"),
                ]

            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [101, 202],
                }

        return _Result()

    class _FakeLocatorRepository:
        def __init__(self):
            self.entries = []

        def upsert_entries(self, entries):
            self.entries.extend(entries)
            return len(entries)

    class _FakeManifestRepository:
        def mark_skipped(self, entries):
            return len(entries)

    class _FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            assert corpus_ids == [101, 202]
            return {202}

    class _FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [101, 202]
            assert limit is None

            class _Row:
                def __init__(self, corpus_id, paper_title):
                    self.corpus_id = corpus_id
                    self.paper_title = paper_title

            return [
                _Row(101, "Canonical Archive Title"),
                _Row(202, "Ignored Existing Title"),
            ]

    def _archive_member_fetcher(**kwargs):
        requests = kwargs["requests"]

        class _Result:
            def __init__(self, document_id, ordinal, member_name, xml_text, cache_hit):
                self.archive_name = kwargs["archive_name"]
                self.document_id = document_id
                self.document_ordinal = ordinal
                self.member_name = member_name
                self.xml_text = xml_text
                self.cache_hit = cache_hit

        class _Report:
            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "requested_members": len(requests),
                    "fetched_members": 1,
                    "cache_hits": 1,
                    "archive_reads": 0,
                    "missing_document_ids": [],
                }

            @property
            def missing_document_ids(self):
                return []

            @property
            def fetched_members(self):
                return 1

        return (
            [
                _Result(
                    "doc-101",
                    4,
                    "output/BioCXML/101.BioC.XML",
                    """
                    <collection><document><id>doc-101</id>
                    <passage><infon key="type">paragraph</infon><offset>0</offset>
                    <text>Resolved through direct member ingest.</text></passage>
                    </document></collection>
                    """,
                    True,
                )
            ],
            _Report(),
        )

    class _FakeWriter:
        def __init__(self):
            self.source_groups = []

        def ingest_source_groups(self, source_groups, *, source_citation_keys_by_corpus=None, chunk_version=None, replace_existing=False):
            self.source_groups.extend(source_groups)
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=101,
                        primary_source_system="biocxml",
                        primary_reason="fallback_structural_best",
                        annotation_source_systems=[],
                    )
                ],
                batch_total_rows=12,
                written_rows=12,
                deferred_stage_names=[],
            )

    class _FakeChunkSeeder:
        def seed_default(self, *, source_revision_keys, parser_version, embedding_model=None):
            return ChunkSeedResult(
                chunk_version_key="default-structural-v1",
                source_revision_keys=list(source_revision_keys),
                batch_total_rows=1,
                written_rows=1,
                deferred_stage_names=[],
            )

    def _chunk_backfill_runner(**kwargs):
        return ChunkBackfillExecutionReport(
            chunk_version_key="default-structural-v1",
            source_revision_keys=list(kwargs["source_revision_keys"]),
            parser_version=kwargs["parser_version"],
            corpus_ids=list(kwargs["corpus_ids"]),
            papers=[],
            total_block_rows=0,
            total_sentence_rows=0,
            total_chunk_rows=2,
            total_chunk_member_rows=6,
            total_batch_rows=8,
            total_written_rows=8,
            deferred_stage_names=[],
            missing_corpus_ids=[],
            executed=True,
            checkpoint_run_id=kwargs["run_id"],
            checkpoint_dir=None,
            resumed_from_checkpoint=False,
        )

    captured_quality_ids = []

    def _quality_inspector(*, corpus_ids):
        captured_quality_ids[:] = list(corpus_ids)

        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "requested_corpus_ids": list(corpus_ids),
                    "flagged_corpus_ids": [],
                    "papers": [],
                }

        return _Result()

    repository = _FakeLocatorRepository()
    writer = _FakeWriter()
    report = run_bioc_archive_ingest(
        run_id="bioc-archive-direct",
        parser_version="parser-v2",
        archive_name="BioCXML.4.tar.gz",
        archive_target_discoverer=_archive_target_discoverer,
        locator_repository=repository,
        manifest_repository=_FakeManifestRepository(),
        quality_inspector=_quality_inspector,
        existing_loader=_FakeExistingLoader(),
        target_loader=_FakeTargetLoader(),
        archive_member_fetcher=_archive_member_fetcher,
        warehouse_writer=writer,
        chunk_seeder=_FakeChunkSeeder(),
        chunk_backfill_runner=_chunk_backfill_runner,
        seed_chunk_version=True,
        backfill_chunks=True,
        inspect_quality=True,
    )

    assert report.seeded_locator_entries == 2
    assert report.warehouse_refresh["mode"] == "direct_archive_member_ingest"
    assert report.warehouse_refresh["skipped_existing_papers"] == 1
    assert report.warehouse_refresh["member_fetch"]["cache_hits"] == 1
    assert report.warehouse_refresh["bioc_fallback_stage"]["ingested_corpus_ids"] == [101]
    assert report.warehouse_refresh["chunk_seed"]["chunk_version_key"] == "default-structural-v1"
    assert report.warehouse_refresh["chunk_backfill"]["total_chunk_rows"] == 2
    assert captured_quality_ids == [101]
    assert len(writer.source_groups) == 1
    assert writer.source_groups[0][0].document.title == "Canonical Archive Title"


def test_bioc_archive_ingest_direct_path_applies_canonical_target_title():
    def _archive_target_discoverer(**kwargs):
        class _Candidate:
            def __init__(self, corpus_id, document_id, ordinal, member_name):
                self.corpus_id = corpus_id
                self.document_id = document_id
                self.archive_name = kwargs["archive_name"]
                self.document_ordinal = ordinal
                self.member_name = member_name

        class _Result:
            @property
            def selected_corpus_ids(self):
                return [101]

            @property
            def candidates(self):
                return [
                    _Candidate(101, "doc-101", 4, "output/BioCXML/101.BioC.XML"),
                ]

            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [101],
                }

        return _Result()

    class _FakeLocatorRepository:
        def upsert_entries(self, entries):
            return len(entries)

    class _FakeManifestRepository:
        def mark_skipped(self, entries):
            return len(entries)

        def fetch_skipped_document_ids(self, *, source_revision, archive_name, document_ids):
            return set()

    class _FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    class _FakeTargetLoader:
        def load(self, *, corpus_ids, limit):
            assert corpus_ids == [101]
            assert limit is None
            return [
                RagTargetCorpusRow(
                    corpus_id=101,
                    pmid=11111,
                    paper_title="Canonical paper title",
                )
            ]

    def _archive_member_fetcher(**kwargs):
        class _Result:
            archive_name = kwargs["archive_name"]
            document_id = "doc-101"
            document_ordinal = 4
            member_name = "output/BioCXML/101.BioC.XML"
            xml_text = """
            <collection><document><id>doc-101</id>
            <passage><infon key=\"type\">title</infon><offset>0</offset><text>Case presentation</text></passage>
            <passage><infon key=\"type\">paragraph</infon><offset>18</offset>
            <text>Resolved through direct member ingest.</text></passage>
            </document></collection>
            """
            cache_hit = False

        class _Report:
            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "requested_members": 1,
                    "fetched_members": 1,
                    "cache_hits": 0,
                    "archive_reads": 1,
                    "missing_document_ids": [],
                }

            @property
            def missing_document_ids(self):
                return []

        return ([_Result()], _Report())

    class _FakeWriter:
        def __init__(self):
            self.source_groups = []

        def ingest_source_groups(self, source_groups, *, source_citation_keys_by_corpus=None, chunk_version=None, replace_existing=False):
            self.source_groups.extend(source_groups)
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=101,
                        primary_source_system="biocxml",
                        primary_reason="fallback_structural_best",
                        annotation_source_systems=[],
                    )
                ],
                batch_total_rows=5,
                written_rows=5,
                deferred_stage_names=[],
            )

    writer = _FakeWriter()
    report = run_bioc_archive_ingest(
        run_id="bioc-archive-title-override",
        parser_version="parser-v2",
        archive_name="BioCXML.4.tar.gz",
        archive_target_discoverer=_archive_target_discoverer,
        locator_repository=_FakeLocatorRepository(),
        manifest_repository=_FakeManifestRepository(),
        existing_loader=_FakeExistingLoader(),
        target_loader=_FakeTargetLoader(),
        archive_member_fetcher=_archive_member_fetcher,
        warehouse_writer=writer,
    )

    assert report.warehouse_refresh["bioc_fallback_stage"]["ingested_corpus_ids"] == [101]
    assert writer.source_groups[0][0].document.title == "Canonical paper title"
    assert writer.source_groups[0][0].document.raw_attrs_json == {
        "source_selected_title": "Case presentation",
        "corpus_metadata_title": "Canonical paper title",
    }


def test_bioc_archive_ingest_enriches_precomputed_report_with_member_names(tmp_path: Path):
    discovery_report_path = tmp_path / "discovery.json"
    discovery_report_path.write_text(
        """
        {
          "archive_name": "BioCXML.4.tar.gz",
          "start_document_ordinal": 1001,
          "resolver_batch_size": 120,
          "limit": 1,
          "max_documents": 250,
          "scanned_documents": 124,
          "last_document_ordinal_scanned": 1242,
          "manifest_entries_used": 4,
          "manifest_entries_written": 120,
          "resolved_corpus_ids": [40],
          "selected_corpus_ids": [40],
          "candidates": [
            {
              "corpus_id": 40,
              "document_id": "doc-40",
              "archive_name": "BioCXML.4.tar.gz",
              "document_ordinal": 1122,
              "existing_document": false,
              "existing_s2_source": false,
              "existing_bioc_source": false
            }
          ]
        }
        """
    )

    class _FakeLocatorRepository:
        def upsert_entries(self, entries):
            return len(entries)

    class _FakeManifestRepository:
        def mark_skipped(self, entries):
            return len(entries)

    class _FakeExistingLoader:
        def load_existing(self, *, corpus_ids):
            return set()

    def _archive_member_fetcher(**kwargs):
        class _Result:
            archive_name = kwargs["archive_name"]
            document_id = "doc-40"
            document_ordinal = 1122
            member_name = "output/BioCXML/40.BioC.XML"
            xml_text = """
            <collection><document><id>doc-40</id>
            <passage><infon key="type">paragraph</infon><offset>0</offset>
            <text>BioC member enrichment path.</text></passage>
            </document></collection>
            """
            cache_hit = False

        class _Report:
            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "requested_members": 1,
                    "fetched_members": 1,
                    "cache_hits": 0,
                    "archive_reads": 1,
                    "missing_document_ids": [],
                }

            @property
            def missing_document_ids(self):
                return []

        return ([_Result()], _Report())

    class _FakeWriter:
        def ingest_source_groups(self, source_groups, *, source_citation_keys_by_corpus=None, chunk_version=None, replace_existing=False):
            return RagWarehouseBulkIngestResult(
                papers=[
                    RagWarehouseBulkIngestPaperResult(
                        corpus_id=40,
                        primary_source_system="biocxml",
                        primary_reason="fallback_structural_best",
                        annotation_source_systems=[],
                    )
                ],
                batch_total_rows=5,
                written_rows=5,
                deferred_stage_names=[],
            )

    report = run_bioc_archive_ingest(
        run_id="bioc-archive-enrich-report",
        parser_version="parser-v2",
        archive_name="BioCXML.4.tar.gz",
        discovery_report_path=discovery_report_path,
        locator_repository=_FakeLocatorRepository(),
        manifest_repository=_FakeManifestRepository(),
        existing_loader=_FakeExistingLoader(),
        archive_member_fetcher=_archive_member_fetcher,
        warehouse_writer=_FakeWriter(),
    )

    updated = discovery_report_path.read_text()
    assert "\"member_name\": \"output/BioCXML/40.BioC.XML\"" in updated
    assert report.warehouse_refresh["mode"] == "direct_archive_member_ingest"
