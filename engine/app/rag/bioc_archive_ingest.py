"""Archive-driven BioC warehouse ingest with direct locator seeding."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.rag.bioc_target_discovery import (
    build_bioc_locator_entries,
    discover_bioc_archive_targets,
)
from app.rag.orchestrator import _load_corpus_ids_file, _unique_ints, run_rag_refresh
from app.rag.parse_contract import ParseContractModel
from app.rag.source_locator import SidecarRagSourceLocatorRepository


class RagBioCArchiveIngestReport(ParseContractModel):
    run_id: str
    parser_version: str
    archive_name: str
    requested_corpus_ids: list[int] = Field(default_factory=list)
    seeded_locator_entries: int = 0
    discovery_report: dict[str, object]
    warehouse_refresh: dict[str, object]


class ArchiveTargetDiscoverer(Protocol):
    def __call__(
        self,
        *,
        archive_name: str,
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


class WarehouseRefreshRunner(Protocol):
    def __call__(self, **kwargs) -> object: ...


def run_bioc_archive_ingest(
    *,
    run_id: str,
    parser_version: str,
    archive_name: str,
    corpus_ids: list[int] | None = None,
    limit: int | None = None,
    max_documents: int | None = None,
    batch_size: int = 100,
    stage_row_budget: int | None = None,
    stage_byte_budget: int | None = None,
    max_bioc_archives: int | None = None,
    checkpoint_root: Path | None = None,
    reset_run: bool = False,
    archive_target_discoverer: ArchiveTargetDiscoverer | None = None,
    locator_repository: LocatorRepository | None = None,
    refresh_runner: WarehouseRefreshRunner | None = None,
) -> RagBioCArchiveIngestReport:
    normalized_requested_ids = _unique_ints(corpus_ids)
    active_archive_target_discoverer = archive_target_discoverer or discover_bioc_archive_targets
    active_locator_repository = locator_repository or SidecarRagSourceLocatorRepository()
    active_refresh_runner = refresh_runner or run_rag_refresh

    discovery_report = active_archive_target_discoverer(
        archive_name=archive_name,
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
    refresh_result = active_refresh_runner(
        parser_version=parser_version,
        run_id=run_id,
        corpus_ids=selected_corpus_ids or None,
        batch_size=batch_size,
        stage_row_budget=stage_row_budget,
        stage_byte_budget=stage_byte_budget,
        max_bioc_archives=max_bioc_archives,
        skip_s2_primary=True,
        reset_run=reset_run,
        checkpoint_root=checkpoint_root,
    )
    return RagBioCArchiveIngestReport(
        run_id=run_id,
        parser_version=parser_version,
        archive_name=archive_name,
        requested_corpus_ids=normalized_requested_ids,
        seeded_locator_entries=seeded_locator_entries,
        discovery_report=discovery_report.model_dump(mode="python"),
        warehouse_refresh=refresh_result.model_dump(mode="python"),
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover bounded BioC archive targets, seed locators, and ingest them in one run."
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--archive-name", required=True)
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-documents", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--stage-row-budget", type=int, default=None)
    parser.add_argument("--stage-byte-budget", type=int, default=None)
    parser.add_argument("--max-bioc-archives", type=int, default=None)
    parser.add_argument("--reset-run", action="store_true")
    parser.add_argument("--checkpoint-root", type=Path, default=None)
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = _unique_ints(
        (args.corpus_ids or [])
        + (_load_corpus_ids_file(args.corpus_ids_file) if args.corpus_ids_file else [])
    )
    try:
        report = run_bioc_archive_ingest(
            run_id=args.run_id,
            parser_version=args.parser_version,
            archive_name=args.archive_name,
            corpus_ids=corpus_ids or None,
            limit=args.limit,
            max_documents=args.max_documents,
            batch_size=args.batch_size,
            stage_row_budget=args.stage_row_budget,
            stage_byte_budget=args.stage_byte_budget,
            max_bioc_archives=args.max_bioc_archives,
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
