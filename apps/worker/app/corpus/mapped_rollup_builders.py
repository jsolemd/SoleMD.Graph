from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import (
    MAPPED_ENTITY_DETAIL,
    MAPPED_RELATION_DETAIL,
    PAPER_SCOPE,
    RELATION_AGGREGATE,
    artifact_ref,
    parse_create_table_row_count,
)
from app.corpus.models import CorpusPlan
from app.corpus.rollup_indexing import create_rollup_index


async def build_relation_aggregate(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> int | None:
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    ref = artifact_ref(corpus_selection_run_id, RELATION_AGGREGATE)
    command_tag = await connection.execute(
        f"""
        CREATE UNLOGGED TABLE {ref.qualified_name}
        WITH (autovacuum_enabled = false, toast.autovacuum_enabled = false) AS
        SELECT
            scope.paper_id,
            scope.corpus_id,
            scope.bucket_id,
            scope.source_release_id AS s2_source_release_id,
            $1::INTEGER AS pt3_source_release_id,
            rules.subject_type,
            rules.relation_type,
            rules.object_type,
            rules.object_id_raw,
            rules.canonical_name,
            rules.family_key,
            rules.min_reference_count,
            count(*)::INTEGER AS signal_count,
            scope.reference_out_count
        FROM pubtator.relations_stage relations
        JOIN {paper_ref.qualified_name} scope
          ON scope.pmid = relations.pmid
         AND scope.corpus_id IS NOT NULL
        JOIN pg_temp.selector_relation_rules rules
          ON rules.subject_type = relations.subject_type
         AND rules.relation_type = relations.relation_type
         AND rules.object_type = relations.object_type
         AND relations.object_entity_id IN (
                rules.object_id_raw,
                rules.object_id_typed
             )
        WHERE relations.source_release_id = $1
        GROUP BY
            scope.paper_id,
            scope.corpus_id,
            scope.bucket_id,
            scope.source_release_id,
            rules.subject_type,
            rules.relation_type,
            rules.object_type,
            rules.object_id_raw,
            rules.canonical_name,
            rules.family_key,
            rules.min_reference_count,
            scope.reference_out_count
        """,
        plan.pt3_source_release_id,
    )
    await create_rollup_index(connection, corpus_selection_run_id, RELATION_AGGREGATE, "corpus", ref, "corpus_id")
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        RELATION_AGGREGATE,
        "rule",
        ref,
        "relation_type, object_type, object_id_raw",
    )
    return parse_create_table_row_count(command_tag)


async def build_mapped_entity_detail(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> int | None:
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    ref = artifact_ref(corpus_selection_run_id, MAPPED_ENTITY_DETAIL)
    command_tag = await connection.execute(
        f"""
        CREATE UNLOGGED TABLE {ref.qualified_name}
        WITH (autovacuum_enabled = false, toast.autovacuum_enabled = false) AS
        SELECT
            scope.bucket_id,
            scope.corpus_id,
            stage.source_release_id,
            stage.start_offset,
            stage.end_offset,
            stage.pmid,
            stage.entity_type,
            stage.mention_text,
            stage.concept_id_raw,
            stage.resource
        FROM pubtator.entity_annotations_stage stage
        JOIN {paper_ref.qualified_name} scope
          ON scope.pmid = stage.pmid
         AND scope.corpus_id IS NOT NULL
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = scope.corpus_id
         AND corpus.domain_status = 'mapped'
        WHERE stage.source_release_id = $1
        """,
        plan.pt3_source_release_id,
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        MAPPED_ENTITY_DETAIL,
        "bucket",
        ref,
        "bucket_id, corpus_id",
    )
    return parse_create_table_row_count(command_tag)


async def build_mapped_relation_detail(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> int | None:
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    ref = artifact_ref(corpus_selection_run_id, MAPPED_RELATION_DETAIL)
    command_tag = await connection.execute(
        f"""
        CREATE UNLOGGED TABLE {ref.qualified_name}
        WITH (autovacuum_enabled = false, toast.autovacuum_enabled = false) AS
        SELECT
            scope.bucket_id,
            scope.corpus_id,
            stage.source_release_id,
            stage.pmid,
            stage.relation_type,
            stage.subject_entity_id,
            stage.object_entity_id,
            stage.subject_type,
            stage.object_type,
            stage.relation_source
        FROM pubtator.relations_stage stage
        JOIN {paper_ref.qualified_name} scope
          ON scope.pmid = stage.pmid
         AND scope.corpus_id IS NOT NULL
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = scope.corpus_id
         AND corpus.domain_status = 'mapped'
        WHERE stage.source_release_id = $1
        """,
        plan.pt3_source_release_id,
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        MAPPED_RELATION_DETAIL,
        "bucket",
        ref,
        "bucket_id, corpus_id",
    )
    return parse_create_table_row_count(command_tag)

