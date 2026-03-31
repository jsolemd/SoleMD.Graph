"""Shared fast archive-id scanning helpers for PubTator BioCXML archives."""

from __future__ import annotations

import tarfile
from pathlib import Path

from app.rag.source_parsers import extract_biocxml_document_id


def extract_bioc_document_id_fast(xml_bytes: bytes) -> str:
    """Fast path for standardized single-document BioCXML payloads."""

    document_start = xml_bytes.find(b"<document")
    id_start = xml_bytes.find(b"<id>", document_start if document_start >= 0 else 0)
    if id_start >= 0:
        id_end = xml_bytes.find(b"</id>", id_start + 4)
        if id_end > id_start:
            return xml_bytes[id_start + 4 : id_end].decode("utf-8", errors="replace").strip()
    return extract_biocxml_document_id(xml_bytes.decode("utf-8", errors="replace"))


def iter_bioc_archive_document_ids(archive_path: Path):
    with tarfile.open(archive_path, "r|gz") as archive:
        for document_ordinal, member in enumerate(archive, start=1):
            if not member.isfile():
                continue
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            xml_bytes = extracted.read()
            yield extract_bioc_document_id_fast(xml_bytes), member.name, document_ordinal
