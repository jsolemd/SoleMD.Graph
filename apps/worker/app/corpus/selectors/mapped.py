from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.models import CorpusPlan


PHASE_NAME = "mapped_promotion"


async def refresh_mapped_promotion(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.corpus_selection_signals
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
        """,
        corpus_selection_run_id,
        PHASE_NAME,
    )
    await _insert_mapped_journal_signals(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
    )
    await _insert_mapped_pattern_signals(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
    )
    await _insert_mapped_entity_rule_signals(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
        direct_entity_confidences=plan.selection_policy.mapped.direct_entity_confidences,
    )
    await _insert_mapped_relation_rule_signals(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
        pt3_source_release_id=plan.pt3_source_release_id,
    )
    await _apply_mapped_status(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        s2_source_release_id=plan.s2_source_release_id,
        direct_entity_confidences=plan.selection_policy.mapped.direct_entity_confidences,
        second_gate_entity_confidences=plan.selection_policy.mapped.second_gate_entity_confidences,
        min_publication_year=plan.selection_policy.mapped.min_publication_year,
    )


async def _insert_mapped_journal_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT
                raw.corpus_id,
                raw.venue_raw,
                coalesce(solemd.clean_venue(raw.venue_raw), '') AS normalized_venue
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status = 'corpus'
        )
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
            release_scope.corpus_id,
            'mapped_promotion',
            'mapped_journal_match',
            'journal_inventory',
            'normalized_venue',
            release_scope.normalized_venue,
            1,
            true,
            jsonb_build_object(
                'normalized_venue', release_scope.normalized_venue,
                'venue_raw', release_scope.venue_raw
            )
        FROM release_scope
        JOIN pg_temp.selector_journal_names journals
          ON journals.normalized_venue = release_scope.normalized_venue
        """,
        corpus_selection_run_id,
        s2_source_release_id,
    )


async def _insert_mapped_pattern_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT
                raw.corpus_id,
                raw.venue_raw,
                coalesce(solemd.clean_venue(raw.venue_raw), '') AS normalized_venue
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status = 'corpus'
        )
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
            release_scope.corpus_id,
            'mapped_promotion',
            'mapped_pattern_match',
            patterns.pattern_key,
            'like_pattern',
            patterns.like_pattern,
            1,
            true,
            jsonb_build_object(
                'normalized_venue', release_scope.normalized_venue,
                'venue_raw', release_scope.venue_raw
            )
        FROM release_scope
        JOIN pg_temp.selector_journal_patterns patterns
          ON release_scope.normalized_venue LIKE patterns.like_pattern
        WHERE patterns.promotes_to_mapped
        """,
        corpus_selection_run_id,
        s2_source_release_id,
    )


async def _insert_mapped_entity_rule_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
    pt3_source_release_id: int,
    direct_entity_confidences: tuple[str, ...],
) -> None:
    await connection.execute(
        """
        WITH reference_counts AS (
            SELECT
                raw.corpus_id,
                count(*)::INTEGER AS reference_out_count
            FROM solemd.s2_paper_references_raw refs
            JOIN solemd.s2_papers_raw raw
              ON raw.source_release_id = $3
             AND raw.paper_id = refs.citing_paper_id
             AND raw.corpus_id IS NOT NULL
            WHERE refs.source_release_id = $3
            GROUP BY raw.corpus_id
        ),
        entity_hits AS (
            SELECT
                raw.corpus_id,
                rules.concept_id_raw,
                rules.canonical_name,
                rules.family_key,
                rules.confidence,
                rules.min_reference_count,
                coalesce(reference_counts.reference_out_count, 0) AS reference_out_count,
                min(annotations.mention_text) AS matched_mention_text,
                count(*)::INTEGER AS signal_count
            FROM pubtator.entity_annotations_stage annotations
            JOIN solemd.s2_papers_raw raw
              ON raw.source_release_id = $3
             AND raw.pmid = annotations.pmid
             AND raw.corpus_id IS NOT NULL
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
             AND corpus.domain_status = 'corpus'
            JOIN pg_temp.selector_entity_rules rules
              ON rules.entity_type = annotations.entity_type
             AND rules.concept_id_raw = annotations.concept_id_raw
            LEFT JOIN reference_counts
              ON reference_counts.corpus_id = raw.corpus_id
            WHERE annotations.source_release_id = $2
            GROUP BY
                raw.corpus_id,
                rules.concept_id_raw,
                rules.canonical_name,
                rules.family_key,
                rules.confidence,
                rules.min_reference_count,
                reference_counts.reference_out_count
        )
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
            entity_hits.corpus_id,
            'mapped_promotion',
            'mapped_entity_rule_match',
            entity_hits.family_key,
            'concept_id_raw',
            entity_hits.concept_id_raw,
            entity_hits.signal_count,
            (
                entity_hits.confidence = ANY($4::TEXT[])
                AND entity_hits.reference_out_count >= entity_hits.min_reference_count
            ),
            jsonb_build_object(
                'canonical_name', entity_hits.canonical_name,
                'confidence', entity_hits.confidence,
                'matched_mention_text', entity_hits.matched_mention_text,
                'min_reference_count', entity_hits.min_reference_count,
                'reference_out_count', entity_hits.reference_out_count
            )
        FROM entity_hits
        """,
        corpus_selection_run_id,
        pt3_source_release_id,
        s2_source_release_id,
        list(direct_entity_confidences),
    )


async def _insert_mapped_relation_rule_signals(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> None:
    await connection.execute(
        """
        WITH reference_counts AS (
            SELECT
                raw.corpus_id,
                count(*)::INTEGER AS reference_out_count
            FROM solemd.s2_paper_references_raw refs
            JOIN solemd.s2_papers_raw raw
              ON raw.source_release_id = $3
             AND raw.paper_id = refs.citing_paper_id
             AND raw.corpus_id IS NOT NULL
            WHERE refs.source_release_id = $3
            GROUP BY raw.corpus_id
        ),
        relation_hits AS (
            SELECT
                raw.corpus_id,
                rules.object_id_raw,
                rules.canonical_name,
                rules.family_key,
                rules.min_reference_count,
                coalesce(reference_counts.reference_out_count, 0) AS reference_out_count,
                count(*)::INTEGER AS signal_count
            FROM pubtator.relations_stage relations
            JOIN solemd.s2_papers_raw raw
              ON raw.source_release_id = $3
             AND raw.pmid = relations.pmid
             AND raw.corpus_id IS NOT NULL
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
             AND corpus.domain_status = 'corpus'
            JOIN pg_temp.selector_relation_rules rules
              ON rules.subject_type = relations.subject_type
             AND rules.relation_type = relations.relation_type
             AND rules.object_type = relations.object_type
             AND rules.object_id_raw = relations.object_entity_id
            LEFT JOIN reference_counts
              ON reference_counts.corpus_id = raw.corpus_id
            WHERE relations.source_release_id = $2
            GROUP BY
                raw.corpus_id,
                rules.object_id_raw,
                rules.canonical_name,
                rules.family_key,
                rules.min_reference_count,
                reference_counts.reference_out_count
        )
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
            relation_hits.corpus_id,
            'mapped_promotion',
            'mapped_relation_rule_match',
            relation_hits.family_key,
            'object_id_raw',
            relation_hits.object_id_raw,
            relation_hits.signal_count,
            relation_hits.reference_out_count >= relation_hits.min_reference_count,
            jsonb_build_object(
                'canonical_name', relation_hits.canonical_name,
                'min_reference_count', relation_hits.min_reference_count,
                'reference_out_count', relation_hits.reference_out_count
            )
        FROM relation_hits
        """,
        corpus_selection_run_id,
        pt3_source_release_id,
        s2_source_release_id,
    )


async def _apply_mapped_status(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
    direct_entity_confidences: tuple[str, ...],
    second_gate_entity_confidences: tuple[str, ...],
    min_publication_year: int,
) -> None:
    await connection.execute(
        """
        WITH release_scope AS (
            SELECT raw.corpus_id, raw.year
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $2
              AND raw.corpus_id IS NOT NULL
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
                CASE
                    WHEN release_scope.year IS NULL THEN true
                    WHEN release_scope.year >= $5 THEN true
                    ELSE false
                END AS meets_quality_floor,
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
        s2_source_release_id,
        list(direct_entity_confidences),
        list(second_gate_entity_confidences),
        min_publication_year,
    )
