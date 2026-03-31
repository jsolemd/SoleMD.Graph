"""Operational refresh for release-sidecar source locators."""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

from pydantic import Field

from app import db
from app.config import settings
from app.rag_ingest.bioc_archive_scan import iter_bioc_archive_document_ids
from app.rag.corpus_resolution import PostgresBioCCorpusResolver, normalize_bioc_document_id
from app.rag_ingest.orchestrator import PostgresTargetCorpusLoader
from app.rag_ingest.orchestrator_units import RagRefreshSourceKind
from app.rag.parse_contract import ParseContractModel, ParseSourceSystem
from app.rag_ingest.source_locator import (
    RagSourceLocatorEntry,
    SidecarRagSourceLocatorRepository,
    locator_sidecar_path,
)
from app.rag_ingest.source_locator_checkpoint import (
    RagSourceLocatorCheckpointState,
    RagSourceLocatorProgress,
    checkpoint_paths as source_locator_checkpoint_paths,
    load_checkpoint_state,
    reset_checkpoint_state,
    save_checkpoint_state,
)
DEFAULT_PROGRESS_INTERVAL = 1_000
DEFAULT_RUN_ID = "rag-source-locator-refresh"


class RagSourceLocatorRefreshStageReport(ParseContractModel):
    source_system: ParseSourceSystem
    scanned_units: list[str] = Field(default_factory=list)
    completed_units: list[str] = Field(default_factory=list)
    scanned_documents: int = 0
    located_corpus_ids: list[int] = Field(default_factory=list)
    written_entries: int = 0


class RagSourceLocatorRefreshReport(ParseContractModel):
    run_id: str = DEFAULT_RUN_ID
    checkpoint_dir: str | None = None
    resumed_from_checkpoint: bool = False
    requested_corpus_ids: list[int] = Field(default_factory=list)
    s2_stage: RagSourceLocatorRefreshStageReport
    bioc_stage: RagSourceLocatorRefreshStageReport


def _unique_ints(values: list[int] | None) -> list[int]:
    return [] if not values else list(dict.fromkeys(int(value) for value in values))


def _load_corpus_ids_file(path: Path) -> list[int]:
    values: list[int] = []
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        values.append(int(stripped))
    return _unique_ints(values)


def _write_report(path: Path, *, report: RagSourceLocatorRefreshReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report.model_dump_json(indent=2))


def _iter_s2_rows(shard_path: Path):
    with gzip.open(shard_path, "rt") as handle:
        for line in handle:
            yield json.loads(line)


def _iter_bioc_documents(archive_path: Path):
    for document_id, member_name, _ in iter_bioc_archive_document_ids(archive_path):
        yield document_id, member_name


def _validate_checkpoint_state(
    *,
    state: RagSourceLocatorCheckpointState,
    requested_corpus_ids: list[int],
    limit: int | None,
    max_s2_shards: int | None,
    max_bioc_archives: int | None,
    skip_s2: bool,
    skip_bioc: bool,
) -> None:
    if list(state.requested_corpus_ids) != requested_corpus_ids:
        raise ValueError("checkpoint requested corpus ids do not match requested locator refresh")
    if state.limit != limit:
        raise ValueError("checkpoint limit does not match requested locator refresh")
    if state.max_s2_shards != max_s2_shards:
        raise ValueError("checkpoint max_s2_shards does not match requested locator refresh")
    if state.max_bioc_archives != max_bioc_archives:
        raise ValueError("checkpoint max_bioc_archives does not match requested locator refresh")
    if state.skip_s2 != skip_s2:
        raise ValueError("checkpoint skip_s2 does not match requested locator refresh")
    if state.skip_bioc != skip_bioc:
        raise ValueError("checkpoint skip_bioc does not match requested locator refresh")


def _save_checkpoint(
    *,
    checkpoint_paths,
    report: RagSourceLocatorRefreshReport,
    requested_corpus_ids: list[int],
    limit: int | None,
    max_s2_shards: int | None,
    max_bioc_archives: int | None,
    skip_s2: bool,
    skip_bioc: bool,
    s2_progress: RagSourceLocatorProgress,
    bioc_progress: RagSourceLocatorProgress,
) -> None:
    save_checkpoint_state(
        checkpoint_paths,
        state=RagSourceLocatorCheckpointState(
            run_id=report.run_id,
            requested_corpus_ids=requested_corpus_ids,
            limit=limit,
            max_s2_shards=max_s2_shards,
            max_bioc_archives=max_bioc_archives,
            skip_s2=skip_s2,
            skip_bioc=skip_bioc,
            s2_progress=s2_progress,
            bioc_progress=bioc_progress,
            report_json=report.model_dump(mode="python"),
        ),
    )


def refresh_rag_source_locator(
    *,
    run_id: str = DEFAULT_RUN_ID,
    corpus_ids: list[int] | None = None,
    limit: int | None = None,
    max_s2_shards: int | None = None,
    max_bioc_archives: int | None = None,
    skip_s2: bool = False,
    skip_bioc: bool = False,
    reset: bool = False,
    reset_run: bool = False,
    checkpoint_root: Path | None = None,
    repository: SidecarRagSourceLocatorRepository | None = None,
) -> RagSourceLocatorRefreshReport:
    target_loader = PostgresTargetCorpusLoader()
    explicit_corpus_ids = _unique_ints(corpus_ids)
    checkpoint = source_locator_checkpoint_paths(run_id, root=checkpoint_root)
    if reset_run:
        reset_checkpoint_state(checkpoint)
    checkpoint_state = load_checkpoint_state(checkpoint)
    target_rows = target_loader.load(
        corpus_ids=explicit_corpus_ids or None,
        limit=limit,
    )
    requested_corpus_ids = [row.corpus_id for row in target_rows]
    requested_set = set(requested_corpus_ids)
    repo = repository or SidecarRagSourceLocatorRepository()

    if checkpoint_state is not None:
        _validate_checkpoint_state(
            state=checkpoint_state,
            requested_corpus_ids=requested_corpus_ids,
            limit=limit,
            max_s2_shards=max_s2_shards,
            max_bioc_archives=max_bioc_archives,
            skip_s2=skip_s2,
            skip_bioc=skip_bioc,
        )

    if reset:
        if not skip_s2:
            s2_path = locator_sidecar_path(
                source_system=ParseSourceSystem.S2ORC_V2,
                source_revision=settings.s2_release_id,
            )
            if s2_path.exists():
                s2_path.unlink()
        if not skip_bioc:
            bioc_path = locator_sidecar_path(
                source_system=ParseSourceSystem.BIOCXML,
                source_revision=settings.pubtator_release_id,
            )
            if bioc_path.exists():
                bioc_path.unlink()

    report = (
        RagSourceLocatorRefreshReport.model_validate(checkpoint_state.report_json)
        if checkpoint_state is not None
        else RagSourceLocatorRefreshReport(
            run_id=run_id,
            checkpoint_dir=str(checkpoint.root),
            requested_corpus_ids=requested_corpus_ids,
            s2_stage=RagSourceLocatorRefreshStageReport(source_system=ParseSourceSystem.S2ORC_V2),
            bioc_stage=RagSourceLocatorRefreshStageReport(source_system=ParseSourceSystem.BIOCXML),
        )
    )
    report.run_id = run_id
    report.checkpoint_dir = str(checkpoint.root)
    report.resumed_from_checkpoint = checkpoint_state is not None
    report.requested_corpus_ids = requested_corpus_ids

    s2_progress = checkpoint_state.s2_progress if checkpoint_state else RagSourceLocatorProgress()
    bioc_progress = (
        checkpoint_state.bioc_progress if checkpoint_state else RagSourceLocatorProgress()
    )

    if not skip_s2:
        existing_s2_lookup = repo.fetch_entries(
            corpus_ids=requested_corpus_ids,
            source_system=ParseSourceSystem.S2ORC_V2,
            source_revision=settings.s2_release_id,
        )
        found_ids = set(report.s2_stage.located_corpus_ids).union(existing_s2_lookup.covered_corpus_ids)
        report.s2_stage.located_corpus_ids = sorted(found_ids)
        missing_s2_ids = requested_set - found_ids
        if not missing_s2_ids:
            _save_checkpoint(
                checkpoint_paths=checkpoint,
                report=report,
                requested_corpus_ids=requested_corpus_ids,
                limit=limit,
                max_s2_shards=max_s2_shards,
                max_bioc_archives=max_bioc_archives,
                skip_s2=skip_s2,
                skip_bioc=skip_bioc,
                s2_progress=s2_progress,
                bioc_progress=bioc_progress,
            )
        shard_paths = sorted(settings.semantic_scholar_s2orc_v2_dir_path.glob("s2orc_v2-*.jsonl.gz"))
        if max_s2_shards is not None:
            shard_paths = shard_paths[:max_s2_shards]
        for shard_path in shard_paths:
            if not missing_s2_ids:
                break
            if shard_path.name in s2_progress.completed_units:
                continue
            if shard_path.name not in report.s2_stage.scanned_units:
                report.s2_stage.scanned_units.append(shard_path.name)
            pending_entries: list[RagSourceLocatorEntry] = []
            saved_ordinal = int(s2_progress.unit_ordinals.get(shard_path.name, 0))
            for row_index, row in enumerate(_iter_s2_rows(shard_path), start=1):
                if row_index <= saved_ordinal:
                    continue
                report.s2_stage.scanned_documents += 1
                corpus_id = int(row["corpusid"])
                if not requested_set or corpus_id in missing_s2_ids:
                    pending_entries.append(
                        RagSourceLocatorEntry(
                            corpus_id=corpus_id,
                            source_system=ParseSourceSystem.S2ORC_V2,
                            source_revision=settings.s2_release_id,
                            source_kind=RagRefreshSourceKind.S2_SHARD,
                            unit_name=shard_path.name,
                            unit_ordinal=row_index,
                            source_document_key=str(corpus_id),
                        )
                    )
                    found_ids.add(corpus_id)
                    missing_s2_ids.discard(corpus_id)
                if row_index % DEFAULT_PROGRESS_INTERVAL == 0:
                    report.s2_stage.written_entries += repo.upsert_entries(pending_entries)
                    pending_entries.clear()
                    s2_progress.unit_ordinals[shard_path.name] = row_index
                    report.s2_stage.located_corpus_ids = sorted(found_ids)
                    _save_checkpoint(
                        checkpoint_paths=checkpoint,
                        report=report,
                        requested_corpus_ids=requested_corpus_ids,
                        limit=limit,
                        max_s2_shards=max_s2_shards,
                        max_bioc_archives=max_bioc_archives,
                        skip_s2=skip_s2,
                        skip_bioc=skip_bioc,
                        s2_progress=s2_progress,
                        bioc_progress=bioc_progress,
                    )
                if requested_set and not missing_s2_ids:
                    break
            report.s2_stage.written_entries += repo.upsert_entries(pending_entries)
            s2_progress.completed_units = sorted({*s2_progress.completed_units, shard_path.name})
            s2_progress.unit_ordinals[shard_path.name] = max(
                saved_ordinal,
                s2_progress.unit_ordinals.get(shard_path.name, 0),
            )
            report.s2_stage.completed_units = list(s2_progress.completed_units)
            report.s2_stage.located_corpus_ids = sorted(found_ids)
            _save_checkpoint(
                checkpoint_paths=checkpoint,
                report=report,
                requested_corpus_ids=requested_corpus_ids,
                limit=limit,
                max_s2_shards=max_s2_shards,
                max_bioc_archives=max_bioc_archives,
                skip_s2=skip_s2,
                skip_bioc=skip_bioc,
                s2_progress=s2_progress,
                bioc_progress=bioc_progress,
            )
            if requested_set and not missing_s2_ids:
                break

    if not skip_bioc:
        existing_bioc_lookup = repo.fetch_entries(
            corpus_ids=requested_corpus_ids,
            source_system=ParseSourceSystem.BIOCXML,
            source_revision=settings.pubtator_release_id,
        )
        found_ids = set(report.bioc_stage.located_corpus_ids).union(existing_bioc_lookup.covered_corpus_ids)
        report.bioc_stage.located_corpus_ids = sorted(found_ids)
        missing_bioc_ids = requested_set - found_ids
        if requested_set:
            resolver_map: dict[tuple[str, str], int] = {}
            for row in target_rows:
                if int(row.corpus_id) not in missing_bioc_ids:
                    continue
                if row.pmid is not None:
                    resolver_map[("pmid", str(int(row.pmid)))] = int(row.corpus_id)
                if row.pmc_id:
                    kind, value = normalize_bioc_document_id(str(row.pmc_id))
                    if value:
                        resolver_map[(kind.value, value)] = int(row.corpus_id)
                if row.doi:
                    kind, value = normalize_bioc_document_id(str(row.doi))
                    if value:
                        resolver_map[(kind.value, value)] = int(row.corpus_id)
            resolve_target = resolver_map.get
            resolver = None
        else:
            resolve_target = None
            resolver = PostgresBioCCorpusResolver()

        if requested_set and not missing_bioc_ids:
            _save_checkpoint(
                checkpoint_paths=checkpoint,
                report=report,
                requested_corpus_ids=requested_corpus_ids,
                limit=limit,
                max_s2_shards=max_s2_shards,
                max_bioc_archives=max_bioc_archives,
                skip_s2=skip_s2,
                skip_bioc=skip_bioc,
                s2_progress=s2_progress,
                bioc_progress=bioc_progress,
            )
        archive_paths = sorted(settings.pubtator_biocxml_dir_path.glob("BioCXML.*.tar.gz"))
        if max_bioc_archives is not None:
            archive_paths = archive_paths[:max_bioc_archives]
        for archive_path in archive_paths:
            if requested_set and not missing_bioc_ids:
                break
            if archive_path.name in bioc_progress.completed_units:
                continue
            if archive_path.name not in report.bioc_stage.scanned_units:
                report.bioc_stage.scanned_units.append(archive_path.name)
            pending_rows: list[tuple[str, int, str, str | None]] = []
            saved_ordinal = int(bioc_progress.unit_ordinals.get(archive_path.name, 0))
            for document_index, (document_id, member_name) in enumerate(
                _iter_bioc_documents(archive_path),
                start=1,
            ):
                if document_index <= saved_ordinal:
                    continue
                report.bioc_stage.scanned_documents += 1
                if document_id:
                    pending_rows.append(
                        (document_id, document_index, archive_path.name, member_name)
                    )
                if len(pending_rows) >= 1_000 or document_index % DEFAULT_PROGRESS_INTERVAL == 0:
                    report.bioc_stage.written_entries += _flush_bioc_locator_batch(
                        pending_rows=pending_rows,
                        repo=repo,
                        source_revision=settings.pubtator_release_id,
                        resolve_target=resolve_target,
                        resolver=resolver,
                        requested_set=missing_bioc_ids if requested_set else requested_set,
                        found_ids=found_ids,
                    )
                    missing_bioc_ids = requested_set - found_ids
                    pending_rows.clear()
                    bioc_progress.unit_ordinals[archive_path.name] = document_index
                    report.bioc_stage.located_corpus_ids = sorted(found_ids)
                    _save_checkpoint(
                        checkpoint_paths=checkpoint,
                        report=report,
                        requested_corpus_ids=requested_corpus_ids,
                        limit=limit,
                        max_s2_shards=max_s2_shards,
                        max_bioc_archives=max_bioc_archives,
                        skip_s2=skip_s2,
                        skip_bioc=skip_bioc,
                        s2_progress=s2_progress,
                        bioc_progress=bioc_progress,
                    )
                if requested_set and not missing_bioc_ids:
                    break
            if pending_rows:
                report.bioc_stage.written_entries += _flush_bioc_locator_batch(
                    pending_rows=pending_rows,
                    repo=repo,
                    source_revision=settings.pubtator_release_id,
                    resolve_target=resolve_target,
                    resolver=resolver,
                    requested_set=missing_bioc_ids if requested_set else requested_set,
                    found_ids=found_ids,
                )
                missing_bioc_ids = requested_set - found_ids
            bioc_progress.completed_units = sorted({*bioc_progress.completed_units, archive_path.name})
            report.bioc_stage.completed_units = list(bioc_progress.completed_units)
            report.bioc_stage.located_corpus_ids = sorted(found_ids)
            _save_checkpoint(
                checkpoint_paths=checkpoint,
                report=report,
                requested_corpus_ids=requested_corpus_ids,
                limit=limit,
                max_s2_shards=max_s2_shards,
                max_bioc_archives=max_bioc_archives,
                skip_s2=skip_s2,
                skip_bioc=skip_bioc,
                s2_progress=s2_progress,
                bioc_progress=bioc_progress,
            )
            if requested_set and not missing_bioc_ids:
                break

    return report


def _flush_bioc_locator_batch(
    *,
    pending_rows: list[tuple[str, int, str, str | None]],
    repo: SidecarRagSourceLocatorRepository,
    source_revision: str,
    resolve_target,
    resolver: PostgresBioCCorpusResolver | None,
    requested_set: set[int],
    found_ids: set[int],
) -> int:
    if not pending_rows:
        return 0
    resolved: dict[str, int]
    if resolve_target is not None:
        resolved = {
            document_id: corpus_id
            for document_id, _, _, _ in pending_rows
            for kind, normalized in [normalize_bioc_document_id(document_id)]
            for corpus_id in [resolve_target((kind.value, normalized))]
            if corpus_id is not None
        }
    else:
        assert resolver is not None
        resolved = resolver.resolve_document_ids(
            [document_id for document_id, _, _, _ in pending_rows]
        )

    entries: list[RagSourceLocatorEntry] = []
    for document_id, document_index, archive_name, member_name in pending_rows:
        corpus_id = resolved.get(document_id)
        if corpus_id is None:
            continue
        if requested_set and corpus_id not in requested_set:
            continue
        entries.append(
            RagSourceLocatorEntry(
                corpus_id=corpus_id,
                source_system=ParseSourceSystem.BIOCXML,
                source_revision=source_revision,
                source_kind=RagRefreshSourceKind.BIOC_ARCHIVE,
                unit_name=archive_name,
                unit_ordinal=document_index,
                source_document_key=document_id,
                member_name=member_name,
            )
        )
        found_ids.add(corpus_id)
    return repo.upsert_entries(entries)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build or refresh release-sidecar source locators for targeted RAG refreshes."
    )
    parser.add_argument("--run-id", default=DEFAULT_RUN_ID)
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-s2-shards", type=int, default=None)
    parser.add_argument("--max-bioc-archives", type=int, default=None)
    parser.add_argument("--skip-s2", action="store_true")
    parser.add_argument("--skip-bioc", action="store_true")
    parser.add_argument("--reset", action="store_true")
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
        report = refresh_rag_source_locator(
            run_id=args.run_id,
            corpus_ids=corpus_ids or None,
            limit=args.limit,
            max_s2_shards=args.max_s2_shards,
            max_bioc_archives=args.max_bioc_archives,
            skip_s2=args.skip_s2,
            skip_bioc=args.skip_bioc,
            reset=args.reset,
            reset_run=args.reset_run,
            checkpoint_root=args.checkpoint_root,
        )
        if args.report_path is not None:
            _write_report(args.report_path, report=report)
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
