from __future__ import annotations

import asyncio
import json
import logging
from urllib.error import HTTPError
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.enrichment.http import is_retryable_http_error
from app.enrichment.models import (
    StartPubMedMetadataEnrichmentRequest,
    StartS2GraphEnrichmentRequest,
)
from app.enrichment.pubmed import PubMedEfetchClient, PubMedMetadataRecord
from app.enrichment.pubmed import validate_pubmed_api_settings
from app.enrichment.run_details import pubmed_run_detail, s2_graph_run_detail
from app.enrichment.s2_graph import S2PaperEnrichmentRecord, SemanticScholarGraphClient
from app.enrichment.s2_graph import validate_s2_graph_api_settings


LOGGER = logging.getLogger(__name__)


async def run_pubmed_metadata_enrichment(
    request: StartPubMedMetadataEnrichmentRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    validate_pubmed_api_settings(runtime_settings)
    async with ingest_pool.acquire() as connection:
        run_id = await _open_pubmed_run(connection, request, runtime_settings)
        await _reset_stale_pubmed_tasks(connection, run_id, runtime_settings)
        await _seed_pubmed_tasks(connection, request, run_id)

    client = PubMedEfetchClient(runtime_settings)
    try:
        while True:
            async with ingest_pool.acquire() as connection:
                tasks = await _claim_pubmed_tasks(connection, run_id, runtime_settings)
            if not tasks:
                break
            pmids = [int(task["pmid"]) for task in tasks]
            try:
                records = await client.fetch(pmids)
                returned_pmids = {record.pmid for record in records}
                missing_pmids = sorted(set(pmids) - returned_pmids)
                async with ingest_pool.acquire() as connection:
                    async with connection.transaction():
                        await _upsert_pubmed_metadata(connection, records)
                        if returned_pmids:
                            await _mark_pubmed_tasks_complete(
                                connection,
                                run_id,
                                sorted(returned_pmids),
                            )
                        if missing_pmids:
                            await _mark_pubmed_tasks_not_found(
                                connection,
                                run_id,
                                missing_pmids,
                            )
            except Exception as exc:
                LOGGER.warning("PubMed metadata batch failed", exc_info=exc)
                terminal = _terminal_provider_error(exc)
                async with ingest_pool.acquire() as connection:
                    await _mark_pubmed_tasks_failed(
                        connection,
                        run_id,
                        pmids,
                        str(exc),
                        runtime_settings.pubmed_metadata_max_attempts,
                        terminal=terminal,
                    )
                if terminal:
                    break

        async with ingest_pool.acquire() as connection:
            await _finalize_pubmed_run(connection, run_id)
    except asyncio.CancelledError:
        async with ingest_pool.acquire() as connection:
            await _abort_pubmed_run(connection, run_id)
        raise
    return str(run_id)


async def run_s2_graph_enrichment(
    request: StartS2GraphEnrichmentRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    validate_s2_graph_api_settings(runtime_settings)
    async with ingest_pool.acquire() as connection:
        run_id, source_release_id = await _open_s2_graph_run(
            connection,
            request,
            runtime_settings,
        )
        await _reset_stale_s2_tasks(connection, run_id, runtime_settings)
        await _seed_s2_graph_tasks(connection, request, run_id, source_release_id)

    client = SemanticScholarGraphClient(runtime_settings)
    try:
        while True:
            async with ingest_pool.acquire() as connection:
                tasks = await _claim_s2_tasks(connection, run_id, runtime_settings)
            if not tasks:
                break
            paper_ids = [str(task["paper_id"]) for task in tasks]
            corpus_by_paper_id = {
                str(task["paper_id"]): int(task["corpus_id"])
                for task in tasks
            }
            try:
                records = await client.fetch_papers(paper_ids)
                returned_paper_ids = {record.paper_id for record in records}
                missing_paper_ids = sorted(set(paper_ids) - returned_paper_ids)
                async with ingest_pool.acquire() as connection:
                    async with connection.transaction():
                        await _upsert_s2_paper_enrichment(
                            connection,
                            records,
                            source_release_id=source_release_id,
                            corpus_by_paper_id=corpus_by_paper_id,
                        )
                        if returned_paper_ids:
                            await _mark_s2_tasks_complete(
                                connection,
                                run_id,
                                sorted(returned_paper_ids),
                            )
                        if missing_paper_ids:
                            await _mark_s2_tasks_not_found(
                                connection,
                                run_id,
                                missing_paper_ids,
                            )
            except Exception as exc:
                LOGGER.warning("S2 Graph enrichment batch failed", exc_info=exc)
                terminal = _terminal_provider_error(exc)
                async with ingest_pool.acquire() as connection:
                    await _mark_s2_tasks_failed(
                        connection,
                        run_id,
                        paper_ids,
                        str(exc),
                        runtime_settings.s2_graph_max_attempts,
                        terminal=terminal,
                    )
                if terminal:
                    break

        async with ingest_pool.acquire() as connection:
            await _finalize_s2_graph_run(connection, run_id)
    except asyncio.CancelledError:
        async with ingest_pool.acquire() as connection:
            await _abort_s2_graph_run(connection, run_id)
        raise
    return str(run_id)


async def _open_pubmed_run(
    connection: asyncpg.Connection,
    request: StartPubMedMetadataEnrichmentRequest,
    runtime_settings: Settings,
) -> UUID:
    return await connection.fetchval(
        """
        INSERT INTO solemd.pubmed_metadata_fetch_runs (
            corpus_selection_run_id,
            requested_by,
            max_papers,
            detail
        )
        VALUES ($1, $2, $3, ($4::TEXT)::JSONB)
        RETURNING pubmed_metadata_fetch_run_id
        """,
        request.corpus_selection_run_id,
        request.requested_by,
        request.max_papers,
        json.dumps(pubmed_run_detail(request, runtime_settings), sort_keys=True),
    )


async def _seed_pubmed_tasks(
    connection: asyncpg.Connection,
    request: StartPubMedMetadataEnrichmentRequest,
    run_id: UUID,
) -> int:
    command_tag = await connection.execute(
        """
        INSERT INTO solemd.pubmed_metadata_fetch_tasks (
            pubmed_metadata_fetch_run_id,
            corpus_id,
            pmid
        )
        SELECT
            $2,
            summary.corpus_id,
            papers.pmid
        FROM solemd.paper_selection_summary summary
        JOIN solemd.papers papers
          ON papers.corpus_id = summary.corpus_id
         AND papers.pmid IS NOT NULL
        LEFT JOIN solemd.pubmed_metadata metadata
          ON metadata.pmid = papers.pmid
        WHERE summary.corpus_selection_run_id = $1
          AND summary.current_status = 'mapped'
          AND summary.rag_candidate
          AND ($3::BOOLEAN OR metadata.pmid IS NULL)
        ORDER BY
            summary.rag_eligible DESC,
            summary.evidence_priority_score DESC,
            summary.mapped_priority_score DESC,
            summary.curated_entity_signal_count DESC,
            summary.corpus_id
        LIMIT coalesce($4::INTEGER, 2147483647)
        ON CONFLICT DO NOTHING
        """,
        request.corpus_selection_run_id,
        run_id,
        request.force_refresh,
        request.max_papers,
    )
    return _row_count(command_tag)


async def _reset_stale_pubmed_tasks(
    connection: asyncpg.Connection,
    run_id: UUID,
    runtime_settings: Settings,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.pubmed_metadata_fetch_tasks
        SET status = 'pending',
            error_message = 'reset stale running task',
            updated_at = now()
        WHERE pubmed_metadata_fetch_run_id = $1
          AND status = 'running'
          AND updated_at < now() - make_interval(secs => $2::DOUBLE PRECISION)
        """,
        run_id,
        runtime_settings.pubmed_metadata_stale_after_seconds,
    )


async def _claim_pubmed_tasks(
    connection: asyncpg.Connection,
    run_id: UUID,
    runtime_settings: Settings,
) -> list[asyncpg.Record]:
    rows = await connection.fetch(
        """
        WITH claimable AS (
            SELECT pmid
            FROM solemd.pubmed_metadata_fetch_tasks
            WHERE pubmed_metadata_fetch_run_id = $1
              AND status = 'pending'
              AND attempts < $3
            ORDER BY attempts, pmid
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE solemd.pubmed_metadata_fetch_tasks tasks
        SET status = 'running',
            attempts = tasks.attempts + 1,
            started_at = now(),
            updated_at = now(),
            error_message = NULL
        FROM claimable
        WHERE tasks.pubmed_metadata_fetch_run_id = $1
          AND tasks.pmid = claimable.pmid
        RETURNING tasks.pmid, tasks.corpus_id, tasks.attempts
        """,
        run_id,
        runtime_settings.pubmed_metadata_batch_size,
        runtime_settings.pubmed_metadata_max_attempts,
    )
    return list(rows)


async def _upsert_pubmed_metadata(
    connection: asyncpg.Connection,
    records: tuple[PubMedMetadataRecord, ...],
) -> None:
    if not records:
        return
    payload = [
        {
            "pmid": record.pmid,
            "response_checksum": record.response_checksum,
            "article_title": record.article_title,
            "abstract_text": record.abstract_text,
            "abstract_hash": record.abstract_hash,
            "language_codes": list(record.language_codes),
            "publication_types": list(record.publication_types),
            "citation_subsets": list(record.citation_subsets),
            "mesh_headings": list(record.mesh_headings),
            "mesh_major_terms": list(record.mesh_major_terms),
            "keywords": list(record.keywords),
            "grant_count": record.grant_count,
            "has_grant": record.has_grant,
            "chemicals": list(record.chemicals),
            "comments_corrections": list(record.comments_corrections),
            "has_retraction": record.has_retraction,
            "has_erratum": record.has_erratum,
            "publication_status": record.publication_status,
            "structured_abstract": list(record.structured_abstract),
            "raw_detail": record.raw_detail,
        }
        for record in records
    ]
    await connection.execute(
        """
        WITH records AS (
            SELECT *
            FROM jsonb_to_recordset(($1::TEXT)::JSONB) AS record (
                pmid INTEGER,
                response_checksum TEXT,
                article_title TEXT,
                abstract_text TEXT,
                abstract_hash TEXT,
                language_codes TEXT[],
                publication_types TEXT[],
                citation_subsets TEXT[],
                mesh_headings JSONB,
                mesh_major_terms TEXT[],
                keywords TEXT[],
                grant_count INTEGER,
                has_grant BOOLEAN,
                chemicals JSONB,
                comments_corrections JSONB,
                has_retraction BOOLEAN,
                has_erratum BOOLEAN,
                publication_status TEXT,
                structured_abstract JSONB,
                raw_detail JSONB
            )
        )
        INSERT INTO solemd.pubmed_metadata (
            pmid,
            fetched_at,
            response_checksum,
            article_title,
            abstract_text,
            abstract_hash,
            language_codes,
            publication_types,
            citation_subsets,
            mesh_headings,
            mesh_major_terms,
            keywords,
            grant_count,
            has_grant,
            chemicals,
            comments_corrections,
            has_retraction,
            has_erratum,
            publication_status,
            structured_abstract,
            raw_detail
        )
        SELECT
            pmid,
            now(),
            response_checksum,
            article_title,
            abstract_text,
            abstract_hash,
            coalesce(language_codes, ARRAY[]::TEXT[]),
            coalesce(publication_types, ARRAY[]::TEXT[]),
            coalesce(citation_subsets, ARRAY[]::TEXT[]),
            coalesce(mesh_headings, '[]'::JSONB),
            coalesce(mesh_major_terms, ARRAY[]::TEXT[]),
            coalesce(keywords, ARRAY[]::TEXT[]),
            coalesce(grant_count, 0),
            coalesce(has_grant, false),
            coalesce(chemicals, '[]'::JSONB),
            coalesce(comments_corrections, '[]'::JSONB),
            coalesce(has_retraction, false),
            coalesce(has_erratum, false),
            publication_status,
            coalesce(structured_abstract, '[]'::JSONB),
            coalesce(raw_detail, '{}'::JSONB)
        FROM records
        ON CONFLICT (pmid) DO UPDATE
        SET fetched_at = EXCLUDED.fetched_at,
            response_checksum = EXCLUDED.response_checksum,
            article_title = EXCLUDED.article_title,
            abstract_text = EXCLUDED.abstract_text,
            abstract_hash = EXCLUDED.abstract_hash,
            language_codes = EXCLUDED.language_codes,
            publication_types = EXCLUDED.publication_types,
            citation_subsets = EXCLUDED.citation_subsets,
            mesh_headings = EXCLUDED.mesh_headings,
            mesh_major_terms = EXCLUDED.mesh_major_terms,
            keywords = EXCLUDED.keywords,
            grant_count = EXCLUDED.grant_count,
            has_grant = EXCLUDED.has_grant,
            chemicals = EXCLUDED.chemicals,
            comments_corrections = EXCLUDED.comments_corrections,
            has_retraction = EXCLUDED.has_retraction,
            has_erratum = EXCLUDED.has_erratum,
            publication_status = EXCLUDED.publication_status,
            structured_abstract = EXCLUDED.structured_abstract,
            raw_detail = EXCLUDED.raw_detail
        """,
        json.dumps(payload),
    )


async def _mark_pubmed_tasks_complete(
    connection: asyncpg.Connection,
    run_id: UUID,
    pmids: list[int],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.pubmed_metadata_fetch_tasks
        SET status = 'complete',
            completed_at = now(),
            updated_at = now(),
            error_message = NULL
        WHERE pubmed_metadata_fetch_run_id = $1
          AND pmid = ANY($2::INTEGER[])
        """,
        run_id,
        pmids,
    )


async def _mark_pubmed_tasks_failed(
    connection: asyncpg.Connection,
    run_id: UUID,
    pmids: list[int],
    error_message: str,
    max_attempts: int,
    *,
    terminal: bool = False,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.pubmed_metadata_fetch_tasks
        SET status = CASE
                WHEN $4::BOOLEAN OR attempts >= $3 THEN 'failed'
                ELSE 'pending'
            END,
            completed_at = CASE
                WHEN $4::BOOLEAN OR attempts >= $3 THEN now()
                ELSE NULL
            END,
            error_message = left($5, 2000),
            updated_at = now()
        WHERE pubmed_metadata_fetch_run_id = $1
          AND pmid = ANY($2::INTEGER[])
        """,
        run_id,
        pmids,
        max_attempts,
        terminal,
        error_message,
    )


async def _mark_pubmed_tasks_not_found(
    connection: asyncpg.Connection,
    run_id: UUID,
    pmids: list[int],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.pubmed_metadata_fetch_tasks
        SET status = 'not_found',
            completed_at = now(),
            error_message = 'PubMed EFetch returned no record for PMID',
            updated_at = now()
        WHERE pubmed_metadata_fetch_run_id = $1
          AND pmid = ANY($2::INTEGER[])
        """,
        run_id,
        pmids,
    )


async def _finalize_pubmed_run(connection: asyncpg.Connection, run_id: UUID) -> None:
    row = await connection.fetchrow(
        """
        SELECT
            count(*) FILTER (WHERE status = 'complete')::INTEGER AS complete_count,
            count(*) FILTER (WHERE status = 'not_found')::INTEGER AS not_found_count,
            count(*) FILTER (WHERE status = 'failed')::INTEGER AS failed_count,
            count(*) FILTER (WHERE status IN ('pending', 'running'))::INTEGER AS pending_count
        FROM solemd.pubmed_metadata_fetch_tasks
        WHERE pubmed_metadata_fetch_run_id = $1
        """,
        run_id,
    )
    failed_count = int(row["failed_count"])
    pending_count = int(row["pending_count"])
    status = "complete" if failed_count == 0 and pending_count == 0 else "failed"
    await connection.execute(
        """
        UPDATE solemd.pubmed_metadata_fetch_runs
        SET status = $2,
            completed_at = now(),
            detail = detail || jsonb_build_object(
                'complete_count', $3::INTEGER,
                'failed_count', $4::INTEGER,
                'pending_count', $5::INTEGER,
                'not_found_count', $6::INTEGER
            ),
            error_message = CASE
                WHEN $2 = 'failed' THEN 'one or more PubMed metadata tasks failed'
                ELSE NULL
            END
        WHERE pubmed_metadata_fetch_run_id = $1
        """,
        run_id,
        status,
        int(row["complete_count"]),
        failed_count,
        pending_count,
        int(row["not_found_count"]),
    )


async def _abort_pubmed_run(connection: asyncpg.Connection, run_id: UUID) -> None:
    await connection.execute(
        """
        UPDATE solemd.pubmed_metadata_fetch_runs
        SET status = 'aborted',
            completed_at = now(),
            error_message = 'run cancelled'
        WHERE pubmed_metadata_fetch_run_id = $1
          AND status = 'running'
        """,
        run_id,
    )


async def _open_s2_graph_run(
    connection: asyncpg.Connection,
    request: StartS2GraphEnrichmentRequest,
    runtime_settings: Settings,
) -> tuple[UUID, int]:
    source_release_id = await connection.fetchval(
        """
        SELECT s2_source_release_id
        FROM solemd.corpus_selection_runs
        WHERE corpus_selection_run_id = $1
        """,
        request.corpus_selection_run_id,
    )
    if source_release_id is None:
        raise RuntimeError(
            f"corpus selection run not found: {request.corpus_selection_run_id}"
        )
    run_id = await connection.fetchval(
        """
        INSERT INTO solemd.s2_graph_enrichment_runs (
            corpus_selection_run_id,
            s2_source_release_id,
            requested_by,
            max_papers,
            detail
        )
        VALUES ($1, $2, $3, $4, ($5::TEXT)::JSONB)
        RETURNING s2_graph_enrichment_run_id
        """,
        request.corpus_selection_run_id,
        int(source_release_id),
        request.requested_by,
        request.max_papers,
        json.dumps(s2_graph_run_detail(request, runtime_settings), sort_keys=True),
    )
    return run_id, int(source_release_id)


async def _seed_s2_graph_tasks(
    connection: asyncpg.Connection,
    request: StartS2GraphEnrichmentRequest,
    run_id: UUID,
    source_release_id: int,
) -> int:
    command_tag = await connection.execute(
        """
        INSERT INTO solemd.s2_graph_enrichment_tasks (
            s2_graph_enrichment_run_id,
            source_release_id,
            corpus_id,
            paper_id
        )
        SELECT
            $2,
            $3,
            summary.corpus_id,
            papers.s2_paper_id
        FROM solemd.paper_selection_summary summary
        JOIN solemd.papers papers
          ON papers.corpus_id = summary.corpus_id
         AND papers.s2_paper_id IS NOT NULL
        LEFT JOIN solemd.s2_paper_enrichment enrichment
          ON enrichment.source_release_id = $3
         AND enrichment.paper_id = papers.s2_paper_id
        WHERE summary.corpus_selection_run_id = $1
          AND summary.current_status = 'mapped'
          AND summary.rag_candidate
          AND ($4::BOOLEAN OR enrichment.paper_id IS NULL)
        ORDER BY
            summary.rag_eligible DESC,
            summary.evidence_priority_score DESC,
            summary.mapped_priority_score DESC,
            summary.curated_entity_signal_count DESC,
            summary.corpus_id
        LIMIT coalesce($5::INTEGER, 2147483647)
        ON CONFLICT DO NOTHING
        """,
        request.corpus_selection_run_id,
        run_id,
        source_release_id,
        request.force_refresh,
        request.max_papers,
    )
    return _row_count(command_tag)


async def _reset_stale_s2_tasks(
    connection: asyncpg.Connection,
    run_id: UUID,
    runtime_settings: Settings,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.s2_graph_enrichment_tasks
        SET status = 'pending',
            error_message = 'reset stale running task',
            updated_at = now()
        WHERE s2_graph_enrichment_run_id = $1
          AND status = 'running'
          AND updated_at < now() - make_interval(secs => $2::DOUBLE PRECISION)
        """,
        run_id,
        runtime_settings.s2_graph_stale_after_seconds,
    )


async def _claim_s2_tasks(
    connection: asyncpg.Connection,
    run_id: UUID,
    runtime_settings: Settings,
) -> list[asyncpg.Record]:
    rows = await connection.fetch(
        """
        WITH claimable AS (
            SELECT paper_id
            FROM solemd.s2_graph_enrichment_tasks
            WHERE s2_graph_enrichment_run_id = $1
              AND status = 'pending'
              AND attempts < $3
            ORDER BY attempts, paper_id
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE solemd.s2_graph_enrichment_tasks tasks
        SET status = 'running',
            attempts = tasks.attempts + 1,
            started_at = now(),
            updated_at = now(),
            error_message = NULL
        FROM claimable
        WHERE tasks.s2_graph_enrichment_run_id = $1
          AND tasks.paper_id = claimable.paper_id
        RETURNING tasks.paper_id, tasks.corpus_id, tasks.attempts
        """,
        run_id,
        runtime_settings.s2_graph_batch_size,
        runtime_settings.s2_graph_max_attempts,
    )
    return list(rows)


async def _upsert_s2_paper_enrichment(
    connection: asyncpg.Connection,
    records: tuple[S2PaperEnrichmentRecord, ...],
    *,
    source_release_id: int,
    corpus_by_paper_id: dict[str, int],
) -> None:
    if not records:
        return
    payload = [
        {
            "source_release_id": source_release_id,
            "paper_id": record.paper_id,
            "corpus_id": corpus_by_paper_id[record.paper_id],
            "response_checksum": record.response_checksum,
            "citation_count": record.citation_count,
            "influential_citation_count": record.influential_citation_count,
            "publication_types": list(record.publication_types),
            "fields_of_study": list(record.fields_of_study),
            "s2_fields_of_study": list(record.s2_fields_of_study),
            "open_access_pdf": record.open_access_pdf,
            "open_access_pdf_status": record.open_access_pdf_status,
            "publication_venue": record.publication_venue,
            "publication_venue_type": record.publication_venue_type,
            "external_ids": record.external_ids,
            "journal": record.journal,
            "is_open_access": record.is_open_access,
            "year": record.year,
            "publication_date": (
                record.publication_date.isoformat()
                if record.publication_date is not None
                else None
            ),
            "raw_detail": record.raw_detail,
        }
        for record in records
        if record.paper_id in corpus_by_paper_id
    ]
    if not payload:
        return
    await connection.execute(
        """
        WITH records AS (
            SELECT *
            FROM jsonb_to_recordset(($1::TEXT)::JSONB) AS record (
                source_release_id INTEGER,
                paper_id TEXT,
                corpus_id BIGINT,
                response_checksum TEXT,
                citation_count INTEGER,
                influential_citation_count INTEGER,
                publication_types TEXT[],
                fields_of_study TEXT[],
                s2_fields_of_study JSONB,
                open_access_pdf JSONB,
                open_access_pdf_status TEXT,
                publication_venue JSONB,
                publication_venue_type TEXT,
                external_ids JSONB,
                journal JSONB,
                is_open_access BOOLEAN,
                year INTEGER,
                publication_date DATE,
                raw_detail JSONB
            )
        )
        INSERT INTO solemd.s2_paper_enrichment (
            source_release_id,
            paper_id,
            corpus_id,
            fetched_at,
            response_checksum,
            citation_count,
            influential_citation_count,
            publication_types,
            fields_of_study,
            s2_fields_of_study,
            open_access_pdf,
            open_access_pdf_status,
            publication_venue,
            publication_venue_type,
            external_ids,
            journal,
            is_open_access,
            year,
            publication_date,
            raw_detail
        )
        SELECT
            source_release_id,
            paper_id,
            corpus_id,
            now(),
            response_checksum,
            coalesce(citation_count, 0),
            coalesce(influential_citation_count, 0),
            coalesce(publication_types, ARRAY[]::TEXT[]),
            coalesce(fields_of_study, ARRAY[]::TEXT[]),
            coalesce(s2_fields_of_study, '[]'::JSONB),
            coalesce(open_access_pdf, '{}'::JSONB),
            open_access_pdf_status,
            coalesce(publication_venue, '{}'::JSONB),
            publication_venue_type,
            coalesce(external_ids, '{}'::JSONB),
            coalesce(journal, '{}'::JSONB),
            is_open_access,
            year,
            publication_date,
            coalesce(raw_detail, '{}'::JSONB)
        FROM records
        ON CONFLICT (source_release_id, paper_id) DO UPDATE
        SET corpus_id = EXCLUDED.corpus_id,
            fetched_at = EXCLUDED.fetched_at,
            response_checksum = EXCLUDED.response_checksum,
            citation_count = EXCLUDED.citation_count,
            influential_citation_count = EXCLUDED.influential_citation_count,
            publication_types = EXCLUDED.publication_types,
            fields_of_study = EXCLUDED.fields_of_study,
            s2_fields_of_study = EXCLUDED.s2_fields_of_study,
            open_access_pdf = EXCLUDED.open_access_pdf,
            open_access_pdf_status = EXCLUDED.open_access_pdf_status,
            publication_venue = EXCLUDED.publication_venue,
            publication_venue_type = EXCLUDED.publication_venue_type,
            external_ids = EXCLUDED.external_ids,
            journal = EXCLUDED.journal,
            is_open_access = EXCLUDED.is_open_access,
            year = EXCLUDED.year,
            publication_date = EXCLUDED.publication_date,
            raw_detail = EXCLUDED.raw_detail
        """,
        json.dumps(payload),
    )


async def _mark_s2_tasks_complete(
    connection: asyncpg.Connection,
    run_id: UUID,
    paper_ids: list[str],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.s2_graph_enrichment_tasks
        SET status = 'complete',
            completed_at = now(),
            updated_at = now(),
            error_message = NULL
        WHERE s2_graph_enrichment_run_id = $1
          AND paper_id = ANY($2::TEXT[])
        """,
        run_id,
        paper_ids,
    )


async def _mark_s2_tasks_failed(
    connection: asyncpg.Connection,
    run_id: UUID,
    paper_ids: list[str],
    error_message: str,
    max_attempts: int,
    *,
    terminal: bool = False,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.s2_graph_enrichment_tasks
        SET status = CASE
                WHEN $4::BOOLEAN OR attempts >= $3 THEN 'failed'
                ELSE 'pending'
            END,
            completed_at = CASE
                WHEN $4::BOOLEAN OR attempts >= $3 THEN now()
                ELSE NULL
            END,
            error_message = left($5, 2000),
            updated_at = now()
        WHERE s2_graph_enrichment_run_id = $1
          AND paper_id = ANY($2::TEXT[])
        """,
        run_id,
        paper_ids,
        max_attempts,
        terminal,
        error_message,
    )


async def _mark_s2_tasks_not_found(
    connection: asyncpg.Connection,
    run_id: UUID,
    paper_ids: list[str],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.s2_graph_enrichment_tasks
        SET status = 'not_found',
            completed_at = now(),
            error_message = 'Semantic Scholar Graph API returned no paper record',
            updated_at = now()
        WHERE s2_graph_enrichment_run_id = $1
          AND paper_id = ANY($2::TEXT[])
        """,
        run_id,
        paper_ids,
    )


async def _finalize_s2_graph_run(connection: asyncpg.Connection, run_id: UUID) -> None:
    row = await connection.fetchrow(
        """
        SELECT
            count(*) FILTER (WHERE status = 'complete')::INTEGER AS complete_count,
            count(*) FILTER (WHERE status = 'not_found')::INTEGER AS not_found_count,
            count(*) FILTER (WHERE status = 'failed')::INTEGER AS failed_count,
            count(*) FILTER (WHERE status IN ('pending', 'running'))::INTEGER AS pending_count
        FROM solemd.s2_graph_enrichment_tasks
        WHERE s2_graph_enrichment_run_id = $1
        """,
        run_id,
    )
    failed_count = int(row["failed_count"])
    pending_count = int(row["pending_count"])
    status = "complete" if failed_count == 0 and pending_count == 0 else "failed"
    await connection.execute(
        """
        UPDATE solemd.s2_graph_enrichment_runs
        SET status = $2,
            completed_at = now(),
            detail = detail || jsonb_build_object(
                'complete_count', $3::INTEGER,
                'failed_count', $4::INTEGER,
                'pending_count', $5::INTEGER,
                'not_found_count', $6::INTEGER
            ),
            error_message = CASE
                WHEN $2 = 'failed' THEN 'one or more S2 Graph enrichment tasks failed'
                ELSE NULL
            END
        WHERE s2_graph_enrichment_run_id = $1
        """,
        run_id,
        status,
        int(row["complete_count"]),
        failed_count,
        pending_count,
        int(row["not_found_count"]),
    )


async def _abort_s2_graph_run(connection: asyncpg.Connection, run_id: UUID) -> None:
    await connection.execute(
        """
        UPDATE solemd.s2_graph_enrichment_runs
        SET status = 'aborted',
            completed_at = now(),
            error_message = 'run cancelled'
        WHERE s2_graph_enrichment_run_id = $1
          AND status = 'running'
        """,
        run_id,
    )


def _row_count(command_tag: str) -> int:
    try:
        return int(command_tag.rsplit(" ", 1)[-1])
    except ValueError:
        return 0


def _terminal_provider_error(exc: Exception) -> bool:
    return isinstance(exc, HTTPError) and not is_retryable_http_error(exc)
