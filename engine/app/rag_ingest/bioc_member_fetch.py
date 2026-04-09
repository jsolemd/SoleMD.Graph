"""Targeted BioC archive-member fetch with release-sidecar caching."""

from __future__ import annotations

import tarfile
from pathlib import Path, PurePosixPath
from typing import Protocol

from pydantic import Field

from app.config import settings
from app.rag.parse_contract import ParseContractModel
from app.rag_ingest.source_parsers import split_biocxml_collection


class RagBioCArchiveMemberRequest(ParseContractModel):
    archive_name: str
    document_id: str
    document_ordinal: int
    member_name: str | None = None


class RagBioCArchiveMemberResult(ParseContractModel):
    archive_name: str
    document_id: str
    document_ordinal: int
    member_name: str | None = None
    xml_text: str
    cache_hit: bool = False


class RagBioCArchiveMemberFetchReport(ParseContractModel):
    archive_name: str
    requested_members: int
    fetched_members: int
    cache_hits: int = 0
    archive_reads: int = 0
    missing_document_ids: list[str] = Field(default_factory=list)


class BioCMemberCacheRepository(Protocol):
    def read_member(
        self,
        *,
        source_revision: str,
        archive_name: str,
        member_name: str,
    ) -> str | None: ...

    def write_member(
        self,
        *,
        source_revision: str,
        archive_name: str,
        member_name: str,
        xml_text: str,
    ) -> None: ...


def _member_cache_root_path(*, source_revision: str) -> Path:
    return settings.pubtator_release_path(source_revision) / "cache" / "biocxml-members"


def _safe_member_relative_path(member_name: str) -> Path:
    pure_path = PurePosixPath(member_name)
    if pure_path.is_absolute():
        raise ValueError("member_name must be relative")
    if any(part in {"..", ""} for part in pure_path.parts):
        raise ValueError("member_name contains invalid path segments")
    return Path(*pure_path.parts)


class SidecarBioCMemberCacheRepository:
    """Release-sidecar cache for raw BioC archive member payloads."""

    def read_member(
        self,
        *,
        source_revision: str,
        archive_name: str,
        member_name: str,
    ) -> str | None:
        cache_path = self._member_cache_path(
            source_revision=source_revision,
            archive_name=archive_name,
            member_name=member_name,
        )
        if not cache_path.exists():
            return None
        return cache_path.read_text()

    def write_member(
        self,
        *,
        source_revision: str,
        archive_name: str,
        member_name: str,
        xml_text: str,
    ) -> None:
        cache_path = self._member_cache_path(
            source_revision=source_revision,
            archive_name=archive_name,
            member_name=member_name,
        )
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(xml_text)

    def _member_cache_path(
        self,
        *,
        source_revision: str,
        archive_name: str,
        member_name: str,
    ) -> Path:
        return (
            _member_cache_root_path(source_revision=source_revision)
            / archive_name
            / _safe_member_relative_path(member_name)
        )


def fetch_bioc_archive_members(
    *,
    archive_name: str,
    requests: list[RagBioCArchiveMemberRequest],
    source_revision: str | None = None,
    cache_repository: BioCMemberCacheRepository | None = None,
) -> tuple[list[RagBioCArchiveMemberResult], RagBioCArchiveMemberFetchReport]:
    normalized_requests = list(requests)
    revision = source_revision or settings.pubtator_release_id
    active_cache = cache_repository or SidecarBioCMemberCacheRepository()
    if not normalized_requests:
        return [], RagBioCArchiveMemberFetchReport(
            archive_name=archive_name,
            requested_members=0,
            fetched_members=0,
        )

    results_by_document: dict[str, RagBioCArchiveMemberResult] = {}
    pending_by_document: dict[str, RagBioCArchiveMemberRequest] = {
        request.document_id: request for request in normalized_requests
    }
    pending_by_ordinal: dict[int, RagBioCArchiveMemberRequest] = {
        int(request.document_ordinal): request for request in normalized_requests
    }
    pending_member_names = sorted(
        {
            str(request.member_name)
            for request in normalized_requests
            if request.member_name
        }
    )

    def _consume_member_payload(
        *,
        member_name: str,
        xml_text: str,
        cache_hit: bool,
        starting_document_ordinal: int | None = None,
    ) -> int:
        current_document_ordinal = starting_document_ordinal or 0
        for document in split_biocxml_collection(xml_text):
            if starting_document_ordinal is not None:
                current_document_ordinal += 1
            request = pending_by_document.get(document.document_id)
            if request is None and starting_document_ordinal is not None:
                request = pending_by_ordinal.get(current_document_ordinal)
            if request is None:
                continue
            results_by_document[request.document_id] = RagBioCArchiveMemberResult(
                archive_name=archive_name,
                document_id=request.document_id,
                document_ordinal=(
                    current_document_ordinal
                    if starting_document_ordinal is not None
                    else int(request.document_ordinal)
                ),
                member_name=member_name,
                xml_text=document.xml_text,
                cache_hit=cache_hit,
            )
            pending_by_document.pop(request.document_id, None)
            pending_by_ordinal.pop(int(request.document_ordinal), None)
        return current_document_ordinal

    for member_name in pending_member_names:
        if not pending_by_document:
            break
        cached = active_cache.read_member(
            source_revision=revision,
            archive_name=archive_name,
            member_name=member_name,
        )
        if cached is None:
            continue
        _consume_member_payload(
            member_name=member_name,
            xml_text=cached,
            cache_hit=True,
        )

    pending_member_names = sorted(
        {
            str(request.member_name)
            for request in pending_by_document.values()
            if request.member_name
        }
    )
    archive_reads = 0
    current_document_ordinal = 0
    needs_ordinal_scan = any(
        request.member_name is None for request in pending_by_document.values()
    )
    if pending_by_document:
        archive_path = settings.pubtator_biocxml_dir_path / archive_name
        with tarfile.open(archive_path, "r|gz") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                if (
                    not needs_ordinal_scan
                    and member.name not in pending_member_names
                ):
                    continue
                extracted = archive.extractfile(member)
                if extracted is None:
                    continue
                xml_text = extracted.read().decode("utf-8", errors="replace")
                archive_reads += 1
                active_cache.write_member(
                    source_revision=revision,
                    archive_name=archive_name,
                    member_name=member.name,
                    xml_text=xml_text,
                )
                current_document_ordinal = _consume_member_payload(
                    member_name=member.name,
                    xml_text=xml_text,
                    cache_hit=False,
                    starting_document_ordinal=current_document_ordinal,
                )
                if not pending_by_document:
                    break

    ordered_results = [
        results_by_document[request.document_id]
        for request in normalized_requests
        if request.document_id in results_by_document
    ]
    report = RagBioCArchiveMemberFetchReport(
        archive_name=archive_name,
        requested_members=len(normalized_requests),
        fetched_members=len(ordered_results),
        cache_hits=sum(1 for result in ordered_results if result.cache_hit),
        archive_reads=archive_reads,
        missing_document_ids=[
            request.document_id
            for request in normalized_requests
            if request.document_id not in results_by_document
        ],
    )
    return ordered_results, report
