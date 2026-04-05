"""Archive-driven BioC warehouse ingest with direct locator seeding."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Protocol

from langfuse import observe

logging.getLogger("langfuse").setLevel(logging.ERROR)

from pydantic import Field

from app import db
from app.config import settings
from app.rag.parse_contract import ParseContractModel
from app.rag.source_selection import parsed_source_has_warehouse_value
from app.rag_ingest.bioc_archive_manifest import (
    RagBioCArchiveManifestSkip,
    SidecarBioCArchiveManifestRepository,
)
from app.rag_ingest.bioc_member_fetch import (
    RagBioCArchiveMemberRequest,
    fetch_bioc_archive_members,
)
from app.rag_ingest.bioc_target_discovery import (
    RagBioCTargetCandidate,
    RagBioCTargetDiscoveryReport,
    build_bioc_locator_entries,
    discover_bioc_archive_targets,
)
from app.rag_ingest.chunk_backfill_runtime import run_chunk_backfill
from app.rag_ingest.chunk_seed import RagChunkSeeder
from app.rag_ingest.corpus_ids import (
    resolve_corpus_ids,
)
from app.rag_ingest.corpus_ids import (
    unique_corpus_ids as _unique_ints,
)
from app.rag_ingest.orchestrator import (
    PostgresExistingDocumentLoader,
    run_rag_refresh,
)
from app.rag_ingest.source_locator import SidecarRagSourceLocatorRepository
from app.rag_ingest.ingest_tracing import traced_parse_biocxml
from app.rag_ingest.source_parsers import parse_biocxml_document
from app.rag_ingest.warehouse_quality import inspect_rag_warehouse_quality
from app.rag_ingest.warehouse_writer import RagWarehouseBulkIngestResult, RagWarehouseWriter


class RagBioCArchiveIngestReport(ParseContractModel):
    run_id: str
    parser_version: str
    archive_name: str
    requested_corpus_ids: list[int] = Field(default_factory=list)
    discovery_report_path: str | None = None
    seeded_locator_entries: int = 0
    manifest_skips_marked: int = 0
    skipped_low_value_corpus_ids: list[int] = Field(default_factory=list)
    discovery_report: dict[str, object]
    warehouse_refresh: dict[str, object]
    quality_report: dict[str, object] | None = None


class ArchiveTargetDiscoverer(Protocol):
    def __call__(
        self,
        *,
        archive_name: str,
        start_document_ordinal: int = 1,
        limit: int | None = None,
        max_documents: int | None = None,
        skip_existing_documents: bool = True,
        skip_existing_bioc: bool = True,
        require_existing_documents: bool = False,
        require_existing_s2_source: bool = False,
        allowed_corpus_ids: list[int] | None = None,
    ) -> object: ...


class LocatorRepository(Protocol):
    def upsert_entries(self, entries) -> int: ...


class ManifestRepository(Protocol):
    def mark_skipped(self, entries) -> int: ...

    def fetch_skipped_document_ids(
        self,
        *,
        source_revision: str,
        archive_name: str,
        document_ids: list[str],
    ) -> set[str]: ...


class WarehouseRefreshRunner(Protocol):
    def __call__(self, **kwargs) -> object: ...


class WarehouseQualityInspector(Protocol):
    def __call__(self, *, corpus_ids: list[int]) -> object: ...


class ExistingDocumentLoader(Protocol):
    def load_existing(self, *, corpus_ids: list[int]) -> set[int]: ...


class ArchiveMemberFetcher(Protocol):
    def __call__(self, **kwargs) -> tuple[list[object], object]: ...


class BulkWarehouseWriter(Protocol):
    def ingest_source_groups(
        self,
        source_groups,
        *,
        source_citation_keys_by_corpus=None,
        chunk_version=None,
        replace_existing: bool = False,
    ) -> RagWarehouseBulkIngestResult: ...


class ChunkSeeder(Protocol):
    def seed_default(
        self,
        *,
        source_revision_keys,
        parser_version: str,
        embedding_model: str | None = None,
    ) -> object: ...


class ChunkBackfillRunner(Protocol):
    def __call__(self, **kwargs) -> object: ...


def _source_revision_keys() -> list[str]:
    return [
        f"s2orc_v2:{settings.s2_release_id}",
        f"biocxml:{settings.pubtator_release_id}",
    ]


def _empty_bulk_ingest_result() -> RagWarehouseBulkIngestResult:
    return RagWarehouseBulkIngestResult(
        papers=[],
        batch_total_rows=0,
        written_rows=0,
        deferred_stage_names=[],
    )


@observe(name="ingest.biocArchive")
def _run_direct_bioc_archive_ingest(
    *,
    run_id: str,
    parser_version: str,
    archive_name: str,
    candidates: list[RagBioCTargetCandidate],
    embedding_model: str | None,
    seed_chunk_version: bool,
    backfill_chunks: bool,
    chunk_backfill_batch_size: int,
    checkpoint_root: Path | None,
    reset_run: bool,
    manifest_repository: ManifestRepository,
    existing_loader: ExistingDocumentLoader | None,
    archive_member_fetcher: ArchiveMemberFetcher | None,
    warehouse_writer: BulkWarehouseWriter | None,
    chunk_seeder: ChunkSeeder | None,
    chunk_backfill_runner: ChunkBackfillRunner | None,
) -> dict[str, object]:
    active_existing_loader = existing_loader or PostgresExistingDocumentLoader()
    active_archive_member_fetcher = archive_member_fetcher or fetch_bioc_archive_members
    active_writer = warehouse_writer or RagWarehouseWriter()
    active_chunk_seeder = chunk_seeder or RagChunkSeeder()
    active_chunk_backfill = chunk_backfill_runner or run_chunk_backfill
    active_manifest_repository = manifest_repository

    selected_corpus_ids = _unique_ints([candidate.corpus_id for candidate in candidates])
    skipped_manifest_document_ids = (
        active_manifest_repository.fetch_skipped_document_ids(
            source_revision=settings.pubtator_release_id,
            archive_name=archive_name,
            document_ids=[candidate.document_id for candidate in candidates],
        )
        if hasattr(active_manifest_repository, "fetch_skipped_document_ids")
        else set()
    )
    candidates = [
        candidate
        for candidate in candidates
        if candidate.document_id not in skipped_manifest_document_ids
    ]
    existing_ids = active_existing_loader.load_existing(corpus_ids=selected_corpus_ids)
    candidates_to_fetch = [
        candidate for candidate in candidates if candidate.corpus_id not in existing_ids
    ]
    if not candidates_to_fetch:
        return {
            "run_id": run_id,
            "requested_corpus_ids": selected_corpus_ids,
            "target_corpus_ids": selected_corpus_ids,
            "source_driven": False,
            "mode": "direct_archive_member_ingest",
            "skipped_reason": "all_candidates_already_ingested",
            "skipped_existing_papers": len(existing_ids),
            "skipped_manifest_document_ids": sorted(skipped_manifest_document_ids),
            "bioc_fallback_stage": {
                "discovered_papers": 0,
                "ingested_corpus_ids": [],
                "skipped_low_value_papers": 0,
                "skipped_low_value_corpus_ids": [],
                "batch_total_rows": 0,
                "written_rows": 0,
                "deferred_stage_names": [],
            },
        }

    member_results, member_fetch_report = active_archive_member_fetcher(
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
    fetched_by_document_id = {result.document_id: result for result in member_results}

    source_groups = []
    ingested_corpus_ids: list[int] = []
    skipped_low_value_corpus_ids: list[int] = []
    for candidate in candidates_to_fetch:
        member_result = fetched_by_document_id.get(candidate.document_id)
        if member_result is None:
            continue
        if candidate.member_name is None and member_result.member_name is not None:
            candidate.member_name = member_result.member_name
        parsed = traced_parse_biocxml(
            member_result.xml_text,
            source_revision=settings.pubtator_release_id,
            parser_version=parser_version,
            corpus_id=candidate.corpus_id,
        )
        if not parsed_source_has_warehouse_value(parsed):
            skipped_low_value_corpus_ids.append(candidate.corpus_id)
            continue
        source_groups.append([parsed])
        ingested_corpus_ids.append(candidate.corpus_id)

    ingest_result = (
        active_writer.ingest_source_groups(source_groups)
        if source_groups
        else _empty_bulk_ingest_result()
    )

    chunk_seed_dump: dict[str, object] | None = None
    if seed_chunk_version:
        chunk_seed_dump = active_chunk_seeder.seed_default(
            source_revision_keys=_source_revision_keys(),
            parser_version=parser_version,
            embedding_model=embedding_model,
        ).model_dump(mode="python")

    chunk_backfill_dump: dict[str, object] | None = None
    if backfill_chunks and ingested_corpus_ids:
        chunk_backfill_dump = active_chunk_backfill(
            corpus_ids=ingested_corpus_ids,
            source_revision_keys=_source_revision_keys(),
            parser_version=parser_version,
            embedding_model=embedding_model,
            batch_size=chunk_backfill_batch_size,
            run_id=f"{run_id}-chunk-backfill",
            reset_run=reset_run,
            checkpoint_root=checkpoint_root,
        ).model_dump(mode="python")

    return {
        "run_id": run_id,
        "requested_corpus_ids": selected_corpus_ids,
        "target_corpus_ids": selected_corpus_ids,
        "source_driven": False,
        "mode": "direct_archive_member_ingest",
        "skipped_existing_papers": len(existing_ids),
        "skipped_manifest_document_ids": sorted(skipped_manifest_document_ids),
        "member_fetch": member_fetch_report.model_dump(mode="python"),
        "bioc_fallback_stage": {
            "discovered_papers": len(member_results),
            "ingested_corpus_ids": _unique_ints(ingested_corpus_ids),
            "skipped_low_value_papers": len(skipped_low_value_corpus_ids),
            "skipped_low_value_corpus_ids": _unique_ints(skipped_low_value_corpus_ids),
            "missing_document_ids": list(member_fetch_report.missing_document_ids),
            "batch_total_rows": int(ingest_result.batch_total_rows),
            "written_rows": int(ingest_result.written_rows),
            "deferred_stage_names": list(ingest_result.deferred_stage_names),
        },
        "chunk_seed": chunk_seed_dump,
        "chunk_backfill": chunk_backfill_dump,
    }


def run_bioc_archive_ingest(
    *,
    run_id: str,
    parser_version: str,
    archive_name: str,
    discovery_report_path: Path | None = None,
    start_document_ordinal: int = 1,
    corpus_ids: list[int] | None = None,
    limit: int | None = None,
    max_documents: int | None = None,
    batch_size: int = 100,
    stage_row_budget: int | None = None,
    stage_byte_budget: int | None = None,
    max_bioc_archives: int | None = None,
    seed_chunk_version: bool = False,
    backfill_chunks: bool = False,
    chunk_backfill_batch_size: int = 250,
    embedding_model: str | None = None,
    inspect_quality: bool = False,
    use_direct_archive_ingest: bool = True,
    checkpoint_root: Path | None = None,
    reset_run: bool = False,
    archive_target_discoverer: ArchiveTargetDiscoverer | None = None,
    locator_repository: LocatorRepository | None = None,
    manifest_repository: ManifestRepository | None = None,
    refresh_runner: WarehouseRefreshRunner | None = None,
    quality_inspector: WarehouseQualityInspector | None = None,
    existing_loader: ExistingDocumentLoader | None = None,
    archive_member_fetcher: ArchiveMemberFetcher | None = None,
    warehouse_writer: BulkWarehouseWriter | None = None,
    chunk_seeder: ChunkSeeder | None = None,
    chunk_backfill_runner: ChunkBackfillRunner | None = None,
) -> RagBioCArchiveIngestReport:
    normalized_requested_ids = _unique_ints(corpus_ids)
    active_archive_target_discoverer = archive_target_discoverer or discover_bioc_archive_targets
    active_locator_repository = locator_repository or SidecarRagSourceLocatorRepository()
    active_manifest_repository = manifest_repository or SidecarBioCArchiveManifestRepository()
    active_refresh_runner = refresh_runner or run_rag_refresh
    active_quality_inspector = quality_inspector or inspect_rag_warehouse_quality

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
    selected_corpus_ids = _unique_ints(list(discovery_report.selected_corpus_ids))
    seeded_locator_entries = active_locator_repository.upsert_entries(
        build_bioc_locator_entries(candidates=list(discovery_report.candidates))
    )
    if selected_corpus_ids and use_direct_archive_ingest and refresh_runner is None:
        warehouse_refresh_dump = _run_direct_bioc_archive_ingest(
            run_id=run_id,
            parser_version=parser_version,
            archive_name=archive_name,
            candidates=list(discovery_report.candidates),
            embedding_model=embedding_model,
            seed_chunk_version=seed_chunk_version,
            backfill_chunks=backfill_chunks,
            chunk_backfill_batch_size=chunk_backfill_batch_size,
            checkpoint_root=checkpoint_root,
            reset_run=reset_run,
            manifest_repository=active_manifest_repository,
            existing_loader=existing_loader,
            archive_member_fetcher=archive_member_fetcher,
            warehouse_writer=warehouse_writer,
            chunk_seeder=chunk_seeder,
            chunk_backfill_runner=chunk_backfill_runner,
        )
    elif selected_corpus_ids:
        refresh_result = active_refresh_runner(
            parser_version=parser_version,
            run_id=run_id,
            corpus_ids=selected_corpus_ids,
            batch_size=batch_size,
            stage_row_budget=stage_row_budget,
            stage_byte_budget=stage_byte_budget,
            max_bioc_archives=max_bioc_archives,
            skip_s2_primary=True,
            seed_chunk_version=seed_chunk_version,
            backfill_chunks=backfill_chunks,
            chunk_backfill_batch_size=chunk_backfill_batch_size,
            embedding_model=embedding_model,
            reset_run=reset_run,
            checkpoint_root=checkpoint_root,
        )
        warehouse_refresh_dump = refresh_result.model_dump(mode="python")
    else:
        warehouse_refresh_dump = {
            "run_id": run_id,
            "requested_corpus_ids": [],
            "target_corpus_ids": [],
            "source_driven": False,
            "skipped_reason": "no_discovered_candidates",
        }
    bioc_stage = warehouse_refresh_dump.get("bioc_fallback_stage", {})
    skipped_low_value_corpus_ids = _unique_ints(
        list(bioc_stage.get("skipped_low_value_corpus_ids", []))
    )
    manifest_skips_marked = active_manifest_repository.mark_skipped(
        [
            RagBioCArchiveManifestSkip(
                source_revision=settings.pubtator_release_id,
                archive_name=candidate.archive_name,
                document_ordinal=candidate.document_ordinal,
                document_id=candidate.document_id,
                skip_reason="low_value_shell_document",
            )
            for candidate in discovery_report.candidates
            if candidate.corpus_id in skipped_low_value_corpus_ids
        ]
    )
    if discovery_report_path is not None and use_direct_archive_ingest and refresh_runner is None:
        discovery_report_path.write_text(discovery_report.model_dump_json(indent=2))
    quality_corpus_ids = _unique_ints(list(bioc_stage.get("ingested_corpus_ids", [])))
    quality_report = (
        active_quality_inspector(corpus_ids=quality_corpus_ids).model_dump(mode="python")
        if inspect_quality and quality_corpus_ids
        else None
    )
    return RagBioCArchiveIngestReport(
        run_id=run_id,
        parser_version=parser_version,
        archive_name=archive_name,
        requested_corpus_ids=normalized_requested_ids,
        discovery_report_path=str(discovery_report_path) if discovery_report_path else None,
        seeded_locator_entries=seeded_locator_entries,
        manifest_skips_marked=manifest_skips_marked,
        skipped_low_value_corpus_ids=skipped_low_value_corpus_ids,
        discovery_report=discovery_report.model_dump(mode="python"),
        warehouse_refresh=warehouse_refresh_dump,
        quality_report=quality_report,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover bounded BioC archive targets, seed locators, "
            "and ingest them in one run."
        )
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--archive-name", required=True)
    parser.add_argument("--discovery-report-path", type=Path, default=None)
    parser.add_argument("--start-document-ordinal", type=int, default=1)
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-documents", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--stage-row-budget", type=int, default=None)
    parser.add_argument("--stage-byte-budget", type=int, default=None)
    parser.add_argument("--max-bioc-archives", type=int, default=None)
    parser.add_argument("--seed-chunk-version", action="store_true")
    parser.add_argument("--backfill-chunks", action="store_true")
    parser.add_argument("--chunk-backfill-batch-size", type=int, default=250)
    parser.add_argument("--embedding-model", default=None)
    parser.add_argument("--inspect-quality", action="store_true")
    parser.add_argument("--disable-direct-archive-ingest", action="store_true")
    parser.add_argument("--reset-run", action="store_true")
    parser.add_argument("--checkpoint-root", type=Path, default=None)
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = resolve_corpus_ids(
        corpus_ids=args.corpus_ids,
        corpus_ids_file=args.corpus_ids_file,
    )
    try:
        report = run_bioc_archive_ingest(
            run_id=args.run_id,
            parser_version=args.parser_version,
            archive_name=args.archive_name,
            discovery_report_path=args.discovery_report_path,
            start_document_ordinal=args.start_document_ordinal,
            corpus_ids=corpus_ids or None,
            limit=args.limit,
            max_documents=args.max_documents,
            batch_size=args.batch_size,
            stage_row_budget=args.stage_row_budget,
            stage_byte_budget=args.stage_byte_budget,
            max_bioc_archives=args.max_bioc_archives,
            seed_chunk_version=args.seed_chunk_version,
            backfill_chunks=args.backfill_chunks,
            chunk_backfill_batch_size=args.chunk_backfill_batch_size,
            embedding_model=args.embedding_model,
            inspect_quality=args.inspect_quality,
            use_direct_archive_ingest=not args.disable_direct_archive_ingest,
            checkpoint_root=args.checkpoint_root,
            reset_run=args.reset_run,
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
