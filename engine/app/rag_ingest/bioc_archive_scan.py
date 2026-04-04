"""Shared fast archive-id scanning helpers for PubTator BioCXML archives."""

from __future__ import annotations

import tarfile
from pathlib import Path

from app.rag_ingest.source_parsers import extract_biocxml_document_id


def extract_bioc_document_id_fast(xml_bytes: bytes) -> str:
    """Fast path: extract the FIRST document id from a BioCXML payload.

    For single-document payloads this returns the only id. For batch files
    (collections of ~100 documents), this returns only the first — use
    ``extract_all_bioc_document_ids_fast`` to get all ids.
    """

    document_start = xml_bytes.find(b"<document")
    id_start = xml_bytes.find(b"<id>", document_start if document_start >= 0 else 0)
    if id_start >= 0:
        id_end = xml_bytes.find(b"</id>", id_start + 4)
        if id_end > id_start:
            return xml_bytes[id_start + 4 : id_end].decode("utf-8", errors="replace").strip()
    return extract_biocxml_document_id(xml_bytes.decode("utf-8", errors="replace"))


def extract_all_bioc_document_ids_fast(xml_bytes: bytes) -> list[str]:
    """Extract ALL document ids from a BioCXML batch payload.

    PubTator BioCXML archives store ~100 ``<document>`` elements per tar member
    inside a ``<collection>`` wrapper. This function returns every ``<id>`` that
    immediately follows a ``<document>`` open tag, using byte search only (no XML
    parsing).
    """
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

    yielded_documents = 0
    with tarfile.open(archive_path, "r|gz") as archive:
        for document_ordinal, member in enumerate(archive, start=1):
            if not member.isfile():
                continue
            if document_ordinal < start_document_ordinal:
                continue
            if max_documents is not None and yielded_documents >= max_documents:
                break
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            xml_bytes = extracted.read()
            yielded_documents += 1
            yield extract_bioc_document_id_fast(xml_bytes), member.name, document_ordinal


def iter_bioc_archive_all_document_ids(
    archive_path: Path,
    *,
    start_member_ordinal: int = 1,
    max_members: int | None = None,
):
    """Yield (document_id, member_name, member_ordinal) for EVERY document in the archive.

    Unlike ``iter_bioc_archive_document_ids`` which yields one id per tar member,
    this function expands batch files (~100 documents each) and yields once per
    document. Use this for full manifest population.

    Yields:
        Tuple of (document_id, member_name, member_ordinal) — note that many
        documents share the same member_name and member_ordinal since they come
        from the same batch file.
    """
    if start_member_ordinal <= 0:
        raise ValueError("start_member_ordinal must be positive")
    if max_members is not None and max_members <= 0:
        raise ValueError("max_members must be positive when provided")

    processed_members = 0
    with tarfile.open(archive_path, "r|gz") as archive:
        for member_ordinal, member in enumerate(archive, start=1):
            if not member.isfile():
                continue
            if member_ordinal < start_member_ordinal:
                continue
            if max_members is not None and processed_members >= max_members:
                break
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            xml_bytes = extracted.read()
            processed_members += 1
            for doc_id in extract_all_bioc_document_ids_fast(xml_bytes):
                yield doc_id, member.name, member_ordinal
