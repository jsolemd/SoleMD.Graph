from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.models import CorpusPlan
from app.document_schema import TEXT_AVAILABILITY_ABSTRACT, TEXT_AVAILABILITY_NONE


CORPUS_BASELINE_PHASE_NAME = "corpus_baseline_materialization"
MAPPED_SURFACES_PHASE_NAME = "mapped_surface_materialization"


async def materialize_corpus_baseline(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    del corpus_selection_run_id
    await _clear_release_materialized_surfaces(
        connection,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _sync_pubtator_stage_corpus_ids(
        connection,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _upsert_papers(connection, s2_source_release_id=plan.s2_source_release_id)
    await _upsert_paper_text(connection, s2_source_release_id=plan.s2_source_release_id)


async def materialize_mapped_surfaces(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    del corpus_selection_run_id
    await _upsert_paper_authors(connection, s2_source_release_id=plan.s2_source_release_id)
    await _replace_entity_annotations(
        connection,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _replace_relations(
        connection,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )


async def _clear_release_materialized_surfaces(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.paper_citations
        WHERE corpus_id IN (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        """,
        s2_source_release_id,
    )
    await connection.execute(
        """
        DELETE FROM solemd.paper_authors
        WHERE corpus_id IN (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        """,
        s2_source_release_id,
    )
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        DELETE FROM pubtator.entity_annotations annotations
        USING release_scope
        WHERE annotations.source_release_id = $2
          AND annotations.corpus_id = release_scope.corpus_id
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        DELETE FROM pubtator.relations relations
        USING release_scope
        WHERE relations.source_release_id = $2
          AND relations.corpus_id = release_scope.corpus_id
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )
    await connection.execute(
        """
        DELETE FROM solemd.paper_text
        WHERE corpus_id IN (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        """,
        s2_source_release_id,
    )
    await connection.execute(
        """
        DELETE FROM solemd.papers
        WHERE corpus_id IN (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        """,
        s2_source_release_id,
    )


async def _sync_pubtator_stage_corpus_ids(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.pmid, raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
              AND raw.pmid IS NOT NULL
        )
        UPDATE pubtator.entity_annotations_stage stage
        SET corpus_id = release_scope.corpus_id
        FROM release_scope
        WHERE stage.source_release_id = $2
          AND stage.pmid = release_scope.pmid
          AND stage.corpus_id IS DISTINCT FROM release_scope.corpus_id
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.pmid, raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
              AND raw.pmid IS NOT NULL
        )
        UPDATE pubtator.relations_stage stage
        SET corpus_id = release_scope.corpus_id
        FROM release_scope
        WHERE stage.source_release_id = $2
          AND stage.pmid = release_scope.pmid
          AND stage.corpus_id IS DISTINCT FROM release_scope.corpus_id
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )


async def _upsert_papers(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
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
        WITH admitted_scope AS (
            SELECT raw.*
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status IN ('corpus', 'mapped')
        )
        SELECT
            admitted_scope.corpus_id,
            venue_match.venue_id,
            admitted_scope.publication_date,
            CASE
                WHEN admitted_scope.year IS NULL THEN NULL
                ELSE admitted_scope.year::SMALLINT
            END,
            admitted_scope.is_open_access,
            admitted_scope.pmid,
            admitted_scope.doi_norm,
            admitted_scope.pmc_id,
            admitted_scope.paper_id
        FROM admitted_scope
        LEFT JOIN LATERAL (
            SELECT venues.venue_id
            FROM solemd.venues venues
            WHERE (
                    admitted_scope.source_venue_id IS NOT NULL
                    AND venues.source_venue_id = admitted_scope.source_venue_id
                  )
               OR (
                    admitted_scope.venue_raw IS NOT NULL
                    AND venues.normalized_name = solemd.normalize_lookup_key(admitted_scope.venue_raw)
                  )
            ORDER BY
                CASE
                    WHEN admitted_scope.source_venue_id IS NOT NULL
                     AND venues.source_venue_id = admitted_scope.source_venue_id
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
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.paper_text (
            corpus_id,
            title_hash,
            abstract_hash,
            text_availability,
            title,
            abstract,
            tldr
        )
        WITH admitted_scope AS (
            SELECT raw.*
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status IN ('corpus', 'mapped')
        )
        SELECT
            admitted_scope.corpus_id,
            substring(digest(coalesce(admitted_scope.title, ''), 'sha1') for 16),
            CASE
                WHEN admitted_scope.abstract IS NULL THEN NULL
                ELSE substring(digest(admitted_scope.abstract, 'sha1') for 16)
            END,
            CASE
                WHEN admitted_scope.abstract IS NOT NULL THEN $2::SMALLINT
                ELSE $3::SMALLINT
            END,
            coalesce(admitted_scope.title, ''),
            admitted_scope.abstract,
            admitted_scope.tldr
        FROM admitted_scope
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


async def _upsert_paper_authors(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.authors (source_author_id, display_name)
        SELECT DISTINCT raw_authors.source_author_id, raw_authors.name_raw
        FROM solemd.s2_paper_authors_raw raw_authors
        JOIN solemd.s2_papers_raw raw
          ON raw.paper_id = raw_authors.paper_id
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = raw.corpus_id
        WHERE raw.source_release_id = $1
          AND raw.corpus_id IS NOT NULL
          AND corpus.domain_status = 'mapped'
          AND raw_authors.source_author_id IS NOT NULL
        ON CONFLICT (source_author_id)
        DO UPDATE SET display_name = EXCLUDED.display_name
        """,
        s2_source_release_id,
    )
    await connection.execute(
        """
        WITH missing_names AS (
            SELECT DISTINCT raw_authors.name_raw
            FROM solemd.s2_paper_authors_raw raw_authors
            JOIN solemd.s2_papers_raw raw
              ON raw.paper_id = raw_authors.paper_id
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status = 'mapped'
              AND raw_authors.source_author_id IS NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM solemd.authors authors
                    WHERE authors.normalized_name = solemd.normalize_lookup_key(raw_authors.name_raw)
              )
        )
        INSERT INTO solemd.authors (display_name)
        SELECT name_raw
        FROM missing_names
        """,
        s2_source_release_id,
    )
    await connection.execute(
        """
        DELETE FROM solemd.paper_authors
        WHERE corpus_id IN (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        """,
        s2_source_release_id,
    )
    await connection.execute(
        """
        INSERT INTO solemd.paper_authors (
            corpus_id,
            author_id,
            author_ordinal,
            affiliation_text
        )
        SELECT
            raw.corpus_id,
            authors.author_id,
            raw_authors.author_ordinal::SMALLINT,
            raw_authors.affiliation_raw
        FROM solemd.s2_paper_authors_raw raw_authors
        JOIN solemd.s2_papers_raw raw
          ON raw.paper_id = raw_authors.paper_id
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = raw.corpus_id
        JOIN solemd.authors authors
          ON (
                raw_authors.source_author_id IS NOT NULL
                AND authors.source_author_id = raw_authors.source_author_id
             )
             OR (
                raw_authors.source_author_id IS NULL
                AND authors.normalized_name = solemd.normalize_lookup_key(raw_authors.name_raw)
             )
        WHERE raw.source_release_id = $1
          AND raw.corpus_id IS NOT NULL
          AND corpus.domain_status = 'mapped'
        """,
        s2_source_release_id,
    )


async def _replace_entity_annotations(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        DELETE FROM pubtator.entity_annotations annotations
        USING release_scope
        WHERE annotations.source_release_id = $2
          AND annotations.corpus_id = release_scope.corpus_id
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )
    await connection.execute(
        """
        INSERT INTO pubtator.entity_annotations (
            corpus_id,
            source_release_id,
            start_offset,
            end_offset,
            pmid,
            entity_type,
            mention_text,
            concept_id_raw,
            resource
        )
        WITH mapped_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status = 'mapped'
        )
        SELECT
            stage.corpus_id,
            stage.source_release_id,
            stage.start_offset,
            stage.end_offset,
            stage.pmid,
            stage.entity_type,
            stage.mention_text,
            stage.concept_id_raw,
            stage.resource
        FROM pubtator.entity_annotations_stage stage
        JOIN mapped_scope
          ON mapped_scope.corpus_id = stage.corpus_id
        WHERE stage.source_release_id = $1
        ON CONFLICT (corpus_id, start_offset, end_offset, concept_id_raw)
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            pmid = EXCLUDED.pmid,
            entity_type = EXCLUDED.entity_type,
            mention_text = EXCLUDED.mention_text,
            resource = EXCLUDED.resource
        """,
        pt3_source_release_id,
        s2_source_release_id,
    )


async def _replace_relations(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
        )
        DELETE FROM pubtator.relations relations
        USING release_scope
        WHERE relations.source_release_id = $2
          AND relations.corpus_id = release_scope.corpus_id
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )
    await connection.execute(
        """
        INSERT INTO pubtator.relations (
            corpus_id,
            source_release_id,
            pmid,
            relation_type,
            subject_entity_id,
            object_entity_id,
            subject_type,
            object_type,
            relation_source
        )
        WITH mapped_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status = 'mapped'
        )
        SELECT
            stage.corpus_id,
            stage.source_release_id,
            stage.pmid,
            stage.relation_type,
            stage.subject_entity_id,
            stage.object_entity_id,
            stage.subject_type,
            stage.object_type,
            stage.relation_source
        FROM pubtator.relations_stage stage
        JOIN mapped_scope
          ON mapped_scope.corpus_id = stage.corpus_id
        WHERE stage.source_release_id = $1
          AND stage.relation_source = 1
        ON CONFLICT (corpus_id, subject_entity_id, relation_type, object_entity_id)
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            pmid = EXCLUDED.pmid,
            subject_type = EXCLUDED.subject_type,
            object_type = EXCLUDED.object_type,
            relation_source = EXCLUDED.relation_source
        """,
        pt3_source_release_id,
        s2_source_release_id,
    )
    await connection.execute(
        """
        INSERT INTO pubtator.relations (
            corpus_id,
            source_release_id,
            pmid,
            relation_type,
            subject_entity_id,
            object_entity_id,
            subject_type,
            object_type,
            relation_source
        )
        WITH mapped_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status = 'mapped'
        )
        SELECT
            stage.corpus_id,
            stage.source_release_id,
            stage.pmid,
            stage.relation_type,
            stage.subject_entity_id,
            stage.object_entity_id,
            stage.subject_type,
            stage.object_type,
            stage.relation_source
        FROM pubtator.relations_stage stage
        JOIN mapped_scope
          ON mapped_scope.corpus_id = stage.corpus_id
        WHERE stage.source_release_id = $1
          AND stage.relation_source = 2
        ON CONFLICT (corpus_id, subject_entity_id, relation_type, object_entity_id)
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            pmid = EXCLUDED.pmid,
            subject_type = EXCLUDED.subject_type,
            object_type = EXCLUDED.object_type,
            relation_source = EXCLUDED.relation_source
        WHERE pubtator.relations.relation_source <> 1
        """,
        pt3_source_release_id,
        s2_source_release_id,
    )
