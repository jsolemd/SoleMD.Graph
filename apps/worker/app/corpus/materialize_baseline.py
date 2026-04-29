from __future__ import annotations

import asyncio
from uuid import UUID

import asyncpg

from app.corpus.artifacts import PAPER_SCOPE
from app.corpus.materialize_chunks import (
    CORPUS_BASELINE_PHASE_NAME,
    drain_phase_chunks,
    drain_phase_chunks_from_pool,
    ensure_phase_chunks,
    parse_command_row_count,
    prepare_phase_chunks_for_resume,
)
from app.corpus.models import CorpusPlan
from app.corpus.rollups import selection_rollup_refs
from app.document_schema import TEXT_AVAILABILITY_ABSTRACT, TEXT_AVAILABILITY_NONE


async def materialize_corpus_baseline(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    bucket_count: int,
    connection_pool: asyncpg.Pool | None = None,
    max_parallel_chunks: int = 1,
    chunk_max_attempts: int = 3,
) -> None:
    refs = await selection_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    paper_scope_table = refs[PAPER_SCOPE].qualified_name

    async def materialize_bucket(
        worker_connection: asyncpg.Connection,
        bucket_id: int,
    ) -> dict[str, int]:
        return await _materialize_bucket(
            worker_connection,
            bucket_id=bucket_id,
            paper_scope_table=paper_scope_table,
            s2_source_release_id=plan.s2_source_release_id,
            pt3_source_release_id=plan.pt3_source_release_id,
        )

    await ensure_phase_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=CORPUS_BASELINE_PHASE_NAME,
        bucket_count=bucket_count,
    )
    await prepare_phase_chunks_for_resume(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=CORPUS_BASELINE_PHASE_NAME,
        max_attempts=chunk_max_attempts,
    )
    if connection_pool is not None and max_parallel_chunks > 1:
        tasks = [
            asyncio.create_task(
                drain_phase_chunks_from_pool(
                    connection_pool,
                    corpus_selection_run_id=corpus_selection_run_id,
                    phase_name=CORPUS_BASELINE_PHASE_NAME,
                    materialize_bucket=materialize_bucket,
                )
            )
            for _ in range(max_parallel_chunks)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, BaseException):
                raise result
        return

    await drain_phase_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=CORPUS_BASELINE_PHASE_NAME,
        materialize_bucket=materialize_bucket,
    )


async def _materialize_bucket(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    paper_scope_table: str,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> dict[str, int]:
    await _clear_bucket_materialized_surfaces(
        connection,
        bucket_id=bucket_id,
        paper_scope_table=paper_scope_table,
        pt3_source_release_id=pt3_source_release_id,
    )
    paper_count = await _upsert_bucket_papers(
        connection,
        bucket_id=bucket_id,
        paper_scope_table=paper_scope_table,
    )
    text_count = await _upsert_bucket_paper_text(
        connection,
        bucket_id=bucket_id,
        paper_scope_table=paper_scope_table,
        s2_source_release_id=s2_source_release_id,
    )
    return {"papers": paper_count, "paper_text": text_count}


async def _clear_bucket_materialized_surfaces(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    paper_scope_table: str,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        f"""
        DELETE FROM solemd.paper_citations
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.bucket_id = $1
        )
        """,
        bucket_id,
    )
    await connection.execute(
        f"""
        DELETE FROM solemd.paper_authors
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.bucket_id = $1
        )
        """,
        bucket_id,
    )
    await connection.execute(
        f"""
        DELETE FROM pubtator.entity_annotations annotations
        USING {paper_scope_table} scope
        WHERE scope.bucket_id = $1
          AND annotations.source_release_id = $2
          AND annotations.corpus_id = scope.corpus_id
        """,
        bucket_id,
        pt3_source_release_id,
    )
    await connection.execute(
        f"""
        DELETE FROM pubtator.relations relations
        USING {paper_scope_table} scope
        WHERE scope.bucket_id = $1
          AND relations.source_release_id = $2
          AND relations.corpus_id = scope.corpus_id
        """,
        bucket_id,
        pt3_source_release_id,
    )
    await connection.execute(
        f"""
        DELETE FROM solemd.paper_text
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.bucket_id = $1
        )
        """,
        bucket_id,
    )
    await connection.execute(
        f"""
        DELETE FROM solemd.papers
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.bucket_id = $1
        )
        """,
        bucket_id,
    )


async def _upsert_bucket_papers(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    paper_scope_table: str,
) -> int:
    command_tag = await connection.execute(
        f"""
        INSERT INTO solemd.papers (
            corpus_id,
            venue_id,
            publication_date,
            year,
            is_open_access,
            pmid,
            doi_norm,
            pmc_id,
            s2_paper_id
        )
        WITH paper_rows AS MATERIALIZED (
            SELECT DISTINCT ON (scope.corpus_id)
                scope.corpus_id,
                coalesce(scope.source_venue_id, '') AS source_venue_key,
                coalesce(solemd.normalize_lookup_key(scope.venue_raw), '')
                    AS venue_lookup_key,
                scope.publication_date,
                CASE WHEN scope.year IS NULL THEN NULL ELSE scope.year::SMALLINT END
                    AS year,
                scope.is_open_access,
                scope.pmid,
                scope.doi_norm,
                scope.pmc_id,
                scope.paper_id AS s2_paper_id
            FROM {paper_scope_table} scope
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = scope.corpus_id
             AND corpus.domain_status IN ('corpus', 'mapped')
            WHERE scope.bucket_id = $1
            ORDER BY
                scope.corpus_id,
                (scope.pmid IS NULL),
                (scope.doi_norm IS NULL),
                (scope.pmc_id IS NULL),
                (scope.publication_date IS NULL),
                scope.paper_id
        ),
        venue_keys AS MATERIALIZED (
            SELECT DISTINCT
                paper_rows.source_venue_key,
                paper_rows.venue_lookup_key
            FROM paper_rows
            WHERE paper_rows.source_venue_key <> ''
               OR paper_rows.venue_lookup_key <> ''
        ),
        venue_map AS MATERIALIZED (
            SELECT
                venue_keys.source_venue_key,
                venue_keys.venue_lookup_key,
                coalesce(source_venues.venue_id, normalized_venues.venue_id)
                    AS venue_id
            FROM venue_keys
            LEFT JOIN solemd.venues source_venues
              ON source_venues.source_venue_id = nullif(venue_keys.source_venue_key, '')
            LEFT JOIN solemd.venues normalized_venues
              ON normalized_venues.normalized_name = nullif(venue_keys.venue_lookup_key, '')
        )
        SELECT
            paper_rows.corpus_id,
            venue_map.venue_id,
            paper_rows.publication_date,
            paper_rows.year,
            paper_rows.is_open_access,
            paper_rows.pmid,
            paper_rows.doi_norm,
            paper_rows.pmc_id,
            paper_rows.s2_paper_id
        FROM paper_rows
        LEFT JOIN venue_map
          ON venue_map.source_venue_key = paper_rows.source_venue_key
         AND venue_map.venue_lookup_key = paper_rows.venue_lookup_key
        ON CONFLICT (corpus_id)
        DO UPDATE SET
            venue_id = EXCLUDED.venue_id,
            publication_date = EXCLUDED.publication_date,
            year = EXCLUDED.year,
            is_open_access = EXCLUDED.is_open_access,
            pmid = EXCLUDED.pmid,
            doi_norm = EXCLUDED.doi_norm,
            pmc_id = EXCLUDED.pmc_id,
            s2_paper_id = EXCLUDED.s2_paper_id,
            updated_at = now()
        """,
        bucket_id,
    )
    return parse_command_row_count(command_tag)


async def _upsert_bucket_paper_text(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    paper_scope_table: str,
    s2_source_release_id: int,
) -> int:
    command_tag = await connection.execute(
        f"""
        INSERT INTO solemd.paper_text (
            corpus_id,
            title_hash,
            abstract_hash,
            text_availability,
            title,
            abstract,
            tldr
        )
        WITH text_rows AS (
            SELECT DISTINCT ON (scope.corpus_id)
                scope.corpus_id,
                substring(digest(coalesce(raw.title, ''), 'sha1') for 16) AS title_hash,
                CASE
                    WHEN raw.abstract IS NULL THEN NULL
                    ELSE substring(digest(raw.abstract, 'sha1') for 16)
                END AS abstract_hash,
                CASE
                    WHEN raw.abstract IS NOT NULL THEN $2::SMALLINT
                    ELSE $3::SMALLINT
                END AS text_availability,
                coalesce(raw.title, '') AS title,
                raw.abstract,
                raw.tldr
            FROM {paper_scope_table} scope
            JOIN solemd.s2_papers_raw raw
              ON raw.source_release_id = $1
             AND raw.paper_id = scope.paper_id
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = scope.corpus_id
             AND corpus.domain_status IN ('corpus', 'mapped')
            WHERE scope.bucket_id = $4
            ORDER BY
                scope.corpus_id,
                (raw.abstract IS NULL),
                length(coalesce(raw.abstract, '')) DESC,
                (raw.tldr IS NULL),
                length(coalesce(raw.title, '')) DESC,
                raw.paper_id
        )
        SELECT
            text_rows.corpus_id,
            text_rows.title_hash,
            text_rows.abstract_hash,
            text_rows.text_availability,
            text_rows.title,
            text_rows.abstract,
            text_rows.tldr
        FROM text_rows
        ON CONFLICT (corpus_id)
        DO UPDATE SET
            title_hash = EXCLUDED.title_hash,
            abstract_hash = EXCLUDED.abstract_hash,
            text_availability = EXCLUDED.text_availability,
            title = EXCLUDED.title,
            abstract = EXCLUDED.abstract,
            tldr = EXCLUDED.tldr
        """,
        s2_source_release_id,
        TEXT_AVAILABILITY_ABSTRACT,
        TEXT_AVAILABILITY_NONE,
        bucket_id,
    )
    return parse_command_row_count(command_tag)
