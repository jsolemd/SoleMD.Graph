from __future__ import annotations

import io
import tarfile
import time
from pathlib import Path

from app.rag_ingest.bioc_archive_scan import iter_bioc_archive_document_ids
from app.rag_ingest.source_parsers import split_biocxml_collection


def _write_member(archive: tarfile.TarFile, name: str, *, document_id: str) -> None:
    payload = (
        "<collection>"
        "<document>"
        f"<id>{document_id}</id>"
        "<passage><text>Example.</text></passage>"
        "</document>"
        "</collection>"
    ).encode()
    info = tarfile.TarInfo(name=name)
    info.size = len(payload)
    archive.addfile(info, io.BytesIO(payload))


def test_iter_bioc_archive_document_ids_honors_start_document_ordinal_and_max_documents(
    tmp_path: Path,
):
    archive_path = tmp_path / "BioCXML.test.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        _write_member(archive, "output/BioCXML/1.BioC.XML", document_id="100")
        _write_member(archive, "output/BioCXML/2.BioC.XML", document_id="200")
        _write_member(archive, "output/BioCXML/3.BioC.XML", document_id="300")

    results = list(
        iter_bioc_archive_document_ids(
            archive_path,
            start_document_ordinal=2,
            max_documents=1,
        )
    )

    assert results == [("200", "output/BioCXML/2.BioC.XML", 2)]


def test_iter_bioc_archive_document_ids_expands_multi_document_members(tmp_path: Path):
    archive_path = tmp_path / "BioCXML.multi.tar.gz"
    multi_payload = (
        b"<collection>"
        b"<document><id>100</id></document>"
        b"<document><id>200</id></document>"
        b"</collection>"
    )
    single_payload = (
        b"<collection>"
        b"<document><id>300</id></document>"
        b"</collection>"
    )

    with tarfile.open(archive_path, "w:gz") as archive:
        multi_info = tarfile.TarInfo("output/BioCXML/1.BioC.XML")
        multi_info.size = len(multi_payload)
        archive.addfile(multi_info, io.BytesIO(multi_payload))
        single_info = tarfile.TarInfo("output/BioCXML/2.BioC.XML")
        single_info.size = len(single_payload)
        archive.addfile(single_info, io.BytesIO(single_payload))

    results = list(iter_bioc_archive_document_ids(archive_path))

    assert results == [
        ("100", "output/BioCXML/1.BioC.XML", 1),
        ("200", "output/BioCXML/1.BioC.XML", 2),
        ("300", "output/BioCXML/2.BioC.XML", 3),
    ]


def test_split_biocxml_collection_parses_100_document_batch_within_budget():
    """split_biocxml_collection must process 100 documents per call in under 500ms (pure CPU)."""
    passages = "".join(
        f"<document><id>{i}</id>"
        "<passage><infon key='type'>paragraph</infon>"
        f"<text>Sample biomedical text for document {i} about psychiatry.</text>"
        "</passage></document>"
        for i in range(1, 101)
    )
    collection_xml = f"<collection><source>PubTator</source><date>2026-04-08</date>{passages}</collection>"

    start = time.perf_counter()
    payloads = split_biocxml_collection(collection_xml)
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert len(payloads) == 100
    assert elapsed_ms < 500, (
        f"split_biocxml_collection took {elapsed_ms:.1f}ms for 100 documents (budget: 500ms)"
    )
    assert all(payload.document_id == str(i) for i, payload in enumerate(payloads, start=1))
