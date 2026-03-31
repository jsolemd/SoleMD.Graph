"""Bounded backfill of BioC overlays over existing S2-backed warehouse papers."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.rag_ingest.bioc_target_discovery import (
    RagBioCTargetCandidate,
    build_bioc_locator_entries,
    discover_bioc_archive_targets,
)
from app.rag_ingest.orchestrator import (
    _load_corpus_ids_file,
    _unique_ints,
    run_rag_refresh,
)
from app.rag.parse_contract import ParseContractModel
from app.rag_ingest.source_locator import SidecarRagSourceLocatorRepository
from app.rag_ingest.source_locator_refresh import refresh_rag_source_locator


_BIOC_OVERLAY_CANDIDATE_SQL = """
SELECT d.corpus_id
FROM solemd.paper_documents AS d
JOIN solemd.paper_document_sources AS s2
  ON s2.corpus_id = d.corpus_id
 AND s2.source_system = 's2orc_v2'
JOIN solemd.corpus AS c
  ON c.corpus_id = d.corpus_id
LEFT JOIN solemd.paper_document_sources AS bioc
  ON bioc.corpus_id = d.corpus_id
 AND bioc.source_system = 'biocxml'
WHERE bioc.corpus_id IS NULL
  AND (%s::BIGINT[] IS NULL OR d.corpus_id = ANY(%s))
  AND (c.pmid IS NOT NULL OR c.pmc_id IS NOT NULL OR c.doi IS NOT NULL)
ORDER BY d.corpus_id
LIMIT %s
"""


class RagBioCOverlayBatchReport(ParseContractModel):
    batch_index: int
    requested_corpus_ids: list[int] = Field(default_factory=list)
    located_corpus_ids: list[int] = Field(default_factory=list)
    refreshed_corpus_ids: list[int] = Field(default_factory=list)
    locator_refresh: dict[str, object] | None = None
    warehouse_refresh: dict[str, object] | None = None


class RagBioCOverlayBackfillReport(ParseContractModel):
    run_id: str
    parser_version: str
    archive_name: str | None = None
    requested_corpus_ids: list[int] = Field(default_factory=list)
    candidate_corpus_ids: list[int] = Field(default_factory=list)
    candidate_batch_size: int
    refresh_batch_size: int
    max_bioc_archives: int | None = None
    stage_row_budget: int | None = None
    stage_byte_budget: int | None = None
    discovery_report: dict[str, object] | None = None
    located_corpus_ids: list[int] = Field(default_factory=list)
    refreshed_corpus_ids: list[int] = Field(default_factory=list)
    batches: list[RagBioCOverlayBatchReport] = Field(default_factory=list)


class BioCOverlayCandidateLoader(Protocol):
    def load_candidate_corpus_ids(
        self,
        *,
        corpus_ids: list[int] | None,
        limit: int | None,
    ) -> list[int]: ...


class PostgresBioCOverlayCandidateLoader:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load_candidate_corpus_ids(
        self,
        *,
        corpus_ids: list[int] | None,
        limit: int | None,
    ) -> list[int]:
        normalized_ids = _unique_ints(corpus_ids)
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                _BIOC_OVERLAY_CANDIDATE_SQL,
                (
                    normalized_ids or None,
                    normalized_ids or None,
                    limit,
                ),
            )
            return [int(row["corpus_id"]) for row in cur.fetchall()]


class LocatorRefresher(Protocol):
    def __call__(
        self,
        *,
        run_id: str,
        corpus_ids: list[int] | None = None,
        limit: int | None = None,
        max_s2_shards: int | None = None,
        max_bioc_archives: int | None = None,
        skip_s2: bool = False,
        skip_bioc: bool = False,
        reset: bool = False,
        reset_run: bool = False,
        checkpoint_root: Path | None = None,
        repository=None,
    ) -> object: ...


class WarehouseRefreshRunner(Protocol):
    def __call__(self, **kwargs) -> object: ...


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


def _chunked(values: list[int], batch_size: int) -> list[list[int]]:
    return [values[index : index + batch_size] for index in range(0, len(values), batch_size)]


def run_bioc_overlay_backfill(
    *,
    run_id: str,
    parser_version: str,
    corpus_ids: list[int] | None = None,
    archive_name: str | None = None,
    discovery_start_document_ordinal: int = 1,
    limit: int | None = None,
    discovery_max_documents: int | None = None,
    candidate_batch_size: int = 25,
    refresh_batch_size: int = 25,
    max_bioc_archives: int | None = None,
    stage_row_budget: int | None = None,
    stage_byte_budget: int | None = None,
    checkpoint_root: Path | None = None,
    reset_run: bool = False,
    candidate_loader: BioCOverlayCandidateLoader | None = None,
    locator_refresher: LocatorRefresher | None = None,
    refresh_runner: WarehouseRefreshRunner | None = None,
    archive_target_discoverer: ArchiveTargetDiscoverer | None = None,
    locator_repository: LocatorRepository | None = None,
) -> RagBioCOverlayBackfillReport:
    if candidate_batch_size <= 0:
        raise ValueError("candidate_batch_size must be positive")
    if refresh_batch_size <= 0:
        raise ValueError("refresh_batch_size must be positive")

    normalized_requested_ids = _unique_ints(corpus_ids)
    active_candidate_loader = candidate_loader or PostgresBioCOverlayCandidateLoader()
    active_locator_refresher = locator_refresher or refresh_rag_source_locator
    active_refresh_runner = refresh_runner or run_rag_refresh
    active_archive_target_discoverer = archive_target_discoverer or discover_bioc_archive_targets
    active_locator_repository = locator_repository or SidecarRagSourceLocatorRepository()

    discovery_dump: dict[str, object] | None = None
    discovery_candidate_map: dict[int, RagBioCTargetCandidate] = {}
    if archive_name is not None:
        discovery_report = active_archive_target_discoverer(
            archive_name=archive_name,
            start_document_ordinal=discovery_start_document_ordinal,
            limit=limit,
            max_documents=discovery_max_documents,
            require_existing_documents=True,
            require_existing_s2_source=True,
            skip_existing_bioc=True,
            allowed_corpus_ids=normalized_requested_ids or None,
        )
        candidate_corpus_ids = discovery_report.selected_corpus_ids
        discovery_dump = discovery_report.model_dump(mode="python")
        discovery_candidate_map = {
            int(candidate.corpus_id): candidate for candidate in discovery_report.candidates
        }
    else:
        candidate_corpus_ids = active_candidate_loader.load_candidate_corpus_ids(
            corpus_ids=normalized_requested_ids or None,
            limit=limit,
        )
    report = RagBioCOverlayBackfillReport(
        run_id=run_id,
        parser_version=parser_version,
        archive_name=archive_name,
        requested_corpus_ids=normalized_requested_ids,
        candidate_corpus_ids=candidate_corpus_ids,
        candidate_batch_size=candidate_batch_size,
        refresh_batch_size=refresh_batch_size,
        max_bioc_archives=max_bioc_archives,
        stage_row_budget=stage_row_budget,
        stage_byte_budget=stage_byte_budget,
        discovery_report=discovery_dump,
    )

    for batch_index, batch_ids in enumerate(_chunked(candidate_corpus_ids, candidate_batch_size), start=1):
        seeded_candidates = [
            discovery_candidate_map[corpus_id]
            for corpus_id in batch_ids
            if corpus_id in discovery_candidate_map
        ]
        locator_dump: dict[str, object]
        if len(seeded_candidates) == len(batch_ids) and seeded_candidates:
            written_entries = active_locator_repository.upsert_entries(
                build_bioc_locator_entries(candidates=seeded_candidates)
            )
            located_corpus_ids = _unique_ints([candidate.corpus_id for candidate in seeded_candidates])
            locator_dump = {
                "seeded_from_discovery": True,
                "bioc_stage": {
                    "located_corpus_ids": located_corpus_ids,
                    "written_entries": written_entries,
                    "scanned_documents": 0,
                    "scanned_units": [],
                },
            }
        else:
            locator_result = active_locator_refresher(
                run_id=f"{run_id}-locator-{batch_index:04d}",
                corpus_ids=batch_ids,
                max_bioc_archives=max_bioc_archives,
                skip_s2=True,
                reset_run=reset_run,
                checkpoint_root=checkpoint_root,
            )
            locator_dump = locator_result.model_dump(mode="python")
            located_corpus_ids = _unique_ints(
                list(locator_dump.get("bioc_stage", {}).get("located_corpus_ids", []))
            )

        refreshed_corpus_ids: list[int] = []
        warehouse_dump: dict[str, object] | None = None
        if located_corpus_ids:
            refresh_result = active_refresh_runner(
                parser_version=parser_version,
                run_id=f"{run_id}-refresh-{batch_index:04d}",
                corpus_ids=located_corpus_ids,
                batch_size=refresh_batch_size,
                stage_row_budget=stage_row_budget,
                stage_byte_budget=stage_byte_budget,
                refresh_existing=True,
                max_bioc_archives=max_bioc_archives,
                skip_s2_primary=True,
                reset_run=reset_run,
                checkpoint_root=checkpoint_root,
            )
            warehouse_dump = refresh_result.model_dump(mode="python")
            refreshed_corpus_ids = _unique_ints(
                list(warehouse_dump.get("bioc_fallback_stage", {}).get("ingested_corpus_ids", []))
            )

        report.batches.append(
            RagBioCOverlayBatchReport(
                batch_index=batch_index,
                requested_corpus_ids=batch_ids,
                located_corpus_ids=located_corpus_ids,
                refreshed_corpus_ids=refreshed_corpus_ids,
                locator_refresh=locator_dump,
                warehouse_refresh=warehouse_dump,
            )
        )
        report.located_corpus_ids = _unique_ints(report.located_corpus_ids + located_corpus_ids)
        report.refreshed_corpus_ids = _unique_ints(report.refreshed_corpus_ids + refreshed_corpus_ids)

    return report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill BioC overlays over existing S2-backed RAG warehouse papers."
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    parser.add_argument("--archive-name", default=None)
    parser.add_argument("--discovery-start-document-ordinal", type=int, default=1)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--discovery-max-documents", type=int, default=None)
    parser.add_argument("--candidate-batch-size", type=int, default=25)
    parser.add_argument("--refresh-batch-size", type=int, default=25)
    parser.add_argument("--max-bioc-archives", type=int, default=None)
    parser.add_argument("--stage-row-budget", type=int, default=None)
    parser.add_argument("--stage-byte-budget", type=int, default=None)
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
        report = run_bioc_overlay_backfill(
            run_id=args.run_id,
            parser_version=args.parser_version,
            corpus_ids=corpus_ids or None,
            archive_name=args.archive_name,
            discovery_start_document_ordinal=args.discovery_start_document_ordinal,
            limit=args.limit,
            discovery_max_documents=args.discovery_max_documents,
            candidate_batch_size=args.candidate_batch_size,
            refresh_batch_size=args.refresh_batch_size,
            max_bioc_archives=args.max_bioc_archives,
            stage_row_budget=args.stage_row_budget,
            stage_byte_budget=args.stage_byte_budget,
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
