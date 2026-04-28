from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import (
    ENTITY_AGGREGATE,
    MAPPED_ENTITY_DETAIL,
    MAPPED_RELATION_DETAIL,
    PAPER_SCOPE,
    RELATION_AGGREGATE,
    ScratchTableRef,
    artifact_ref,
    parse_create_table_row_count,
    quote_ident,
)
from app.corpus.models import CorpusPlan


async def build_paper_scope(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    bucket_count: int,
) -> int | None:
    ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    command_tag = await connection.execute(
        f"""
        CREATE UNLOGGED TABLE {ref.qualified_name} AS
        WITH raw_scope AS (
            SELECT
                raw.paper_id,
                raw.source_release_id,
                raw.corpus_id AS raw_corpus_id,
                raw.source_venue_id,
                raw.pmid,
                raw.doi_norm,
                raw.pmc_id,
                raw.venue_raw,
                raw.year,
                raw.publication_date,
                coalesce(raw.is_open_access, false) AS is_open_access,
                raw.abstract IS NOT NULL AS has_abstract,
                coalesce(solemd.clean_venue(raw.venue_raw), '') AS normalized_venue
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $1
        )
        SELECT
            raw_scope.paper_id,
            raw_scope.source_release_id,
            $2::INTEGER AS pt3_source_release_id,
            coalesce(
                papers_by_s2.corpus_id,
                papers_by_pmid.corpus_id,
                papers_by_doi.corpus_id,
                papers_by_pmc.corpus_id,
                raw_scope.raw_corpus_id
            ) AS corpus_id,
            raw_scope.source_venue_id,
            raw_scope.pmid,
            raw_scope.doi_norm,
            raw_scope.pmc_id,
            raw_scope.venue_raw,
            raw_scope.normalized_venue,
            raw_scope.year,
            raw_scope.publication_date,
            raw_scope.is_open_access,
            raw_scope.has_abstract,
            coalesce(metrics.reference_out_count, 0)::INTEGER AS reference_out_count,
            coalesce(metrics.influential_reference_count, 0)::INTEGER
                AS influential_reference_count,
            EXISTS (
                SELECT 1
                FROM pg_temp.selector_journal_names journals
                WHERE journals.normalized_venue = raw_scope.normalized_venue
            ) AS has_journal_match,
            coalesce(pattern_matches.pattern_matches, '[]'::JSONB) AS pattern_matches,
            0::INTEGER AS bucket_id
        FROM raw_scope
        LEFT JOIN solemd.papers papers_by_s2
          ON papers_by_s2.s2_paper_id = raw_scope.paper_id
        LEFT JOIN solemd.papers papers_by_pmid
          ON raw_scope.pmid IS NOT NULL
         AND papers_by_pmid.pmid = raw_scope.pmid
        LEFT JOIN solemd.papers papers_by_doi
          ON raw_scope.doi_norm IS NOT NULL
         AND papers_by_doi.doi_norm = raw_scope.doi_norm
        LEFT JOIN solemd.papers papers_by_pmc
          ON raw_scope.pmc_id IS NOT NULL
         AND papers_by_pmc.pmc_id = CASE
                WHEN raw_scope.pmc_id ~* '^PMC' THEN raw_scope.pmc_id
                ELSE 'PMC' || raw_scope.pmc_id
            END
        LEFT JOIN solemd.s2_paper_reference_metrics_raw metrics
          ON metrics.source_release_id = raw_scope.source_release_id
         AND metrics.citing_paper_id = raw_scope.paper_id
        LEFT JOIN LATERAL (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'pattern_key', patterns.pattern_key,
                    'like_pattern', patterns.like_pattern,
                    'promotes_to_mapped', patterns.promotes_to_mapped
                )
                ORDER BY patterns.pattern_key
            ) AS pattern_matches
            FROM pg_temp.selector_journal_patterns patterns
            WHERE raw_scope.normalized_venue LIKE patterns.like_pattern
        ) pattern_matches ON TRUE
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
    )
    await _create_index(connection, corpus_selection_run_id, PAPER_SCOPE, "paper", ref, "paper_id", unique=True)
    await _create_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "corpus",
        ref,
        "corpus_id",
        where="corpus_id IS NOT NULL",
    )
    await _create_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "pmid",
        ref,
        "pmid",
        where="pmid IS NOT NULL",
    )
    return parse_create_table_row_count(command_tag)


async def build_entity_aggregate(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> int | None:
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    ref = artifact_ref(corpus_selection_run_id, ENTITY_AGGREGATE)
    command_tag = await connection.execute(
        f"""
        CREATE UNLOGGED TABLE {ref.qualified_name} AS
        SELECT
            scope.paper_id,
            scope.corpus_id,
            scope.bucket_id,
            scope.source_release_id AS s2_source_release_id,
            $1::INTEGER AS pt3_source_release_id,
            annotations.entity_type,
            annotations.concept_id_raw,
            terms.term_id,
            terms.canonical_name AS term_canonical_name,
            terms.category AS term_category,
            coalesce(
                min(aliases.alias) FILTER (WHERE aliases.is_preferred),
                min(aliases.alias)
            ) AS matched_alias,
            rules.canonical_name AS rule_canonical_name,
            rules.family_key AS rule_family_key,
            rules.confidence AS rule_confidence,
            coalesce(rules.min_reference_count, 0)::INTEGER AS rule_min_reference_count,
            min(annotations.mention_text) AS matched_mention_text,
            count(*)::INTEGER AS signal_count,
            scope.reference_out_count
        FROM pubtator.entity_annotations_stage annotations
        JOIN {paper_ref.qualified_name} scope
          ON scope.pmid = annotations.pmid
        LEFT JOIN solemd.vocab_term_aliases aliases
          ON aliases.normalized_alias = solemd.normalize_lookup_key(annotations.mention_text)
        LEFT JOIN solemd.vocab_terms terms
          ON terms.term_id = aliases.term_id
        LEFT JOIN pg_temp.selector_entity_rules rules
          ON rules.entity_type = annotations.entity_type
         AND rules.concept_id_raw = annotations.concept_id_raw
        WHERE annotations.source_release_id = $1
          AND (terms.term_id IS NOT NULL OR rules.concept_id_raw IS NOT NULL)
        GROUP BY
            scope.paper_id,
            scope.corpus_id,
            scope.bucket_id,
            scope.source_release_id,
            annotations.entity_type,
            annotations.concept_id_raw,
            terms.term_id,
            terms.canonical_name,
            terms.category,
            rules.canonical_name,
            rules.family_key,
            rules.confidence,
            rules.min_reference_count,
            scope.reference_out_count
        """,
        plan.pt3_source_release_id,
    )
    await _create_index(connection, corpus_selection_run_id, ENTITY_AGGREGATE, "paper", ref, "paper_id")
    await _create_index(
        connection,
        corpus_selection_run_id,
        ENTITY_AGGREGATE,
        "corpus",
        ref,
        "corpus_id",
        where="corpus_id IS NOT NULL",
    )
    await _create_index(
        connection,
        corpus_selection_run_id,
        ENTITY_AGGREGATE,
        "term",
        ref,
        "term_id",
        where="term_id IS NOT NULL",
    )
    await _create_index(
        connection,
        corpus_selection_run_id,
        ENTITY_AGGREGATE,
        "rule",
        ref,
        "entity_type, concept_id_raw",
        where="rule_family_key IS NOT NULL",
    )
    return parse_create_table_row_count(command_tag)


async def allocate_candidate_corpus_ids(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    bucket_count: int,
) -> None:
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    entity_ref = artifact_ref(corpus_selection_run_id, ENTITY_AGGREGATE)
    await connection.execute(
        f"""
        WITH candidate_papers AS (
            SELECT paper_id
            FROM {paper_ref.qualified_name}
            WHERE ($1::BOOLEAN AND has_journal_match)
               OR ($2::BOOLEAN AND jsonb_array_length(pattern_matches) > 0)

            UNION

            SELECT paper_id
            FROM {entity_ref.qualified_name}
            WHERE $3::BOOLEAN
              AND term_id IS NOT NULL
        ),
        missing AS (
            SELECT scope.paper_id
            FROM {paper_ref.qualified_name} scope
            JOIN candidate_papers candidates
              ON candidates.paper_id = scope.paper_id
            WHERE scope.corpus_id IS NULL
            ORDER BY scope.paper_id
        ),
        allocated AS (
            SELECT
                missing.paper_id,
                nextval(pg_get_serial_sequence('solemd.corpus', 'corpus_id'))::BIGINT
                    AS corpus_id
            FROM missing
        ),
        inserted AS (
            INSERT INTO solemd.corpus (
                corpus_id,
                admission_reason,
                domain_status
            )
            SELECT
                allocated.corpus_id,
                'corpus_pending',
                'corpus'
            FROM allocated
        )
        UPDATE {paper_ref.qualified_name} scope
        SET corpus_id = coalesce(scope.corpus_id, allocated.corpus_id)
        FROM candidate_papers candidates
        LEFT JOIN allocated
          ON allocated.paper_id = candidates.paper_id
        WHERE scope.paper_id = candidates.paper_id
        """,
        plan.selection_policy.corpus_admission.enable_journal_match,
        plan.selection_policy.corpus_admission.enable_venue_pattern_match,
        plan.selection_policy.corpus_admission.enable_vocab_entity_match,
    )
    await connection.execute(
        f"""
        UPDATE {paper_ref.qualified_name} scope
        SET bucket_id = mod(abs(hashtextextended(scope.corpus_id::TEXT, 0)), $1)::INTEGER
        WHERE scope.corpus_id IS NOT NULL
        """,
        bucket_count,
    )
    await connection.execute(
        f"""
        UPDATE {entity_ref.qualified_name} entity_rollup
        SET corpus_id = scope.corpus_id,
            bucket_id = scope.bucket_id
        FROM {paper_ref.qualified_name} scope
        WHERE entity_rollup.paper_id = scope.paper_id
          AND entity_rollup.corpus_id IS DISTINCT FROM scope.corpus_id
        """
    )
    await connection.execute(
        f"""
        UPDATE solemd.s2_papers_raw raw
        SET corpus_id = scope.corpus_id
        FROM {paper_ref.qualified_name} scope
        WHERE raw.source_release_id = $1
          AND raw.paper_id = scope.paper_id
          AND scope.corpus_id IS NOT NULL
          AND raw.corpus_id IS DISTINCT FROM scope.corpus_id
        """,
        plan.s2_source_release_id,
    )
    await connection.execute(f"ANALYZE {paper_ref.qualified_name}")
    await connection.execute(f"ANALYZE {entity_ref.qualified_name}")


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
        CREATE UNLOGGED TABLE {ref.qualified_name} AS
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
         AND rules.object_id_raw = relations.object_entity_id
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
    await _create_index(connection, corpus_selection_run_id, RELATION_AGGREGATE, "corpus", ref, "corpus_id")
    await _create_index(
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
        CREATE UNLOGGED TABLE {ref.qualified_name} AS
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
    await _create_index(
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
        CREATE UNLOGGED TABLE {ref.qualified_name} AS
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
    await _create_index(
        connection,
        corpus_selection_run_id,
        MAPPED_RELATION_DETAIL,
        "bucket",
        ref,
        "bucket_id, corpus_id",
    )
    return parse_create_table_row_count(command_tag)


async def _create_index(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
    artifact_kind: str,
    suffix: str,
    ref: ScratchTableRef,
    columns: str,
    *,
    unique: bool = False,
    where: str | None = None,
) -> None:
    artifact_key = "".join(part[0] for part in artifact_kind.split("_"))
    index_name = quote_ident(
        f"idx_{corpus_selection_run_id.hex[:10]}_{artifact_key}_{suffix}"
    )
    unique_sql = "UNIQUE " if unique else ""
    where_sql = f" WHERE {where}" if where else ""
    await connection.execute(
        f"CREATE {unique_sql}INDEX {index_name} ON {ref.qualified_name} ({columns}){where_sql}"
    )
