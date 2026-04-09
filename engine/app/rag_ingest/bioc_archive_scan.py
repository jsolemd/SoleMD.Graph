"""Shared fast archive-id scanning helpers for PubTator BioCXML archives."""

from __future__ import annotations

import tarfile
from pathlib import Path


def extract_all_bioc_document_ids_fast(xml_bytes: bytes) -> list[str]:
    """Extract all document ids from a BioCXML archive member payload."""

    ids: list[str] = []
    search_start = 0
    while True:
        doc_start = xml_bytes.find(b"<document>", search_start)
        if doc_start < 0:
            doc_start = xml_bytes.find(b"<document ", search_start)
        if doc_start < 0:
            break
        id_start = xml_bytes.find(b"<id>", doc_start)
        if id_start < 0:
            break
        id_end = xml_bytes.find(b"</id>", id_start + 4)
        if id_end < 0:
            break
        doc_id = xml_bytes[id_start + 4 : id_end].decode("utf-8", errors="replace").strip()
        if doc_id:
            ids.append(doc_id)
        search_start = id_end + 5
    return ids


def iter_bioc_archive_document_ids(
    archive_path: Path,
    *,
    start_document_ordinal: int = 1,
    max_documents: int | None = None,
):
    if start_document_ordinal <= 0:
        raise ValueError("start_document_ordinal must be positive")
    if max_documents is not None and max_documents <= 0:
        raise ValueError("max_documents must be positive when provided")

    document_ordinal = 0
    yielded_documents = 0
    with tarfile.open(archive_path, "r|gz") as archive:
        for member in archive:
            if not member.isfile():
                continue
            if max_documents is not None and yielded_documents >= max_documents:
                break
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            xml_bytes = extracted.read()
            for document_id in extract_all_bioc_document_ids_fast(xml_bytes):
                document_ordinal += 1
                if document_ordinal < start_document_ordinal:
                    continue
                if max_documents is not None and yielded_documents >= max_documents:
                    return
                yielded_documents += 1
                yield document_id, member.name, document_ordinal
