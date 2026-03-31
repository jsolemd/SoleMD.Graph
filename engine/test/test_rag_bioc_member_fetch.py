from __future__ import annotations

import io
import tarfile
from pathlib import Path

from app.rag_ingest.bioc_member_fetch import (
    RagBioCArchiveMemberRequest,
    fetch_bioc_archive_members,
)


def _write_bioc_archive(path: Path, members: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(path, "w:gz") as archive:
        for member_name, xml_text in members.items():
            data = xml_text.encode("utf-8")
            info = tarfile.TarInfo(name=member_name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))


def test_fetch_bioc_archive_members_caches_member_hits(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    _write_bioc_archive(
        archive_root / "BioCXML.1.tar.gz",
        {
            "output/BioCXML/100.BioC.XML": "<document><id>100</id></document>",
        },
    )

    class _FakeSettings:
        pubtator_release_id = "2026-03-21"
        pubtator_biocxml_dir_path = archive_root

        def pubtator_release_path(self, release_id: str | None = None) -> Path:
            assert release_id in {None, "2026-03-21"}
            return tmp_path / "pubtator" / "releases" / "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_member_fetch.settings", _FakeSettings())

    requests = [
        RagBioCArchiveMemberRequest(
            archive_name="BioCXML.1.tar.gz",
            document_id="100",
            document_ordinal=1,
            member_name="output/BioCXML/100.BioC.XML",
        )
    ]

    first_results, first_report = fetch_bioc_archive_members(
        archive_name="BioCXML.1.tar.gz",
        requests=requests,
        source_revision="2026-03-21",
    )
    second_results, second_report = fetch_bioc_archive_members(
        archive_name="BioCXML.1.tar.gz",
        requests=requests,
        source_revision="2026-03-21",
    )

    assert first_report.archive_reads == 1
    assert first_report.cache_hits == 0
    assert first_results[0].cache_hit is False
    assert second_report.archive_reads == 0
    assert second_report.cache_hits == 1
    assert second_results[0].cache_hit is True


def test_fetch_bioc_archive_members_can_fall_back_to_document_ordinal(monkeypatch, tmp_path: Path):
    archive_root = tmp_path / "pubtator" / "releases" / "2026-03-21" / "biocxml"
    _write_bioc_archive(
        archive_root / "BioCXML.2.tar.gz",
        {
            "output/BioCXML/100.BioC.XML": "<document><id>100</id></document>",
            "output/BioCXML/200.BioC.XML": "<document><id>200</id></document>",
        },
    )

    class _FakeSettings:
        pubtator_release_id = "2026-03-21"
        pubtator_biocxml_dir_path = archive_root

        def pubtator_release_path(self, release_id: str | None = None) -> Path:
            assert release_id in {None, "2026-03-21"}
            return tmp_path / "pubtator" / "releases" / "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_member_fetch.settings", _FakeSettings())

    results, report = fetch_bioc_archive_members(
        archive_name="BioCXML.2.tar.gz",
        requests=[
            RagBioCArchiveMemberRequest(
                archive_name="BioCXML.2.tar.gz",
                document_id="200",
                document_ordinal=2,
                member_name=None,
            )
        ],
        source_revision="2026-03-21",
    )

    assert report.archive_reads == 1
    assert report.cache_hits == 0
    assert report.missing_document_ids == []
    assert results[0].document_id == "200"
    assert results[0].member_name == "output/BioCXML/200.BioC.XML"
