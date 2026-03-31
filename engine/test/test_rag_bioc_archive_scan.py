from __future__ import annotations

import io
import tarfile
from pathlib import Path

from app.rag_ingest.bioc_archive_scan import iter_bioc_archive_document_ids


def _write_member(archive: tarfile.TarFile, name: str, *, document_id: str) -> None:
    payload = (
        "<collection>"
        "<document>"
        f"<id>{document_id}</id>"
        "<passage><text>Example.</text></passage>"
        "</document>"
        "</collection>"
    ).encode("utf-8")
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
