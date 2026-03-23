"""Ingest domain-domain citation edges from the Semantic Scholar bulk citations dataset.

This path is meant to become the canonical graph-edge source. It is separate from
`references.py` on purpose:

- `references.py` keeps a richer per-paper bibliography snapshot from the batch API
- `citations.py` loads the scalable domain-domain edge layer with contexts,
  intents, and influence flags from the bulk dataset

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.citations --dry-run
    uv run python -m app.corpus.citations --release-id 2026-03-10
    uv run python -m app.corpus.citations --release-id 2026-03-10 --limit-shards 4 --dry-run
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from dataclasses import dataclass
from itertools import islice
import json
import os
from pathlib import Path
import sys
import tempfile
import time

import duckdb

from app import db
from app.corpus._etl import log_etl_run, sql_string_literal
from app.config import settings

try:
    from data.release_storage import read_release_manifest
    from data.release_storage import semantic_scholar_manifest_path
except ModuleNotFoundError:
    project_root = Path(__file__).resolve().parents[3]
    if str(project_root) not in sys.path:
        sys.path.append(str(project_root))
    from data.release_storage import read_release_manifest
    from data.release_storage import semantic_scholar_manifest_path


@dataclass(frozen=True, slots=True)
class CitationIngestSummary:
    release_id: str
    shards_scanned: int
    batches_processed: int
    shards_per_batch: int
    total_candidate_edges: int | None
    total_domain_edges: int
    loaded_edges: int
    staging_bytes: int
    elapsed_seconds: float


@dataclass(frozen=True, slots=True)
class CitationBatchStage:
    csv_path: Path
    shards_scanned: int
    total_candidate_edges: int | None
    total_domain_edges: int


_CITATION_COLUMNS = {
    "citationid": "BIGINT",
    "citingcorpusid": "BIGINT",
    "citedcorpusid": "BIGINT",
    "contexts": "VARCHAR[]",
    "intents": "VARCHAR[][]",
    "isinfluential": "BOOLEAN",
}


def _citations_shards(release_id: str, limit_shards: int = 0) -> list[Path]:
    root = settings.semantic_scholar_dataset_path("citations", release_id)
    shards = sorted(root.glob("*.jsonl.gz"))
    manifest_path = semantic_scholar_manifest_path(release_id, "citations")
    if manifest_path.exists():
        manifest = read_release_manifest(manifest_path)
        if manifest.release_id != release_id:
            raise RuntimeError(
                f"citations manifest release mismatch: expected {release_id}, "
                f"found {manifest.release_id}"
            )
        expected_files = {entry.name for entry in manifest.files if entry.verified}
        present_files = {path.name for path in shards}
        missing = sorted(expected_files - present_files)
        if missing:
            raise RuntimeError(
                f"citations release {release_id} is incomplete: missing {len(missing)} verified shards"
            )
    if limit_shards > 0:
        return shards[:limit_shards]
    return shards


def _temp_path(prefix: str, suffix: str) -> Path:
    temp_root = settings.graph_tmp_root_path / "citations"
    temp_root.mkdir(parents=True, exist_ok=True)
    fd, path_str = tempfile.mkstemp(prefix=prefix, suffix=suffix, dir=temp_root)
    os.close(fd)
    path = Path(path_str)
    path.unlink(missing_ok=True)
    return path


def _write_domain_ids_csv() -> Path:
    path = _temp_path("solemd_domain_ids_", ".csv")
    with db.pooled() as conn, conn.cursor() as cur:
        with path.open("wb") as handle:
            with cur.copy(
                """
                COPY (
                    SELECT corpus_id
                    FROM solemd.corpus
                    ORDER BY corpus_id
                ) TO STDOUT WITH (FORMAT CSV, HEADER TRUE)
                """
            ) as copy:
                for chunk in copy:
                    handle.write(bytes(chunk))
    return path


def _citation_scan_expr(shards: list[Path]) -> str:
    shard_sql = ", ".join(sql_string_literal(str(shard)) for shard in shards)
    column_sql = ", ".join(f"{name}: '{dtype}'" for name, dtype in _CITATION_COLUMNS.items())
    return (
        f"read_json([{shard_sql}], "
        "format='newline_delimited', compression='gzip', "
        f"columns={{{column_sql}}})"
    )


def _duckdb_connection() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    threads = max(1, min(os.cpu_count() or 4, 8))
    con.execute(f"PRAGMA threads={threads}")
    con.execute("SET preserve_insertion_order=false")
    con.execute(f"SET memory_limit='{settings.duckdb_memory_limit}'")
    temp_directory = settings.graph_tmp_root_path / "duckdb"
    temp_directory.mkdir(parents=True, exist_ok=True)
    con.execute(f"SET temp_directory={sql_string_literal(str(temp_directory))}")
    return con


def _chunked_paths(paths: list[Path], batch_size: int) -> list[list[Path]]:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    iterator = iter(paths)
    batches: list[list[Path]] = []
    while batch := list(islice(iterator, batch_size)):
        batches.append(batch)
    return batches


def _prepare_domain_ids(con: duckdb.DuckDBPyConnection, domain_ids_csv: Path) -> None:
    con.execute(
        """
        CREATE TEMP TABLE domain_ids AS
        SELECT CAST(corpus_id AS BIGINT) AS corpus_id
        FROM read_csv_auto(?, header=true)
        """,
        [str(domain_ids_csv)],
    )


def _domain_citations_select(scan_expr: str) -> str:
    return f"""
        WITH raw_domain_citations AS (
            SELECT
                CAST(c.citationid AS BIGINT) AS citation_id,
                CAST(c.citingcorpusid AS BIGINT) AS citing_corpus_id,
                CAST(c.citedcorpusid AS BIGINT) AS cited_corpus_id,
                COALESCE(c.contexts, []::VARCHAR[]) AS contexts,
                COALESCE(c.intents, []::VARCHAR[][]) AS intents,
                COALESCE(CAST(c.isinfluential AS BOOLEAN), FALSE) AS is_influential
            FROM {scan_expr} c
            JOIN domain_ids citing ON citing.corpus_id = c.citingcorpusid
            JOIN domain_ids cited ON cited.corpus_id = c.citedcorpusid
            WHERE c.citingcorpusid IS NOT NULL
              AND c.citedcorpusid IS NOT NULL
              AND c.citingcorpusid != c.citedcorpusid
        )
        SELECT
            MIN(citation_id) AS citation_id,
            citing_corpus_id,
            cited_corpus_id,
            CAST(to_json(list_sort(list_distinct(flatten(list(contexts))))) AS VARCHAR) AS contexts_json,
            CAST(to_json(list_sort(list_distinct(flatten(list(intents))))) AS VARCHAR) AS intents_json,
            bool_or(is_influential) AS is_influential,
            array_length(list_distinct(flatten(list(contexts)))) AS context_count
        FROM raw_domain_citations
        GROUP BY citing_corpus_id, cited_corpus_id
    """


def _materialize_domain_citation_batch(
    con: duckdb.DuckDBPyConnection,
    *,
    shards: list[Path],
    include_candidate_count: bool = False,
) -> CitationBatchStage:
    stage_csv = _temp_path("solemd_bulk_citations_", ".csv")
    if not shards:
        stage_csv.touch()
        return CitationBatchStage(
            csv_path=stage_csv,
            shards_scanned=0,
            total_candidate_edges=0 if include_candidate_count else None,
            total_domain_edges=0,
        )

    scan_expr = _citation_scan_expr(shards)
    if include_candidate_count:
        total_candidate_edges = int(con.execute(f"SELECT count(*) FROM {scan_expr}").fetchone()[0])
    else:
        total_candidate_edges = None

    domain_select = _domain_citations_select(scan_expr)
    total_domain_edges = int(
        con.execute(f"SELECT count(*) FROM ({domain_select}) domain_citations").fetchone()[0]
    )

    if total_domain_edges > 0:
        con.execute(
            """
            COPY (
                SELECT
                    citing_corpus_id,
                    cited_corpus_id,
                    citation_id,
                    contexts_json,
                    intents_json,
                    is_influential,
                    context_count
                FROM (
            """
            + domain_select
            + """
                ) domain_citations
            ) TO ? (HEADER FALSE, DELIMITER ',')
            """,
            [str(stage_csv)],
        )
    else:
        stage_csv.touch()

    return CitationBatchStage(
        csv_path=stage_csv,
        shards_scanned=len(shards),
        total_candidate_edges=total_candidate_edges,
        total_domain_edges=total_domain_edges,
    )


def _create_bulk_citation_stage_table(cur) -> None:
    cur.execute(
        """
        CREATE TEMP TABLE stg_bulk_citations (
            citing_corpus_id BIGINT NOT NULL,
            cited_corpus_id BIGINT NOT NULL,
            citation_id BIGINT,
            contexts_json JSONB NOT NULL,
            intents_json JSONB NOT NULL,
            is_influential BOOLEAN,
            context_count INTEGER NOT NULL
        ) ON COMMIT DROP
        """
    )


def _copy_stage_csv_into_postgres(cur, csv_path: Path) -> None:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return

    with cur.copy(
        """
        COPY stg_bulk_citations (
            citing_corpus_id,
            cited_corpus_id,
            citation_id,
            contexts_json,
            intents_json,
            is_influential,
            context_count
        )
        FROM STDIN WITH (FORMAT CSV, HEADER FALSE)
        """
    ) as copy:
        with csv_path.open("r", encoding="utf-8") as handle:
            while chunk := handle.read(1024 * 1024):
                copy.write(chunk)


def _upsert_bulk_citations(cur, *, release_id: str) -> None:
    cur.execute(
        """
        INSERT INTO solemd.citations (
            citing_corpus_id,
            cited_corpus_id,
            cited_paper_id,
            citation_id,
            contexts,
            intents,
            is_influential,
            context_count,
            source,
            source_release_id,
            updated_at
        )
        SELECT
            s.citing_corpus_id,
            s.cited_corpus_id,
            NULL,
            s.citation_id,
            s.contexts_json,
            s.intents_json,
            s.is_influential,
            s.context_count,
            'semantic_scholar_citations_bulk',
            %s,
            now()
        FROM stg_bulk_citations s
        ON CONFLICT (citing_corpus_id, cited_corpus_id)
        DO UPDATE
        SET citation_id = EXCLUDED.citation_id,
            contexts = EXCLUDED.contexts,
            intents = EXCLUDED.intents,
            is_influential = EXCLUDED.is_influential,
            context_count = EXCLUDED.context_count,
            source = EXCLUDED.source,
            source_release_id = EXCLUDED.source_release_id,
            updated_at = now()
        """,
        (release_id,),
    )


def _cleanup_stale_bulk_citations(cur, *, release_id: str) -> None:
    cur.execute(
        """
        DELETE FROM solemd.citations
        WHERE source = 'semantic_scholar_citations_bulk'
          AND source_release_id IS DISTINCT FROM %s
        """,
        (release_id,),
    )
    cur.execute("ANALYZE solemd.citations")


def _batch_metadata(*, shard_batch: list[Path], stage: CitationBatchStage) -> dict:
    return {
        "shard_names": [path.name for path in shard_batch],
        "shard_paths": [str(path) for path in shard_batch],
        "shards_scanned": stage.shards_scanned,
        "total_candidate_edges": stage.total_candidate_edges,
        "total_domain_edges": stage.total_domain_edges,
        "loaded_edges": stage.total_domain_edges,
        "staging_bytes": stage.csv_path.stat().st_size if stage.csv_path.exists() else 0,
    }


def _load_completed_batches(release_id: str) -> dict[int, dict]:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                batch_index,
                shards_scanned,
                total_candidate_edges,
                total_domain_edges,
                loaded_edges,
                staging_bytes,
                metadata
            FROM solemd.bulk_citation_ingest_batches
            WHERE release_id = %s
              AND status = 'completed'
            ORDER BY batch_index
            """,
            (release_id,),
        )
        return {int(row["batch_index"]): dict(row) for row in cur.fetchall()}


def _summary_from_completed_batches(
    *,
    release_id: str,
    completed_batches: dict[int, dict],
    shards_scanned: int,
    shards_per_batch: int,
    started: float,
    total_candidate_edges: int | None,
) -> CitationIngestSummary:
    return CitationIngestSummary(
        release_id=release_id,
        shards_scanned=shards_scanned,
        batches_processed=len(completed_batches),
        shards_per_batch=shards_per_batch,
        total_candidate_edges=total_candidate_edges,
        total_domain_edges=sum(int(batch["total_domain_edges"]) for batch in completed_batches.values()),
        loaded_edges=sum(int(batch["loaded_edges"]) for batch in completed_batches.values()),
        staging_bytes=sum(int(batch["staging_bytes"]) for batch in completed_batches.values()),
        elapsed_seconds=round(time.monotonic() - started, 1),
    )


def _record_batch_started(cur, *, release_id: str, batch_index: int, shard_batch: list[Path]) -> None:
    metadata = {
        "shard_names": [path.name for path in shard_batch],
        "shard_paths": [str(path) for path in shard_batch],
    }
    cur.execute(
        """
        INSERT INTO solemd.bulk_citation_ingest_batches (
            release_id,
            batch_index,
            shard_names,
            shards_scanned,
            status,
            started_at,
            completed_at,
            error_message,
            metadata
        )
        VALUES (%s, %s, %s::jsonb, %s, 'running', now(), NULL, NULL, %s::jsonb)
        ON CONFLICT (release_id, batch_index)
        DO UPDATE
        SET shard_names = EXCLUDED.shard_names,
            shards_scanned = EXCLUDED.shards_scanned,
            status = 'running',
            started_at = now(),
            completed_at = NULL,
            error_message = NULL,
            metadata = EXCLUDED.metadata
        """,
        (
            release_id,
            batch_index,
            json.dumps(metadata["shard_names"]),
            len(shard_batch),
            json.dumps(metadata),
        ),
    )


def _record_batch_completed(
    cur,
    *,
    release_id: str,
    batch_index: int,
    shard_batch: list[Path],
    stage: CitationBatchStage,
) -> None:
    metadata = _batch_metadata(shard_batch=shard_batch, stage=stage)
    cur.execute(
        """
        INSERT INTO solemd.bulk_citation_ingest_batches (
            release_id,
            batch_index,
            shard_names,
            shards_scanned,
            total_candidate_edges,
            total_domain_edges,
            loaded_edges,
            staging_bytes,
            status,
            started_at,
            completed_at,
            metadata
        )
        VALUES (
            %s, %s, %s::jsonb, %s, %s, %s, %s, %s,
            'completed', now(), now(), %s::jsonb
        )
        ON CONFLICT (release_id, batch_index)
        DO UPDATE
        SET shard_names = EXCLUDED.shard_names,
            shards_scanned = EXCLUDED.shards_scanned,
            total_candidate_edges = EXCLUDED.total_candidate_edges,
            total_domain_edges = EXCLUDED.total_domain_edges,
            loaded_edges = EXCLUDED.loaded_edges,
            staging_bytes = EXCLUDED.staging_bytes,
            status = 'completed',
            completed_at = now(),
            error_message = NULL,
            metadata = EXCLUDED.metadata
        """,
        (
            release_id,
            batch_index,
            json.dumps(metadata["shard_names"]),
            stage.shards_scanned,
            stage.total_candidate_edges,
            stage.total_domain_edges,
            stage.total_domain_edges,
            metadata["staging_bytes"],
            json.dumps(metadata),
        ),
    )


def _record_batch_failed(
    *,
    release_id: str,
    batch_index: int,
    shard_batch: list[Path],
    error_message: str,
) -> None:
    metadata = {
        "shard_names": [path.name for path in shard_batch],
        "shard_paths": [str(path) for path in shard_batch],
    }
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO solemd.bulk_citation_ingest_batches (
                release_id,
                batch_index,
                shard_names,
                shards_scanned,
                status,
                started_at,
                completed_at,
                error_message,
                metadata
            )
            VALUES (%s, %s, %s::jsonb, %s, 'failed', now(), now(), %s, %s::jsonb)
            ON CONFLICT (release_id, batch_index)
            DO UPDATE
            SET shard_names = EXCLUDED.shard_names,
                shards_scanned = EXCLUDED.shards_scanned,
                status = 'failed',
                completed_at = now(),
                error_message = EXCLUDED.error_message,
                metadata = EXCLUDED.metadata
            """,
            (
                release_id,
                batch_index,
                json.dumps(metadata["shard_names"]),
                len(shard_batch),
                error_message,
                json.dumps(metadata),
            ),
        )
        conn.commit()


def _reset_release_state(cur, *, release_id: str) -> None:
    cur.execute(
        """
        DELETE FROM solemd.bulk_citation_ingest_batches
        WHERE release_id = %s
        """,
        (release_id,),
    )
    cur.execute(
        """
        DELETE FROM solemd.citations
        WHERE source = 'semantic_scholar_citations_bulk'
          AND source_release_id = %s
        """,
        (release_id,),
    )


def _log_ingest(status: str, summary: CitationIngestSummary, *, extra: dict | None = None) -> None:
    """Write an ETL audit record for a citation ingest run."""
    metadata = asdict(summary)
    if extra:
        metadata.update(extra)
    with db.pooled() as conn:
        log_etl_run(
            conn,
            operation="ingest_bulk_citations",
            source="semantic_scholar_bulk_citations",
            rows_processed=summary.total_domain_edges,
            rows_loaded=summary.loaded_edges,
            status=status,
            metadata=metadata,
        )


def _ingest_empty_shards(
    release_id: str,
    shards_per_batch: int,
    dry_run: bool,
    include_candidate_count: bool,
    started: float,
) -> dict:
    """Handle the edge case where no citation shards are found."""
    summary = CitationIngestSummary(
        release_id=release_id,
        shards_scanned=0,
        batches_processed=0,
        shards_per_batch=shards_per_batch,
        total_candidate_edges=0 if dry_run and include_candidate_count else None,
        total_domain_edges=0,
        loaded_edges=0,
        staging_bytes=0,
        elapsed_seconds=round(time.monotonic() - started, 1),
    )
    _log_ingest("dry_run" if dry_run else "completed", summary)
    return asdict(summary)


def _ingest_resumed(
    release_id: str,
    shards: list[Path],
    shards_per_batch: int,
    completed_batches: dict,
    shard_batches: list,
    started: float,
) -> dict:
    """Fast path: all batches already completed from a prior run."""
    with db.pooled() as conn, conn.cursor() as cur:
        _cleanup_stale_bulk_citations(cur, release_id=release_id)
        conn.commit()
    summary = _summary_from_completed_batches(
        release_id=release_id,
        completed_batches=completed_batches,
        shards_scanned=len(shards),
        shards_per_batch=shards_per_batch,
        started=started,
        total_candidate_edges=None,
    )
    _log_ingest("completed", summary, extra={"resumed_from_checkpoints": True})
    return asdict(summary)


def _ingest_batches(
    con: duckdb.DuckDBPyConnection,
    *,
    release_id: str,
    shards: list[Path],
    shard_batches: list,
    completed_batches: dict,
    dry_run: bool,
    include_candidate_count: bool,
    reset_release: bool,
) -> CitationIngestSummary:
    """Core batch-processing loop for citation ingest."""
    total_candidate_edges = 0 if dry_run and include_candidate_count else None
    total_domain_edges = 0
    loaded_edges = 0
    staging_bytes = 0
    batches_processed = 0
    failed_batch_index: int | None = None

    if not dry_run and reset_release:
        with db.pooled() as conn, conn.cursor() as cur:
            _reset_release_state(cur, release_id=release_id)
            conn.commit()
        completed_batches = {}

    for batch_index, shard_batch in enumerate(shard_batches):
        batches_processed += 1

        # Skip already-completed batches (checkpoint resume)
        if not dry_run and batch_index in completed_batches:
            completed = completed_batches[batch_index]
            if total_candidate_edges is not None and completed["total_candidate_edges"] is not None:
                total_candidate_edges += int(completed["total_candidate_edges"])
            total_domain_edges += int(completed["total_domain_edges"])
            loaded_edges += int(completed["loaded_edges"])
            staging_bytes += int(completed["staging_bytes"])
            continue

        stage: CitationBatchStage | None = None
        try:
            failed_batch_index = batch_index
            if not dry_run:
                with db.pooled() as batch_conn, batch_conn.cursor() as cur:
                    _record_batch_started(
                        cur,
                        release_id=release_id,
                        batch_index=batch_index,
                        shard_batch=shard_batch,
                    )
                    batch_conn.commit()

            stage = _materialize_domain_citation_batch(
                con,
                shards=shard_batch,
                include_candidate_count=dry_run and include_candidate_count,
            )
            if total_candidate_edges is not None and stage.total_candidate_edges is not None:
                total_candidate_edges += stage.total_candidate_edges
            total_domain_edges += stage.total_domain_edges
            batch_staging_bytes = stage.csv_path.stat().st_size if stage.csv_path.exists() else 0
            staging_bytes += batch_staging_bytes

            if dry_run:
                continue

            with db.pooled() as batch_conn, batch_conn.cursor() as cur:
                _create_bulk_citation_stage_table(cur)
                if stage.total_domain_edges > 0:
                    _copy_stage_csv_into_postgres(cur, stage.csv_path)
                    _upsert_bulk_citations(cur, release_id=release_id)
                _record_batch_completed(
                    cur,
                    release_id=release_id,
                    batch_index=batch_index,
                    shard_batch=shard_batch,
                    stage=stage,
                )
                batch_conn.commit()
            loaded_edges += stage.total_domain_edges
            failed_batch_index = None
        except Exception as exc:
            if not dry_run:
                _record_batch_failed(
                    release_id=release_id,
                    batch_index=batch_index,
                    shard_batch=shard_batch,
                    error_message=str(exc),
                )
            raise
        finally:
            if stage is not None:
                stage.csv_path.unlink(missing_ok=True)

    if not dry_run:
        with db.pooled() as conn, conn.cursor() as cur:
            _cleanup_stale_bulk_citations(cur, release_id=release_id)
            conn.commit()

    return CitationIngestSummary(
        release_id=release_id,
        shards_scanned=len(shards),
        batches_processed=batches_processed,
        shards_per_batch=len(shard_batches[0]) if shard_batches else 0,
        total_candidate_edges=total_candidate_edges,
        total_domain_edges=total_domain_edges,
        loaded_edges=loaded_edges,
        staging_bytes=staging_bytes,
        elapsed_seconds=0,  # filled by caller
    )


def run_citation_ingest(
    *,
    release_id: str,
    dry_run: bool = False,
    limit_shards: int = 0,
    shards_per_batch: int = 8,
    include_candidate_count: bool = False,
    reset_release: bool = False,
) -> dict:
    """Ingest domain-domain citation edges from S2 bulk citations dataset.

    Orchestrates shard discovery, checkpoint resume, DuckDB filtering,
    and PostgreSQL upsert in batches with full error recovery.
    """
    if limit_shards and not dry_run:
        raise ValueError("partial shard loads are only supported in --dry-run mode")
    if shards_per_batch <= 0:
        raise ValueError("shards_per_batch must be positive")

    started = time.monotonic()
    shards = _citations_shards(release_id, limit_shards=limit_shards)

    # Early exit: no shards found
    if not shards:
        return _ingest_empty_shards(
            release_id, shards_per_batch, dry_run, include_candidate_count, started,
        )

    completed_batches = {} if dry_run else _load_completed_batches(release_id)
    shard_batches = _chunked_paths(shards, shards_per_batch)

    # Fast path: all batches already completed (full checkpoint resume)
    if not dry_run and not reset_release and len(completed_batches) == len(shard_batches) and shard_batches:
        return _ingest_resumed(
            release_id, shards, shards_per_batch, completed_batches, shard_batches, started,
        )

    # Main path: process batches
    domain_ids_csv = _write_domain_ids_csv()
    con = _duckdb_connection()
    try:
        _prepare_domain_ids(con, domain_ids_csv)
        summary = _ingest_batches(
            con,
            release_id=release_id,
            shards=shards,
            shard_batches=shard_batches,
            completed_batches=completed_batches,
            dry_run=dry_run,
            include_candidate_count=include_candidate_count,
            reset_release=reset_release,
        )
        summary = CitationIngestSummary(
            **{**asdict(summary), "elapsed_seconds": round(time.monotonic() - started, 1)},
        )
    except Exception as exc:
        if not dry_run:
            with db.pooled() as conn:
                log_etl_run(
                    conn,
                    operation="ingest_bulk_citations",
                    source="semantic_scholar_bulk_citations",
                    rows_processed=0,
                    rows_loaded=0,
                    status="failed",
                    metadata={"error": str(exc)},
                )
        raise
    finally:
        con.close()
        domain_ids_csv.unlink(missing_ok=True)
        db.close_pool()

    _log_ingest(
        "dry_run" if dry_run else "completed",
        summary,
    )
    return asdict(summary)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Semantic Scholar bulk citations")
    parser.add_argument(
        "--release-id",
        default=settings.s2_release_id,
        help="Semantic Scholar release id (defaults to S2_RELEASE_ID)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Summarize without writing")
    parser.add_argument("--limit-shards", type=int, default=0, help="Limit to the first N shards")
    parser.add_argument(
        "--shards-per-batch",
        type=int,
        default=8,
        help="Number of citations shards to process per DuckDB batch",
    )
    parser.add_argument(
        "--include-candidate-count",
        action="store_true",
        help="Also count raw citation rows before domain filtering during dry-run",
    )
    parser.add_argument(
        "--reset-release",
        action="store_true",
        help="Delete existing checkpoint rows and current-release bulk citation rows before loading",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON summary")
    args = parser.parse_args()

    if not args.release_id:
        raise SystemExit("release id required: pass --release-id or set S2_RELEASE_ID")

    summary = run_citation_ingest(
        release_id=args.release_id,
        dry_run=args.dry_run,
        limit_shards=args.limit_shards,
        shards_per_batch=args.shards_per_batch,
        include_candidate_count=args.include_candidate_count,
        reset_release=args.reset_release,
    )
    if args.json:
        print(json.dumps(summary, indent=2))
        return

    print(f"Citation ingest — {summary['release_id']}")
    print(f"  Shards scanned:       {summary['shards_scanned']:,}")
    print(f"  Batches processed:    {summary['batches_processed']:,}")
    print(f"  Shards per batch:     {summary['shards_per_batch']:,}")
    if summary.get("total_candidate_edges") is not None:
        print(f"  Candidate edges:      {summary['total_candidate_edges']:,}")
    print(f"  Domain edges:         {summary['total_domain_edges']:,}")
    print(f"  Loaded edges:         {summary['loaded_edges']:,}")
    print(f"  Staging bytes:        {summary['staging_bytes']:,}")
    print(f"  Elapsed:              {summary['elapsed_seconds']:.1f}s")


if __name__ == "__main__":
    main()
