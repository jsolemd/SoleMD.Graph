from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import ENTITY_AGGREGATE, PAPER_SCOPE, RELATION_AGGREGATE
from app.corpus.models import CorpusPlan
from app.corpus.rollups import selection_rollup_refs


PHASE_NAME = "selection_summary"


async def refresh_selection_summary(
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
        f"""
        INSERT INTO solemd.paper_selection_summary (
            corpus_id,
            corpus_selection_run_id,
            selector_version,
            current_status,
            primary_admission_reason,
            normalized_venue,
            publication_year,
            has_journal_match,
            has_pattern_match,
            has_vocab_entity_match,
            has_mapped_journal_match,
            has_mapped_pattern_match,
            has_mapped_entity_match,
            has_mapped_relation_match,
            journal_signal_count,
            pattern_signal_count,
            vocab_entity_signal_count,
            entity_annotation_count,
            relation_count,
            mapped_signal_count,
            mapped_entity_signal_count,
            mapped_relation_signal_count,
            mapped_family_keys,
            has_open_access,
            has_pmc_id,
            has_locator_candidate,
            has_abstract,
            reference_out_count,
            influential_reference_count,
            mapped_priority_score,
            evidence_priority_score,
            updated_at
        )
        WITH release_scope AS (
            SELECT
                scope.corpus_id,
                scope.normalized_venue,
                CASE
                    WHEN scope.year IS NULL THEN NULL
                    ELSE scope.year::SMALLINT
                END AS publication_year,
                scope.is_open_access AS has_open_access,
                scope.pmc_id IS NOT NULL AS has_pmc_id,
                (scope.pmc_id IS NOT NULL OR scope.pmid IS NOT NULL OR scope.doi_norm IS NOT NULL)
                    AS has_locator_candidate,
                scope.has_abstract,
                scope.reference_out_count,
                scope.influential_reference_count
            FROM {refs[PAPER_SCOPE].qualified_name} scope
            WHERE scope.corpus_id IS NOT NULL
        ),
        signal_rollup AS (
            SELECT
                signals.corpus_id,
                bool_or(signals.signal_kind = 'journal_match') AS has_journal_match,
                bool_or(signals.signal_kind = 'pattern_match') AS has_pattern_match,
                bool_or(signals.signal_kind = 'vocab_entity_match') AS has_vocab_entity_match,
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
                    AND signals.contributes_to_mapped
                ) AS has_mapped_entity_match,
                bool_or(
                    signals.signal_kind = 'mapped_relation_rule_match'
                    AND signals.contributes_to_mapped
                ) AS has_mapped_relation_match,
                coalesce(
                    sum(signals.signal_count) FILTER (WHERE signals.signal_kind = 'journal_match'),
                    0
                )::INTEGER AS journal_signal_count,
                coalesce(
                    sum(signals.signal_count) FILTER (WHERE signals.signal_kind = 'pattern_match'),
                    0
                )::INTEGER AS pattern_signal_count,
                coalesce(
                    sum(signals.signal_count)
                        FILTER (WHERE signals.signal_kind = 'vocab_entity_match'),
                    0
                )::INTEGER AS vocab_entity_signal_count,
                coalesce(
                    sum(signals.signal_count) FILTER (WHERE signals.contributes_to_mapped),
                    0
                )::INTEGER AS mapped_signal_count,
                coalesce(
                    sum(signals.signal_count)
                        FILTER (
                            WHERE signals.signal_kind = 'mapped_entity_rule_match'
                              AND signals.contributes_to_mapped
                        ),
                    0
                )::INTEGER AS mapped_entity_signal_count,
                coalesce(
                    sum(signals.signal_count)
                        FILTER (
                            WHERE signals.signal_kind = 'mapped_relation_rule_match'
                              AND signals.contributes_to_mapped
                        ),
                    0
                )::INTEGER AS mapped_relation_signal_count,
                coalesce(
                    array_remove(
                        array_agg(DISTINCT signals.family_key)
                            FILTER (WHERE signals.contributes_to_mapped),
                        NULL
                    ),
                    ARRAY[]::TEXT[]
                ) AS mapped_family_keys
            FROM solemd.corpus_selection_signals signals
            WHERE signals.corpus_selection_run_id = $1
            GROUP BY signals.corpus_id
        ),
        entity_counts AS (
            SELECT
                entity_rollup.corpus_id,
                sum(entity_rollup.signal_count)::INTEGER AS entity_annotation_count
            FROM {refs[ENTITY_AGGREGATE].qualified_name} entity_rollup
            WHERE entity_rollup.corpus_id IS NOT NULL
            GROUP BY entity_rollup.corpus_id
        ),
        relation_counts AS (
            SELECT
                relation_rollup.corpus_id,
                sum(relation_rollup.signal_count)::INTEGER AS relation_count
            FROM {refs[RELATION_AGGREGATE].qualified_name} relation_rollup
            WHERE relation_rollup.corpus_id IS NOT NULL
            GROUP BY relation_rollup.corpus_id
        )
        SELECT
            release_scope.corpus_id,
            $1,
            $2,
            corpus.domain_status,
            corpus.admission_reason,
            release_scope.normalized_venue,
            release_scope.publication_year,
            coalesce(signal_rollup.has_journal_match, false),
            coalesce(signal_rollup.has_pattern_match, false),
            coalesce(signal_rollup.has_vocab_entity_match, false),
            coalesce(signal_rollup.has_mapped_journal_match, false),
            coalesce(signal_rollup.has_mapped_pattern_match, false),
            coalesce(signal_rollup.has_mapped_entity_match, false),
            coalesce(signal_rollup.has_mapped_relation_match, false),
            coalesce(signal_rollup.journal_signal_count, 0),
            coalesce(signal_rollup.pattern_signal_count, 0),
            coalesce(signal_rollup.vocab_entity_signal_count, 0),
            coalesce(entity_counts.entity_annotation_count, 0),
            coalesce(relation_counts.relation_count, 0),
            coalesce(signal_rollup.mapped_signal_count, 0),
            coalesce(signal_rollup.mapped_entity_signal_count, 0),
            coalesce(signal_rollup.mapped_relation_signal_count, 0),
            coalesce(signal_rollup.mapped_family_keys, ARRAY[]::TEXT[]),
            release_scope.has_open_access,
            release_scope.has_pmc_id,
            release_scope.has_locator_candidate,
            release_scope.has_abstract,
            release_scope.reference_out_count,
            release_scope.influential_reference_count,
            (
                CASE WHEN corpus.domain_status = 'mapped' THEN 100 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_journal_match, false) THEN 60 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_pattern_match, false) THEN 35 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_entity_match, false) THEN 45 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_relation_match, false) THEN 50 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_journal_match, false) THEN 25 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_pattern_match, false) THEN 10 ELSE 0 END
                + least(coalesce(signal_rollup.vocab_entity_signal_count, 0), 10) * 8
                + least(coalesce(entity_counts.entity_annotation_count, 0), 20) * 2
                + least(coalesce(relation_counts.relation_count, 0), 10) * 4
                + least(release_scope.reference_out_count, 50)
                + least(release_scope.influential_reference_count, 10) * 4
                + CASE WHEN release_scope.has_open_access THEN 10 ELSE 0 END
                + CASE WHEN release_scope.has_abstract THEN 10 ELSE 0 END
            )::INTEGER,
            (
                CASE WHEN corpus.domain_status = 'mapped' THEN 100 ELSE 0 END
                + CASE WHEN release_scope.has_pmc_id THEN 80 ELSE 0 END
                + CASE WHEN release_scope.has_locator_candidate THEN 15 ELSE 0 END
                + CASE WHEN release_scope.has_open_access THEN 20 ELSE 0 END
                + CASE WHEN release_scope.has_abstract THEN 15 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_journal_match, false) THEN 12 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_pattern_match, false) THEN 8 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_entity_match, false) THEN 20 ELSE 0 END
                + CASE WHEN coalesce(signal_rollup.has_mapped_relation_match, false) THEN 25 ELSE 0 END
                + least(coalesce(entity_counts.entity_annotation_count, 0), 20) * 4
                + least(coalesce(relation_counts.relation_count, 0), 10) * 8
                + least(coalesce(signal_rollup.vocab_entity_signal_count, 0), 10) * 4
                + least(release_scope.influential_reference_count, 10) * 4
            )::INTEGER,
            now()
        FROM release_scope
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = release_scope.corpus_id
        LEFT JOIN signal_rollup
          ON signal_rollup.corpus_id = release_scope.corpus_id
        LEFT JOIN entity_counts
          ON entity_counts.corpus_id = release_scope.corpus_id
        LEFT JOIN relation_counts
          ON relation_counts.corpus_id = release_scope.corpus_id
        ON CONFLICT (corpus_id) DO UPDATE
        SET corpus_selection_run_id = EXCLUDED.corpus_selection_run_id,
            selector_version = EXCLUDED.selector_version,
            current_status = EXCLUDED.current_status,
            primary_admission_reason = EXCLUDED.primary_admission_reason,
            normalized_venue = EXCLUDED.normalized_venue,
            publication_year = EXCLUDED.publication_year,
            has_journal_match = EXCLUDED.has_journal_match,
            has_pattern_match = EXCLUDED.has_pattern_match,
            has_vocab_entity_match = EXCLUDED.has_vocab_entity_match,
            has_mapped_journal_match = EXCLUDED.has_mapped_journal_match,
            has_mapped_pattern_match = EXCLUDED.has_mapped_pattern_match,
            has_mapped_entity_match = EXCLUDED.has_mapped_entity_match,
            has_mapped_relation_match = EXCLUDED.has_mapped_relation_match,
            journal_signal_count = EXCLUDED.journal_signal_count,
            pattern_signal_count = EXCLUDED.pattern_signal_count,
            vocab_entity_signal_count = EXCLUDED.vocab_entity_signal_count,
            entity_annotation_count = EXCLUDED.entity_annotation_count,
            relation_count = EXCLUDED.relation_count,
            mapped_signal_count = EXCLUDED.mapped_signal_count,
            mapped_entity_signal_count = EXCLUDED.mapped_entity_signal_count,
            mapped_relation_signal_count = EXCLUDED.mapped_relation_signal_count,
            mapped_family_keys = EXCLUDED.mapped_family_keys,
            has_open_access = EXCLUDED.has_open_access,
            has_pmc_id = EXCLUDED.has_pmc_id,
            has_locator_candidate = EXCLUDED.has_locator_candidate,
            has_abstract = EXCLUDED.has_abstract,
            reference_out_count = EXCLUDED.reference_out_count,
            influential_reference_count = EXCLUDED.influential_reference_count,
            mapped_priority_score = EXCLUDED.mapped_priority_score,
            evidence_priority_score = EXCLUDED.evidence_priority_score,
            updated_at = EXCLUDED.updated_at
        """,
        corpus_selection_run_id,
        plan.selector_version,
    )
