from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import (
    PAPER_SCOPE,
    ScratchTableRef,
    artifact_ref,
    parse_create_table_row_count,
)
from app.corpus.models import CorpusPlan
from app.corpus.rollup_indexing import create_rollup_index


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
        CREATE UNLOGGED TABLE {ref.qualified_name}
        WITH (autovacuum_enabled = false, toast.autovacuum_enabled = false) AS
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
                coalesce(solemd.clean_venue(raw.venue_raw), '') AS normalized_venue,
                CASE
                    WHEN raw.doi_norm IS NOT NULL THEN 'doi:' || raw.doi_norm
                    WHEN raw.pmc_id IS NOT NULL THEN 'pmc:' || CASE
                        WHEN raw.pmc_id ~* '^PMC' THEN upper(raw.pmc_id)
                        ELSE 'PMC' || raw.pmc_id
                    END
                    WHEN raw.pmid IS NOT NULL THEN 'pmid:' || raw.pmid::TEXT
                    ELSE 's2:' || raw.paper_id
                END AS publication_identity_key
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
                assigned_by_s2.corpus_id,
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
            raw_scope.publication_identity_key,
            coalesce(metrics.reference_out_count, 0)::INTEGER AS reference_out_count,
            coalesce(metrics.influential_reference_count, 0)::INTEGER
                AS influential_reference_count,
            EXISTS (
                SELECT 1
                FROM pg_temp.selector_journal_names journals
                WHERE journals.normalized_venue = raw_scope.normalized_venue
            ) AS has_journal_match,
            coalesce(pattern_matches.pattern_matches, '[]'::JSONB) AS pattern_matches,
            CASE
                WHEN coalesce(
                    papers_by_s2.corpus_id,
                    papers_by_pmid.corpus_id,
                    papers_by_doi.corpus_id,
                    papers_by_pmc.corpus_id,
                    assigned_by_s2.corpus_id,
                    raw_scope.raw_corpus_id
                ) IS NULL THEN 0
                ELSE mod(
                    abs(hashtextextended(coalesce(
                        papers_by_s2.corpus_id,
                        papers_by_pmid.corpus_id,
                        papers_by_doi.corpus_id,
                        papers_by_pmc.corpus_id,
                        assigned_by_s2.corpus_id,
                        raw_scope.raw_corpus_id
                    )::TEXT, 0)),
                    $3
                )::INTEGER
            END AS bucket_id
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
        LEFT JOIN solemd.paper_corpus_assignments assigned_by_s2
          ON assigned_by_s2.s2_source_release_id = raw_scope.source_release_id
         AND assigned_by_s2.paper_id = raw_scope.paper_id
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
        bucket_count,
    )
    await create_rollup_index(connection, corpus_selection_run_id, PAPER_SCOPE, "paper", ref, "paper_id", unique=True)
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "corpus",
        ref,
        "corpus_id",
        where="corpus_id IS NOT NULL",
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "baseline_corpus",
        ref,
        "corpus_id",
        include=(
            "paper_id",
            "source_venue_id",
            "venue_raw",
            "publication_date",
            "year",
            "is_open_access",
            "pmid",
            "doi_norm",
            "pmc_id",
        ),
        where="corpus_id IS NOT NULL",
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "bucket_corpus",
        ref,
        "bucket_id, corpus_id",
        where="corpus_id IS NOT NULL",
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "journal_corpus",
        ref,
        "corpus_id",
        include=("normalized_venue", "venue_raw"),
        where="corpus_id IS NOT NULL AND has_journal_match",
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "pattern_corpus",
        ref,
        "corpus_id",
        include=("normalized_venue", "venue_raw", "pattern_matches"),
        where="corpus_id IS NOT NULL AND jsonb_array_length(pattern_matches) > 0",
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "pmid",
        ref,
        "pmid",
        where="pmid IS NOT NULL",
    )
    return parse_create_table_row_count(command_tag)


async def allocate_candidate_corpus_ids(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    bucket_count: int,
    entity_signal_checksum: str,
) -> None:
    async with connection.transaction():
        await _allocate_candidate_corpus_ids(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
            bucket_count=bucket_count,
            entity_signal_checksum=entity_signal_checksum,
        )


async def reconcile_paper_scope_identity_corpus_ids(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    bucket_count: int,
    entity_signal_checksum: str,
) -> int:
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    rewrites_ref = ScratchTableRef("pg_temp", "corpus_identity_rewrites")
    await connection.execute(f"DROP TABLE IF EXISTS {rewrites_ref.qualified_name}")
    await connection.execute(
        f"""
        CREATE TEMP TABLE {rewrites_ref.qualified_name} AS
        WITH identity_members AS (
            SELECT
                'identity:' || scope.publication_identity_key AS identity_key,
                scope.paper_id,
                scope.corpus_id
            FROM {paper_ref.qualified_name} scope
            WHERE scope.corpus_id IS NOT NULL
            UNION ALL
            SELECT
                'doi:' || scope.doi_norm AS identity_key,
                scope.paper_id,
                scope.corpus_id
            FROM {paper_ref.qualified_name} scope
            WHERE scope.corpus_id IS NOT NULL
              AND scope.doi_norm IS NOT NULL
            UNION ALL
            SELECT
                'pmid:' || scope.pmid::TEXT AS identity_key,
                scope.paper_id,
                scope.corpus_id
            FROM {paper_ref.qualified_name} scope
            WHERE scope.corpus_id IS NOT NULL
              AND scope.pmid IS NOT NULL
            UNION ALL
            SELECT
                'pmc:' || CASE
                    WHEN scope.pmc_id ~* '^PMC' THEN upper(scope.pmc_id)
                    ELSE 'PMC' || scope.pmc_id
                END AS identity_key,
                scope.paper_id,
                scope.corpus_id
            FROM {paper_ref.qualified_name} scope
            WHERE scope.corpus_id IS NOT NULL
              AND scope.pmc_id IS NOT NULL
        ),
        key_rewrites AS (
            SELECT
                identity_key,
                min(corpus_id) AS canonical_corpus_id
            FROM identity_members
            GROUP BY identity_key
            HAVING count(DISTINCT corpus_id) > 1
        )
        SELECT
            members.paper_id,
            min(key_rewrites.canonical_corpus_id) AS corpus_id
        FROM identity_members members
        JOIN key_rewrites
          ON key_rewrites.identity_key = members.identity_key
        GROUP BY members.paper_id
        """
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "identity_rewrite_paper",
        rewrites_ref,
        "paper_id",
        unique=True,
    )
    await connection.execute(f"ANALYZE {rewrites_ref.qualified_name}")
    command_tag = await connection.execute(
        f"""
        UPDATE {paper_ref.qualified_name} scope
        SET corpus_id = rewrites.corpus_id
        FROM {rewrites_ref.qualified_name} rewrites
        WHERE rewrites.paper_id = scope.paper_id
          AND scope.corpus_id IS DISTINCT FROM rewrites.corpus_id
        """
    )
    rewritten_count = _parse_update_row_count(command_tag)
    await connection.execute(
        f"""
        UPDATE solemd.paper_corpus_assignments assignments
        SET corpus_id = rewrites.corpus_id,
            assigned_by_run_id = $2::UUID,
            selector_version = $3::TEXT,
            entity_signal_checksum = $4::TEXT,
            updated_at = now()
        FROM {rewrites_ref.qualified_name} rewrites
        WHERE assignments.s2_source_release_id = $1
          AND assignments.paper_id = rewrites.paper_id
          AND assignments.corpus_id IS DISTINCT FROM rewrites.corpus_id
        """,
        plan.s2_source_release_id,
        corpus_selection_run_id,
        plan.selector_version,
        entity_signal_checksum,
    )
    await connection.execute(
        f"""
        UPDATE solemd.paper_corpus_assignments assignments
        SET corpus_id = scope.corpus_id,
            assigned_by_run_id = $2::UUID,
            selector_version = $3::TEXT,
            entity_signal_checksum = $4::TEXT,
            updated_at = now()
        FROM {paper_ref.qualified_name} scope
        WHERE assignments.s2_source_release_id = $1
          AND assignments.paper_id = scope.paper_id
          AND scope.corpus_id IS NOT NULL
          AND assignments.corpus_id IS DISTINCT FROM scope.corpus_id
        """,
        plan.s2_source_release_id,
        corpus_selection_run_id,
        plan.selector_version,
        entity_signal_checksum,
    )
    if rewritten_count:
        await _update_bucket_ids_for_papers(
            connection,
            paper_ref=paper_ref,
            paper_ids_ref=rewrites_ref,
            bucket_count=bucket_count,
        )
        await connection.execute(f"ANALYZE {paper_ref.qualified_name}")
    await connection.execute(f"DROP TABLE IF EXISTS {rewrites_ref.qualified_name}")
    return rewritten_count


async def _allocate_candidate_corpus_ids(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    bucket_count: int,
    entity_signal_checksum: str,
) -> None:
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    candidates_ref = ScratchTableRef("pg_temp", "corpus_candidate_missing")
    allocated_ref = ScratchTableRef("pg_temp", "corpus_candidate_allocated")
    await connection.execute(f"DROP TABLE IF EXISTS {allocated_ref.qualified_name}")
    await connection.execute(f"DROP TABLE IF EXISTS {candidates_ref.qualified_name}")
    await connection.execute(
        f"""
        CREATE TEMP TABLE {candidates_ref.qualified_name} (
            paper_id TEXT PRIMARY KEY
        )
        """,
    )
    await connection.execute(
        f"""
        INSERT INTO {candidates_ref.qualified_name} (paper_id)
        SELECT scope.paper_id
        FROM {paper_ref.qualified_name} scope
        WHERE scope.corpus_id IS NULL
          AND (
                ($1::BOOLEAN AND scope.has_journal_match)
             OR ($2::BOOLEAN AND jsonb_array_length(scope.pattern_matches) > 0)
          )
        ON CONFLICT (paper_id) DO NOTHING
        """,
        plan.selection_policy.corpus_admission.enable_journal_match,
        plan.selection_policy.corpus_admission.enable_venue_pattern_match,
    )
    await connection.execute(
        f"""
        INSERT INTO {candidates_ref.qualified_name} (paper_id)
        SELECT entity_papers.paper_id
        FROM (
            SELECT DISTINCT ON (signals.paper_id)
                signals.paper_id
            FROM solemd.paper_entity_signals signals
            WHERE $1::BOOLEAN
              AND signals.s2_source_release_id = $2
              AND signals.pt3_source_release_id = $3
              AND signals.entity_signal_checksum = $4
              AND signals.term_id IS NOT NULL
            ORDER BY signals.paper_id
        ) entity_papers
        JOIN {paper_ref.qualified_name} scope
          ON scope.paper_id = entity_papers.paper_id
         AND scope.corpus_id IS NULL
        ON CONFLICT (paper_id) DO NOTHING
        """,
        plan.selection_policy.corpus_admission.enable_vocab_entity_match,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        entity_signal_checksum,
    )
    await connection.execute(f"ANALYZE {candidates_ref.qualified_name}")
    await connection.execute(
        f"""
        CREATE TEMP TABLE {allocated_ref.qualified_name} AS
        WITH candidate_scope AS (
            SELECT
                candidates.paper_id,
                scope.publication_identity_key
            FROM {candidates_ref.qualified_name} candidates
            JOIN {paper_ref.qualified_name} scope
              ON scope.paper_id = candidates.paper_id
        ),
        candidate_identities AS (
            SELECT DISTINCT publication_identity_key
            FROM candidate_scope
        ),
        identity_allocations AS (
            SELECT
                candidate_identities.publication_identity_key,
                nextval(pg_get_serial_sequence('solemd.corpus', 'corpus_id'))::BIGINT
                    AS corpus_id
            FROM candidate_identities
            ORDER BY candidate_identities.publication_identity_key
        )
        SELECT
            candidates.paper_id,
            identity_allocations.corpus_id
        FROM candidate_scope candidates
        JOIN identity_allocations
          ON identity_allocations.publication_identity_key = candidates.publication_identity_key
        ORDER BY candidates.paper_id
        """
    )
    await create_rollup_index(
        connection,
        corpus_selection_run_id,
        PAPER_SCOPE,
        "allocated_candidate_paper",
        allocated_ref,
        "paper_id",
        unique=True,
    )
    await connection.execute(f"ANALYZE {allocated_ref.qualified_name}")
    await connection.execute(
        f"""
        INSERT INTO solemd.corpus (
            corpus_id,
            admission_reason,
            domain_status
        )
        SELECT
            allocated.corpus_id,
            'corpus_pending',
            'corpus'
        FROM {allocated_ref.qualified_name} allocated
        WHERE NOT EXISTS (
            SELECT 1
            FROM solemd.corpus corpus
            WHERE corpus.corpus_id = allocated.corpus_id
        )
        GROUP BY allocated.corpus_id
        """
    )
    await connection.execute(
        f"""
        INSERT INTO solemd.paper_corpus_assignments (
            s2_source_release_id,
            paper_id,
            corpus_id,
            assigned_by_run_id,
            selector_version,
            admission_reason,
            entity_signal_checksum,
            updated_at
        )
        SELECT
            $1::INTEGER,
            allocated.paper_id,
            allocated.corpus_id,
            $2::UUID,
            $3::TEXT,
            'corpus_pending',
            $4::TEXT,
            now()
        FROM {allocated_ref.qualified_name} allocated
        ON CONFLICT (s2_source_release_id, paper_id)
        DO UPDATE SET
            corpus_id = EXCLUDED.corpus_id,
            assigned_by_run_id = EXCLUDED.assigned_by_run_id,
            selector_version = EXCLUDED.selector_version,
            admission_reason = EXCLUDED.admission_reason,
            entity_signal_checksum = EXCLUDED.entity_signal_checksum,
            updated_at = now()
        WHERE solemd.paper_corpus_assignments.corpus_id
                IS DISTINCT FROM EXCLUDED.corpus_id
           OR solemd.paper_corpus_assignments.selector_version
                IS DISTINCT FROM EXCLUDED.selector_version
           OR solemd.paper_corpus_assignments.entity_signal_checksum
                IS DISTINCT FROM EXCLUDED.entity_signal_checksum
        """,
        plan.s2_source_release_id,
        corpus_selection_run_id,
        plan.selector_version,
        entity_signal_checksum,
    )
    conflicting_assignments = await connection.fetchval(
        f"""
        SELECT count(*)::BIGINT
        FROM {allocated_ref.qualified_name} allocated
        JOIN solemd.paper_corpus_assignments assignments
          ON assignments.s2_source_release_id = $1
         AND assignments.paper_id = allocated.paper_id
        WHERE assignments.corpus_id <> allocated.corpus_id
        """,
        plan.s2_source_release_id,
    )
    if conflicting_assignments:
        raise RuntimeError(
            "paper corpus assignment conflict for "
            f"{conflicting_assignments} candidate papers"
        )
    command_tag = await connection.execute(
        f"""
        UPDATE {paper_ref.qualified_name} scope
        SET corpus_id = allocated.corpus_id
        FROM {allocated_ref.qualified_name} allocated
        WHERE scope.paper_id = allocated.paper_id
          AND scope.corpus_id IS DISTINCT FROM allocated.corpus_id
        """
    )
    allocated_count = _parse_update_row_count(command_tag)
    if allocated_count:
        await _update_bucket_ids_for_papers(
            connection,
            paper_ref=paper_ref,
            paper_ids_ref=allocated_ref,
            bucket_count=bucket_count,
        )
        await connection.execute(f"ANALYZE {paper_ref.qualified_name}")
    await connection.execute(f"DROP TABLE IF EXISTS {allocated_ref.qualified_name}")
    await connection.execute(f"DROP TABLE IF EXISTS {candidates_ref.qualified_name}")


def _parse_update_row_count(command_tag: str) -> int:
    try:
        return int(command_tag.rsplit(" ", 1)[-1])
    except ValueError:
        return 0


async def _update_bucket_ids_for_papers(
    connection: asyncpg.Connection,
    *,
    paper_ref: ScratchTableRef,
    paper_ids_ref: ScratchTableRef,
    bucket_count: int,
) -> None:
    await connection.execute(
        f"""
        UPDATE {paper_ref.qualified_name} scope
        SET bucket_id = mod(abs(hashtextextended(scope.corpus_id::TEXT, 0)), $1)::INTEGER
        FROM {paper_ids_ref.qualified_name} changed_papers
        WHERE changed_papers.paper_id = scope.paper_id
          AND scope.corpus_id IS NOT NULL
          AND scope.bucket_id IS DISTINCT FROM
              mod(abs(hashtextextended(scope.corpus_id::TEXT, 0)), $1)::INTEGER
        """,
        bucket_count,
    )
