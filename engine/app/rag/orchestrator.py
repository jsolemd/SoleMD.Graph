"""Rerunnable warehouse refresh orchestrator over current downloaded raw data."""

from __future__ import annotations

import argparse
import gzip
import json
import tarfile
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.config import settings
from app.rag.chunk_seed import RagChunkSeeder
from app.rag.corpus_resolution import normalize_bioc_document_id
from app.rag.orchestrator_checkpoint import (
    RagRefreshCheckpointState,
    checkpoint_paths as rag_refresh_checkpoint_paths,
    load_checkpoint_state,
    reset_checkpoint_state,
    save_checkpoint_state,
)
from app.rag.parse_contract import ParseContractModel
from app.rag.source_parsers import (
    extract_biocxml_document_id,
    parse_biocxml_document,
    parse_s2orc_row,
)
from app.rag.warehouse_writer import RagWarehouseBulkIngestResult, RagWarehouseWriter
from db.scripts.backfill_chunks import run_chunk_backfill


class RagTargetCorpusRow(ParseContractModel):
    corpus_id: int
    pmid: int | None = None
    pmc_id: str | None = None
    doi: str | None = None


class RagSourceStageReport(ParseContractModel):
    stage_name: str
    completed_units: list[str] = Field(default_factory=list)
    discovered_papers: int = 0
    ingested_papers: int = 0
    ingested_corpus_ids: list[int] = Field(default_factory=list)
    skipped_existing_papers: int = 0
    batch_total_rows: int = 0
    written_rows: int = 0
    deferred_stage_names: list[str] = Field(default_factory=list)


class RagRefreshReport(ParseContractModel):
    run_id: str
    parser_version: str
    refresh_existing: bool = False
    requested_corpus_ids: list[int] = Field(default_factory=list)
    target_corpus_ids: list[int] = Field(default_factory=list)
    s2_stage: RagSourceStageReport
    bioc_fallback_stage: RagSourceStageReport
    chunk_seed: dict[str, object] | None = None
    chunk_backfill: dict[str, object] | None = None
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


_TARGET_CORPUS_SQL = """
SELECT corpus_id, pmid, pmc_id, doi
FROM solemd.corpus
{where_clause}
ORDER BY corpus_id
{limit_clause}
"""


class PostgresTargetCorpusLoader:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load(
        self,
        *,
        corpus_ids: list[int] | None,
        limit: int | None,
    ) -> list[RagTargetCorpusRow]:
        where_clause = ""
        params: list[object] = []
        if corpus_ids:
            where_clause = "WHERE corpus_id = ANY(%s)"
            params.append(corpus_ids)
        limit_clause = ""
        if limit is not None and limit > 0:
            limit_clause = "LIMIT %s"
            params.append(limit)
        sql = _TARGET_CORPUS_SQL.format(
            where_clause=where_clause,
            limit_clause=limit_clause,
        )
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            return [RagTargetCorpusRow.model_validate(row) for row in cur.fetchall()]


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
        paths = sorted(settings.semantic_scholar_raw_s2orc_v2_dir_path.glob("s2orc_v2-*.jsonl.gz"))
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
                yield extract_biocxml_document_id(xml_text), xml_text


def _unique_ints(values: list[int] | None) -> list[int]:
    return [] if not values else list(dict.fromkeys(int(value) for value in values))


def _source_revision_keys() -> list[str]:
    return [
        f"s2orc_v2:{settings.s2_release_id or 'raw'}",
        f"biocxml:{settings.pubtator_release_id or 'raw'}",
    ]


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


def _flush_source_groups(
    *,
    writer: RagWarehouseWriter,
    source_groups,
    stage_report: RagSourceStageReport,
) -> None:
    if not source_groups:
        return
    result: RagWarehouseBulkIngestResult = writer.ingest_source_groups(source_groups)
    stage_report.ingested_papers += len(result.papers)
    stage_report.batch_total_rows += result.batch_total_rows
    stage_report.written_rows += result.written_rows
    stage_report.deferred_stage_names = sorted(
        set(stage_report.deferred_stage_names).union(result.deferred_stage_names)
    )
    source_groups.clear()


def _validate_checkpoint_state(
    *,
    state: RagRefreshCheckpointState,
    parser_version: str,
    refresh_existing: bool,
    explicit_corpus_ids: list[int],
    limit: int | None,
) -> None:
    if state.parser_version != parser_version:
        raise ValueError("checkpoint run parser_version does not match requested parser_version")
    if state.refresh_existing != refresh_existing:
        raise ValueError("checkpoint run refresh_existing does not match requested refresh_existing")
    if list(state.explicit_corpus_ids) != explicit_corpus_ids:
        raise ValueError("checkpoint run explicit corpus ids do not match requested corpus ids")
    if state.limit != limit:
        raise ValueError("checkpoint run limit does not match requested limit")


def run_rag_refresh(
    *,
    parser_version: str,
    run_id: str,
    corpus_ids: list[int] | None = None,
    limit: int | None = None,
    batch_size: int = 100,
    refresh_existing: bool = False,
    max_s2_shards: int | None = None,
    max_bioc_archives: int | None = None,
    skip_bioc_fallback: bool = False,
    seed_chunk_version: bool = False,
    backfill_chunks: bool = False,
    chunk_backfill_batch_size: int = 250,
    embedding_model: str | None = None,
    reset_run: bool = False,
    checkpoint_root: Path | None = None,
    target_loader: TargetCorpusLoader | None = None,
    existing_loader: ExistingDocumentLoader | None = None,
    s2_reader: S2ShardReader | None = None,
    bioc_reader: BioCArchiveReader | None = None,
    writer: RagWarehouseWriter | None = None,
    chunk_backfill_runner: ChunkBackfillCallable | None = None,
) -> RagRefreshReport:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    if chunk_backfill_batch_size <= 0:
        raise ValueError("chunk_backfill_batch_size must be positive")

    normalized_explicit_ids = _unique_ints(corpus_ids)
    checkpoint_paths = rag_refresh_checkpoint_paths(run_id, root=checkpoint_root)
    if reset_run:
        reset_checkpoint_state(checkpoint_paths)
    checkpoint_state = load_checkpoint_state(checkpoint_paths)
    resumed_from_checkpoint = checkpoint_state is not None
    if checkpoint_state is not None:
        _validate_checkpoint_state(
            state=checkpoint_state,
            parser_version=parser_version,
            refresh_existing=refresh_existing,
            explicit_corpus_ids=normalized_explicit_ids,
            limit=limit,
        )

    target_rows = (target_loader or PostgresTargetCorpusLoader()).load(
        corpus_ids=normalized_explicit_ids or None,
        limit=limit,
    )
    target_corpus_ids = [row.corpus_id for row in target_rows]
    existing_ids = set()
    if not refresh_existing:
        existing_ids = (existing_loader or PostgresExistingDocumentLoader()).load_existing(
            corpus_ids=target_corpus_ids
        )

    active_writer = writer or RagWarehouseWriter()
    active_s2_reader = s2_reader or LocalS2ShardReader()
    active_bioc_reader = bioc_reader or LocalBioCArchiveReader()
    active_chunk_backfill = chunk_backfill_runner or run_chunk_backfill

    report = (
        RagRefreshReport.model_validate(checkpoint_state.report_json)
        if checkpoint_state is not None
        else RagRefreshReport(
            run_id=run_id,
            parser_version=parser_version,
            refresh_existing=refresh_existing,
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
    report.s2_stage.skipped_existing_papers = len(existing_ids)

    pending_primary_ids = set(target_corpus_ids)
    if not refresh_existing:
        pending_primary_ids -= existing_ids

    completed_s2 = set(checkpoint_state.completed_s2_shards if checkpoint_state else [])
    s2_source_groups: list[list[object]] = []
    s2_ingested_ids: set[int] = set()
    for shard_path in active_s2_reader.shard_paths(max_shards=max_s2_shards):
        if shard_path.name in completed_s2:
            continue
        for row in active_s2_reader.iter_rows(shard_path):
            corpus_id = int(row["corpusid"])
            if corpus_id not in pending_primary_ids:
                continue
            parsed = parse_s2orc_row(
                row,
                source_revision=settings.s2_release_id or "raw",
                parser_version=parser_version,
            )
            report.s2_stage.discovered_papers += 1
            s2_source_groups.append([parsed])
            s2_ingested_ids.add(corpus_id)
            report.s2_stage.ingested_corpus_ids = sorted(s2_ingested_ids)
            if len(s2_source_groups) >= batch_size:
                _flush_source_groups(
                    writer=active_writer,
                    source_groups=s2_source_groups,
                    stage_report=report.s2_stage,
                )
        _flush_source_groups(
            writer=active_writer,
            source_groups=s2_source_groups,
            stage_report=report.s2_stage,
        )
        completed_s2.add(shard_path.name)
        report.s2_stage.completed_units = sorted(completed_s2)
        save_checkpoint_state(
            checkpoint_paths,
            state=RagRefreshCheckpointState(
                run_id=run_id,
                parser_version=parser_version,
                refresh_existing=refresh_existing,
                explicit_corpus_ids=normalized_explicit_ids,
                limit=limit,
                completed_s2_shards=sorted(completed_s2),
                completed_bioc_archives=sorted(
                    checkpoint_state.completed_bioc_archives if checkpoint_state else []
                ),
                report_json=report.model_dump(mode="python"),
            ),
        )

    pending_bioc_ids = pending_primary_ids - set(report.s2_stage.ingested_corpus_ids)

    if not skip_bioc_fallback and pending_bioc_ids:
        bioc_map = _build_bioc_resolution_map(
            [row for row in target_rows if row.corpus_id in pending_bioc_ids]
        )
        completed_bioc = set(checkpoint_state.completed_bioc_archives if checkpoint_state else [])
        bioc_source_groups: list[list[object]] = []
        ingested_bioc_ids: set[int] = set()
        for archive_path in active_bioc_reader.archive_paths(max_archives=max_bioc_archives):
            if archive_path.name in completed_bioc:
                continue
            for document_id, xml_text in active_bioc_reader.iter_documents(archive_path):
                kind, normalized_value = normalize_bioc_document_id(document_id)
                corpus_id = bioc_map.get((kind.value, normalized_value))
                if corpus_id is None or corpus_id not in pending_bioc_ids or corpus_id in ingested_bioc_ids:
                    continue
                parsed = parse_biocxml_document(
                    xml_text,
                    source_revision=settings.pubtator_release_id or "raw",
                    parser_version=parser_version,
                    corpus_id=corpus_id,
                )
                report.bioc_fallback_stage.discovered_papers += 1
                bioc_source_groups.append([parsed])
                ingested_bioc_ids.add(corpus_id)
                report.bioc_fallback_stage.ingested_corpus_ids = sorted(ingested_bioc_ids)
                if len(bioc_source_groups) >= batch_size:
                    _flush_source_groups(
                        writer=active_writer,
                        source_groups=bioc_source_groups,
                        stage_report=report.bioc_fallback_stage,
                    )
            _flush_source_groups(
                writer=active_writer,
                source_groups=bioc_source_groups,
                stage_report=report.bioc_fallback_stage,
            )
            completed_bioc.add(archive_path.name)
            report.bioc_fallback_stage.completed_units = sorted(completed_bioc)
            save_checkpoint_state(
                checkpoint_paths,
                state=RagRefreshCheckpointState(
                    run_id=run_id,
                    parser_version=parser_version,
                    refresh_existing=refresh_existing,
                    explicit_corpus_ids=normalized_explicit_ids,
                    limit=limit,
                    completed_s2_shards=sorted(completed_s2),
                    completed_bioc_archives=sorted(completed_bioc),
                    report_json=report.model_dump(mode="python"),
                ),
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
        ).model_dump(mode="python")

    save_checkpoint_state(
        checkpoint_paths,
        state=RagRefreshCheckpointState(
            run_id=run_id,
            parser_version=parser_version,
            refresh_existing=refresh_existing,
            explicit_corpus_ids=normalized_explicit_ids,
            limit=limit,
            completed_s2_shards=sorted(completed_s2),
            completed_bioc_archives=sorted(
                checkpoint_state.completed_bioc_archives if checkpoint_state else []
            )
            if skip_bioc_fallback
            else sorted(completed_bioc if 'completed_bioc' in locals() else []),
            report_json=report.model_dump(mode="python"),
        ),
    )
    return report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refresh the RAG warehouse from current raw downloads.")
    parser.add_argument("--run-id", required=True, help="Checkpoint run id for resumable refresh.")
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--limit", type=int, default=None, help="Optional limit over target corpus rows.")
    parser.add_argument("--batch-size", type=int, default=100, help="Parsed-paper batch size per staged write.")
    parser.add_argument("--chunk-backfill-batch-size", type=int, default=250)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--embedding-model", default=None)
    parser.add_argument("--refresh-existing", action="store_true")
    parser.add_argument("--reset-run", action="store_true")
    parser.add_argument("--max-s2-shards", type=int, default=None)
    parser.add_argument("--max-bioc-archives", type=int, default=None)
    parser.add_argument("--skip-bioc-fallback", action="store_true")
    parser.add_argument("--seed-chunk-version", action="store_true")
    parser.add_argument("--backfill-chunks", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = run_rag_refresh(
            parser_version=args.parser_version,
            run_id=args.run_id,
            corpus_ids=args.corpus_ids,
            limit=args.limit,
            batch_size=args.batch_size,
            refresh_existing=args.refresh_existing,
            max_s2_shards=args.max_s2_shards,
            max_bioc_archives=args.max_bioc_archives,
            skip_bioc_fallback=args.skip_bioc_fallback,
            seed_chunk_version=args.seed_chunk_version,
            backfill_chunks=args.backfill_chunks,
            chunk_backfill_batch_size=args.chunk_backfill_batch_size,
            embedding_model=args.embedding_model,
            reset_run=args.reset_run,
        )
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
