"""Bounded BioCXML backfill for corpus papers with PMID/PMC/DOI identifiers.

Finds papers in solemd.corpus that have PubMed/PMC/DOI identifiers, locates
them in the BioCXML archive, and runs the targeted warehouse refresh to reparse
canonical document structure from BioCXML.

Default discovery mode only selects papers that do not already have a BioCXML
source row. When explicit corpus ids are provided, those ids are honored even if
they already have BioCXML coverage so stale or partial parses can be refreshed
cleanly.

Works for both:
- Papers with existing S2ORC warehouse coverage (replaces the canonical
  warehouse text spine with the BioCXML parse for that targeted refresh)
- Papers with no warehouse coverage at all (uses BioCXML as the primary source)
- Papers with existing BioCXML rows that need a targeted reparsing refresh

Chunk backfill is optional and runs as a second stage after the canonical
BioCXML write. It is not implied by the warehouse refresh itself.
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.config import settings
from app.rag.parse_contract import ParseContractModel
from app.rag_ingest.bioc_archive_manifest import SidecarBioCArchiveManifestRepository
from app.rag_ingest.bioc_target_discovery import (
    RagBioCTargetCandidate,
    build_bioc_locator_entries,
    discover_bioc_archive_targets,
)
from app.rag_ingest.corpus_ids import (
    resolve_corpus_ids,
)
from app.rag_ingest.corpus_ids import (
    unique_corpus_ids as _unique_ints,
)
from app.rag_ingest.orchestrator import (
    run_rag_refresh,
)
from app.rag_ingest.source_locator import SidecarRagSourceLocatorRepository
from app.rag_ingest.source_locator_refresh import refresh_rag_source_locator

logger = logging.getLogger(__name__)

_BIOC_BACKFILL_CANDIDATE_SQL = """
SELECT c.corpus_id
FROM solemd.corpus AS c
LEFT JOIN solemd.paper_document_sources AS bioc
  ON bioc.corpus_id = c.corpus_id
 AND bioc.source_system = 'biocxml'
WHERE bioc.corpus_id IS NULL
  AND (%s::BIGINT[] IS NULL OR c.corpus_id = ANY(%s))
  AND (c.pmid IS NOT NULL OR c.pmc_id IS NOT NULL OR c.doi IS NOT NULL)
ORDER BY c.corpus_id
LIMIT %s
"""

_BIOC_EXPLICIT_CANDIDATE_SQL = """
SELECT c.corpus_id
FROM solemd.corpus AS c
WHERE (%s::BIGINT[] IS NULL OR c.corpus_id = ANY(%s))
  AND (c.pmid IS NOT NULL OR c.pmc_id IS NOT NULL OR c.doi IS NOT NULL)
ORDER BY c.corpus_id
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
        sql = (
            _BIOC_EXPLICIT_CANDIDATE_SQL
            if normalized_ids
            else _BIOC_BACKFILL_CANDIDATE_SQL
        )
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                sql,
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


def _order_candidate_corpus_ids(
    *,
    corpus_ids: list[int],
    candidate_map: dict[int, RagBioCTargetCandidate],
) -> list[int]:
    """Sort candidates by archive locality to minimize redundant archive scans."""

    def _sort_key(corpus_id: int) -> tuple[int, str, int, int]:
        candidate = candidate_map.get(corpus_id)
        if candidate is None:
            return (1, "", 0, corpus_id)
        return (
            0,
            candidate.archive_name,
            int(candidate.document_ordinal),
            corpus_id,
        )

    return sorted(corpus_ids, key=_sort_key)


def _chunk_candidate_corpus_ids(
    *,
    corpus_ids: list[int],
    candidate_map: dict[int, RagBioCTargetCandidate],
    batch_size: int,
) -> list[list[int]]:
    """Batch candidates by archive locality before falling back to unresolved ids.

    Manifest-seeded candidates are grouped by archive and document ordinal so each
    batch tends to walk one archive contiguously. Unresolved ids, if any, are
    appended in plain fixed-size batches at the end.
    """

    ordered = _order_candidate_corpus_ids(corpus_ids=corpus_ids, candidate_map=candidate_map)
    seeded_batches: list[list[int]] = []
    unresolved: list[int] = []
    current_archive: str | None = None
    current_batch: list[int] = []

    def _flush_current() -> None:
        nonlocal current_batch, current_archive
        if current_batch:
            seeded_batches.append(current_batch)
        current_batch = []
        current_archive = None

    for corpus_id in ordered:
        candidate = candidate_map.get(corpus_id)
        if candidate is None:
            _flush_current()
            unresolved.append(corpus_id)
            continue
        archive_name = candidate.archive_name
        if (
            current_batch
            and (archive_name != current_archive or len(current_batch) >= batch_size)
        ):
            _flush_current()
        current_archive = archive_name
        current_batch.append(corpus_id)
        if len(current_batch) >= batch_size:
            _flush_current()

    _flush_current()
    return seeded_batches + _chunked(unresolved, batch_size)


def _resolve_candidates_from_manifest(
    *,
    corpus_ids: list[int],
    connect=None,
) -> dict[int, RagBioCTargetCandidate]:
    """Resolve corpus_ids → PMIDs → manifest entries without scanning archives.

    Uses the SQLite archive manifest index for O(n) lookup instead of the
    O(all_archives) full-scan locator refresh.
    """

    if not corpus_ids:
        return {}
    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT corpus_id, pmid, pmc_id, doi
            FROM solemd.corpus
            WHERE corpus_id = ANY(%s::BIGINT[])
              AND (pmid IS NOT NULL OR pmc_id IS NOT NULL OR doi IS NOT NULL)
            """,
            (corpus_ids,),
        )
        rows = cur.fetchall()

    pmid_to_corpus: dict[str, int] = {}
    for row in rows:
        if row["pmid"] is not None:
            pmid_to_corpus[str(int(row["pmid"]))] = int(row["corpus_id"])

    if not pmid_to_corpus:
        return {}

    manifest_repo = SidecarBioCArchiveManifestRepository()
    manifest_entries = manifest_repo.resolve_by_document_ids(
        source_revision=settings.pubtator_release_id,
        document_ids=list(pmid_to_corpus.keys()),
    )

    candidates: dict[int, RagBioCTargetCandidate] = {}
    for entry in manifest_entries:
        corpus_id = pmid_to_corpus.get(entry.document_id)
        if corpus_id is None:
            continue
        candidates[corpus_id] = RagBioCTargetCandidate(
            corpus_id=corpus_id,
            document_id=entry.document_id,
            archive_name=entry.archive_name,
            document_ordinal=entry.document_ordinal,
            member_name=entry.member_name,
        )
    return candidates


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
    seed_chunk_version: bool = False,
    backfill_chunks: bool = False,
    chunk_backfill_batch_size: int = 250,
    embedding_model: str | None = None,
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
            require_existing_documents=False,
            require_existing_s2_source=False,
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
        discovery_candidate_map = _resolve_candidates_from_manifest(
            corpus_ids=candidate_corpus_ids,
        )
    candidate_corpus_ids = _order_candidate_corpus_ids(
        corpus_ids=candidate_corpus_ids,
        candidate_map=discovery_candidate_map,
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

    batch_groups = _chunk_candidate_corpus_ids(
        corpus_ids=candidate_corpus_ids,
        candidate_map=discovery_candidate_map,
        batch_size=candidate_batch_size,
    )
    logger.info(
        "BioC overlay backfill %s: %d candidate corpus ids across %d batches",
        run_id,
        len(candidate_corpus_ids),
        len(batch_groups),
    )
    for batch_index, batch_ids in enumerate(batch_groups, start=1):
        logger.info(
            "BioC overlay backfill %s: batch %d/%d requested=%d",
            run_id,
            batch_index,
            len(batch_groups),
            len(batch_ids),
        )
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
            located_corpus_ids = _unique_ints(
                [candidate.corpus_id for candidate in seeded_candidates]
            )
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
            logger.info(
                "BioC overlay backfill %s: batch %d/%d located=%d, refreshing",
                run_id,
                batch_index,
                len(batch_groups),
                len(located_corpus_ids),
            )
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
                seed_chunk_version=seed_chunk_version,
                backfill_chunks=backfill_chunks,
                chunk_backfill_batch_size=chunk_backfill_batch_size,
                embedding_model=embedding_model,
                reset_run=reset_run,
                checkpoint_root=checkpoint_root,
            )
            warehouse_dump = refresh_result.model_dump(mode="python")
            refreshed_corpus_ids = _unique_ints(
                list(warehouse_dump.get("bioc_fallback_stage", {}).get("ingested_corpus_ids", []))
            )
            logger.info(
                "BioC overlay backfill %s: batch %d/%d refreshed=%d",
                run_id,
                batch_index,
                len(batch_groups),
                len(refreshed_corpus_ids),
            )
        else:
            logger.info(
                "BioC overlay backfill %s: batch %d/%d had no located corpus ids",
                run_id,
                batch_index,
                len(batch_groups),
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
        report.located_corpus_ids = _unique_ints(
            report.located_corpus_ids + located_corpus_ids
        )
        report.refreshed_corpus_ids = _unique_ints(
            report.refreshed_corpus_ids + refreshed_corpus_ids
        )

    return report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill BioCXML warehouse coverage for corpus papers with "
            "PMID/PMC/DOI identifiers."
        )
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
    parser.add_argument("--seed-chunk-version", action="store_true")
    parser.add_argument("--backfill-chunks", action="store_true")
    parser.add_argument("--chunk-backfill-batch-size", type=int, default=250)
    parser.add_argument("--embedding-model", default=None)
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
            seed_chunk_version=args.seed_chunk_version,
            backfill_chunks=args.backfill_chunks,
            chunk_backfill_batch_size=args.chunk_backfill_batch_size,
            embedding_model=args.embedding_model,
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
