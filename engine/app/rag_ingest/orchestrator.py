"""Rerunnable warehouse refresh orchestrator over current downloaded release data."""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import tarfile
from pathlib import Path
from typing import Protocol
from xml.etree import ElementTree as ET

from langfuse import observe

logging.getLogger("langfuse").setLevel(logging.ERROR)

from pydantic import Field

from app import db
from app.config import settings
from app.rag.corpus_resolution import normalize_bioc_document_id
from app.rag.parse_contract import ParseContractModel, ParseSourceSystem
from app.rag.source_selection import (
    build_grounding_source_plan,
    parsed_source_has_warehouse_value,
)
from app.rag_ingest.chunk_backfill_runtime import run_chunk_backfill
from app.rag_ingest.chunk_seed import RagChunkSeeder
from app.rag_ingest.corpus_ids import (
    load_corpus_ids_file,
    resolve_corpus_ids,
)
from app.rag_ingest.corpus_ids import (
    unique_corpus_ids as _unique_ints,
)
from app.rag_ingest.orchestrator_checkpoint import (
    RagRefreshCheckpointState,
    load_checkpoint_state,
    reset_checkpoint_state,
    save_checkpoint_state,
)
from app.rag_ingest.orchestrator_checkpoint import (
    checkpoint_paths as rag_refresh_checkpoint_paths,
)
from app.rag_ingest.orchestrator_units import (
    PostgresRagRefreshUnitStore,
    RagRefreshRunState,
    RagRefreshSourceKind,
    RagRefreshUnitStore,
    RagRefreshWorker,
)
from app.rag_ingest.source_locator import (
    RagSourceLocatorEntry,
    RagSourceLocatorLookup,
    SidecarRagSourceLocatorRepository,
)
from app.rag_ingest.ingest_tracing import traced_parse_biocxml, traced_parse_s2orc
from app.rag_ingest.source_parsers import (
    ParsedPaperSource,
    extract_biocxml_document_id,
    parse_biocxml_document,
    parse_s2_paper_abstract,
    parse_s2orc_row,
)
from app.rag_ingest.target_corpus import (
    PostgresTargetCorpusLoader,
    RagTargetCorpusRow,
    has_paper_abstract,
)
from app.rag_ingest.warehouse_writer import RagWarehouseBulkIngestResult, RagWarehouseWriter
from app.rag_ingest.write_batch_builder import (
    estimate_write_batch_bytes_from_grounding_plan,
    estimate_write_batch_rows_from_grounding_plan,
)

DEFAULT_STAGE_ROW_BUDGET = 25_000
DEFAULT_UNIT_PROGRESS_INTERVAL_ROWS = 1_000
logger = logging.getLogger(__name__)


class RagSourceStageReport(ParseContractModel):
    stage_name: str
    completed_units: list[str] = Field(default_factory=list)
    discovered_papers: int = 0
    ingested_papers: int = 0
    ingested_corpus_ids: list[int] = Field(default_factory=list)
    skipped_existing_papers: int = 0
    skipped_low_value_papers: int = 0
    skipped_low_value_corpus_ids: list[int] = Field(default_factory=list)
    batch_total_rows: int = 0
    written_rows: int = 0
    estimated_bytes_total: int = 0
    write_batches_executed: int = 0
    max_batch_total_rows: int = 0
    max_batch_estimated_bytes: int = 0
    deferred_stage_names: list[str] = Field(default_factory=list)


class RagRefreshReport(ParseContractModel):
    run_id: str
    parser_version: str
    refresh_existing: bool = False
    source_driven: bool = False
    metadata_abstract_only: bool = False
    worker_count: int = 1
    worker_index: int = 0
    requested_limit: int | None = None
    selected_target_count: int = 0
    stage_row_budget: int | None = None
    stage_byte_budget: int | None = None
    requested_corpus_ids: list[int] = Field(default_factory=list)
    target_corpus_ids: list[int] = Field(default_factory=list)
    s2_stage: RagSourceStageReport
    bioc_fallback_stage: RagSourceStageReport
    source_locator_refresh: dict[str, object] | None = None
    chunk_seed: dict[str, object] | None = None
    chunk_backfill: dict[str, object] | None = None
    quality_report: dict[str, object] | None = None
    checkpoint_dir: str | None = None
    resumed_from_checkpoint: bool = False


class TargetCorpusLoader(Protocol):
    def load(
        self,
        *,
        corpus_ids: list[int] | None,
        limit: int | None,
    ) -> list[RagTargetCorpusRow]: ...


class ExistingDocumentLoader(Protocol):
    def load_existing(self, *, corpus_ids: list[int]) -> set[int]: ...


class S2ShardReader(Protocol):
    def shard_paths(self, *, max_shards: int | None = None) -> list[Path]: ...

    def iter_rows(self, shard_path: Path): ...


class BioCArchiveReader(Protocol):
    def archive_paths(self, *, max_archives: int | None = None) -> list[Path]: ...

    def iter_documents(self, archive_path: Path): ...


class ChunkBackfillCallable(Protocol):
    def __call__(
        self,
        *,
        corpus_ids,
        source_revision_keys,
        parser_version,
        embedding_model=None,
        batch_size=250,
        run_id=None,
        reset_run=False,
        checkpoint_root=None,
    ) -> object: ...


class SourceLocatorRepository(Protocol):
    def upsert_entries(self, entries: list[RagSourceLocatorEntry]) -> int: ...

    def fetch_entries(
        self,
        *,
        corpus_ids: list[int],
        source_system,
        source_revision: str,
    ) -> RagSourceLocatorLookup: ...


class SourceLocatorRefreshCallable(Protocol):
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
        repository: SourceLocatorRepository | None = None,
    ) -> object: ...


class WarehouseQualityCallable(Protocol):
    def __call__(
        self,
        *,
        corpus_ids: list[int],
    ) -> object: ...


def _target_row_by_corpus_id(
    target_rows: list[RagTargetCorpusRow],
) -> dict[int, RagTargetCorpusRow]:
    return {
        int(target_row.corpus_id): target_row
        for target_row in target_rows
    }


def _apply_target_metadata_to_parsed_source(
    *,
    parsed: ParsedPaperSource,
    target_row: RagTargetCorpusRow | None,
) -> ParsedPaperSource:
    if target_row is None:
        return parsed
    metadata_title = (target_row.paper_title or "").strip()
    if not metadata_title:
        return parsed
    current_title = (parsed.document.title or "").strip()
    if current_title == metadata_title:
        return parsed
    if current_title:
        parsed.document.raw_attrs_json.setdefault("source_selected_title", current_title)
    parsed.document.raw_attrs_json["corpus_metadata_title"] = metadata_title
    parsed.document.title = metadata_title
    return parsed


class PostgresExistingDocumentLoader:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load_existing(self, *, corpus_ids: list[int]) -> set[int]:
        if not corpus_ids:
            return set()
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('solemd.paper_documents')")
            row = cur.fetchone()
            if row is None or row["to_regclass"] is None:
                return set()
            cur.execute(
                """
                SELECT corpus_id
                FROM solemd.paper_documents
                WHERE corpus_id = ANY(%s)
                """,
                (corpus_ids,),
            )
            return {int(result["corpus_id"]) for result in cur.fetchall()}


class LocalS2ShardReader:
    def shard_paths(self, *, max_shards: int | None = None) -> list[Path]:
        paths = sorted(settings.semantic_scholar_s2orc_v2_dir_path.glob("s2orc_v2-*.jsonl.gz"))
        return paths[:max_shards] if max_shards is not None else paths

    def iter_rows(self, shard_path: Path):
        with gzip.open(shard_path, "rt") as handle:
            for line in handle:
                yield json.loads(line)


class LocalBioCArchiveReader:
    def archive_paths(self, *, max_archives: int | None = None) -> list[Path]:
        paths = sorted(settings.pubtator_biocxml_dir_path.glob("BioCXML.*.tar.gz"))
        return paths[:max_archives] if max_archives is not None else paths

    def iter_documents(self, archive_path: Path):
        with tarfile.open(archive_path, "r|gz") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                extracted = archive.extractfile(member)
                if extracted is None:
                    continue
                xml_text = extracted.read().decode("utf-8", errors="replace")
                try:
                    document_id = extract_biocxml_document_id(xml_text)
                except ET.ParseError:
                    logger.warning(
                        "Skipping malformed BioC XML member %s from %s",
                        member.name,
                        archive_path.name,
                    )
                    continue
                yield document_id, member.name, xml_text


def _unpack_bioc_document_record(record) -> tuple[str, str | None, str]:
    if not isinstance(record, tuple):
        raise TypeError("BioC archive reader records must be tuples")
    if len(record) == 3:
        document_id, member_name, xml_text = record
        normalized_member_name = (
            str(member_name) if member_name is not None else None
        )
        return str(document_id), normalized_member_name, str(xml_text)
    if len(record) == 2:
        document_id, xml_text = record
        return str(document_id), None, str(xml_text)
    raise ValueError(
        "BioC archive reader records must be (document_id, xml_text) "
        "or (document_id, member_name, xml_text)"
    )


def _source_revision_keys() -> list[str]:
    return [
        f"s2orc_v2:{settings.s2_release_id}",
        f"biocxml:{settings.pubtator_release_id}",
    ]


def _load_corpus_ids_file(path: Path) -> list[int]:
    return load_corpus_ids_file(path)


def _write_report(path: Path, *, report: RagRefreshReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report.model_dump_json(indent=2))


def _build_bioc_resolution_map(rows: list[RagTargetCorpusRow]) -> dict[tuple[str, str], int]:
    mapping: dict[tuple[str, str], int] = {}
    for row in rows:
        if row.pmid is not None:
            mapping[("pmid", str(int(row.pmid)))] = int(row.corpus_id)
        if row.pmc_id:
            kind, value = normalize_bioc_document_id(str(row.pmc_id))
            mapping[(kind.value, value)] = int(row.corpus_id)
        if row.doi:
            kind, value = normalize_bioc_document_id(str(row.doi))
            if value:
                mapping[(kind.value, value)] = int(row.corpus_id)
    return mapping


def _pending_primary_ids(
    *,
    target_corpus_ids: list[int],
    existing_ids: set[int],
    refresh_existing: bool,
) -> set[int]:
    pending_ids = set(target_corpus_ids)
    if not refresh_existing:
        pending_ids -= existing_ids
    return pending_ids


def _metadata_abstract_candidate_ids(
    *,
    target_rows: list[RagTargetCorpusRow],
    pending_primary_ids: set[int],
    skip_s2_primary: bool,
) -> set[int]:
    if skip_s2_primary:
        return set()
    return {
        int(row.corpus_id)
        for row in target_rows
        if int(row.corpus_id) in pending_primary_ids and has_paper_abstract(row)
    }


def _append_skipped_low_value_corpus_id(
    *,
    stage_report: RagSourceStageReport,
    corpus_id: int,
) -> None:
    stage_report.skipped_low_value_papers += 1
    stage_report.skipped_low_value_corpus_ids = sorted(
        set(stage_report.skipped_low_value_corpus_ids).union({corpus_id})
    )


def _bootstrap_s2_metadata_abstract_sources(
    *,
    target_rows: list[RagTargetCorpusRow],
    pending_primary_ids: set[int],
    source_groups_by_corpus: dict[int, list[ParsedPaperSource]],
    s2_ingested_ids: set[int],
    parser_version: str,
    report: RagRefreshReport,
) -> set[int]:
    bootstrapped_ids: set[int] = set()
    for target_row in target_rows:
        corpus_id = int(target_row.corpus_id)
        if corpus_id not in pending_primary_ids or not has_paper_abstract(target_row):
            continue
        parsed = parse_s2_paper_abstract(
            corpus_id=corpus_id,
            title_text=target_row.paper_title,
            abstract_text=target_row.paper_abstract or "",
            source_revision=settings.s2_release_id,
            parser_version=parser_version,
            paper_id=target_row.paper_id,
            text_availability=target_row.text_availability,
        )
        parsed = _apply_target_metadata_to_parsed_source(
            parsed=parsed,
            target_row=target_row,
        )
        if not parsed_source_has_warehouse_value(parsed):
            _append_skipped_low_value_corpus_id(
                stage_report=report.s2_stage,
                corpus_id=corpus_id,
            )
            continue
        source_groups_by_corpus.setdefault(corpus_id, []).append(parsed)
        s2_ingested_ids.add(corpus_id)
        bootstrapped_ids.add(corpus_id)
        report.s2_stage.discovered_papers += 1
    if bootstrapped_ids:
        report.s2_stage.ingested_corpus_ids = sorted(s2_ingested_ids)
    pending_primary_ids -= bootstrapped_ids
    return bootstrapped_ids


def _preload_explicit_metadata_abstracts(
    *,
    parser_version: str,
    run_id: str,
    target_rows: list[RagTargetCorpusRow],
    target_corpus_ids: list[int],
    pending_primary_ids: set[int],
    refresh_existing: bool,
    metadata_abstract_only: bool,
    checkpoint_paths,
    worker: RagRefreshWorker,
    report: RagRefreshReport,
    active_writer: RagWarehouseWriter,
) -> set[int]:
    already_ingested_ids = set(report.s2_stage.ingested_corpus_ids)
    bootstrap_pending_ids = pending_primary_ids - already_ingested_ids
    if not bootstrap_pending_ids:
        return set()

    source_groups_by_corpus: dict[int, list[ParsedPaperSource]] = {}
    s2_ingested_ids = set(report.s2_stage.ingested_corpus_ids)
    bootstrapped_ids = _bootstrap_s2_metadata_abstract_sources(
        target_rows=target_rows,
        pending_primary_ids=bootstrap_pending_ids,
        source_groups_by_corpus=source_groups_by_corpus,
        s2_ingested_ids=s2_ingested_ids,
        parser_version=parser_version,
        report=report,
    )
    if not bootstrapped_ids:
        return set()

    _flush_targeted_group_batches(
        source_groups=[
            source_groups_by_corpus[corpus_id]
            for corpus_id in target_corpus_ids
            if corpus_id in bootstrapped_ids
        ],
        batch_size=max(1, len(bootstrapped_ids)),
        writer=active_writer,
        stage_report=report.s2_stage,
        replace_existing=refresh_existing,
    )
    _save_refresh_checkpoint(
        checkpoint_paths=checkpoint_paths,
        run_id=run_id,
        parser_version=parser_version,
        refresh_existing=refresh_existing,
        source_driven=False,
        metadata_abstract_only=metadata_abstract_only,
        explicit_corpus_ids=target_corpus_ids,
        limit=None,
        batch_size=max(1, len(bootstrapped_ids)),
        stage_row_budget=report.stage_row_budget,
        stage_byte_budget=report.stage_byte_budget,
        worker=worker,
        report=report,
    )
    return bootstrapped_ids


def _model_dump_python(value: object) -> object:
    model_dump = getattr(value, "model_dump", None)
    return model_dump(mode="python") if callable(model_dump) else value


def _run_explicit_source_locator_refresh(
    *,
    run_id: str,
    target_rows: list[RagTargetCorpusRow],
    pending_primary_ids: set[int],
    bootstrapped_metadata_ids: set[int],
    metadata_abstract_only: bool,
    max_s2_shards: int | None,
    skip_s2_primary: bool,
    max_bioc_archives: int | None,
    skip_bioc_fallback: bool,
    reset_source_locators: bool,
    reset_run: bool,
    checkpoint_root: Path | None,
    active_source_locator_refresher: SourceLocatorRefreshCallable,
    repository: SourceLocatorRepository,
) -> dict[str, object] | None:
    target_row_by_corpus_id = _target_row_by_corpus_id(target_rows)
    source_locator_refresh: dict[str, object] = {}
    s2_locator_ids = sorted(
        corpus_id
        for corpus_id in pending_primary_ids
        if corpus_id not in bootstrapped_metadata_ids
    )
    bioc_locator_ids = sorted(
        corpus_id
        for corpus_id in (
            (pending_primary_ids - bootstrapped_metadata_ids)
            if metadata_abstract_only
            else (pending_primary_ids | bootstrapped_metadata_ids)
        )
        if target_row_by_corpus_id[corpus_id].pmid is not None
        or target_row_by_corpus_id[corpus_id].pmc_id
        or target_row_by_corpus_id[corpus_id].doi
    )
    if s2_locator_ids and not skip_s2_primary:
        source_locator_refresh["s2"] = _model_dump_python(
            active_source_locator_refresher(
                run_id=f"{run_id}-source-locator-s2",
                corpus_ids=s2_locator_ids,
                limit=None,
                max_s2_shards=max_s2_shards,
                max_bioc_archives=max_bioc_archives,
                skip_s2=False,
                skip_bioc=True,
                reset=reset_source_locators,
                reset_run=reset_run,
                checkpoint_root=checkpoint_root,
                repository=repository,
            )
        )
    if bioc_locator_ids and not skip_bioc_fallback:
        source_locator_refresh["bioc"] = _model_dump_python(
            active_source_locator_refresher(
                run_id=f"{run_id}-source-locator-bioc",
                corpus_ids=bioc_locator_ids,
                limit=None,
                max_s2_shards=max_s2_shards,
                max_bioc_archives=max_bioc_archives,
                skip_s2=True,
                skip_bioc=False,
                reset=reset_source_locators,
                reset_run=reset_run,
                checkpoint_root=checkpoint_root,
                repository=repository,
            )
        )
    return source_locator_refresh or None


def _restrict_unit_paths_with_locator(
    unit_paths: list[Path],
    *,
    locator_lookup: RagSourceLocatorLookup | None,
) -> list[Path]:
    if locator_lookup is None or not locator_lookup.entries:
        return unit_paths
    allowed_unit_names = set(locator_lookup.unit_names)
    return [path for path in unit_paths if path.name in allowed_unit_names]


def _upsert_locator_entries(
    locator_repository: SourceLocatorRepository | None,
    entries: list[RagSourceLocatorEntry],
) -> None:
    if locator_repository is None or not entries:
        return
    locator_repository.upsert_entries(entries)
    entries.clear()


def _route_targeted_source_groups(
    source_groups: list[list[ParsedPaperSource]],
) -> tuple[list[list[ParsedPaperSource]], list[list[ParsedPaperSource]], set[int]]:
    s2_primary_groups: list[list[ParsedPaperSource]] = []
    bioc_primary_groups: list[list[ParsedPaperSource]] = []
    bioc_overlay_corpus_ids: set[int] = set()
    for group in source_groups:
        plan = build_grounding_source_plan(group)
        if any(
            source.document.source_system == ParseSourceSystem.BIOCXML
            for source in group
        ):
            bioc_overlay_corpus_ids.add(plan.primary_source.document.corpus_id)
        if plan.primary_source.document.source_system == ParseSourceSystem.S2ORC_V2:
            s2_primary_groups.append(group)
        else:
            bioc_primary_groups.append(group)
    return s2_primary_groups, bioc_primary_groups, bioc_overlay_corpus_ids


def _quality_corpus_ids_for_report(report: RagRefreshReport) -> list[int]:
    chunk_backfill_corpus_ids = []
    if isinstance(report.chunk_backfill, dict):
        chunk_backfill_corpus_ids = [
            int(corpus_id)
            for corpus_id in report.chunk_backfill.get("corpus_ids") or []
        ]
    return _unique_ints(
        list(report.s2_stage.ingested_corpus_ids)
        + list(report.bioc_fallback_stage.ingested_corpus_ids)
        + chunk_backfill_corpus_ids
    )


def _flush_source_groups(
    *,
    writer: RagWarehouseWriter,
    source_groups,
    stage_report: RagSourceStageReport,
    replace_existing: bool = False,
    estimated_batch_bytes: int = 0,
) -> None:
    if not source_groups:
        return
    result: RagWarehouseBulkIngestResult = writer.ingest_source_groups(
        source_groups,
        replace_existing=replace_existing,
    )
    stage_report.ingested_papers += len(result.papers)
    stage_report.batch_total_rows += result.batch_total_rows
    stage_report.written_rows += result.written_rows
    stage_report.estimated_bytes_total += estimated_batch_bytes
    stage_report.write_batches_executed += 1
    stage_report.max_batch_total_rows = max(
        stage_report.max_batch_total_rows,
        result.batch_total_rows,
    )
    stage_report.max_batch_estimated_bytes = max(
        stage_report.max_batch_estimated_bytes,
        estimated_batch_bytes,
    )
    stage_report.deferred_stage_names = sorted(
        set(stage_report.deferred_stage_names).union(result.deferred_stage_names)
    )
    source_groups.clear()


def _estimate_source_group_row_count(
    source_group: list[ParsedPaperSource],
) -> int:
    return estimate_write_batch_rows_from_grounding_plan(
        build_grounding_source_plan(source_group)
    )


def _estimate_source_group_byte_count(
    source_group: list[ParsedPaperSource],
) -> int:
    return estimate_write_batch_bytes_from_grounding_plan(
        build_grounding_source_plan(source_group)
    )


def _append_source_group_with_budget(
    *,
    source_group: list[ParsedPaperSource],
    source_groups: list[list[ParsedPaperSource]],
    pending_row_estimate: int,
    stage_row_budget: int | None,
    pending_byte_estimate: int,
    stage_byte_budget: int | None,
    writer: RagWarehouseWriter,
    stage_report: RagSourceStageReport,
    replace_existing: bool,
) -> tuple[int, int]:
    row_estimate = _estimate_source_group_row_count(source_group)
    byte_estimate = _estimate_source_group_byte_count(source_group)
    if (
        source_groups
        and (
            (
                stage_row_budget is not None
                and pending_row_estimate + row_estimate > stage_row_budget
            )
            or (
                stage_byte_budget is not None
                and pending_byte_estimate + byte_estimate > stage_byte_budget
            )
        )
    ):
        _flush_source_groups(
            writer=writer,
            source_groups=source_groups,
            stage_report=stage_report,
            replace_existing=replace_existing,
            estimated_batch_bytes=pending_byte_estimate,
        )
        pending_row_estimate = 0
        pending_byte_estimate = 0
    source_groups.append(source_group)
    return pending_row_estimate + row_estimate, pending_byte_estimate + byte_estimate


def _validate_checkpoint_state(
    *,
    state: RagRefreshCheckpointState,
    parser_version: str,
    refresh_existing: bool,
    source_driven: bool,
    metadata_abstract_only: bool,
    explicit_corpus_ids: list[int],
    limit: int | None,
    batch_size: int,
    stage_row_budget: int | None,
    stage_byte_budget: int | None,
    worker: RagRefreshWorker,
) -> None:
    if state.parser_version != parser_version:
        raise ValueError("checkpoint run parser_version does not match requested parser_version")
    if state.refresh_existing != refresh_existing:
        raise ValueError(
            "checkpoint run refresh_existing does not match requested refresh_existing"
        )
    if state.source_driven != source_driven:
        raise ValueError("checkpoint run source_driven mode does not match requested mode")
    if state.metadata_abstract_only != metadata_abstract_only:
        raise ValueError(
            "checkpoint run metadata_abstract_only does not match requested mode"
        )
    if list(state.explicit_corpus_ids) != explicit_corpus_ids:
        raise ValueError("checkpoint run explicit corpus ids do not match requested corpus ids")
    if state.limit != limit:
        raise ValueError("checkpoint run limit does not match requested limit")
    if state.batch_size != batch_size:
        raise ValueError("checkpoint run batch_size does not match requested batch_size")
    if state.stage_row_budget != stage_row_budget:
        raise ValueError(
            "checkpoint run stage_row_budget does not match requested stage_row_budget"
        )
    if state.stage_byte_budget != stage_byte_budget:
        raise ValueError(
            "checkpoint run stage_byte_budget does not match requested stage_byte_budget"
        )
    if state.worker_count != worker.worker_count or state.worker_index != worker.worker_index:
        raise ValueError("checkpoint run worker assignment does not match requested worker")


def _save_refresh_checkpoint(
    *,
    checkpoint_paths,
    run_id: str,
    parser_version: str,
    refresh_existing: bool,
    source_driven: bool,
    metadata_abstract_only: bool,
    explicit_corpus_ids: list[int],
    limit: int | None,
    batch_size: int,
    stage_row_budget: int | None,
    stage_byte_budget: int | None,
    worker: RagRefreshWorker,
    report: RagRefreshReport,
) -> None:
    save_checkpoint_state(
        checkpoint_paths,
        state=RagRefreshCheckpointState(
            run_id=run_id,
            parser_version=parser_version,
            refresh_existing=refresh_existing,
            source_driven=source_driven,
            metadata_abstract_only=metadata_abstract_only,
            explicit_corpus_ids=explicit_corpus_ids,
            limit=limit,
            batch_size=batch_size,
            stage_row_budget=stage_row_budget,
            stage_byte_budget=stage_byte_budget,
            worker_count=worker.worker_count,
            worker_index=worker.worker_index,
            report_json=report.model_dump(mode="python"),
        ),
    )


def _save_unit_progress_if_advanced(
    *,
    unit_store: RagRefreshUnitStore,
    run_id: str,
    source_kind: RagRefreshSourceKind,
    unit_name: str,
    worker: RagRefreshWorker,
    last_saved_ordinal: int,
    processed_ordinal: int,
    last_corpus_id: int | None = None,
) -> int:
    if processed_ordinal <= last_saved_ordinal:
        return last_saved_ordinal
    unit_store.save_unit_progress_ordinal(
        run_id=run_id,
        source_kind=source_kind,
        unit_name=unit_name,
        worker=worker,
        processed_ordinal=processed_ordinal,
        last_corpus_id=last_corpus_id,
    )
    return processed_ordinal


def _flush_discovered_s2_rows(
    *,
    rows: list[dict[str, object]],
    parser_version: str,
    source_revision: str,
    refresh_existing: bool,
    target_loader: TargetCorpusLoader,
    existing_loader: ExistingDocumentLoader,
    stage_report: RagSourceStageReport,
    source_groups: list[list[ParsedPaperSource]],
    pending_row_estimate: int,
    stage_row_budget: int | None,
    pending_byte_estimate: int,
    stage_byte_budget: int | None,
    writer: RagWarehouseWriter,
    ingested_ids: set[int],
    run_id: str | None = None,
    worker: RagRefreshWorker | None = None,
    source_kind: RagRefreshSourceKind | None = None,
    unit_name: str | None = None,
    unit_store: RagRefreshUnitStore | None = None,
) -> tuple[list[int], int, int]:
    if not rows:
        return [], pending_row_estimate, pending_byte_estimate
    candidate_ids = [int(row["corpusid"]) for row in rows]
    loaded_target_rows = target_loader.load(corpus_ids=candidate_ids, limit=None)
    target_row_by_corpus_id = _target_row_by_corpus_id(loaded_target_rows)
    allowed_ids = set(target_row_by_corpus_id)
    if not allowed_ids:
        rows.clear()
        return [], pending_row_estimate, pending_byte_estimate
    existing_ids = (
        set()
        if refresh_existing
        else existing_loader.load_existing(corpus_ids=sorted(allowed_ids))
    )
    candidate_accepted_ids: list[int] = []
    for row in rows:
        corpus_id = int(row["corpusid"])
        if corpus_id not in allowed_ids:
            continue
        if corpus_id in existing_ids:
            stage_report.skipped_existing_papers += 1
            continue
        candidate_accepted_ids.append(corpus_id)
    accepted_ids = (
        unit_store.reserve_source_driven_targets(
            run_id=run_id,
            worker=worker,
            source_kind=source_kind,
            unit_name=unit_name,
            candidate_ids=candidate_accepted_ids,
        )
        if run_id is not None
        and worker is not None
        and source_kind is not None
        and unit_name is not None
        and unit_store is not None
        else candidate_accepted_ids
    )
    accepted_id_set = set(accepted_ids)
    for row in rows:
        corpus_id = int(row["corpusid"])
        if corpus_id not in accepted_id_set:
            continue
        parsed = traced_parse_s2orc(
            row,
            source_revision=source_revision,
            parser_version=parser_version,
        )
        parsed = _apply_target_metadata_to_parsed_source(
            parsed=parsed,
            target_row=target_row_by_corpus_id.get(corpus_id),
        )
        stage_report.discovered_papers += 1
        pending_row_estimate, pending_byte_estimate = _append_source_group_with_budget(
            source_group=[parsed],
            source_groups=source_groups,
            pending_row_estimate=pending_row_estimate,
            stage_row_budget=stage_row_budget,
            pending_byte_estimate=pending_byte_estimate,
            stage_byte_budget=stage_byte_budget,
            writer=writer,
            stage_report=stage_report,
            replace_existing=refresh_existing,
        )
        ingested_ids.add(corpus_id)
        stage_report.ingested_corpus_ids = sorted(ingested_ids)
    _flush_source_groups(
        writer=writer,
        source_groups=source_groups,
        stage_report=stage_report,
        replace_existing=refresh_existing,
        estimated_batch_bytes=pending_byte_estimate,
    )
    pending_row_estimate = 0
    pending_byte_estimate = 0
    rows.clear()
    return accepted_ids, pending_row_estimate, pending_byte_estimate


def _flush_targeted_group_batches(
    *,
    source_groups: list[list[ParsedPaperSource]],
    batch_size: int,
    writer: RagWarehouseWriter,
    stage_report: RagSourceStageReport,
    replace_existing: bool,
) -> None:
    if not source_groups:
        return
    for start in range(0, len(source_groups), batch_size):
        batch_groups = source_groups[start : start + batch_size]
        _flush_source_groups(
            writer=writer,
            source_groups=batch_groups,
            stage_report=stage_report,
            replace_existing=replace_existing,
            estimated_batch_bytes=sum(
                _estimate_source_group_byte_count(group)
                for group in batch_groups
            ),
        )


def _run_explicit_targeted_refresh(
    *,
    parser_version: str,
    run_id: str,
    target_rows: list[RagTargetCorpusRow],
    target_corpus_ids: list[int],
    existing_ids: set[int],
    batch_size: int,
    refresh_existing: bool,
    metadata_abstract_only: bool,
    max_s2_shards: int | None,
    skip_s2_primary: bool,
    max_bioc_archives: int | None,
    skip_bioc_fallback: bool,
    checkpoint_paths,
    worker: RagRefreshWorker,
    report: RagRefreshReport,
    active_s2_reader: S2ShardReader,
    active_bioc_reader: BioCArchiveReader,
    active_writer: RagWarehouseWriter,
    active_unit_store: RagRefreshUnitStore,
    active_source_locator_repository: SourceLocatorRepository,
    prebootstrapped_metadata_ids: set[int] | None = None,
) -> None:
    target_row_by_corpus_id = _target_row_by_corpus_id(target_rows)
    pending_primary_ids = _pending_primary_ids(
        target_corpus_ids=target_corpus_ids,
        existing_ids=existing_ids,
        refresh_existing=refresh_existing,
    )
    prebootstrapped_ids = set(prebootstrapped_metadata_ids or ())
    s2_pending_primary_ids = pending_primary_ids - prebootstrapped_ids

    source_groups_by_corpus: dict[int, list[ParsedPaperSource]] = {}
    s2_ingested_ids: set[int] = set(prebootstrapped_ids)
    bioc_overlay_ids: set[int] = set()

    if not skip_s2_primary:
        _bootstrap_s2_metadata_abstract_sources(
            target_rows=target_rows,
            pending_primary_ids=s2_pending_primary_ids,
            source_groups_by_corpus=source_groups_by_corpus,
            s2_ingested_ids=s2_ingested_ids,
            parser_version=parser_version,
            report=report,
        )

    s2_locator_lookup = active_source_locator_repository.fetch_entries(
        corpus_ids=sorted(s2_pending_primary_ids),
        source_system=ParseSourceSystem.S2ORC_V2,
        source_revision=settings.s2_release_id,
    )
    s2_target_ids_by_unit = {
        unit_name: {entry.corpus_id for entry in entries}
        for unit_name, entries in s2_locator_lookup.by_unit_name.items()
    }
    s2_unit_paths: list[Path] = []
    if s2_pending_primary_ids:
        s2_unit_paths = (
            _restrict_unit_paths_with_locator(
                active_s2_reader.shard_paths(max_shards=max_s2_shards),
                locator_lookup=s2_locator_lookup,
            )
            if not s2_locator_lookup.missing_corpus_ids(sorted(s2_pending_primary_ids))
            else active_s2_reader.shard_paths(max_shards=max_s2_shards)
        )
        active_unit_store.ensure_units(
            run_id=run_id,
            source_kind=RagRefreshSourceKind.S2_SHARD,
            unit_paths=s2_unit_paths,
            worker=worker,
        )
    completed_s2 = set(
        active_unit_store.list_completed_units(
            run_id=run_id,
            source_kind=RagRefreshSourceKind.S2_SHARD,
            worker=worker,
        )
    )

    if not skip_s2_primary:
        while True:
            claimed_s2 = active_unit_store.claim_next_unit(
                run_id=run_id,
                source_kind=RagRefreshSourceKind.S2_SHARD,
                worker=worker,
            )
            if claimed_s2 is None:
                break
            target_ids_for_unit = s2_target_ids_by_unit.get(
                claimed_s2.unit_name,
                s2_pending_primary_ids,
            )
            found_target_ids: set[int] = set()
            locator_entries: list[RagSourceLocatorEntry] = []
            try:
                saved_s2_ordinal = active_unit_store.get_unit_progress_ordinal(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                )
                if saved_s2_ordinal > 0:
                    report.resumed_from_checkpoint = True
                last_processed_s2_ordinal = saved_s2_ordinal
                last_seen_corpus_id: int | None = None
                progress_interval_rows = max(batch_size, DEFAULT_UNIT_PROGRESS_INTERVAL_ROWS)
                for row_index, row in enumerate(
                    active_s2_reader.iter_rows(claimed_s2.path),
                    start=1,
                ):
                    if row_index <= saved_s2_ordinal:
                        continue
                    last_processed_s2_ordinal = row_index
                    corpus_id = int(row["corpusid"])
                    last_seen_corpus_id = corpus_id
                    if corpus_id not in target_ids_for_unit:
                        if row_index % progress_interval_rows == 0:
                            saved_s2_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.S2_SHARD,
                                unit_name=claimed_s2.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_s2_ordinal,
                                processed_ordinal=row_index,
                                last_corpus_id=last_seen_corpus_id,
                            )
                        continue
                    locator_entries.append(
                        RagSourceLocatorEntry(
                            corpus_id=corpus_id,
                            source_system=ParseSourceSystem.S2ORC_V2,
                            source_revision=settings.s2_release_id,
                            source_kind=RagRefreshSourceKind.S2_SHARD,
                            unit_name=claimed_s2.unit_name,
                            unit_ordinal=row_index,
                            source_document_key=str(corpus_id),
                        )
                    )
                    found_target_ids.add(corpus_id)
                    if corpus_id not in s2_pending_primary_ids:
                        if len(found_target_ids) == len(target_ids_for_unit):
                            saved_s2_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.S2_SHARD,
                                unit_name=claimed_s2.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_s2_ordinal,
                                processed_ordinal=row_index,
                                last_corpus_id=last_seen_corpus_id,
                            )
                            break
                        continue
                    parsed = traced_parse_s2orc(
                        row,
                        source_revision=settings.s2_release_id,
                        parser_version=parser_version,
                    )
                    parsed = _apply_target_metadata_to_parsed_source(
                        parsed=parsed,
                        target_row=target_row_by_corpus_id.get(corpus_id),
                    )
                    source_groups_by_corpus.setdefault(corpus_id, []).append(parsed)
                    s2_ingested_ids.add(corpus_id)
                    report.s2_stage.discovered_papers += 1
                    report.s2_stage.ingested_corpus_ids = sorted(s2_ingested_ids)
                    if len(found_target_ids) == len(target_ids_for_unit):
                        saved_s2_ordinal = _save_unit_progress_if_advanced(
                            unit_store=active_unit_store,
                            run_id=run_id,
                            source_kind=RagRefreshSourceKind.S2_SHARD,
                            unit_name=claimed_s2.unit_name,
                            worker=worker,
                            last_saved_ordinal=saved_s2_ordinal,
                            processed_ordinal=row_index,
                            last_corpus_id=last_seen_corpus_id,
                        )
                        break
                    if row_index % progress_interval_rows == 0:
                        saved_s2_ordinal = _save_unit_progress_if_advanced(
                            unit_store=active_unit_store,
                            run_id=run_id,
                            source_kind=RagRefreshSourceKind.S2_SHARD,
                            unit_name=claimed_s2.unit_name,
                            worker=worker,
                            last_saved_ordinal=saved_s2_ordinal,
                            processed_ordinal=row_index,
                            last_corpus_id=last_seen_corpus_id,
                        )
                _upsert_locator_entries(active_source_locator_repository, locator_entries)
                saved_s2_ordinal = _save_unit_progress_if_advanced(
                    unit_store=active_unit_store,
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                    worker=worker,
                    last_saved_ordinal=saved_s2_ordinal,
                    processed_ordinal=last_processed_s2_ordinal,
                    last_corpus_id=last_seen_corpus_id,
                )
                active_unit_store.mark_completed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                    worker=worker,
                )
            except Exception as exc:
                active_unit_store.mark_failed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                    worker=worker,
                    error_message=str(exc),
                )
                raise
            completed_s2.add(claimed_s2.unit_name)
            report.s2_stage.completed_units = sorted(completed_s2)
            _save_refresh_checkpoint(
                checkpoint_paths=checkpoint_paths,
                run_id=run_id,
                parser_version=parser_version,
                refresh_existing=refresh_existing,
                source_driven=False,
                metadata_abstract_only=metadata_abstract_only,
                explicit_corpus_ids=target_corpus_ids,
                limit=None,
                batch_size=batch_size,
                stage_row_budget=report.stage_row_budget,
                stage_byte_budget=report.stage_byte_budget,
                worker=worker,
                report=report,
            )

    pending_bioc_ids = (pending_primary_ids - s2_ingested_ids) | s2_ingested_ids
    if metadata_abstract_only and prebootstrapped_ids:
        pending_bioc_ids -= prebootstrapped_ids
    if not skip_bioc_fallback and pending_bioc_ids:
        bioc_target_rows = [row for row in target_rows if row.corpus_id in pending_bioc_ids]
        bioc_map = _build_bioc_resolution_map(bioc_target_rows)
        bioc_locator_lookup = active_source_locator_repository.fetch_entries(
            corpus_ids=sorted(pending_bioc_ids),
            source_system=ParseSourceSystem.BIOCXML,
            source_revision=settings.pubtator_release_id,
        )
        bioc_target_ids_by_unit = {
            unit_name: {entry.corpus_id for entry in entries}
            for unit_name, entries in bioc_locator_lookup.by_unit_name.items()
        }
        bioc_unit_paths = (
            _restrict_unit_paths_with_locator(
                active_bioc_reader.archive_paths(max_archives=max_bioc_archives),
                locator_lookup=bioc_locator_lookup,
            )
            if not bioc_locator_lookup.missing_corpus_ids(sorted(pending_bioc_ids))
            else active_bioc_reader.archive_paths(max_archives=max_bioc_archives)
        )
        active_unit_store.ensure_units(
            run_id=run_id,
            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
            unit_paths=bioc_unit_paths,
            worker=worker,
        )
        completed_bioc = set(
            active_unit_store.list_completed_units(
                run_id=run_id,
                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                worker=worker,
            )
        )
        for claimed_bioc in iter(lambda: active_unit_store.claim_next_unit(
            run_id=run_id,
            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
            worker=worker,
        ), None):
            target_ids_for_unit = bioc_target_ids_by_unit.get(
                claimed_bioc.unit_name,
                pending_bioc_ids,
            )
            found_target_ids: set[int] = set()
            locator_entries: list[RagSourceLocatorEntry] = []
            try:
                saved_bioc_ordinal = active_unit_store.get_unit_progress_ordinal(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                )
                if saved_bioc_ordinal > 0:
                    report.resumed_from_checkpoint = True
                last_processed_bioc_ordinal = saved_bioc_ordinal
                last_seen_bioc_corpus_id: int | None = None
                progress_interval_docs = max(batch_size, DEFAULT_UNIT_PROGRESS_INTERVAL_ROWS)
                for document_index, bioc_record in enumerate(
                    active_bioc_reader.iter_documents(claimed_bioc.path),
                    start=1,
                ):
                    document_id, member_name, xml_text = _unpack_bioc_document_record(bioc_record)
                    if document_index <= saved_bioc_ordinal:
                        continue
                    last_processed_bioc_ordinal = document_index
                    kind, normalized_value = normalize_bioc_document_id(document_id)
                    corpus_id = bioc_map.get((kind.value, normalized_value))
                    if corpus_id is None or corpus_id not in target_ids_for_unit:
                        if document_index % progress_interval_docs == 0:
                            saved_bioc_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                                unit_name=claimed_bioc.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_bioc_ordinal,
                                processed_ordinal=document_index,
                                last_corpus_id=last_seen_bioc_corpus_id,
                            )
                        continue
                    last_seen_bioc_corpus_id = corpus_id
                    locator_entries.append(
                        RagSourceLocatorEntry(
                            corpus_id=corpus_id,
                            source_system=ParseSourceSystem.BIOCXML,
                            source_revision=settings.pubtator_release_id,
                            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                            unit_name=claimed_bioc.unit_name,
                            unit_ordinal=document_index,
                            source_document_key=document_id,
                            member_name=member_name,
                        )
                    )
                    parsed = traced_parse_biocxml(
                        xml_text,
                        source_revision=settings.pubtator_release_id,
                        parser_version=parser_version,
                        corpus_id=corpus_id,
                    )
                    parsed = _apply_target_metadata_to_parsed_source(
                        parsed=parsed,
                        target_row=target_row_by_corpus_id.get(corpus_id),
                    )
                    report.bioc_fallback_stage.discovered_papers += 1
                    if not parsed_source_has_warehouse_value(parsed):
                        report.bioc_fallback_stage.skipped_low_value_papers += 1
                        report.bioc_fallback_stage.skipped_low_value_corpus_ids = sorted(
                            set(report.bioc_fallback_stage.skipped_low_value_corpus_ids).union(
                                {corpus_id}
                            )
                        )
                        if document_index % progress_interval_docs == 0:
                            saved_bioc_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                                unit_name=claimed_bioc.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_bioc_ordinal,
                                processed_ordinal=document_index,
                                last_corpus_id=last_seen_bioc_corpus_id,
                            )
                        continue
                    source_groups_by_corpus.setdefault(corpus_id, []).append(parsed)
                    bioc_overlay_ids.add(corpus_id)
                    found_target_ids.add(corpus_id)
                    report.bioc_fallback_stage.ingested_corpus_ids = sorted(bioc_overlay_ids)
                    if len(found_target_ids) == len(target_ids_for_unit):
                        saved_bioc_ordinal = _save_unit_progress_if_advanced(
                            unit_store=active_unit_store,
                            run_id=run_id,
                            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                            unit_name=claimed_bioc.unit_name,
                            worker=worker,
                            last_saved_ordinal=saved_bioc_ordinal,
                            processed_ordinal=document_index,
                            last_corpus_id=last_seen_bioc_corpus_id,
                        )
                        break
                    if document_index % progress_interval_docs == 0:
                        saved_bioc_ordinal = _save_unit_progress_if_advanced(
                            unit_store=active_unit_store,
                            run_id=run_id,
                            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                            unit_name=claimed_bioc.unit_name,
                            worker=worker,
                            last_saved_ordinal=saved_bioc_ordinal,
                            processed_ordinal=document_index,
                            last_corpus_id=last_seen_bioc_corpus_id,
                        )
                _upsert_locator_entries(active_source_locator_repository, locator_entries)
                saved_bioc_ordinal = _save_unit_progress_if_advanced(
                    unit_store=active_unit_store,
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                    worker=worker,
                    last_saved_ordinal=saved_bioc_ordinal,
                    processed_ordinal=last_processed_bioc_ordinal,
                    last_corpus_id=last_seen_bioc_corpus_id,
                )
                active_unit_store.mark_completed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                    worker=worker,
                )
            except Exception as exc:
                active_unit_store.mark_failed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                    worker=worker,
                    error_message=str(exc),
                )
                raise
            completed_bioc.add(claimed_bioc.unit_name)
            report.bioc_fallback_stage.completed_units = sorted(completed_bioc)
            _save_refresh_checkpoint(
                checkpoint_paths=checkpoint_paths,
                run_id=run_id,
                parser_version=parser_version,
                refresh_existing=refresh_existing,
                source_driven=False,
                metadata_abstract_only=metadata_abstract_only,
                explicit_corpus_ids=target_corpus_ids,
                limit=None,
                batch_size=batch_size,
                stage_row_budget=report.stage_row_budget,
                stage_byte_budget=report.stage_byte_budget,
                worker=worker,
                report=report,
            )

    merged_groups = [
        source_groups_by_corpus[corpus_id]
        for corpus_id in target_corpus_ids
        if corpus_id in source_groups_by_corpus
    ]
    s2_primary_groups, bioc_primary_groups, bioc_overlay_ids = _route_targeted_source_groups(
        merged_groups
    )
    report.bioc_fallback_stage.ingested_corpus_ids = sorted(
        set(report.bioc_fallback_stage.ingested_corpus_ids).union(bioc_overlay_ids)
    )
    if s2_primary_groups:
        _flush_targeted_group_batches(
            source_groups=s2_primary_groups,
            batch_size=batch_size,
            writer=active_writer,
            stage_report=report.s2_stage,
            replace_existing=refresh_existing,
        )
    if bioc_primary_groups:
        _flush_targeted_group_batches(
            source_groups=bioc_primary_groups,
            batch_size=batch_size,
            writer=active_writer,
            stage_report=report.bioc_fallback_stage,
            replace_existing=refresh_existing or bool(prebootstrapped_ids),
        )


@observe(name="ingest.ragRefresh")
def run_rag_refresh(
    *,
    parser_version: str,
    run_id: str,
    corpus_ids: list[int] | None = None,
    limit: int | None = None,
    batch_size: int = 100,
    stage_row_budget: int | None = DEFAULT_STAGE_ROW_BUDGET,
    stage_byte_budget: int | None = None,
    refresh_existing: bool = False,
    metadata_abstract_only: bool = False,
    max_s2_shards: int | None = None,
    skip_s2_primary: bool = False,
    max_bioc_archives: int | None = None,
    skip_bioc_fallback: bool = False,
    refresh_source_locators: bool = False,
    reset_source_locators: bool = False,
    seed_chunk_version: bool = False,
    backfill_chunks: bool = False,
    inspect_quality: bool = False,
    chunk_backfill_batch_size: int = 250,
    embedding_model: str | None = None,
    reset_run: bool = False,
    checkpoint_root: Path | None = None,
    worker_count: int = 1,
    worker_index: int = 0,
    target_loader: TargetCorpusLoader | None = None,
    existing_loader: ExistingDocumentLoader | None = None,
    s2_reader: S2ShardReader | None = None,
    bioc_reader: BioCArchiveReader | None = None,
    writer: RagWarehouseWriter | None = None,
    chunk_backfill_runner: ChunkBackfillCallable | None = None,
    unit_store: RagRefreshUnitStore | None = None,
    source_locator_repository: SourceLocatorRepository | None = None,
    source_locator_refresher: SourceLocatorRefreshCallable | None = None,
    quality_inspector: WarehouseQualityCallable | None = None,
) -> RagRefreshReport:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    normalized_stage_row_budget = (
        None if stage_row_budget is None or stage_row_budget <= 0 else stage_row_budget
    )
    normalized_stage_byte_budget = (
        None if stage_byte_budget is None or stage_byte_budget <= 0 else stage_byte_budget
    )
    if chunk_backfill_batch_size <= 0:
        raise ValueError("chunk_backfill_batch_size must be positive")

    worker = RagRefreshWorker(worker_count=worker_count, worker_index=worker_index)
    normalized_explicit_ids = _unique_ints(corpus_ids)
    source_driven = not normalized_explicit_ids
    if worker.worker_count > 1 and (seed_chunk_version or backfill_chunks):
        raise ValueError(
            "parallel refresh workers must not seed chunk versions "
            "or backfill chunks inline"
        )
    checkpoint_paths = rag_refresh_checkpoint_paths(
        run_id,
        root=checkpoint_root,
        worker_suffix=worker.checkpoint_suffix,
    )
    active_unit_store = unit_store or PostgresRagRefreshUnitStore()
    if reset_run:
        reset_checkpoint_state(checkpoint_paths)
        active_unit_store.reset_run(run_id=run_id)
    checkpoint_state = load_checkpoint_state(checkpoint_paths)
    resumed_from_checkpoint = checkpoint_state is not None
    if checkpoint_state is not None:
        _validate_checkpoint_state(
            state=checkpoint_state,
            parser_version=parser_version,
            refresh_existing=refresh_existing,
            source_driven=source_driven,
            metadata_abstract_only=metadata_abstract_only,
            explicit_corpus_ids=normalized_explicit_ids,
            limit=limit,
            batch_size=batch_size,
            stage_row_budget=normalized_stage_row_budget,
            stage_byte_budget=normalized_stage_byte_budget,
            worker=worker,
        )

    target_rows: list[RagTargetCorpusRow]
    target_corpus_ids: list[int]
    existing_ids = set()
    active_target_loader = target_loader or PostgresTargetCorpusLoader()
    active_existing_loader = existing_loader or PostgresExistingDocumentLoader()
    if source_driven:
        target_rows = []
        target_corpus_ids = []
    else:
        target_rows = active_target_loader.load(
            corpus_ids=normalized_explicit_ids or None,
            limit=limit,
        )
        target_corpus_ids = [row.corpus_id for row in target_rows]
        if not refresh_existing:
            existing_ids = active_existing_loader.load_existing(
                corpus_ids=target_corpus_ids
            )

    active_writer = writer or RagWarehouseWriter()
    active_s2_reader = s2_reader or LocalS2ShardReader()
    active_bioc_reader = bioc_reader or LocalBioCArchiveReader()
    active_chunk_backfill = chunk_backfill_runner or run_chunk_backfill
    run_state: RagRefreshRunState | None = None
    active_source_locator_repository = (
        source_locator_repository or SidecarRagSourceLocatorRepository()
    )
    active_source_locator_refresher = source_locator_refresher
    if source_driven:
        run_state = active_unit_store.ensure_source_driven_run(
            run_id=run_id,
            worker=worker,
            requested_limit=limit,
        )

    report = (
        RagRefreshReport.model_validate(checkpoint_state.report_json)
        if checkpoint_state is not None
        else RagRefreshReport(
            run_id=run_id,
            parser_version=parser_version,
            refresh_existing=refresh_existing,
            source_driven=source_driven,
            metadata_abstract_only=metadata_abstract_only,
            worker_count=worker.worker_count,
            worker_index=worker.worker_index,
            requested_limit=limit,
            selected_target_count=run_state.selected_target_count if run_state is not None else 0,
            stage_row_budget=normalized_stage_row_budget,
            stage_byte_budget=normalized_stage_byte_budget,
            requested_corpus_ids=normalized_explicit_ids,
            target_corpus_ids=target_corpus_ids,
            s2_stage=RagSourceStageReport(stage_name="s2_primary"),
            bioc_fallback_stage=RagSourceStageReport(stage_name="bioc_fallback_primary"),
            checkpoint_dir=str(checkpoint_paths.root),
            resumed_from_checkpoint=resumed_from_checkpoint,
        )
    )
    report.checkpoint_dir = str(checkpoint_paths.root)
    report.resumed_from_checkpoint = resumed_from_checkpoint
    report.source_driven = source_driven
    report.metadata_abstract_only = metadata_abstract_only
    report.worker_count = worker.worker_count
    report.worker_index = worker.worker_index
    report.requested_limit = limit
    report.stage_row_budget = normalized_stage_row_budget
    report.stage_byte_budget = normalized_stage_byte_budget
    if source_driven:
        current_run_state = active_unit_store.get_source_driven_run_state(run_id=run_id)
        report.selected_target_count = (
            current_run_state.selected_target_count if current_run_state else 0
        )
        report.target_corpus_ids = active_unit_store.list_source_driven_targets(run_id=run_id)
    if not source_driven:
        report.s2_stage.skipped_existing_papers = len(existing_ids)

    if not source_driven:
        explicit_pending_primary_ids = _pending_primary_ids(
            target_corpus_ids=target_corpus_ids,
            existing_ids=existing_ids,
            refresh_existing=refresh_existing,
        )
        metadata_abstract_ids = _metadata_abstract_candidate_ids(
            target_rows=target_rows,
            pending_primary_ids=explicit_pending_primary_ids,
            skip_s2_primary=skip_s2_primary,
        )
        _preload_explicit_metadata_abstracts(
            parser_version=parser_version,
            run_id=run_id,
            target_rows=target_rows,
            target_corpus_ids=target_corpus_ids,
            pending_primary_ids=explicit_pending_primary_ids,
            refresh_existing=refresh_existing,
            metadata_abstract_only=metadata_abstract_only,
            checkpoint_paths=checkpoint_paths,
            worker=worker,
            report=report,
            active_writer=active_writer,
        )
        bootstrapped_metadata_ids = set(report.s2_stage.ingested_corpus_ids).intersection(
            metadata_abstract_ids
        )
        if refresh_source_locators:
            if active_source_locator_refresher is None:
                from app.rag_ingest.source_locator_refresh import refresh_rag_source_locator

                active_source_locator_refresher = refresh_rag_source_locator
            report.source_locator_refresh = _run_explicit_source_locator_refresh(
                run_id=run_id,
                target_rows=target_rows,
                pending_primary_ids=explicit_pending_primary_ids,
                bootstrapped_metadata_ids=bootstrapped_metadata_ids,
                metadata_abstract_only=metadata_abstract_only,
                max_s2_shards=max_s2_shards,
                skip_s2_primary=skip_s2_primary,
                max_bioc_archives=max_bioc_archives,
                skip_bioc_fallback=skip_bioc_fallback,
                reset_source_locators=reset_source_locators,
                reset_run=reset_run,
                checkpoint_root=checkpoint_root,
                active_source_locator_refresher=active_source_locator_refresher,
                repository=active_source_locator_repository,
            )
        _run_explicit_targeted_refresh(
            parser_version=parser_version,
            run_id=run_id,
            target_rows=target_rows,
            target_corpus_ids=target_corpus_ids,
            existing_ids=existing_ids,
            batch_size=batch_size,
            refresh_existing=refresh_existing,
            metadata_abstract_only=metadata_abstract_only,
            max_s2_shards=max_s2_shards,
            skip_s2_primary=skip_s2_primary,
            max_bioc_archives=max_bioc_archives,
            skip_bioc_fallback=skip_bioc_fallback,
            checkpoint_paths=checkpoint_paths,
            worker=worker,
            report=report,
            active_s2_reader=active_s2_reader,
            active_bioc_reader=active_bioc_reader,
            active_writer=active_writer,
            active_unit_store=active_unit_store,
            active_source_locator_repository=active_source_locator_repository,
            prebootstrapped_metadata_ids=bootstrapped_metadata_ids,
        )
        if seed_chunk_version:
            report.chunk_seed = RagChunkSeeder().seed_default(
                source_revision_keys=_source_revision_keys(),
                parser_version=parser_version,
                embedding_model=embedding_model,
            ).model_dump(mode="python")

        if backfill_chunks:
            report.chunk_backfill = active_chunk_backfill(
                corpus_ids=target_corpus_ids,
                source_revision_keys=_source_revision_keys(),
                parser_version=parser_version,
                embedding_model=embedding_model,
                batch_size=chunk_backfill_batch_size,
                run_id=f"{run_id}-chunk-backfill",
                reset_run=reset_run,
                checkpoint_root=checkpoint_root,
            ).model_dump(mode="python")

        if inspect_quality:
            active_quality_inspector = quality_inspector
            if active_quality_inspector is None:
                from app.rag_ingest.warehouse_quality import inspect_rag_warehouse_quality

                active_quality_inspector = inspect_rag_warehouse_quality
            quality_corpus_ids = _quality_corpus_ids_for_report(report)
            if quality_corpus_ids:
                quality_result = active_quality_inspector(corpus_ids=quality_corpus_ids)
                model_dump = getattr(quality_result, "model_dump", None)
                report.quality_report = (
                    model_dump(mode="python")
                    if callable(model_dump)
                    else quality_result
                )

        _save_refresh_checkpoint(
            checkpoint_paths=checkpoint_paths,
            run_id=run_id,
            parser_version=parser_version,
            refresh_existing=refresh_existing,
            source_driven=False,
            metadata_abstract_only=metadata_abstract_only,
            explicit_corpus_ids=normalized_explicit_ids,
            limit=limit,
            batch_size=batch_size,
            stage_row_budget=normalized_stage_row_budget,
            stage_byte_budget=normalized_stage_byte_budget,
            worker=worker,
            report=report,
        )
        return report

    pending_primary_ids = set(target_corpus_ids)
    if not refresh_existing:
        pending_primary_ids -= existing_ids

    s2_unit_paths = active_s2_reader.shard_paths(max_shards=max_s2_shards)
    active_unit_store.ensure_units(
        run_id=run_id,
        source_kind=RagRefreshSourceKind.S2_SHARD,
        unit_paths=s2_unit_paths,
        worker=worker,
    )
    completed_s2 = set(
        active_unit_store.list_completed_units(
            run_id=run_id,
            source_kind=RagRefreshSourceKind.S2_SHARD,
            worker=worker,
        )
    )
    s2_source_groups: list[list[ParsedPaperSource]] = []
    s2_pending_row_estimate = 0
    s2_pending_byte_estimate = 0
    s2_ingested_ids: set[int] = set()
    discovered_s2_rows: list[dict[str, object]] = []
    selected_source_ids = set(report.target_corpus_ids if source_driven else [])
    pending_source_ids: set[int] = set()
    if not skip_s2_primary:
        while True:
            if source_driven:
                current_run_state = active_unit_store.get_source_driven_run_state(run_id=run_id)
                if current_run_state is not None and current_run_state.limit_reached:
                    break
            claimed_s2 = active_unit_store.claim_next_unit(
                run_id=run_id,
                source_kind=RagRefreshSourceKind.S2_SHARD,
                worker=worker,
            )
            if claimed_s2 is None:
                break
            try:
                shard_path = claimed_s2.path
                saved_s2_ordinal = active_unit_store.get_unit_progress_ordinal(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                )
                if saved_s2_ordinal > 0:
                    report.resumed_from_checkpoint = True
                last_processed_s2_ordinal = saved_s2_ordinal
                last_seen_corpus_id: int | None = None
                progress_interval_rows = max(batch_size, DEFAULT_UNIT_PROGRESS_INTERVAL_ROWS)
                for row_index, row in enumerate(active_s2_reader.iter_rows(shard_path), start=1):
                    if row_index <= saved_s2_ordinal:
                        continue
                    last_processed_s2_ordinal = row_index
                    corpus_id = int(row["corpusid"])
                    last_seen_corpus_id = corpus_id
                    if source_driven:
                        if corpus_id in selected_source_ids or corpus_id in pending_source_ids:
                            pass
                        elif limit is not None and len(selected_source_ids) >= limit:
                            saved_s2_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.S2_SHARD,
                                unit_name=claimed_s2.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_s2_ordinal,
                                processed_ordinal=row_index,
                                last_corpus_id=last_seen_corpus_id,
                            )
                            break
                        else:
                            discovered_s2_rows.append(row)
                            pending_source_ids.add(corpus_id)
                        if discovered_s2_rows and (
                            len(discovered_s2_rows) >= batch_size
                            or (
                                limit is not None
                                and len(selected_source_ids)
                                + len(pending_source_ids)
                                >= limit
                            )
                        ):
                            (
                                accepted_ids,
                                s2_pending_row_estimate,
                                s2_pending_byte_estimate,
                            ) = _flush_discovered_s2_rows(
                                rows=discovered_s2_rows,
                                parser_version=parser_version,
                                source_revision=settings.s2_release_id,
                                refresh_existing=refresh_existing,
                                target_loader=active_target_loader,
                                existing_loader=active_existing_loader,
                                stage_report=report.s2_stage,
                                source_groups=s2_source_groups,
                                pending_row_estimate=s2_pending_row_estimate,
                                stage_row_budget=normalized_stage_row_budget,
                                pending_byte_estimate=s2_pending_byte_estimate,
                                stage_byte_budget=normalized_stage_byte_budget,
                                writer=active_writer,
                                ingested_ids=s2_ingested_ids,
                                run_id=run_id if source_driven else None,
                                worker=worker if source_driven else None,
                                source_kind=(
                                    RagRefreshSourceKind.S2_SHARD
                                    if source_driven
                                    else None
                                ),
                                unit_name=claimed_s2.unit_name if source_driven else None,
                                unit_store=active_unit_store if source_driven else None,
                            )
                            selected_source_ids.update(accepted_ids)
                            pending_source_ids.clear()
                            if source_driven:
                                current_run_state = (
                                    active_unit_store.get_source_driven_run_state(
                                        run_id=run_id
                                    )
                                )
                                report.selected_target_count = (
                                    current_run_state.selected_target_count
                                    if current_run_state
                                    else 0
                                )
                                report.target_corpus_ids = (
                                    active_unit_store.list_source_driven_targets(
                                        run_id=run_id
                                    )
                                )
                            else:
                                report.target_corpus_ids = sorted(selected_source_ids)
                            saved_s2_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.S2_SHARD,
                                unit_name=claimed_s2.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_s2_ordinal,
                                processed_ordinal=row_index,
                                last_corpus_id=last_seen_corpus_id,
                            )
                    else:
                        if corpus_id not in pending_primary_ids:
                            pass
                        else:
                            parsed = parse_s2orc_row(
                                row,
                                source_revision=settings.s2_release_id,
                                parser_version=parser_version,
                            )
                            report.s2_stage.discovered_papers += 1
                            (
                                s2_pending_row_estimate,
                                s2_pending_byte_estimate,
                            ) = _append_source_group_with_budget(
                                source_group=[parsed],
                                source_groups=s2_source_groups,
                                pending_row_estimate=s2_pending_row_estimate,
                                stage_row_budget=normalized_stage_row_budget,
                                pending_byte_estimate=s2_pending_byte_estimate,
                                stage_byte_budget=normalized_stage_byte_budget,
                                writer=active_writer,
                                stage_report=report.s2_stage,
                                replace_existing=refresh_existing,
                            )
                            s2_ingested_ids.add(corpus_id)
                            report.s2_stage.ingested_corpus_ids = sorted(s2_ingested_ids)
                            if len(s2_source_groups) >= batch_size:
                                _flush_source_groups(
                                    writer=active_writer,
                                    source_groups=s2_source_groups,
                                    stage_report=report.s2_stage,
                                    replace_existing=refresh_existing,
                                    estimated_batch_bytes=s2_pending_byte_estimate,
                                )
                                s2_pending_row_estimate = 0
                                s2_pending_byte_estimate = 0
                                saved_s2_ordinal = _save_unit_progress_if_advanced(
                                    unit_store=active_unit_store,
                                    run_id=run_id,
                                    source_kind=RagRefreshSourceKind.S2_SHARD,
                                    unit_name=claimed_s2.unit_name,
                                    worker=worker,
                                    last_saved_ordinal=saved_s2_ordinal,
                                    processed_ordinal=row_index,
                                    last_corpus_id=last_seen_corpus_id,
                                )
                    if row_index % progress_interval_rows == 0:
                        saved_s2_ordinal = _save_unit_progress_if_advanced(
                            unit_store=active_unit_store,
                            run_id=run_id,
                            source_kind=RagRefreshSourceKind.S2_SHARD,
                            unit_name=claimed_s2.unit_name,
                            worker=worker,
                            last_saved_ordinal=saved_s2_ordinal,
                            processed_ordinal=row_index,
                            last_corpus_id=last_seen_corpus_id,
                        )
                if source_driven:
                    (
                        accepted_ids,
                        s2_pending_row_estimate,
                        s2_pending_byte_estimate,
                    ) = _flush_discovered_s2_rows(
                        rows=discovered_s2_rows,
                        parser_version=parser_version,
                        source_revision=settings.s2_release_id,
                        refresh_existing=refresh_existing,
                        target_loader=active_target_loader,
                        existing_loader=active_existing_loader,
                        stage_report=report.s2_stage,
                        source_groups=s2_source_groups,
                        pending_row_estimate=s2_pending_row_estimate,
                        stage_row_budget=normalized_stage_row_budget,
                        pending_byte_estimate=s2_pending_byte_estimate,
                        stage_byte_budget=normalized_stage_byte_budget,
                        writer=active_writer,
                        ingested_ids=s2_ingested_ids,
                        run_id=run_id,
                        worker=worker,
                        source_kind=RagRefreshSourceKind.S2_SHARD,
                        unit_name=claimed_s2.unit_name,
                        unit_store=active_unit_store,
                    )
                    selected_source_ids.update(accepted_ids)
                    pending_source_ids.clear()
                    current_run_state = active_unit_store.get_source_driven_run_state(run_id=run_id)
                    report.selected_target_count = (
                        current_run_state.selected_target_count
                        if current_run_state
                        else 0
                    )
                    report.target_corpus_ids = (
                        active_unit_store.list_source_driven_targets(run_id=run_id)
                    )
                _flush_source_groups(
                    writer=active_writer,
                    source_groups=s2_source_groups,
                    stage_report=report.s2_stage,
                    replace_existing=refresh_existing,
                    estimated_batch_bytes=s2_pending_byte_estimate,
                )
                s2_pending_row_estimate = 0
                s2_pending_byte_estimate = 0
                saved_s2_ordinal = _save_unit_progress_if_advanced(
                    unit_store=active_unit_store,
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                    worker=worker,
                    last_saved_ordinal=saved_s2_ordinal,
                    processed_ordinal=last_processed_s2_ordinal,
                    last_corpus_id=last_seen_corpus_id,
                )
                active_unit_store.mark_completed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                    worker=worker,
                )
            except Exception as exc:
                active_unit_store.mark_failed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.S2_SHARD,
                    unit_name=claimed_s2.unit_name,
                    worker=worker,
                    error_message=str(exc),
                )
                raise
            completed_s2.add(claimed_s2.unit_name)
            report.s2_stage.completed_units = sorted(completed_s2)
            _save_refresh_checkpoint(
                checkpoint_paths=checkpoint_paths,
                run_id=run_id,
                parser_version=parser_version,
                refresh_existing=refresh_existing,
                source_driven=source_driven,
                metadata_abstract_only=metadata_abstract_only,
                explicit_corpus_ids=normalized_explicit_ids,
                limit=limit,
                batch_size=batch_size,
                stage_row_budget=normalized_stage_row_budget,
                stage_byte_budget=normalized_stage_byte_budget,
                worker=worker,
                report=report,
            )
            current_run_state = (
                active_unit_store.get_source_driven_run_state(run_id=run_id)
                if source_driven
                else None
            )
            if source_driven and current_run_state is not None and current_run_state.limit_reached:
                break

    pending_bioc_ids = (
        set()
        if source_driven
        else pending_primary_ids - set(report.s2_stage.ingested_corpus_ids)
    )

    if not skip_bioc_fallback and pending_bioc_ids:
        bioc_map = _build_bioc_resolution_map(
            [row for row in target_rows if row.corpus_id in pending_bioc_ids]
        )
        bioc_unit_paths = active_bioc_reader.archive_paths(max_archives=max_bioc_archives)
        active_unit_store.ensure_units(
            run_id=run_id,
            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
            unit_paths=bioc_unit_paths,
            worker=worker,
        )
        completed_bioc = set(
            active_unit_store.list_completed_units(
                run_id=run_id,
                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                worker=worker,
            )
        )
        bioc_source_groups: list[list[ParsedPaperSource]] = []
        bioc_pending_row_estimate = 0
        bioc_pending_byte_estimate = 0
        ingested_bioc_ids: set[int] = set()
        while True:
            claimed_bioc = active_unit_store.claim_next_unit(
                run_id=run_id,
                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                worker=worker,
            )
            if claimed_bioc is None:
                break
            try:
                archive_path = claimed_bioc.path
                saved_bioc_ordinal = active_unit_store.get_unit_progress_ordinal(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                )
                if saved_bioc_ordinal > 0:
                    report.resumed_from_checkpoint = True
                last_processed_bioc_ordinal = saved_bioc_ordinal
                last_seen_bioc_corpus_id: int | None = None
                progress_interval_docs = max(batch_size, DEFAULT_UNIT_PROGRESS_INTERVAL_ROWS)
                for document_index, bioc_record in enumerate(
                    active_bioc_reader.iter_documents(archive_path),
                    start=1,
                ):
                    document_id, member_name, xml_text = _unpack_bioc_document_record(bioc_record)
                    if document_index <= saved_bioc_ordinal:
                        continue
                    last_processed_bioc_ordinal = document_index
                    kind, normalized_value = normalize_bioc_document_id(document_id)
                    corpus_id = bioc_map.get((kind.value, normalized_value))
                    if (
                        corpus_id is None
                        or corpus_id not in pending_bioc_ids
                        or corpus_id in ingested_bioc_ids
                    ):
                        if document_index % progress_interval_docs == 0:
                            saved_bioc_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                                unit_name=claimed_bioc.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_bioc_ordinal,
                                processed_ordinal=document_index,
                                last_corpus_id=last_seen_bioc_corpus_id,
                            )
                        continue
                    last_seen_bioc_corpus_id = corpus_id
                    parsed = traced_parse_biocxml(
                        xml_text,
                        source_revision=settings.pubtator_release_id,
                        parser_version=parser_version,
                        corpus_id=corpus_id,
                    )
                    report.bioc_fallback_stage.discovered_papers += 1
                    if not parsed_source_has_warehouse_value(parsed):
                        report.bioc_fallback_stage.skipped_low_value_papers += 1
                        report.bioc_fallback_stage.skipped_low_value_corpus_ids = sorted(
                            set(report.bioc_fallback_stage.skipped_low_value_corpus_ids).union(
                                {corpus_id}
                            )
                        )
                        if document_index % progress_interval_docs == 0:
                            saved_bioc_ordinal = _save_unit_progress_if_advanced(
                                unit_store=active_unit_store,
                                run_id=run_id,
                                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                                unit_name=claimed_bioc.unit_name,
                                worker=worker,
                                last_saved_ordinal=saved_bioc_ordinal,
                                processed_ordinal=document_index,
                                last_corpus_id=last_seen_bioc_corpus_id,
                            )
                        continue
                    (
                        bioc_pending_row_estimate,
                        bioc_pending_byte_estimate,
                    ) = _append_source_group_with_budget(
                        source_group=[parsed],
                        source_groups=bioc_source_groups,
                        pending_row_estimate=bioc_pending_row_estimate,
                        stage_row_budget=normalized_stage_row_budget,
                        pending_byte_estimate=bioc_pending_byte_estimate,
                        stage_byte_budget=normalized_stage_byte_budget,
                        writer=active_writer,
                        stage_report=report.bioc_fallback_stage,
                        replace_existing=refresh_existing,
                    )
                    ingested_bioc_ids.add(corpus_id)
                    report.bioc_fallback_stage.ingested_corpus_ids = sorted(ingested_bioc_ids)
                    if len(bioc_source_groups) >= batch_size:
                        _flush_source_groups(
                            writer=active_writer,
                            source_groups=bioc_source_groups,
                            stage_report=report.bioc_fallback_stage,
                            replace_existing=refresh_existing,
                            estimated_batch_bytes=bioc_pending_byte_estimate,
                        )
                        bioc_pending_row_estimate = 0
                        bioc_pending_byte_estimate = 0
                        saved_bioc_ordinal = _save_unit_progress_if_advanced(
                            unit_store=active_unit_store,
                            run_id=run_id,
                            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                            unit_name=claimed_bioc.unit_name,
                            worker=worker,
                            last_saved_ordinal=saved_bioc_ordinal,
                            processed_ordinal=document_index,
                            last_corpus_id=last_seen_bioc_corpus_id,
                        )
                    elif document_index % progress_interval_docs == 0:
                        saved_bioc_ordinal = _save_unit_progress_if_advanced(
                            unit_store=active_unit_store,
                            run_id=run_id,
                            source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                            unit_name=claimed_bioc.unit_name,
                            worker=worker,
                            last_saved_ordinal=saved_bioc_ordinal,
                            processed_ordinal=document_index,
                            last_corpus_id=last_seen_bioc_corpus_id,
                        )
                _flush_source_groups(
                    writer=active_writer,
                    source_groups=bioc_source_groups,
                    stage_report=report.bioc_fallback_stage,
                    replace_existing=refresh_existing,
                    estimated_batch_bytes=bioc_pending_byte_estimate,
                )
                bioc_pending_row_estimate = 0
                bioc_pending_byte_estimate = 0
                saved_bioc_ordinal = _save_unit_progress_if_advanced(
                    unit_store=active_unit_store,
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                    worker=worker,
                    last_saved_ordinal=saved_bioc_ordinal,
                    processed_ordinal=last_processed_bioc_ordinal,
                    last_corpus_id=last_seen_bioc_corpus_id,
                )
                active_unit_store.mark_completed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                    worker=worker,
                )
            except Exception as exc:
                active_unit_store.mark_failed(
                    run_id=run_id,
                    source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                    unit_name=claimed_bioc.unit_name,
                    worker=worker,
                    error_message=str(exc),
                )
                raise
            completed_bioc.add(claimed_bioc.unit_name)
            report.bioc_fallback_stage.completed_units = sorted(completed_bioc)
            _save_refresh_checkpoint(
                checkpoint_paths=checkpoint_paths,
                run_id=run_id,
                parser_version=parser_version,
                refresh_existing=refresh_existing,
                source_driven=source_driven,
                metadata_abstract_only=metadata_abstract_only,
                explicit_corpus_ids=normalized_explicit_ids,
                limit=limit,
                batch_size=batch_size,
                stage_row_budget=normalized_stage_row_budget,
                stage_byte_budget=normalized_stage_byte_budget,
                worker=worker,
                report=report,
            )

    if seed_chunk_version:
        report.chunk_seed = RagChunkSeeder().seed_default(
            source_revision_keys=_source_revision_keys(),
            parser_version=parser_version,
            embedding_model=embedding_model,
        ).model_dump(mode="python")

    if backfill_chunks:
        chunk_backfill_corpus_ids = (
            list(report.target_corpus_ids)
            if source_driven
            else target_corpus_ids
        )
        report.chunk_backfill = active_chunk_backfill(
            corpus_ids=chunk_backfill_corpus_ids,
            source_revision_keys=_source_revision_keys(),
            parser_version=parser_version,
            embedding_model=embedding_model,
            batch_size=chunk_backfill_batch_size,
            run_id=f"{run_id}-chunk-backfill",
            reset_run=reset_run,
            checkpoint_root=checkpoint_root,
        ).model_dump(mode="python")

    if inspect_quality:
        active_quality_inspector = quality_inspector
        if active_quality_inspector is None:
            from app.rag_ingest.warehouse_quality import inspect_rag_warehouse_quality

            active_quality_inspector = inspect_rag_warehouse_quality
        quality_corpus_ids = _quality_corpus_ids_for_report(report)
        if quality_corpus_ids:
            quality_result = active_quality_inspector(corpus_ids=quality_corpus_ids)
            model_dump = getattr(quality_result, "model_dump", None)
            report.quality_report = (
                model_dump(mode="python")
                if callable(model_dump)
                else quality_result
            )

    _save_refresh_checkpoint(
        checkpoint_paths=checkpoint_paths,
        run_id=run_id,
        parser_version=parser_version,
        refresh_existing=refresh_existing,
        source_driven=source_driven,
        metadata_abstract_only=metadata_abstract_only,
        explicit_corpus_ids=normalized_explicit_ids,
        limit=limit,
        batch_size=batch_size,
        stage_row_budget=normalized_stage_row_budget,
        stage_byte_budget=normalized_stage_byte_budget,
        worker=worker,
        report=report,
    )
    return report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Refresh the RAG warehouse from current downloaded release sources."
    )
    parser.add_argument("--run-id", required=True, help="Checkpoint run id for resumable refresh.")
    parser.add_argument(
        "--corpus-id",
        dest="corpus_ids",
        action="append",
        type=int,
        default=None,
    )
    parser.add_argument(
        "--corpus-ids-file",
        dest="corpus_ids_file",
        type=Path,
        default=None,
        help="Optional newline-delimited corpus-id file.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help=(
            "Optional refresh target limit. With explicit corpus ids, limits the "
            "targeted corpus rows. Without explicit corpus ids, runs source-driven "
            "S2 refresh and stops after this many supported non-existing papers."
        ),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Parsed-paper batch size per staged write.",
    )
    parser.add_argument(
        "--stage-row-budget",
        type=int,
        default=DEFAULT_STAGE_ROW_BUDGET,
        help=(
            "Approximate maximum canonical warehouse rows per staged write batch. "
            "Use 0 to disable row-budget flushing."
        ),
    )
    parser.add_argument(
        "--stage-byte-budget",
        type=int,
        default=None,
        help=(
            "Approximate maximum estimated canonical payload bytes per staged write batch. "
            "Use 0 to disable byte-budget flushing."
        ),
    )
    parser.add_argument("--chunk-backfill-batch-size", type=int, default=250)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--embedding-model", default=None)
    parser.add_argument("--refresh-existing", action="store_true")
    parser.add_argument(
        "--metadata-abstract-only",
        action="store_true",
        help=(
            "For explicit targeted refreshes, treat metadata abstracts as the terminal "
            "ingest source for papers that have them instead of continuing to S2/BioC fulltext "
            "discovery in the same run."
        ),
    )
    parser.add_argument("--reset-run", action="store_true")
    parser.add_argument("--worker-count", type=int, default=1)
    parser.add_argument("--worker-index", type=int, default=0)
    parser.add_argument("--max-s2-shards", type=int, default=None)
    parser.add_argument("--skip-s2-primary", action="store_true")
    parser.add_argument("--max-bioc-archives", type=int, default=None)
    parser.add_argument("--skip-bioc-fallback", action="store_true")
    parser.add_argument(
        "--refresh-source-locators",
        action="store_true",
        help=(
            "For explicit targeted refreshes, refresh source-unit locators "
            "inline before the warehouse run so targeted corpus ids can route "
            "through sidecar shard/archive locators."
        ),
    )
    parser.add_argument(
        "--reset-source-locators",
        action="store_true",
        help="Reset touched source locator sidecars before inline locator refresh.",
    )
    parser.add_argument("--seed-chunk-version", action="store_true")
    parser.add_argument("--backfill-chunks", action="store_true")
    parser.add_argument("--inspect-quality", action="store_true")
    parser.add_argument(
        "--checkpoint-root",
        type=Path,
        default=None,
        help="Optional checkpoint root directory override.",
    )
    parser.add_argument(
        "--report-path",
        type=Path,
        default=None,
        help="Optional JSON output path for the refresh report.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = resolve_corpus_ids(
        corpus_ids=args.corpus_ids,
        corpus_ids_file=args.corpus_ids_file,
    )
    try:
        report = run_rag_refresh(
            parser_version=args.parser_version,
            run_id=args.run_id,
            corpus_ids=corpus_ids or None,
            limit=args.limit,
            batch_size=args.batch_size,
            stage_row_budget=args.stage_row_budget,
            stage_byte_budget=args.stage_byte_budget,
            refresh_existing=args.refresh_existing,
            metadata_abstract_only=args.metadata_abstract_only,
            max_s2_shards=args.max_s2_shards,
            skip_s2_primary=args.skip_s2_primary,
            max_bioc_archives=args.max_bioc_archives,
            skip_bioc_fallback=args.skip_bioc_fallback,
            refresh_source_locators=args.refresh_source_locators,
            reset_source_locators=args.reset_source_locators,
            seed_chunk_version=args.seed_chunk_version,
            backfill_chunks=args.backfill_chunks,
            inspect_quality=args.inspect_quality,
            chunk_backfill_batch_size=args.chunk_backfill_batch_size,
            embedding_model=args.embedding_model,
            reset_run=args.reset_run,
            checkpoint_root=args.checkpoint_root,
            worker_count=args.worker_count,
            worker_index=args.worker_index,
        )
        if args.report_path is not None:
            _write_report(args.report_path, report=report)
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
