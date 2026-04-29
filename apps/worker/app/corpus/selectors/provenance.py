from __future__ import annotations

import asyncio
from uuid import UUID

import asyncpg

from app.corpus.artifacts import PAPER_SCOPE, RELATION_AGGREGATE
from app.corpus.entity_signals import entity_signal_checksum
from app.corpus.materialize_chunks import (
    SELECTION_SUMMARY_PHASE_NAME,
    drain_phase_chunks,
    drain_phase_chunks_from_pool,
    ensure_phase_chunks,
    parse_command_row_count,
    prepare_phase_chunks_for_resume,
)
from app.corpus.models import CorpusPlan
from app.corpus.rollups import relation_rollup_refs, selection_rollup_refs


PHASE_NAME = SELECTION_SUMMARY_PHASE_NAME


async def refresh_selection_summary(
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
    relation_refs = await relation_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    paper_scope_table = refs[PAPER_SCOPE].qualified_name
    relation_aggregate_table = relation_refs[RELATION_AGGREGATE].qualified_name
    checksum = entity_signal_checksum(plan)

    async def refresh_bucket(
        worker_connection: asyncpg.Connection,
        bucket_id: int,
    ) -> dict[str, int]:
        return await _refresh_selection_summary_bucket(
            worker_connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
            paper_scope_table=paper_scope_table,
            relation_aggregate_table=relation_aggregate_table,
            entity_signal_checksum_value=checksum,
            bucket_id=bucket_id,
        )

    await ensure_phase_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=PHASE_NAME,
        bucket_count=bucket_count,
    )
    await prepare_phase_chunks_for_resume(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=PHASE_NAME,
        max_attempts=chunk_max_attempts,
    )
    if connection_pool is not None and max_parallel_chunks > 1:
        tasks = [
            asyncio.create_task(
                drain_phase_chunks_from_pool(
                    connection_pool,
                    corpus_selection_run_id=corpus_selection_run_id,
                    phase_name=PHASE_NAME,
                    materialize_bucket=refresh_bucket,
                )
            )
            for _ in range(max_parallel_chunks)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, BaseException):
                raise result
        return

    await drain_phase_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=PHASE_NAME,
        materialize_bucket=refresh_bucket,
    )


async def _refresh_selection_summary_bucket(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    paper_scope_table: str,
    relation_aggregate_table: str,
    entity_signal_checksum_value: str,
    bucket_id: int,
) -> dict[str, int]:
    command_tag = await connection.execute(
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
            raw_pubtator_entity_annotation_count,
            curated_entity_signal_count,
            relation_count,
            raw_pubtator_relation_count,
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
            incoming_citation_count,
            influential_citation_count,
            s2_fields_of_study,
            s2_publication_types,
            open_access_pdf_status,
            publication_venue_type,
            rag_candidate,
            rag_eligible,
            content_status,
            relevance_band,
            topic_tracks,
            organ_system_tracks,
            publication_type_tracks,
            mesh_major_tracks,
            has_cl_bridge,
            quality_warnings,
            mapped_priority_score,
            evidence_priority_score,
            updated_at
        )
        WITH bucket_scope AS MATERIALIZED (
            SELECT DISTINCT
                scope.paper_id,
                scope.corpus_id,
                scope.pmid
            FROM {paper_scope_table} scope
            WHERE scope.bucket_id = $6
              AND scope.corpus_id IS NOT NULL
        ),
        bucket_pmids AS MATERIALIZED (
            SELECT DISTINCT
                bucket_scope.corpus_id,
                bucket_scope.pmid
            FROM bucket_scope
            WHERE bucket_scope.pmid IS NOT NULL
        ),
        release_scope AS MATERIALIZED (
            SELECT
                scope.corpus_id,
                coalesce(
                    min(scope.normalized_venue) FILTER (WHERE scope.normalized_venue <> ''),
                    ''
                ) AS normalized_venue,
                CASE
                    WHEN max(scope.year) IS NULL THEN NULL
                    ELSE max(scope.year)::SMALLINT
                END AS publication_year,
                bool_or(scope.is_open_access) AS has_open_access,
                bool_or(scope.pmc_id IS NOT NULL) AS has_pmc_id,
                bool_or(
                    scope.pmc_id IS NOT NULL
                    OR scope.pmid IS NOT NULL
                    OR scope.doi_norm IS NOT NULL
                ) AS has_locator_candidate,
                max(scope.pmid) FILTER (WHERE scope.pmid IS NOT NULL) AS representative_pmid,
                bool_or(scope.has_abstract) AS has_abstract,
                max(scope.reference_out_count)::INTEGER AS reference_out_count,
                max(scope.influential_reference_count)::INTEGER
                    AS influential_reference_count,
                bool_or(coalesce(papers.is_retracted, false)) AS is_retracted
            FROM {paper_scope_table} scope
            LEFT JOIN solemd.papers papers
              ON papers.corpus_id = scope.corpus_id
            WHERE scope.bucket_id = $6
              AND scope.corpus_id IS NOT NULL
            GROUP BY scope.corpus_id
        ),
        signal_rollup AS MATERIALIZED (
            SELECT
                signals.corpus_id,
                bool_or(signals.signal_kind = 'journal_match') AS has_journal_match,
                bool_or(signals.signal_kind = 'pattern_match') AS has_pattern_match,
                bool_or(signals.signal_kind = 'vocab_entity_match')
                    AS has_vocab_entity_match,
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
                    sum(signals.signal_count) FILTER (
                        WHERE signals.signal_kind = 'journal_match'
                    ),
                    0
                )::INTEGER AS journal_signal_count,
                coalesce(
                    sum(signals.signal_count) FILTER (
                        WHERE signals.signal_kind = 'pattern_match'
                    ),
                    0
                )::INTEGER AS pattern_signal_count,
                coalesce(
                    sum(signals.signal_count) FILTER (
                        WHERE signals.signal_kind = 'vocab_entity_match'
                    ),
                    0
                )::INTEGER AS vocab_entity_signal_count,
                coalesce(
                    sum(signals.signal_count) FILTER (WHERE signals.contributes_to_mapped),
                    0
                )::INTEGER AS mapped_signal_count,
                coalesce(
                    sum(signals.signal_count) FILTER (
                        WHERE signals.signal_kind = 'mapped_entity_rule_match'
                          AND signals.contributes_to_mapped
                    ),
                    0
                )::INTEGER AS mapped_entity_signal_count,
                coalesce(
                    sum(signals.signal_count) FILTER (
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
            FROM release_scope
            JOIN solemd.corpus_selection_signals signals
              ON signals.corpus_id = release_scope.corpus_id
             AND signals.corpus_selection_run_id = $1
            GROUP BY signals.corpus_id
        ),
        entity_signal_rows AS MATERIALIZED (
            SELECT
                bucket_scope.corpus_id,
                signals.signal_count,
                signals.term_category,
                signals.rule_family_key,
                terms.organ_systems
            FROM bucket_scope
            JOIN solemd.paper_entity_signals signals
              ON signals.paper_id = bucket_scope.paper_id
             AND signals.s2_source_release_id = $3
             AND signals.pt3_source_release_id = $4
             AND signals.entity_signal_checksum = $5
            LEFT JOIN solemd.vocab_terms terms
              ON terms.term_id = signals.term_id
        ),
        entity_counts AS MATERIALIZED (
            SELECT
                entity_signal_rows.corpus_id,
                sum(entity_signal_rows.signal_count)::INTEGER
                    AS curated_entity_signal_count
            FROM entity_signal_rows
            GROUP BY entity_signal_rows.corpus_id
        ),
        topic_tracks AS MATERIALIZED (
            SELECT
                topic_values.corpus_id,
                array_agg(DISTINCT topic_values.topic ORDER BY topic_values.topic)
                    AS topic_tracks
            FROM (
                SELECT
                    entity_signal_rows.corpus_id,
                    lower(entity_signal_rows.term_category) AS topic
                FROM entity_signal_rows
                WHERE entity_signal_rows.term_category IS NOT NULL
                UNION ALL
                SELECT
                    entity_signal_rows.corpus_id,
                    lower(entity_signal_rows.rule_family_key) AS topic
                FROM entity_signal_rows
                WHERE entity_signal_rows.rule_family_key IS NOT NULL
            ) topic_values
            WHERE topic_values.topic <> ''
            GROUP BY topic_values.corpus_id
        ),
        organ_tracks AS MATERIALIZED (
            SELECT
                organ_values.corpus_id,
                array_agg(DISTINCT organ_values.organ_system ORDER BY organ_values.organ_system)
                    AS organ_system_tracks
            FROM (
                SELECT
                    entity_signal_rows.corpus_id,
                    lower(organ_system) AS organ_system
                FROM entity_signal_rows
                CROSS JOIN LATERAL unnest(entity_signal_rows.organ_systems) organ_system
            ) organ_values
            WHERE organ_values.organ_system <> ''
            GROUP BY organ_values.corpus_id
        ),
        raw_entity_counts AS MATERIALIZED (
            SELECT
                bucket_pmids.corpus_id,
                count(*)::INTEGER AS raw_pubtator_entity_annotation_count
            FROM bucket_pmids
            JOIN pubtator.entity_annotations_stage annotations
              ON annotations.source_release_id = $4
             AND annotations.pmid = bucket_pmids.pmid
            GROUP BY bucket_pmids.corpus_id
        ),
        raw_relation_counts AS MATERIALIZED (
            SELECT
                bucket_pmids.corpus_id,
                count(*)::INTEGER AS raw_pubtator_relation_count
            FROM bucket_pmids
            JOIN pubtator.relations_stage relations
              ON relations.source_release_id = $4
             AND relations.pmid = bucket_pmids.pmid
            GROUP BY bucket_pmids.corpus_id
        ),
        relation_counts AS MATERIALIZED (
            SELECT
                relation_rollup.corpus_id,
                sum(relation_rollup.signal_count)::INTEGER AS relation_count
            FROM {relation_aggregate_table} relation_rollup
            WHERE relation_rollup.bucket_id = $6
              AND relation_rollup.corpus_id IS NOT NULL
            GROUP BY relation_rollup.corpus_id
        ),
        canonical_text AS MATERIALIZED (
            SELECT
                text.corpus_id,
                max(text.text_availability)::INTEGER AS text_availability
            FROM solemd.paper_text text
            JOIN release_scope
              ON release_scope.corpus_id = text.corpus_id
            GROUP BY text.corpus_id
        ),
        s2_enrichment AS MATERIALIZED (
            SELECT
                bucket_scope.corpus_id,
                max(coalesce(enrichment.citation_count, 0))::INTEGER
                    AS incoming_citation_count,
                max(coalesce(enrichment.influential_citation_count, 0))::INTEGER
                    AS influential_citation_count,
                coalesce(
                    array_agg(DISTINCT lower(fields.field_name) ORDER BY lower(fields.field_name))
                        FILTER (WHERE fields.field_name IS NOT NULL),
                    ARRAY[]::TEXT[]
                ) AS s2_fields_of_study,
                coalesce(
                    array_agg(DISTINCT lower(publication_types.publication_type)
                        ORDER BY lower(publication_types.publication_type))
                        FILTER (WHERE publication_types.publication_type IS NOT NULL),
                    ARRAY[]::TEXT[]
                ) AS s2_publication_types,
                max(enrichment.open_access_pdf_status) AS open_access_pdf_status,
                max(enrichment.publication_venue_type) AS publication_venue_type
            FROM bucket_scope
            JOIN solemd.s2_paper_enrichment enrichment
              ON enrichment.source_release_id = $3
             AND enrichment.paper_id = bucket_scope.paper_id
            LEFT JOIN LATERAL unnest(enrichment.fields_of_study) fields(field_name)
              ON TRUE
            LEFT JOIN LATERAL unnest(enrichment.publication_types) publication_types(publication_type)
              ON TRUE
            GROUP BY bucket_scope.corpus_id
        ),
        quality_base AS MATERIALIZED (
            SELECT
                release_scope.corpus_id,
                corpus.domain_status,
                corpus.admission_reason,
                release_scope.normalized_venue,
                release_scope.publication_year,
                release_scope.has_open_access,
                release_scope.has_pmc_id,
                release_scope.has_locator_candidate,
                release_scope.has_abstract,
                release_scope.reference_out_count,
                release_scope.influential_reference_count,
                release_scope.is_retracted,
                coalesce(canonical_text.text_availability, 0) AS text_availability,
                coalesce(signal_rollup.has_journal_match, false) AS has_journal_match,
                coalesce(signal_rollup.has_pattern_match, false) AS has_pattern_match,
                coalesce(signal_rollup.has_vocab_entity_match, false)
                    AS has_vocab_entity_match,
                coalesce(signal_rollup.has_mapped_journal_match, false)
                    AS has_mapped_journal_match,
                coalesce(signal_rollup.has_mapped_pattern_match, false)
                    AS has_mapped_pattern_match,
                coalesce(signal_rollup.has_mapped_entity_match, false)
                    AS has_mapped_entity_match,
                coalesce(signal_rollup.has_mapped_relation_match, false)
                    AS has_mapped_relation_match,
                coalesce(signal_rollup.journal_signal_count, 0) AS journal_signal_count,
                coalesce(signal_rollup.pattern_signal_count, 0) AS pattern_signal_count,
                coalesce(signal_rollup.vocab_entity_signal_count, 0)
                    AS vocab_entity_signal_count,
                coalesce(entity_counts.curated_entity_signal_count, 0)
                    AS curated_entity_signal_count,
                coalesce(raw_entity_counts.raw_pubtator_entity_annotation_count, 0)
                    AS raw_pubtator_entity_annotation_count,
                coalesce(relation_counts.relation_count, 0) AS relation_count,
                coalesce(raw_relation_counts.raw_pubtator_relation_count, 0)
                    AS raw_pubtator_relation_count,
                coalesce(signal_rollup.mapped_signal_count, 0) AS mapped_signal_count,
                coalesce(signal_rollup.mapped_entity_signal_count, 0)
                    AS mapped_entity_signal_count,
                coalesce(signal_rollup.mapped_relation_signal_count, 0)
                    AS mapped_relation_signal_count,
                coalesce(signal_rollup.mapped_family_keys, ARRAY[]::TEXT[])
                    AS mapped_family_keys,
                coalesce(topic_tracks.topic_tracks, ARRAY[]::TEXT[]) AS topic_tracks,
                coalesce(organ_tracks.organ_system_tracks, ARRAY[]::TEXT[])
                    AS organ_system_tracks,
                coalesce(pubmed.publication_types, ARRAY[]::TEXT[])
                    AS publication_type_tracks,
                coalesce(pubmed.mesh_major_terms, ARRAY[]::TEXT[]) AS mesh_major_tracks,
                coalesce(s2_enrichment.incoming_citation_count, 0)
                    AS incoming_citation_count,
                coalesce(s2_enrichment.influential_citation_count, 0)
                    AS influential_citation_count,
                coalesce(s2_enrichment.s2_fields_of_study, ARRAY[]::TEXT[])
                    AS s2_fields_of_study,
                coalesce(s2_enrichment.s2_publication_types, ARRAY[]::TEXT[])
                    AS s2_publication_types,
                s2_enrichment.open_access_pdf_status,
                s2_enrichment.publication_venue_type,
                CASE
                    WHEN coalesce(canonical_text.text_availability, 0) >= 2
                    THEN 'fulltext_ready'
                    WHEN release_scope.has_abstract
                      OR pubmed.abstract_text IS NOT NULL
                      OR coalesce(canonical_text.text_availability, 0) >= 1
                    THEN 'abstract_ready'
                    WHEN release_scope.has_locator_candidate THEN 'metadata_only'
                    ELSE 'missing_text'
                END AS content_status
            FROM release_scope
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = release_scope.corpus_id
            LEFT JOIN signal_rollup
              ON signal_rollup.corpus_id = release_scope.corpus_id
            LEFT JOIN entity_counts
              ON entity_counts.corpus_id = release_scope.corpus_id
            LEFT JOIN topic_tracks
              ON topic_tracks.corpus_id = release_scope.corpus_id
            LEFT JOIN organ_tracks
              ON organ_tracks.corpus_id = release_scope.corpus_id
            LEFT JOIN raw_entity_counts
              ON raw_entity_counts.corpus_id = release_scope.corpus_id
            LEFT JOIN relation_counts
              ON relation_counts.corpus_id = release_scope.corpus_id
            LEFT JOIN raw_relation_counts
              ON raw_relation_counts.corpus_id = release_scope.corpus_id
            LEFT JOIN canonical_text
              ON canonical_text.corpus_id = release_scope.corpus_id
            LEFT JOIN solemd.pubmed_metadata pubmed
              ON pubmed.pmid = release_scope.representative_pmid
            LEFT JOIN s2_enrichment
              ON s2_enrichment.corpus_id = release_scope.corpus_id
        ),
        bridge_base AS MATERIALIZED (
            SELECT
                quality_base.*,
                (
                    quality_base.topic_tracks && ARRAY[
                        'behavior',
                        'clinical.symptom.neuropsychiatric',
                        'neuropsychiatric',
                        'psychiatry',
                        'psychology',
                        'psychologic.framework',
                        'systemic_bridge'
                    ]::TEXT[]
                    OR quality_base.organ_system_tracks && ARRAY[
                        'central_nervous_system',
                        'neurological',
                        'neuroscience',
                        'psychiatric',
                        'sleep'
                    ]::TEXT[]
                    OR quality_base.mesh_major_tracks && ARRAY[
                        'Mental Disorders',
                        'Nervous System Diseases',
                        'Sleep Wake Disorders'
                    ]::TEXT[]
                    OR quality_base.s2_fields_of_study && ARRAY[
                        'psychology'
                    ]::TEXT[]
                ) AS has_psych_anchor,
                (
                    EXISTS (
                        SELECT 1
                        FROM unnest(quality_base.organ_system_tracks) AS organs(organ_system)
                        WHERE organs.organ_system NOT IN (
                            'central_nervous_system',
                            'neurological',
                            'neuroscience',
                            'psychiatric',
                            'sleep'
                        )
                    )
                    OR quality_base.mesh_major_tracks && ARRAY[
                        'Cardiovascular Diseases',
                        'Critical Care',
                        'Endocrine System Diseases',
                        'Gastrointestinal Diseases',
                        'Immune System Diseases',
                        'Infections',
                        'Kidney Diseases',
                        'Liver Diseases',
                        'Lung Diseases',
                        'Neoplasms',
                        'Pain',
                        'Palliative Care',
                        'Pregnancy',
                        'Transplantation'
                    ]::TEXT[]
                    OR quality_base.topic_tracks && ARRAY[
                        'cardiac_toxicity',
                        'gi_toxicity',
                        'hematologic_toxicity',
                        'metabolic_toxicity'
                    ]::TEXT[]
                ) AS has_organ_anchor
            FROM quality_base
        ),
        scored AS MATERIALIZED (
            SELECT
                bridge_base.*,
                (
                    bridge_base.domain_status = 'mapped'
                    AND NOT bridge_base.is_retracted
                    AND (
                        bridge_base.has_mapped_relation_match
                        OR bridge_base.has_mapped_entity_match
                        OR bridge_base.has_mapped_journal_match
                        OR bridge_base.has_mapped_pattern_match
                        OR bridge_base.vocab_entity_signal_count > 0
                        OR bridge_base.curated_entity_signal_count > 0
                    )
                ) AS rag_candidate,
                (
                    bridge_base.has_psych_anchor
                    AND bridge_base.has_organ_anchor
                ) AS has_cl_bridge
            FROM bridge_base
        )
        SELECT
            scored.corpus_id,
            $1,
            $2,
            scored.domain_status,
            scored.admission_reason,
            scored.normalized_venue,
            scored.publication_year,
            scored.has_journal_match,
            scored.has_pattern_match,
            scored.has_vocab_entity_match,
            scored.has_mapped_journal_match,
            scored.has_mapped_pattern_match,
            scored.has_mapped_entity_match,
            scored.has_mapped_relation_match,
            scored.journal_signal_count,
            scored.pattern_signal_count,
            scored.vocab_entity_signal_count,
            scored.curated_entity_signal_count,
            scored.raw_pubtator_entity_annotation_count,
            scored.curated_entity_signal_count,
            scored.relation_count,
            scored.raw_pubtator_relation_count,
            scored.mapped_signal_count,
            scored.mapped_entity_signal_count,
            scored.mapped_relation_signal_count,
            scored.mapped_family_keys,
            scored.has_open_access,
            scored.has_pmc_id,
            scored.has_locator_candidate,
            scored.has_abstract,
            scored.reference_out_count,
            scored.influential_reference_count,
            scored.incoming_citation_count,
            scored.influential_citation_count,
            scored.s2_fields_of_study,
            scored.s2_publication_types,
            scored.open_access_pdf_status,
            scored.publication_venue_type,
            scored.rag_candidate,
            (
                scored.rag_candidate
                AND scored.content_status IN ('fulltext_ready', 'abstract_ready')
            ),
            scored.content_status,
            CASE
                WHEN scored.domain_status <> 'mapped' THEN 'low_confidence'
                WHEN scored.has_mapped_relation_match
                  OR scored.mapped_entity_signal_count >= 3
                  OR scored.curated_entity_signal_count >= 6
                THEN 'high_confidence'
                WHEN scored.has_cl_bridge THEN 'clinical_bridge'
                WHEN scored.has_mapped_journal_match
                  OR scored.has_mapped_pattern_match
                  OR scored.has_mapped_entity_match
                THEN 'venue_supported'
                WHEN scored.rag_candidate THEN 'weak_candidate'
                ELSE 'low_confidence'
            END,
            scored.topic_tracks,
            scored.organ_system_tracks,
            scored.publication_type_tracks,
            scored.mesh_major_tracks,
            scored.has_cl_bridge,
            jsonb_strip_nulls(
                jsonb_build_object(
                    'title_only', CASE
                        WHEN scored.content_status IN ('metadata_only', 'missing_text')
                        THEN true
                        ELSE NULL
                    END,
                    'missing_organ_tracks', CASE
                        WHEN scored.curated_entity_signal_count > 0
                         AND cardinality(scored.organ_system_tracks) = 0
                        THEN true
                        ELSE NULL
                    END,
                    'low_entity_signal', CASE
                        WHEN scored.domain_status = 'mapped'
                         AND scored.curated_entity_signal_count = 0
                         AND scored.mapped_entity_signal_count = 0
                        THEN true
                        ELSE NULL
                    END,
                    'raw_relation_without_rule_match', CASE
                        WHEN scored.raw_pubtator_relation_count > 0
                         AND scored.relation_count = 0
                        THEN true
                        ELSE NULL
                    END,
                    'retracted', CASE
                        WHEN scored.is_retracted THEN true
                        ELSE NULL
                    END
                )
            ),
            (
                CASE WHEN scored.domain_status = 'mapped' THEN 100 ELSE 0 END
                + CASE
                    WHEN scored.has_mapped_journal_match
                    THEN 60 ELSE 0
                  END
                + CASE
                    WHEN scored.has_mapped_pattern_match
                    THEN 35 ELSE 0
                  END
                + CASE
                    WHEN scored.has_mapped_entity_match
                    THEN 45 ELSE 0
                  END
                + CASE
                    WHEN scored.has_mapped_relation_match
                    THEN 50 ELSE 0
                  END
                + CASE
                    WHEN scored.has_journal_match
                    THEN 25 ELSE 0
                  END
                + CASE
                    WHEN scored.has_pattern_match
                    THEN 10 ELSE 0
                  END
                + least(scored.vocab_entity_signal_count, 10) * 8
                + least(scored.curated_entity_signal_count, 20) * 2
                + least(scored.relation_count, 10) * 4
                + least(scored.reference_out_count, 50)
                + least(scored.influential_reference_count, 10) * 4
                + least(scored.incoming_citation_count, 100) / 5
                + CASE WHEN scored.has_open_access THEN 10 ELSE 0 END
                + CASE WHEN scored.has_abstract THEN 10 ELSE 0 END
                + CASE WHEN scored.has_cl_bridge THEN 20 ELSE 0 END
            )::INTEGER,
            (
                CASE WHEN scored.domain_status = 'mapped' THEN 100 ELSE 0 END
                + CASE WHEN scored.content_status = 'fulltext_ready' THEN 90 ELSE 0 END
                + CASE WHEN scored.content_status = 'abstract_ready' THEN 35 ELSE 0 END
                + CASE WHEN scored.has_pmc_id THEN 80 ELSE 0 END
                + CASE WHEN scored.has_locator_candidate THEN 15 ELSE 0 END
                + CASE WHEN scored.has_open_access THEN 20 ELSE 0 END
                + CASE WHEN scored.has_abstract THEN 15 ELSE 0 END
                + CASE
                    WHEN scored.has_mapped_journal_match
                    THEN 12 ELSE 0
                  END
                + CASE
                    WHEN scored.has_mapped_pattern_match
                    THEN 8 ELSE 0
                  END
                + CASE
                    WHEN scored.has_mapped_entity_match
                    THEN 20 ELSE 0
                  END
                + CASE
                    WHEN scored.has_mapped_relation_match
                    THEN 25 ELSE 0
                  END
                + least(scored.curated_entity_signal_count, 20) * 4
                + least(scored.relation_count, 10) * 8
                + least(scored.vocab_entity_signal_count, 10) * 4
                + least(scored.influential_reference_count, 10) * 4
                + least(scored.incoming_citation_count, 100) / 5
                + CASE WHEN scored.has_cl_bridge THEN 30 ELSE 0 END
            )::INTEGER,
            now()
        FROM scored
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
            raw_pubtator_entity_annotation_count =
                EXCLUDED.raw_pubtator_entity_annotation_count,
            curated_entity_signal_count = EXCLUDED.curated_entity_signal_count,
            relation_count = EXCLUDED.relation_count,
            raw_pubtator_relation_count = EXCLUDED.raw_pubtator_relation_count,
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
            incoming_citation_count = EXCLUDED.incoming_citation_count,
            influential_citation_count = EXCLUDED.influential_citation_count,
            s2_fields_of_study = EXCLUDED.s2_fields_of_study,
            s2_publication_types = EXCLUDED.s2_publication_types,
            open_access_pdf_status = EXCLUDED.open_access_pdf_status,
            publication_venue_type = EXCLUDED.publication_venue_type,
            rag_candidate = EXCLUDED.rag_candidate,
            rag_eligible = EXCLUDED.rag_eligible,
            content_status = EXCLUDED.content_status,
            relevance_band = EXCLUDED.relevance_band,
            topic_tracks = EXCLUDED.topic_tracks,
            organ_system_tracks = EXCLUDED.organ_system_tracks,
            publication_type_tracks = EXCLUDED.publication_type_tracks,
            mesh_major_tracks = EXCLUDED.mesh_major_tracks,
            has_cl_bridge = EXCLUDED.has_cl_bridge,
            quality_warnings = EXCLUDED.quality_warnings,
            mapped_priority_score = EXCLUDED.mapped_priority_score,
            evidence_priority_score = EXCLUDED.evidence_priority_score,
            updated_at = EXCLUDED.updated_at
        """,
        corpus_selection_run_id,
        plan.selector_version,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        entity_signal_checksum_value,
        bucket_id,
    )
    return {"summary_rows": parse_command_row_count(command_tag)}
