from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import PAPER_SCOPE, RELATION_AGGREGATE
from app.corpus.entity_signals import entity_signal_checksum
from app.corpus.models import CorpusPlan
from app.corpus.rollups import relation_rollup_refs, selection_rollup_refs


PHASE_NAME = "mapped_promotion"


async def refresh_mapped_promotion(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    refs = await selection_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    relation_refs = await relation_rollup_refs(
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
    if plan.selection_policy.mapped.enable_journal_match:
        await _insert_mapped_journal_signals(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            paper_scope_table=refs[PAPER_SCOPE].qualified_name,
        )
    if plan.selection_policy.mapped.enable_venue_pattern_match:
        await _insert_mapped_pattern_signals(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            paper_scope_table=refs[PAPER_SCOPE].qualified_name,
        )
    if plan.selection_policy.mapped.enable_entity_rule_match:
        await _insert_mapped_entity_rule_signals(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            paper_scope_table=refs[PAPER_SCOPE].qualified_name,
            plan=plan,
            direct_entity_confidences=plan.selection_policy.mapped.direct_entity_confidences,
        )
    if plan.selection_policy.mapped.enable_relation_rule_match:
        await _insert_mapped_relation_rule_signals(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            relation_aggregate_table=relation_refs[RELATION_AGGREGATE].qualified_name,
        )
    await _apply_mapped_status(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        paper_scope_table=refs[PAPER_SCOPE].qualified_name,
        direct_entity_confidences=plan.selection_policy.mapped.direct_entity_confidences,
        second_gate_entity_confidences=plan.selection_policy.mapped.second_gate_entity_confidences,
        min_publication_year=plan.selection_policy.mapped.min_publication_year,
    )


async def _insert_mapped_journal_signals(
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
            contributes_to_mapped,
            detail
        )
        SELECT
            $1,
            scope.corpus_id,
            'mapped_promotion',
            'mapped_journal_match',
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
          AND EXISTS (
              SELECT 1
              FROM solemd.corpus corpus
              WHERE corpus.corpus_id = scope.corpus_id
                AND corpus.domain_status = 'corpus'
          )
        """,
        corpus_selection_run_id,
    )


async def _insert_mapped_pattern_signals(
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
            contributes_to_mapped,
            detail
        )
        SELECT
            $1,
            scope.corpus_id,
            'mapped_promotion',
            'mapped_pattern_match',
            pattern_match.value ->> 'pattern_key',
            'like_pattern',
            pattern_match.value ->> 'like_pattern',
            1,
            true,
            jsonb_build_object(
                'normalized_venue', scope.normalized_venue,
                'venue_raw', scope.venue_raw
            )
        FROM (
            SELECT corpus_id, normalized_venue, venue_raw, pattern_matches
            FROM {paper_scope_table}
            WHERE corpus_id IS NOT NULL
              AND jsonb_array_length(pattern_matches) > 0
        ) scope
        CROSS JOIN LATERAL jsonb_array_elements(scope.pattern_matches) AS pattern_match(value)
        WHERE coalesce((pattern_match.value ->> 'promotes_to_mapped')::BOOLEAN, false)
          AND EXISTS (
              SELECT 1
              FROM solemd.corpus corpus
              WHERE corpus.corpus_id = scope.corpus_id
                AND corpus.domain_status = 'corpus'
          )
        """,
        corpus_selection_run_id,
    )


async def _insert_mapped_entity_rule_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    paper_scope_table: str,
    plan: CorpusPlan,
    direct_entity_confidences: tuple[str, ...],
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
            contributes_to_mapped,
            detail
        )
        SELECT
            $1,
            scope.corpus_id,
            'mapped_promotion',
            'mapped_entity_rule_match',
            signals.rule_family_key,
            'concept_id_raw',
            signals.concept_id_raw,
            signals.signal_count,
            (
                signals.rule_confidence = ANY($2::TEXT[])
                AND signals.reference_out_count >= signals.rule_min_reference_count
            ),
            jsonb_build_object(
                'canonical_name', signals.rule_canonical_name,
                'confidence', signals.rule_confidence,
                'matched_mention_text', signals.matched_mention_text,
                'min_reference_count', signals.rule_min_reference_count,
                'reference_out_count', signals.reference_out_count
            )
        FROM solemd.paper_entity_signals signals
        JOIN {paper_scope_table} scope
          ON scope.paper_id = signals.paper_id
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = scope.corpus_id
         AND corpus.domain_status = 'corpus'
        WHERE signals.s2_source_release_id = $3
          AND signals.pt3_source_release_id = $4
          AND signals.entity_signal_checksum = $5
          AND signals.rule_family_key IS NOT NULL
        """,
        corpus_selection_run_id,
        list(direct_entity_confidences),
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        entity_signal_checksum(plan),
    )


async def _insert_mapped_relation_rule_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    relation_aggregate_table: str,
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
            contributes_to_mapped,
            detail
        )
        SELECT
            $1,
            relation_rollup.corpus_id,
            'mapped_promotion',
            'mapped_relation_rule_match',
            relation_rollup.family_key,
            'object_id_raw',
            relation_rollup.object_id_raw,
            relation_rollup.signal_count,
            relation_rollup.reference_out_count >= relation_rollup.min_reference_count,
            jsonb_build_object(
                'canonical_name', relation_rollup.canonical_name,
                'min_reference_count', relation_rollup.min_reference_count,
                'reference_out_count', relation_rollup.reference_out_count
            )
        FROM {relation_aggregate_table} relation_rollup
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = relation_rollup.corpus_id
         AND corpus.domain_status = 'corpus'
        """,
        corpus_selection_run_id,
    )


async def _apply_mapped_status(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    paper_scope_table: str,
    direct_entity_confidences: tuple[str, ...],
    second_gate_entity_confidences: tuple[str, ...],
    min_publication_year: int,
) -> None:
    await connection.execute(
        f"""
        WITH release_scope AS (
            SELECT
                scope.corpus_id,
                bool_or(scope.year IS NULL OR scope.year >= $2) AS meets_quality_floor
            FROM {paper_scope_table} scope
            WHERE scope.corpus_id IS NOT NULL
            GROUP BY scope.corpus_id
        ),
        mapped_rollup AS (
            SELECT
                signals.corpus_id,
                bool_or(
                    signals.signal_kind = 'mapped_journal_match'
                    AND signals.contributes_to_mapped
                ) AS has_mapped_journal_match,
                bool_or(
                    signals.signal_kind = 'mapped_pattern_match'
                    AND signals.contributes_to_mapped
                ) AS has_mapped_pattern_match,
                bool_or(
                    signals.signal_kind = 'mapped_entity_rule_match'
                    AND coalesce(signals.detail ->> 'confidence', '') = ANY($3::TEXT[])
                    AND signals.contributes_to_mapped
                ) AS has_direct_entity_match,
                bool_or(
                    signals.signal_kind = 'mapped_entity_rule_match'
                    AND coalesce(signals.detail ->> 'confidence', '') = ANY($4::TEXT[])
                ) AS has_second_gate_entity_match,
                bool_or(
                    signals.signal_kind = 'mapped_relation_rule_match'
                    AND signals.contributes_to_mapped
                ) AS has_relation_rule_match
            FROM solemd.corpus_selection_signals signals
            WHERE signals.corpus_selection_run_id = $1
              AND signals.phase_name = 'mapped_promotion'
            GROUP BY signals.corpus_id
        ),
        resolved AS (
            SELECT
                release_scope.corpus_id,
                release_scope.meets_quality_floor,
                (
                    coalesce(mapped_rollup.has_mapped_journal_match, false)
                    OR coalesce(mapped_rollup.has_mapped_pattern_match, false)
                    OR coalesce(mapped_rollup.has_direct_entity_match, false)
                    OR coalesce(mapped_rollup.has_relation_rule_match, false)
                ) AS has_direct_mapping_signal,
                coalesce(mapped_rollup.has_second_gate_entity_match, false)
                    AS has_second_gate_entity_match
            FROM release_scope
            LEFT JOIN mapped_rollup
              ON mapped_rollup.corpus_id = release_scope.corpus_id
        ),
        applied AS (
            SELECT
                resolved.corpus_id,
                CASE
                    WHEN corpus.domain_status = 'retired' THEN 'retired'
                    WHEN resolved.meets_quality_floor
                     AND (
                        resolved.has_direct_mapping_signal
                        OR (
                            resolved.has_second_gate_entity_match
                            AND resolved.has_direct_mapping_signal
                        )
                     )
                    THEN 'mapped'
                    ELSE 'corpus'
                END AS domain_status
            FROM resolved
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = resolved.corpus_id
        ),
        updated_signals AS (
            UPDATE solemd.corpus_selection_signals signals
            SET contributes_to_mapped = (applied.domain_status = 'mapped')
            FROM applied
            WHERE signals.corpus_selection_run_id = $1
              AND signals.phase_name = 'mapped_promotion'
              AND signals.signal_kind = 'mapped_entity_rule_match'
              AND signals.corpus_id = applied.corpus_id
              AND coalesce(signals.detail ->> 'confidence', '') = ANY($4::TEXT[])
        )
        UPDATE solemd.corpus corpus
        SET domain_status = applied.domain_status,
            last_seen_at = now()
        FROM applied
        WHERE corpus.corpus_id = applied.corpus_id
        """,
        corpus_selection_run_id,
        min_publication_year,
        list(direct_entity_confidences),
        list(second_gate_entity_confidences),
    )
