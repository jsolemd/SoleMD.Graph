from __future__ import annotations

import asyncio
from uuid import UUID

import asyncpg

from app.corpus.artifacts import MAPPED_ENTITY_DETAIL, MAPPED_RELATION_DETAIL, PAPER_SCOPE
from app.corpus.materialize_chunks import (
    MAPPED_SURFACES_PHASE_NAME,
    drain_mapped_chunks,
    drain_mapped_chunks_from_pool,
    ensure_mapped_chunks,
    parse_command_row_count,
    prepare_mapped_chunks_for_resume,
)
from app.corpus.models import CorpusPlan
from app.corpus.rollups import mapped_detail_rollup_refs, selection_rollup_refs


PRIMARY_RELATION_SOURCE = 1
SECONDARY_RELATION_SOURCE = 2


async def materialize_mapped_surfaces(
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
    detail_refs = await mapped_detail_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    paper_scope_table = refs[PAPER_SCOPE].qualified_name
    entity_detail_table = detail_refs[MAPPED_ENTITY_DETAIL].qualified_name
    relation_detail_table = detail_refs[MAPPED_RELATION_DETAIL].qualified_name
    await _upsert_mapped_source_authors(
        connection,
        paper_scope_table=paper_scope_table,
        s2_source_release_id=plan.s2_source_release_id,
    )

    async def materialize_bucket(
        worker_connection: asyncpg.Connection,
        bucket_id: int,
    ) -> dict[str, int]:
        return await _materialize_bucket(
            worker_connection,
            bucket_id=bucket_id,
            paper_scope_table=paper_scope_table,
            entity_detail_table=entity_detail_table,
            relation_detail_table=relation_detail_table,
            s2_source_release_id=plan.s2_source_release_id,
            pt3_source_release_id=plan.pt3_source_release_id,
        )

    await ensure_mapped_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        bucket_count=bucket_count,
    )
    await prepare_mapped_chunks_for_resume(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        max_attempts=chunk_max_attempts,
    )
    if connection_pool is not None and max_parallel_chunks > 1:
        tasks = [
            asyncio.create_task(
                drain_mapped_chunks_from_pool(
                    connection_pool,
                    corpus_selection_run_id=corpus_selection_run_id,
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

    await drain_mapped_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        materialize_bucket=materialize_bucket,
    )


async def _materialize_bucket(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    paper_scope_table: str,
    entity_detail_table: str,
    relation_detail_table: str,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> dict[str, int]:
    await _delete_mapped_bucket_surfaces(
        connection,
        bucket_id=bucket_id,
        paper_scope_table=paper_scope_table,
        pt3_source_release_id=pt3_source_release_id,
    )
    author_count = await _upsert_bucket_authors(
        connection,
        bucket_id=bucket_id,
        paper_scope_table=paper_scope_table,
        s2_source_release_id=s2_source_release_id,
    )
    entity_count = await _insert_bucket_entity_annotations(
        connection,
        bucket_id=bucket_id,
        entity_detail_table=entity_detail_table,
    )
    relation_count = await _insert_bucket_relations(
        connection,
        bucket_id=bucket_id,
        relation_detail_table=relation_detail_table,
    )
    return {
        "paper_authors": author_count,
        "entity_annotations": entity_count,
        "relations": relation_count,
    }


async def _delete_mapped_bucket_surfaces(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    paper_scope_table: str,
    pt3_source_release_id: int,
) -> None:
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


async def _upsert_bucket_authors(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    paper_scope_table: str,
    s2_source_release_id: int,
) -> int:
    await connection.execute(
        f"""
        WITH missing_names AS (
            SELECT DISTINCT ON (solemd.normalize_lookup_key(raw_authors.name_raw))
                raw_authors.name_raw
            FROM solemd.s2_paper_authors_raw raw_authors
            JOIN {paper_scope_table} scope
              ON scope.paper_id = raw_authors.paper_id
             AND scope.bucket_id = $2
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = scope.corpus_id
             AND corpus.domain_status = 'mapped'
            WHERE scope.source_release_id = $1
              AND raw_authors.source_author_id IS NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM solemd.authors authors
                    WHERE authors.normalized_name = solemd.normalize_lookup_key(raw_authors.name_raw)
              )
            ORDER BY
                solemd.normalize_lookup_key(raw_authors.name_raw),
                length(btrim(raw_authors.name_raw)) DESC,
                raw_authors.name_raw
        )
        INSERT INTO solemd.authors (display_name)
        SELECT name_raw
        FROM missing_names
        ON CONFLICT (normalized_name) WHERE source_author_id IS NULL
        DO NOTHING
        """,
        s2_source_release_id,
        bucket_id,
    )
    command_tag = await connection.execute(
        f"""
        INSERT INTO solemd.paper_authors (
            corpus_id,
            author_id,
            author_ordinal,
            affiliation_text
        )
        WITH bucket_author_rows AS MATERIALIZED (
            SELECT DISTINCT ON (scope.corpus_id, raw_authors.author_ordinal)
                scope.corpus_id,
                raw_authors.source_author_id,
                raw_authors.name_raw,
                raw_authors.author_ordinal::SMALLINT AS author_ordinal,
                raw_authors.affiliation_raw
            FROM solemd.s2_paper_authors_raw raw_authors
            JOIN {paper_scope_table} scope
              ON scope.paper_id = raw_authors.paper_id
             AND scope.bucket_id = $2
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = scope.corpus_id
             AND corpus.domain_status = 'mapped'
            WHERE scope.source_release_id = $1
            ORDER BY
                scope.corpus_id,
                raw_authors.author_ordinal,
                (scope.pmid IS NULL),
                (scope.doi_norm IS NULL),
                (scope.pmc_id IS NULL),
                (raw_authors.source_author_id IS NULL),
                length(btrim(raw_authors.name_raw)) DESC,
                scope.paper_id,
                raw_authors.name_raw
        )
        SELECT
            bucket_author_rows.corpus_id,
            authors.author_id,
            bucket_author_rows.author_ordinal,
            bucket_author_rows.affiliation_raw
        FROM bucket_author_rows
        JOIN solemd.authors authors
          ON (
                bucket_author_rows.source_author_id IS NOT NULL
                AND authors.source_author_id = bucket_author_rows.source_author_id
             )
             OR (
                bucket_author_rows.source_author_id IS NULL
                AND authors.source_author_id IS NULL
                AND authors.normalized_name = solemd.normalize_lookup_key(bucket_author_rows.name_raw)
             )
        """,
        s2_source_release_id,
        bucket_id,
    )
    return parse_command_row_count(command_tag)


async def _upsert_mapped_source_authors(
    connection: asyncpg.Connection,
    *,
    paper_scope_table: str,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        f"""
        WITH source_author_rows AS MATERIALIZED (
            SELECT DISTINCT ON (raw_authors.source_author_id)
                raw_authors.source_author_id,
                raw_authors.name_raw
            FROM solemd.s2_paper_authors_raw raw_authors
            JOIN {paper_scope_table} scope
              ON scope.paper_id = raw_authors.paper_id
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = scope.corpus_id
             AND corpus.domain_status = 'mapped'
            WHERE scope.source_release_id = $1
              AND raw_authors.source_author_id IS NOT NULL
            ORDER BY
                raw_authors.source_author_id,
                length(btrim(raw_authors.name_raw)) DESC,
                raw_authors.name_raw
        )
        INSERT INTO solemd.authors (source_author_id, display_name)
        SELECT source_author_id, name_raw
        FROM source_author_rows
        ON CONFLICT (source_author_id)
        DO UPDATE SET display_name = EXCLUDED.display_name
        WHERE solemd.authors.display_name IS DISTINCT FROM EXCLUDED.display_name
        """,
        s2_source_release_id,
    )


async def _insert_bucket_entity_annotations(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    entity_detail_table: str,
) -> int:
    command_tag = await connection.execute(
        f"""
        WITH bucket_detail AS MATERIALIZED (
            SELECT DISTINCT ON (
                detail.corpus_id,
                detail.start_offset,
                detail.end_offset,
                detail.entity_type,
                digest(detail.concept_id_raw, 'sha256'),
                detail.resource
            )
                detail.corpus_id,
                detail.source_release_id,
                detail.start_offset,
                detail.end_offset,
                detail.pmid,
                detail.entity_type,
                detail.mention_text,
                detail.concept_id_raw,
                detail.resource
            FROM {entity_detail_table} detail
            WHERE detail.bucket_id = $1
            ORDER BY
                detail.corpus_id,
                detail.start_offset,
                detail.end_offset,
                detail.entity_type,
                digest(detail.concept_id_raw, 'sha256'),
                detail.resource,
                detail.source_release_id DESC,
                detail.pmid,
                length(btrim(detail.mention_text)) DESC,
                detail.mention_text
        )
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
            bucket_detail.corpus_id,
            bucket_detail.source_release_id,
            bucket_detail.start_offset,
            bucket_detail.end_offset,
            bucket_detail.pmid,
            bucket_detail.entity_type,
            bucket_detail.mention_text,
            bucket_detail.concept_id_raw,
            bucket_detail.resource
        FROM bucket_detail
        ON CONFLICT (
            corpus_id,
            start_offset,
            end_offset,
            entity_type,
            (digest(concept_id_raw, 'sha256')),
            resource
        )
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            pmid = EXCLUDED.pmid,
            mention_text = EXCLUDED.mention_text,
            resource = EXCLUDED.resource
        """,
        bucket_id,
    )
    return parse_command_row_count(command_tag)


async def _insert_bucket_relations(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    relation_detail_table: str,
) -> int:
    source_one_count = await _insert_bucket_relations_by_source(
        connection,
        bucket_id=bucket_id,
        relation_detail_table=relation_detail_table,
        relation_source=PRIMARY_RELATION_SOURCE,
    )
    source_two_count = await _insert_bucket_relations_by_source(
        connection,
        bucket_id=bucket_id,
        relation_detail_table=relation_detail_table,
        relation_source=SECONDARY_RELATION_SOURCE,
    )
    return source_one_count + source_two_count


async def _insert_bucket_relations_by_source(
    connection: asyncpg.Connection,
    *,
    bucket_id: int,
    relation_detail_table: str,
    relation_source: int,
) -> int:
    source_two_guard = (
        f"WHERE pubtator.relations.relation_source <> {PRIMARY_RELATION_SOURCE}"
        if relation_source == SECONDARY_RELATION_SOURCE
        else ""
    )
    command_tag = await connection.execute(
        f"""
        WITH bucket_detail AS MATERIALIZED (
            SELECT DISTINCT ON (
                detail.corpus_id,
                digest(detail.subject_entity_id, 'sha256'),
                detail.relation_type,
                digest(detail.object_entity_id, 'sha256')
            )
                detail.corpus_id,
                detail.source_release_id,
                detail.pmid,
                detail.relation_type,
                detail.subject_entity_id,
                detail.object_entity_id,
                detail.subject_type,
                detail.object_type,
                detail.relation_source
            FROM {relation_detail_table} detail
            WHERE detail.bucket_id = $1
              AND detail.relation_source = $2
            ORDER BY
                detail.corpus_id,
                digest(detail.subject_entity_id, 'sha256'),
                detail.relation_type,
                digest(detail.object_entity_id, 'sha256'),
                detail.source_release_id DESC,
                detail.pmid,
                detail.subject_type,
                detail.object_type
        )
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
            bucket_detail.corpus_id,
            bucket_detail.source_release_id,
            bucket_detail.pmid,
            bucket_detail.relation_type,
            bucket_detail.subject_entity_id,
            bucket_detail.object_entity_id,
            bucket_detail.subject_type,
            bucket_detail.object_type,
            bucket_detail.relation_source
        FROM bucket_detail
        ON CONFLICT (
            corpus_id,
            (digest(subject_entity_id, 'sha256')),
            relation_type,
            (digest(object_entity_id, 'sha256'))
        )
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            pmid = EXCLUDED.pmid,
            subject_type = EXCLUDED.subject_type,
            object_type = EXCLUDED.object_type,
            relation_source = EXCLUDED.relation_source
        {source_two_guard}
        """,
        bucket_id,
        relation_source,
    )
    return parse_command_row_count(command_tag)
