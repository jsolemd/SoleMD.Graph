from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.models import CorpusPlan
from app.document_schema import TEXT_AVAILABILITY_ABSTRACT, TEXT_AVAILABILITY_NONE


PHASE_NAME = "canonical_materialization"


async def materialize_selected_corpus(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    del corpus_selection_run_id
    await _sync_pubtator_stage_corpus_ids(
        connection,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _upsert_papers(connection, s2_source_release_id=plan.s2_source_release_id)
    await _upsert_paper_text(connection, s2_source_release_id=plan.s2_source_release_id)
    await _upsert_paper_authors(connection, s2_source_release_id=plan.s2_source_release_id)
    await _replace_paper_citations(connection, s2_source_release_id=plan.s2_source_release_id)
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
        SELECT
            raw.corpus_id,
            venues.venue_id,
            raw.publication_date,
            CASE
                WHEN raw.year IS NULL THEN NULL
                ELSE raw.year::SMALLINT
            END,
            raw.is_open_access,
            raw.pmid,
            raw.doi_norm,
            raw.pmc_id,
            raw.paper_id
        FROM solemd.s2_papers_raw raw
        LEFT JOIN solemd.venues venues
          ON venues.source_venue_id = raw.source_venue_id
        WHERE raw.source_release_id = $1
          AND raw.corpus_id IS NOT NULL
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
        SELECT
            raw.corpus_id,
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
        FROM solemd.s2_papers_raw raw
        WHERE raw.source_release_id = $1
          AND raw.corpus_id IS NOT NULL
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
        WHERE raw.source_release_id = $1
          AND raw.corpus_id IS NOT NULL
          AND raw_authors.source_author_id IS NOT NULL
        ON CONFLICT (source_author_id)
        DO UPDATE SET display_name = EXCLUDED.display_name
        """,
        s2_source_release_id,
    )


async def _replace_paper_citations(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
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
        INSERT INTO solemd.paper_citations (
            corpus_id,
            reference_checksum,
            cited_corpus_id,
            cited_s2_paper_id,
            linkage_status,
            is_influential,
            intent_raw
        )
        SELECT
            citing_raw.corpus_id,
            refs.reference_checksum,
            cited_papers.corpus_id,
            refs.cited_paper_id,
            refs.linkage_status,
            refs.is_influential,
            refs.intent_raw
        FROM solemd.s2_paper_references_raw refs
        JOIN solemd.s2_papers_raw citing_raw
          ON citing_raw.source_release_id = $1
         AND citing_raw.paper_id = refs.citing_paper_id
         AND citing_raw.corpus_id IS NOT NULL
        LEFT JOIN solemd.papers cited_papers
          ON cited_papers.s2_paper_id = refs.cited_paper_id
        WHERE refs.source_release_id = $1
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
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
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
        WHERE stage.source_release_id = $1
          AND stage.corpus_id IS NOT NULL
        ON CONFLICT (corpus_id, start_offset, end_offset, concept_id_raw)
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            pmid = EXCLUDED.pmid,
            entity_type = EXCLUDED.entity_type,
            mention_text = EXCLUDED.mention_text,
            resource = EXCLUDED.resource
        """,
        pt3_source_release_id,
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
        WHERE stage.source_release_id = $1
          AND stage.relation_source = 1
          AND stage.corpus_id IS NOT NULL
        ON CONFLICT (corpus_id, subject_entity_id, relation_type, object_entity_id)
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            pmid = EXCLUDED.pmid,
            subject_type = EXCLUDED.subject_type,
            object_type = EXCLUDED.object_type,
            relation_source = EXCLUDED.relation_source
        """,
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
        WHERE stage.source_release_id = $1
          AND stage.relation_source = 2
          AND stage.corpus_id IS NOT NULL
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
    )
