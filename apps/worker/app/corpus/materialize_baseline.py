from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import PAPER_SCOPE
from app.corpus.models import CorpusPlan
from app.corpus.rollups import selection_rollup_refs
from app.document_schema import TEXT_AVAILABILITY_ABSTRACT, TEXT_AVAILABILITY_NONE


async def materialize_corpus_baseline(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    refs = await selection_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    paper_scope_table = refs[PAPER_SCOPE].qualified_name
    await _clear_release_materialized_surfaces(
        connection,
        paper_scope_table=paper_scope_table,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _sync_pubtator_stage_corpus_ids(
        connection,
        paper_scope_table=paper_scope_table,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _upsert_papers(
        connection,
        paper_scope_table=paper_scope_table,
        s2_source_release_id=plan.s2_source_release_id,
    )
    await _upsert_paper_text(
        connection,
        paper_scope_table=paper_scope_table,
        s2_source_release_id=plan.s2_source_release_id,
    )


async def _clear_release_materialized_surfaces(
    connection: asyncpg.Connection,
    *,
    paper_scope_table: str,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        f"""
        DELETE FROM solemd.paper_citations
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.corpus_id IS NOT NULL
        )
        """
    )
    await connection.execute(
        f"""
        DELETE FROM solemd.paper_authors
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.corpus_id IS NOT NULL
        )
        """
    )
    await connection.execute(
        f"""
        DELETE FROM pubtator.entity_annotations annotations
        USING {paper_scope_table} scope
        WHERE annotations.source_release_id = $1
          AND annotations.corpus_id = scope.corpus_id
        """,
        pt3_source_release_id,
    )
    await connection.execute(
        f"""
        DELETE FROM pubtator.relations relations
        USING {paper_scope_table} scope
        WHERE relations.source_release_id = $1
          AND relations.corpus_id = scope.corpus_id
        """,
        pt3_source_release_id,
    )
    await connection.execute(
        f"""
        DELETE FROM solemd.paper_text
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.corpus_id IS NOT NULL
        )
        """
    )
    await connection.execute(
        f"""
        DELETE FROM solemd.papers
        WHERE corpus_id IN (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.corpus_id IS NOT NULL
        )
        """
    )


async def _sync_pubtator_stage_corpus_ids(
    connection: asyncpg.Connection,
    *,
    paper_scope_table: str,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        f"""
        UPDATE pubtator.entity_annotations_stage stage
        SET corpus_id = scope.corpus_id
        FROM {paper_scope_table} scope
        WHERE stage.source_release_id = $1
          AND stage.pmid = scope.pmid
          AND scope.corpus_id IS NOT NULL
          AND stage.corpus_id IS DISTINCT FROM scope.corpus_id
        """,
        pt3_source_release_id,
    )
    await connection.execute(
        f"""
        UPDATE pubtator.relations_stage stage
        SET corpus_id = scope.corpus_id
        FROM {paper_scope_table} scope
        WHERE stage.source_release_id = $1
          AND stage.pmid = scope.pmid
          AND scope.corpus_id IS NOT NULL
          AND stage.corpus_id IS DISTINCT FROM scope.corpus_id
        """,
        pt3_source_release_id,
    )


async def _upsert_papers(
    connection: asyncpg.Connection,
    *,
    paper_scope_table: str,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
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
        SELECT
            scope.corpus_id,
            venue_match.venue_id,
            raw.publication_date,
            CASE WHEN raw.year IS NULL THEN NULL ELSE raw.year::SMALLINT END,
            raw.is_open_access,
            raw.pmid,
            raw.doi_norm,
            raw.pmc_id,
            raw.paper_id
        FROM {paper_scope_table} scope
        JOIN solemd.s2_papers_raw raw
          ON raw.source_release_id = $1
         AND raw.paper_id = scope.paper_id
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = scope.corpus_id
         AND corpus.domain_status IN ('corpus', 'mapped')
        LEFT JOIN LATERAL (
            SELECT venues.venue_id
            FROM solemd.venues venues
            WHERE (
                    raw.source_venue_id IS NOT NULL
                    AND venues.source_venue_id = raw.source_venue_id
                  )
               OR (
                    raw.venue_raw IS NOT NULL
                    AND venues.normalized_name = solemd.normalize_lookup_key(raw.venue_raw)
                  )
            ORDER BY
                CASE
                    WHEN raw.source_venue_id IS NOT NULL
                     AND venues.source_venue_id = raw.source_venue_id
                    THEN 0
                    ELSE 1
                END,
                venues.venue_id
            LIMIT 1
        ) AS venue_match ON TRUE
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
        s2_source_release_id,
    )


async def _upsert_paper_text(
    connection: asyncpg.Connection,
    *,
    paper_scope_table: str,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
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
        SELECT
            scope.corpus_id,
            substring(digest(coalesce(raw.title, ''), 'sha1') for 16),
            CASE
                WHEN raw.abstract IS NULL THEN NULL
                ELSE substring(digest(raw.abstract, 'sha1') for 16)
            END,
            CASE
                WHEN raw.abstract IS NOT NULL THEN $2::SMALLINT
                ELSE $3::SMALLINT
            END,
            coalesce(raw.title, ''),
            raw.abstract,
            raw.tldr
        FROM {paper_scope_table} scope
        JOIN solemd.s2_papers_raw raw
          ON raw.source_release_id = $1
         AND raw.paper_id = scope.paper_id
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = scope.corpus_id
         AND corpus.domain_status IN ('corpus', 'mapped')
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
    )
