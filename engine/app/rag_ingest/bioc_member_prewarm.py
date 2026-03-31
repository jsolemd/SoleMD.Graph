"""Bounded BioC archive-member cache prewarm for hot later-window reports."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.config import settings
from app.rag_ingest.bioc_archive_ingest import (
    ArchiveMemberFetcher,
    ArchiveTargetDiscoverer,
    ExistingDocumentLoader,
)
from app.rag_ingest.bioc_archive_manifest import SidecarBioCArchiveManifestRepository
from app.rag_ingest.bioc_member_fetch import RagBioCArchiveMemberRequest, fetch_bioc_archive_members
from app.rag_ingest.bioc_target_discovery import (
    RagBioCTargetDiscoveryReport,
    discover_bioc_archive_targets,
)
from app.rag_ingest.orchestrator import (
    PostgresExistingDocumentLoader,
    _load_corpus_ids_file,
    _unique_ints,
)
from app.rag.parse_contract import ParseContractModel


class ManifestRepository(Protocol):
    def fetch_skipped_document_ids(
        self,
        *,
        source_revision: str,
        archive_name: str,
        document_ids: list[str],
    ) -> set[str]: ...


class RagBioCMemberPrewarmReport(ParseContractModel):
    archive_name: str
    discovery_report_path: str | None = None
    requested_corpus_ids: list[int] = Field(default_factory=list)
    candidate_corpus_ids: list[int] = Field(default_factory=list)
    selected_corpus_ids: list[int] = Field(default_factory=list)
    skipped_existing_papers: int = 0
    skipped_manifest_document_ids: list[str] = Field(default_factory=list)
    report_enriched: bool = False
    member_fetch: dict[str, object]


def run_bioc_archive_member_prewarm(
    *,
    archive_name: str,
    discovery_report_path: Path | None = None,
    start_document_ordinal: int = 1,
    corpus_ids: list[int] | None = None,
    limit: int | None = None,
    max_documents: int | None = None,
    archive_target_discoverer: ArchiveTargetDiscoverer | None = None,
    existing_loader: ExistingDocumentLoader | None = None,
    manifest_repository: ManifestRepository | None = None,
    archive_member_fetcher: ArchiveMemberFetcher | None = None,
) -> RagBioCMemberPrewarmReport:
    normalized_requested_ids = _unique_ints(corpus_ids)
    active_archive_target_discoverer = archive_target_discoverer or discover_bioc_archive_targets
    active_existing_loader = existing_loader or PostgresExistingDocumentLoader()
    active_manifest_repository = manifest_repository or SidecarBioCArchiveManifestRepository()
    active_archive_member_fetcher = archive_member_fetcher or fetch_bioc_archive_members

    if discovery_report_path is not None:
        loaded_discovery_report = RagBioCTargetDiscoveryReport.model_validate_json(
            discovery_report_path.read_text()
        )
        if loaded_discovery_report.archive_name != archive_name:
            raise ValueError("discovery report archive_name does not match requested archive_name")
        effective_candidates = list(loaded_discovery_report.candidates)
        if limit is not None:
            effective_candidates = effective_candidates[:limit]
        discovery_report = loaded_discovery_report.model_copy(
            update={
                "limit": limit if limit is not None else loaded_discovery_report.limit,
                "candidates": effective_candidates,
                "selected_corpus_ids": sorted(
                    {int(candidate.corpus_id) for candidate in effective_candidates}
                ),
            }
        )
    else:
        discovery_report = active_archive_target_discoverer(
            archive_name=archive_name,
            start_document_ordinal=start_document_ordinal,
            limit=limit,
            max_documents=max_documents,
            skip_existing_documents=True,
            skip_existing_bioc=True,
            allowed_corpus_ids=normalized_requested_ids or None,
        )

    candidate_corpus_ids = _unique_ints(list(discovery_report.selected_corpus_ids))
    skipped_manifest_document_ids = active_manifest_repository.fetch_skipped_document_ids(
        source_revision=settings.pubtator_release_id,
        archive_name=archive_name,
        document_ids=[candidate.document_id for candidate in discovery_report.candidates],
    )
    existing_ids = active_existing_loader.load_existing(corpus_ids=candidate_corpus_ids)
    candidates_to_fetch = [
        candidate
        for candidate in discovery_report.candidates
        if candidate.document_id not in skipped_manifest_document_ids
        and candidate.corpus_id not in existing_ids
    ]
    member_results, fetch_report = active_archive_member_fetcher(
        archive_name=archive_name,
        requests=[
            RagBioCArchiveMemberRequest(
                archive_name=archive_name,
                document_id=candidate.document_id,
                document_ordinal=candidate.document_ordinal,
                member_name=candidate.member_name,
            )
            for candidate in candidates_to_fetch
        ],
        source_revision=settings.pubtator_release_id,
    )
    results_by_document_id = {result.document_id: result for result in member_results}
    report_enriched = False
    for candidate in discovery_report.candidates:
        result = results_by_document_id.get(candidate.document_id)
        if result is None or result.member_name is None or candidate.member_name is not None:
            continue
        candidate.member_name = result.member_name
        report_enriched = True
    if discovery_report_path is not None and report_enriched:
        discovery_report_path.write_text(discovery_report.model_dump_json(indent=2))

    return RagBioCMemberPrewarmReport(
        archive_name=archive_name,
        discovery_report_path=str(discovery_report_path) if discovery_report_path else None,
        requested_corpus_ids=normalized_requested_ids,
        candidate_corpus_ids=candidate_corpus_ids,
        selected_corpus_ids=[int(candidate.corpus_id) for candidate in candidates_to_fetch],
        skipped_existing_papers=len(existing_ids),
        skipped_manifest_document_ids=sorted(skipped_manifest_document_ids),
        report_enriched=report_enriched,
        member_fetch=fetch_report.model_dump(mode="python"),
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prewarm the BioC archive-member cache for a bounded discovery report or archive window."
    )
    parser.add_argument("--archive-name", required=True)
    parser.add_argument("--discovery-report-path", type=Path, default=None)
    parser.add_argument("--start-document-ordinal", type=int, default=1)
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-documents", type=int, default=None)
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = _unique_ints(
        (args.corpus_ids or [])
        + (_load_corpus_ids_file(args.corpus_ids_file) if args.corpus_ids_file else [])
    )
    try:
        report = run_bioc_archive_member_prewarm(
            archive_name=args.archive_name,
            discovery_report_path=args.discovery_report_path,
            start_document_ordinal=args.start_document_ordinal,
            corpus_ids=corpus_ids or None,
            limit=args.limit,
            max_documents=args.max_documents,
        )
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(report.model_dump_json(indent=2))
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
