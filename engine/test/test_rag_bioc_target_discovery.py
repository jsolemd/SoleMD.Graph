from __future__ import annotations

from pathlib import Path

from app.rag.bioc_target_discovery import discover_bioc_archive_targets


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


def test_discover_bioc_archive_targets_filters_existing_and_limits(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    archive_root.mkdir(parents=True)
    (archive_root / "BioCXML.0.tar.gz").write_bytes(b"placeholder")

    class _FakeSettings:
        pubtator_biocxml_dir_path = archive_root

    monkeypatch.setattr("app.rag.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr(
        "app.rag.bioc_target_discovery.iter_bioc_archive_document_ids",
        lambda _path: iter(
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

    monkeypatch.setattr("app.rag.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr(
        "app.rag.bioc_target_discovery.iter_bioc_archive_document_ids",
        lambda _path: iter(
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

    monkeypatch.setattr("app.rag.bioc_target_discovery.settings", _FakeSettings())
    monkeypatch.setattr(
        "app.rag.bioc_target_discovery.iter_bioc_archive_document_ids",
        lambda _path: iter(
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
    )

    assert report.selected_corpus_ids == [10]
    assert len(report.candidates) == 1
    assert report.candidates[0].corpus_id == 10
