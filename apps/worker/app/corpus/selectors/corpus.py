from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import ENTITY_AGGREGATE, PAPER_SCOPE
from app.corpus.models import CorpusPlan
from app.corpus.rollups import selection_rollup_refs


PHASE_NAME = "corpus_admission"


async def refresh_corpus_admission(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    refs = await selection_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    await connection.execute(
        """
        DELETE FROM solemd.corpus_selection_signals
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
        """,
        corpus_selection_run_id,
        PHASE_NAME,
    )
    if plan.selection_policy.corpus_admission.enable_journal_match:
        await _insert_journal_match_signals(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            paper_scope_table=refs[PAPER_SCOPE].qualified_name,
        )
    if plan.selection_policy.corpus_admission.enable_venue_pattern_match:
        await _insert_pattern_match_signals(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            paper_scope_table=refs[PAPER_SCOPE].qualified_name,
        )
    if plan.selection_policy.corpus_admission.enable_vocab_entity_match:
        await _insert_vocab_entity_match_signals(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            entity_aggregate_table=refs[ENTITY_AGGREGATE].qualified_name,
        )
    await _apply_corpus_status(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        paper_scope_table=refs[PAPER_SCOPE].qualified_name,
    )


async def _insert_journal_match_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    paper_scope_table: str,
) -> None:
    await connection.execute(
        f"""
        INSERT INTO solemd.corpus_selection_signals (
            corpus_selection_run_id,
            corpus_id,
            phase_name,
            signal_kind,
            family_key,
            match_key,
            match_value,
            signal_count,
            contributes_to_corpus,
            detail
        )
        SELECT
            $1,
            scope.corpus_id,
            'corpus_admission',
            'journal_match',
            'journal_inventory',
            'normalized_venue',
            scope.normalized_venue,
            1,
            true,
            jsonb_build_object(
                'normalized_venue', scope.normalized_venue,
                'venue_raw', scope.venue_raw
            )
        FROM {paper_scope_table} scope
        WHERE scope.corpus_id IS NOT NULL
          AND scope.has_journal_match
        """,
        corpus_selection_run_id,
    )


async def _insert_pattern_match_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    paper_scope_table: str,
) -> None:
    await connection.execute(
        f"""
        INSERT INTO solemd.corpus_selection_signals (
            corpus_selection_run_id,
            corpus_id,
            phase_name,
            signal_kind,
            family_key,
            match_key,
            match_value,
            signal_count,
            contributes_to_corpus,
            detail
        )
        SELECT
            $1,
            scope.corpus_id,
            'corpus_admission',
            'pattern_match',
            pattern_match.value ->> 'pattern_key',
            'like_pattern',
            pattern_match.value ->> 'like_pattern',
            1,
            true,
            jsonb_build_object(
                'normalized_venue', scope.normalized_venue,
                'venue_raw', scope.venue_raw
            )
        FROM {paper_scope_table} scope
        CROSS JOIN LATERAL jsonb_array_elements(scope.pattern_matches) AS pattern_match(value)
        WHERE scope.corpus_id IS NOT NULL
        """,
        corpus_selection_run_id,
    )


async def _insert_vocab_entity_match_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    entity_aggregate_table: str,
) -> None:
    await connection.execute(
        f"""
        INSERT INTO solemd.corpus_selection_signals (
            corpus_selection_run_id,
            corpus_id,
            phase_name,
            signal_kind,
            family_key,
            match_key,
            match_value,
            signal_count,
            contributes_to_corpus,
            detail
        )
        SELECT
            $1,
            entity_rollup.corpus_id,
            'corpus_admission',
            'vocab_entity_match',
            'vocab_alias',
            'term_id',
            entity_rollup.term_id::TEXT,
            entity_rollup.signal_count,
            true,
            jsonb_build_object(
                'term_id', entity_rollup.term_id,
                'canonical_name', entity_rollup.term_canonical_name,
                'category', entity_rollup.term_category,
                'matched_alias', entity_rollup.matched_alias
            )
        FROM {entity_aggregate_table} entity_rollup
        WHERE entity_rollup.corpus_id IS NOT NULL
          AND entity_rollup.term_id IS NOT NULL
        """,
        corpus_selection_run_id,
    )


async def _apply_corpus_status(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    paper_scope_table: str,
) -> None:
    await connection.execute(
        f"""
        WITH release_scope AS (
            SELECT scope.corpus_id
            FROM {paper_scope_table} scope
            WHERE scope.corpus_id IS NOT NULL
        ),
        signal_rollup AS (
            SELECT
                signals.corpus_id,
                bool_or(signals.signal_kind = 'journal_match') AS has_journal_match,
                bool_or(signals.signal_kind = 'pattern_match') AS has_pattern_match,
                bool_or(signals.signal_kind = 'vocab_entity_match') AS has_vocab_entity_match
            FROM solemd.corpus_selection_signals signals
            WHERE signals.corpus_selection_run_id = $1
              AND signals.phase_name = 'corpus_admission'
            GROUP BY signals.corpus_id
        ),
        resolved AS (
            SELECT
                release_scope.corpus_id,
                CASE
                    WHEN coalesce(signal_rollup.has_journal_match, false)
                      OR coalesce(signal_rollup.has_pattern_match, false)
                      OR coalesce(signal_rollup.has_vocab_entity_match, false)
                    THEN 'corpus'
                    ELSE 'retired'
                END AS domain_status,
                CASE
                    WHEN coalesce(signal_rollup.has_journal_match, false)
                     AND coalesce(signal_rollup.has_vocab_entity_match, false)
                    THEN 'journal_and_vocab'
                    WHEN coalesce(signal_rollup.has_journal_match, false)
                    THEN 'journal_match'
                    WHEN coalesce(signal_rollup.has_pattern_match, false)
                    THEN 'pattern_match'
                    WHEN coalesce(signal_rollup.has_vocab_entity_match, false)
                    THEN 'vocab_entity_match'
                    ELSE 'selection_retired'
                END AS admission_reason
            FROM release_scope
            LEFT JOIN signal_rollup
              ON signal_rollup.corpus_id = release_scope.corpus_id
        )
        UPDATE solemd.corpus corpus
        SET domain_status = resolved.domain_status,
            admission_reason = resolved.admission_reason,
            last_seen_at = now()
        FROM resolved
        WHERE corpus.corpus_id = resolved.corpus_id
        """,
        corpus_selection_run_id,
    )
