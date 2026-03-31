from __future__ import annotations

from pathlib import Path

from app.rag_ingest.bioc_archive_manifest import RagBioCArchiveManifestEntry
from app.rag_ingest.bioc_target_discovery import discover_bioc_archive_targets


class _FakeResolver:
    def __init__(self, mapping):
        self.mapping = mapping

    def resolve_document_ids(self, document_ids):
        return {
            document_id: self.mapping[document_id]
            for document_id in document_ids
            if document_id in self.mapping
        }


class _FakeCoverageInspector:
    def __init__(self, *, existing_documents=None, existing_s2=None, existing_bioc=None):
        self.existing_documents = set(existing_documents or [])
        self.existing_s2 = set(existing_s2 or [])
        self.existing_bioc = set(existing_bioc or [])

    def classify_corpus_ids(self, *, corpus_ids):
        normalized = {int(corpus_id) for corpus_id in corpus_ids}
        return (
            normalized & self.existing_documents,
            normalized & self.existing_s2,
            normalized & self.existing_bioc,
        )


class _FakeManifestRepository:
    def __init__(self, entries=None):
        self.entries = list(entries or [])
        self.written_entries = []

    def fetch_window(self, *, source_revision, archive_name, start_document_ordinal, limit):
        matches = [
            entry
            for entry in self.entries
            if entry.source_revision == source_revision
            and entry.archive_name == archive_name
            and entry.document_ordinal >= start_document_ordinal
        ]
        matches.sort(key=lambda entry: entry.document_ordinal)

        class _Lookup:
            def __init__(self, entries):
                self.entries = entries
                self.covered_until_ordinal = (
                    int(entries[-1].document_ordinal) if entries else 0
                )

        return _Lookup(matches[:limit])

    def max_document_ordinal(self, *, source_revision, archive_name):
        ordinals = [
            int(entry.document_ordinal)
            for entry in self.entries
            if entry.source_revision == source_revision and entry.archive_name == archive_name
        ]
        return max(ordinals, default=0)

    def upsert_entries(self, entries):
        self.written_entries.extend(entries)
        return len(entries)


def test_discover_bioc_archive_targets_filters_existing_and_limits(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    archive_root.mkdir(parents=True)
    (archive_root / "BioCXML.0.tar.gz").write_bytes(b"placeholder")

    class _FakeSettings:
        pubtator_biocxml_dir_path = archive_root
        pubtator_release_id = "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr(
        "app.rag_ingest.bioc_target_discovery.iter_bioc_archive_document_ids",
        lambda _path, **_kwargs: iter(
            [
                ("100", "output/BioCXML/1.BioC.XML", 1),
                ("200", "output/BioCXML/2.BioC.XML", 2),
                ("300", "output/BioCXML/3.BioC.XML", 3),
            ]
        ),
    )

    report = discover_bioc_archive_targets(
        archive_name="BioCXML.0.tar.gz",
        limit=1,
        resolver=_FakeResolver({"100": 10, "200": 20, "300": 30}),
        coverage_inspector=_FakeCoverageInspector(
            existing_documents={10},
            existing_s2={10},
            existing_bioc={20},
        ),
        manifest_repository=_FakeManifestRepository(),
    )

    assert report.scanned_documents == 3
    assert report.resolved_corpus_ids == [10, 20, 30]
    assert report.selected_corpus_ids == [30]
    assert len(report.candidates) == 1
    assert report.candidates[0].corpus_id == 30
    assert report.candidates[0].document_id == "300"
    assert report.candidates[0].archive_name == "BioCXML.0.tar.gz"
    assert report.candidates[0].document_ordinal == 3


def test_discover_bioc_archive_targets_can_require_existing_s2_source(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    archive_root.mkdir(parents=True)
    (archive_root / "BioCXML.0.tar.gz").write_bytes(b"placeholder")

    class _FakeSettings:
        pubtator_biocxml_dir_path = archive_root
        pubtator_release_id = "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr(
        "app.rag_ingest.bioc_target_discovery.iter_bioc_archive_document_ids",
        lambda _path, **_kwargs: iter(
            [
                ("100", "output/BioCXML/1.BioC.XML", 1),
                ("200", "output/BioCXML/2.BioC.XML", 2),
                ("300", "output/BioCXML/3.BioC.XML", 3),
            ]
        ),
    )

    report = discover_bioc_archive_targets(
        archive_name="BioCXML.0.tar.gz",
        require_existing_documents=True,
        require_existing_s2_source=True,
        skip_existing_documents=False,
        resolver=_FakeResolver({"100": 10, "200": 20, "300": 30}),
        coverage_inspector=_FakeCoverageInspector(
            existing_documents={10, 20},
            existing_s2={20},
            existing_bioc=set(),
        ),
        manifest_repository=_FakeManifestRepository(),
    )

    assert report.selected_corpus_ids == [20]
    assert len(report.candidates) == 1
    assert report.candidates[0].corpus_id == 20
    assert report.candidates[0].existing_document is True
    assert report.candidates[0].existing_s2_source is True


def test_discover_bioc_archive_targets_can_require_existing_documents(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    archive_root.mkdir(parents=True)
    (archive_root / "BioCXML.0.tar.gz").write_bytes(b"placeholder")

    class _FakeSettings:
        pubtator_biocxml_dir_path = archive_root
        pubtator_release_id = "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr(
        "app.rag_ingest.bioc_target_discovery.iter_bioc_archive_document_ids",
        lambda _path, **_kwargs: iter(
            [
                ("100", "output/BioCXML/1.BioC.XML", 1),
                ("200", "output/BioCXML/2.BioC.XML", 2),
                ("300", "output/BioCXML/3.BioC.XML", 3),
            ]
        ),
    )

    report = discover_bioc_archive_targets(
        archive_name="BioCXML.0.tar.gz",
        require_existing_documents=True,
        skip_existing_documents=False,
        resolver=_FakeResolver({"100": 10, "200": 20, "300": 30}),
        coverage_inspector=_FakeCoverageInspector(
            existing_documents={10, 30},
            existing_bioc={30},
        ),
        manifest_repository=_FakeManifestRepository(),
    )

    assert report.selected_corpus_ids == [10]
    assert len(report.candidates) == 1
    assert report.candidates[0].corpus_id == 10


def test_discover_bioc_archive_targets_honors_start_document_ordinal(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    archive_root.mkdir(parents=True)
    (archive_root / "BioCXML.0.tar.gz").write_bytes(b"placeholder")

    class _FakeSettings:
        pubtator_biocxml_dir_path = archive_root
        pubtator_release_id = "2026-03-21"

    seen = {}

    def _iter(_path, *, start_document_ordinal=1, max_documents=None):
        seen["start_document_ordinal"] = start_document_ordinal
        seen["max_documents"] = max_documents
        return iter(
            [
                ("200", "output/BioCXML/2.BioC.XML", 200),
                ("201", "output/BioCXML/3.BioC.XML", 201),
            ]
        )

    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.iter_bioc_archive_document_ids", _iter)

    report = discover_bioc_archive_targets(
        archive_name="BioCXML.0.tar.gz",
        start_document_ordinal=200,
        max_documents=50,
        limit=2,
        resolver=_FakeResolver({"200": 20, "201": 21}),
        coverage_inspector=_FakeCoverageInspector(),
        manifest_repository=_FakeManifestRepository(),
    )

    assert seen == {"start_document_ordinal": 200, "max_documents": 50}
    assert report.start_document_ordinal == 200
    assert report.resolver_batch_size == 25
    assert report.last_document_ordinal_scanned == 201
    assert report.selected_corpus_ids == [20, 21]


def test_discover_bioc_archive_targets_reuses_manifest_window(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    archive_root.mkdir(parents=True)
    (archive_root / "BioCXML.3.tar.gz").write_bytes(b"placeholder")

    class _FakeSettings:
        pubtator_biocxml_dir_path = archive_root
        pubtator_release_id = "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr(
        "app.rag_ingest.bioc_target_discovery.iter_bioc_archive_document_ids",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("archive scan should not run when manifest coverage exists")
        ),
    )

    manifest_repository = _FakeManifestRepository(
        [
            RagBioCArchiveManifestEntry(
                source_revision="2026-03-21",
                archive_name="BioCXML.3.tar.gz",
                document_ordinal=1009,
                member_name="output/BioCXML/32134221.BioC.XML",
                document_id="32134221",
            ),
            RagBioCArchiveManifestEntry(
                source_revision="2026-03-21",
                archive_name="BioCXML.3.tar.gz",
                document_ordinal=1010,
                member_name="output/BioCXML/3100857.BioC.XML",
                document_id="3100857",
            ),
        ]
    )

    report = discover_bioc_archive_targets(
        archive_name="BioCXML.3.tar.gz",
        start_document_ordinal=1009,
        limit=2,
        resolver=_FakeResolver({"32134221": 212418416, "3100857": 42062427}),
        coverage_inspector=_FakeCoverageInspector(),
        manifest_repository=manifest_repository,
    )

    assert report.manifest_entries_used == 2
    assert report.manifest_entries_written == 0
    assert report.scanned_documents == 2
    assert report.last_document_ordinal_scanned == 1010
    assert report.selected_corpus_ids == [42062427, 212418416]


def test_discover_bioc_archive_targets_advances_past_skipped_manifest_rows(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    archive_root.mkdir(parents=True)
    (archive_root / "BioCXML.4.tar.gz").write_bytes(b"placeholder")

    class _FakeSettings:
        pubtator_biocxml_dir_path = archive_root
        pubtator_release_id = "2026-03-21"

    seen = {}

    def _iter(_path, *, start_document_ordinal=1, max_documents=None):
        seen["start_document_ordinal"] = start_document_ordinal
        seen["max_documents"] = max_documents
        return iter(
            [
                ("400", "output/BioCXML/4.BioC.XML", 1004),
                ("500", "output/BioCXML/5.BioC.XML", 1005),
            ]
        )

    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr("app.rag_ingest.bioc_target_discovery.iter_bioc_archive_document_ids", _iter)

    class _ManifestRepository:
        def fetch_window(self, *, source_revision, archive_name, start_document_ordinal, limit):
            class _Lookup:
                covered_until_ordinal = 1003
                entries = [
                    RagBioCArchiveManifestEntry(
                        source_revision=source_revision,
                        archive_name=archive_name,
                        document_ordinal=1001,
                        member_name="output/BioCXML/1.BioC.XML",
                        document_id="100",
                    )
                ]

            return _Lookup()

        def max_document_ordinal(self, *, source_revision, archive_name):
            return 1003

        def upsert_entries(self, entries):
            return len(entries)

    report = discover_bioc_archive_targets(
        archive_name="BioCXML.4.tar.gz",
        start_document_ordinal=1001,
        limit=2,
        resolver=_FakeResolver({"100": 10, "400": 40, "500": 50}),
        coverage_inspector=_FakeCoverageInspector(),
        manifest_repository=_ManifestRepository(),
    )

    assert seen == {"start_document_ordinal": 1004, "max_documents": None}
    assert report.manifest_entries_used == 1
    assert report.selected_corpus_ids == [10, 40]
