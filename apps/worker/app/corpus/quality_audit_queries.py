from __future__ import annotations


EVIDENCE_PUBLICATION_TYPES = (
    "Meta-Analysis",
    "Systematic Review",
    "Randomized Controlled Trial",
    "Clinical Trial",
    "Practice Guideline",
    "Guideline",
    "Observational Study",
)
LOW_VALUE_PUBLICATION_TYPES = ("Editorial", "Letter", "Comment")
METADATA_ONLY_LOW_VALUE_PUBLICATION_TYPES = (
    "Editorial",
    "Letter",
    "Comment",
    "News",
    "Biography",
    "Portrait",
    "Published Erratum",
    "Retraction Notice",
    "Interview",
    "Bibliography",
    "Personal Narrative",
)

SUMMARY_METRICS_SQL = """
SELECT
    count(*)::BIGINT AS summary_rows,
    count(*) FILTER (WHERE current_status = 'corpus')::BIGINT AS corpus_rows,
    count(*) FILTER (WHERE current_status = 'mapped')::BIGINT AS mapped_rows,
    count(*) FILTER (WHERE rag_candidate)::BIGINT AS rag_candidate_rows,
    count(*) FILTER (WHERE rag_eligible)::BIGINT AS rag_eligible_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND content_status = 'metadata_only'
    )::BIGINT AS mapped_metadata_only_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND content_status = 'missing_text'
    )::BIGINT AS mapped_missing_text_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND quality_warnings ? 'missing_organ_tracks'
    )::BIGINT AS mapped_missing_organ_track_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND quality_warnings ? 'low_entity_signal'
    )::BIGINT AS mapped_low_signal_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND relevance_band = 'low_confidence'
    )::BIGINT AS mapped_low_confidence_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND relevance_band = 'weak_candidate'
    )::BIGINT AS mapped_weak_candidate_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND has_cl_bridge
    )::BIGINT AS mapped_cl_bridge_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND has_pmc_id
    )::BIGINT AS mapped_pmc_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped' AND cardinality(mesh_major_tracks) > 0
    )::BIGINT AS mapped_mesh_major_rows
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
"""

STATUS_DISTRIBUTION_SQL = """
SELECT
    current_status,
    count(*)::BIGINT AS rows,
    count(*) FILTER (WHERE rag_eligible)::BIGINT AS rag_eligible_rows,
    avg(mapped_priority_score)::INTEGER AS avg_mapped_priority_score,
    avg(evidence_priority_score)::INTEGER AS avg_evidence_priority_score
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
GROUP BY current_status
ORDER BY rows DESC, current_status
"""

MAPPED_RELEVANCE_CONTENT_SQL = """
SELECT
    relevance_band,
    content_status,
    count(*)::BIGINT AS rows,
    count(*) FILTER (WHERE rag_eligible)::BIGINT AS rag_eligible_rows,
    count(*) FILTER (WHERE has_cl_bridge)::BIGINT AS cl_bridge_rows,
    count(*) FILTER (WHERE has_mapped_relation_match)::BIGINT AS relation_rows,
    avg(mapped_priority_score)::INTEGER AS avg_mapped_priority_score,
    avg(evidence_priority_score)::INTEGER AS avg_evidence_priority_score
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
  AND current_status = 'mapped'
GROUP BY relevance_band, content_status
ORDER BY rows DESC, relevance_band, content_status
"""

QUALITY_WARNING_DISTRIBUTION_SQL = """
SELECT
    warning_key,
    count(*)::BIGINT AS rows
FROM solemd.paper_selection_summary summary
CROSS JOIN LATERAL jsonb_object_keys(summary.quality_warnings) warning_key
WHERE summary.corpus_selection_run_id = $1
  AND summary.current_status = 'mapped'
GROUP BY warning_key
ORDER BY rows DESC, warning_key
"""

EVIDENCE_PUBLICATION_TYPE_PROFILE_SQL = """
SELECT
    count(*) FILTER (
        WHERE current_status = 'mapped'
          AND rag_eligible
          AND publication_type_tracks && $2::TEXT[]
    )::BIGINT AS evidence_design_rag_eligible_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped'
          AND rag_eligible
          AND publication_type_tracks && $3::TEXT[]
    )::BIGINT AS low_value_publication_type_rag_eligible_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped'
          AND publication_type_tracks && $2::TEXT[]
    )::BIGINT AS evidence_design_mapped_rows,
    count(*) FILTER (
        WHERE current_status = 'mapped'
          AND publication_type_tracks && $3::TEXT[]
    )::BIGINT AS low_value_publication_type_mapped_rows
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
"""

ENTITY_SIGNAL_COVERAGE_SQL = """
SELECT
    content_status,
    count(*)::BIGINT AS rows,
    count(*) FILTER (
        WHERE has_vocab_entity_match OR vocab_entity_signal_count > 0
    )::BIGINT AS vocab_signal_rows,
    count(*) FILTER (
        WHERE raw_pubtator_entity_annotation_count > 0
    )::BIGINT AS raw_pubtator_entity_rows,
    count(*) FILTER (
        WHERE curated_entity_signal_count > 0
    )::BIGINT AS curated_entity_rows,
    count(*) FILTER (
        WHERE mapped_entity_signal_count > 0
    )::BIGINT AS mapped_entity_rule_rows,
    count(*) FILTER (WHERE cardinality(topic_tracks) > 0)::BIGINT
        AS topic_track_rows,
    count(*) FILTER (WHERE cardinality(organ_system_tracks) > 0)::BIGINT
        AS organ_track_rows,
    count(*) FILTER (WHERE has_mapped_relation_match)::BIGINT
        AS mapped_relation_rows,
    count(*) FILTER (WHERE raw_pubtator_relation_count > 0)::BIGINT
        AS raw_relation_rows
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
  AND current_status = 'mapped'
GROUP BY content_status
ORDER BY rows DESC
"""

METADATA_ONLY_PROFILE_SQL = """
SELECT
    count(*)::BIGINT AS rows,
    count(*) FILTER (WHERE cardinality(publication_type_tracks) > 0)::BIGINT
        AS publication_type_rows,
    count(*) FILTER (WHERE cardinality(mesh_major_tracks) > 0)::BIGINT
        AS mesh_major_rows,
    count(*) FILTER (WHERE cardinality(s2_fields_of_study) > 0)::BIGINT
        AS s2_field_rows,
    count(*) FILTER (WHERE incoming_citation_count > 0)::BIGINT
        AS incoming_citation_rows,
    count(*) FILTER (WHERE has_locator_candidate)::BIGINT AS locator_rows,
    count(*) FILTER (WHERE has_pmc_id)::BIGINT AS pmc_rows,
    count(*) FILTER (
        WHERE publication_type_tracks && $2::TEXT[]
    )::BIGINT AS low_value_publication_type_rows,
    count(*) FILTER (
        WHERE publication_type_tracks && $3::TEXT[]
    )::BIGINT AS evidence_design_publication_type_rows,
    count(*) FILTER (
        WHERE (has_mapped_journal_match OR has_mapped_pattern_match)
          AND NOT has_vocab_entity_match
          AND vocab_entity_signal_count = 0
          AND curated_entity_signal_count = 0
          AND mapped_entity_signal_count = 0
          AND NOT has_mapped_relation_match
    )::BIGINT AS venue_or_pattern_only_no_entity_rows,
    count(*) FILTER (
        WHERE raw_pubtator_entity_annotation_count = 0
    )::BIGINT AS no_raw_pubtator_entity_rows,
    count(*) FILTER (
        WHERE raw_pubtator_entity_annotation_count > 0
          AND curated_entity_signal_count = 0
    )::BIGINT AS raw_entity_not_curated_vocab_rows,
    count(*) FILTER (
        WHERE has_vocab_entity_match
           OR vocab_entity_signal_count > 0
           OR curated_entity_signal_count > 0
           OR mapped_entity_signal_count > 0
    )::BIGINT AS any_vocab_or_curated_entity_signal_rows,
    count(*) FILTER (WHERE has_mapped_relation_match)::BIGINT
        AS mapped_relation_rows,
    count(*) FILTER (WHERE raw_pubtator_relation_count > 0)::BIGINT
        AS raw_relation_rows,
    count(*) FILTER (WHERE has_cl_bridge)::BIGINT AS cl_bridge_rows,
    count(*) FILTER (WHERE relevance_band = 'high_confidence')::BIGINT
        AS high_confidence_rows,
    count(*) FILTER (WHERE relevance_band = 'clinical_bridge')::BIGINT
        AS clinical_bridge_rows,
    count(*) FILTER (WHERE relevance_band = 'venue_supported')::BIGINT
        AS venue_supported_rows
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
  AND current_status = 'mapped'
  AND content_status = 'metadata_only'
"""

METADATA_ONLY_PUBLICATION_TYPE_SQL = """
SELECT
    publication_type,
    count(*)::BIGINT AS rows,
    count(*) FILTER (
        WHERE summary.has_vocab_entity_match
           OR summary.vocab_entity_signal_count > 0
           OR summary.curated_entity_signal_count > 0
           OR summary.mapped_entity_signal_count > 0
    )::BIGINT AS entity_signal_rows,
    count(*) FILTER (WHERE summary.incoming_citation_count > 0)::BIGINT
        AS incoming_citation_rows,
    count(*) FILTER (WHERE summary.has_cl_bridge)::BIGINT AS cl_bridge_rows
FROM solemd.paper_selection_summary summary
CROSS JOIN LATERAL unnest(summary.publication_type_tracks) publication_type
WHERE summary.corpus_selection_run_id = $1
  AND summary.current_status = 'mapped'
  AND summary.content_status = 'metadata_only'
GROUP BY publication_type
ORDER BY rows DESC, publication_type
LIMIT $2
"""

RELATION_SUMMARY_SQL = """
SELECT
    count(*) FILTER (WHERE raw_pubtator_relation_count > 0)::BIGINT
        AS raw_relation_rows,
    coalesce(sum(raw_pubtator_relation_count), 0)::BIGINT AS raw_relation_total,
    count(*) FILTER (WHERE relation_count > 0)::BIGINT AS rule_relation_rows,
    coalesce(sum(relation_count), 0)::BIGINT AS rule_relation_total,
    count(*) FILTER (WHERE has_mapped_relation_match)::BIGINT
        AS mapped_relation_match_rows,
    count(*) FILTER (WHERE mapped_relation_signal_count > 0)::BIGINT
        AS mapped_relation_signal_rows,
    coalesce(sum(mapped_relation_signal_count), 0)::BIGINT
        AS mapped_relation_signal_total,
    count(*) FILTER (WHERE quality_warnings ? 'raw_relation_without_rule_match')::BIGINT
        AS raw_relation_without_rule_match_warning_rows
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
  AND current_status = 'mapped'
"""

RELATION_SIGNAL_SQL = """
SELECT
    signal_kind,
    contributes_to_mapped,
    count(*)::BIGINT AS rows,
    coalesce(sum(signal_count), 0)::BIGINT AS signal_total
FROM solemd.corpus_selection_signals
WHERE corpus_selection_run_id = $1
  AND signal_kind LIKE '%relation%'
GROUP BY signal_kind, contributes_to_mapped
ORDER BY signal_kind, contributes_to_mapped
"""

RELATION_ARTIFACT_SQL = """
SELECT
    artifact_kind,
    status,
    row_count,
    byte_size,
    storage_schema,
    storage_table,
    to_regclass(format('%I.%I', storage_schema, storage_table)) IS NOT NULL
        AS physical_table_exists,
    pg_relation_size(to_regclass(format('%I.%I', storage_schema, storage_table)))
        AS physical_byte_size
FROM solemd.corpus_selection_artifacts
WHERE corpus_selection_run_id = $1
  AND artifact_kind IN ('relation_aggregate', 'mapped_relation_detail')
ORDER BY artifact_kind
"""

TOP_VENUES_SQL = """
SELECT
    coalesce(nullif(normalized_venue, ''), '<missing>') AS normalized_venue,
    count(*)::BIGINT AS rows,
    count(*) FILTER (WHERE rag_eligible)::BIGINT AS rag_eligible_rows,
    count(*) FILTER (WHERE has_cl_bridge)::BIGINT AS cl_bridge_rows,
    avg(mapped_priority_score)::INTEGER AS avg_mapped_priority_score,
    avg(evidence_priority_score)::INTEGER AS avg_evidence_priority_score
FROM solemd.paper_selection_summary
WHERE corpus_selection_run_id = $1
  AND current_status = 'mapped'
GROUP BY coalesce(nullif(normalized_venue, ''), '<missing>')
ORDER BY rows DESC, normalized_venue
LIMIT $2
"""

TRACK_COLUMNS = {
    "mesh_major_tracks",
    "organ_system_tracks",
    "publication_type_tracks",
    "s2_fields_of_study",
    "topic_tracks",
}

SAMPLE_BUCKETS = (
    (
        "rag_ready_high_confidence",
        "summary.current_status = 'mapped' AND summary.rag_eligible "
        "AND summary.relevance_band = 'high_confidence'",
        "summary.evidence_priority_score DESC, summary.mapped_priority_score DESC",
    ),
    (
        "clinical_bridge",
        "summary.current_status = 'mapped' AND summary.has_cl_bridge",
        "summary.evidence_priority_score DESC, summary.mapped_priority_score DESC",
    ),
    (
        "relation_driven",
        "summary.current_status = 'mapped' AND summary.has_mapped_relation_match",
        "summary.mapped_relation_signal_count DESC, summary.evidence_priority_score DESC",
    ),
    (
        "metadata_only_backlog",
        "summary.current_status = 'mapped' AND summary.content_status = 'metadata_only'",
        "summary.evidence_priority_score DESC, summary.mapped_priority_score DESC",
    ),
    (
        "metadata_only_low_value_publication",
        "summary.current_status = 'mapped' "
        "AND summary.content_status = 'metadata_only' "
        "AND summary.publication_type_tracks && ARRAY["
        "'Editorial','Letter','Comment','News','Biography','Portrait',"
        "'Published Erratum','Retraction Notice','Interview','Bibliography',"
        "'Personal Narrative']::TEXT[]",
        "summary.evidence_priority_score DESC, summary.mapped_priority_score DESC",
    ),
    (
        "metadata_only_evidence_design",
        "summary.current_status = 'mapped' "
        "AND summary.content_status = 'metadata_only' "
        "AND summary.publication_type_tracks && ARRAY["
        "'Meta-Analysis','Systematic Review','Randomized Controlled Trial',"
        "'Clinical Trial','Controlled Clinical Trial','Practice Guideline',"
        "'Guideline','Observational Study','Multicenter Study']::TEXT[]",
        "summary.evidence_priority_score DESC, summary.mapped_priority_score DESC",
    ),
    (
        "metadata_only_venue_only_no_entity",
        "summary.current_status = 'mapped' "
        "AND summary.content_status = 'metadata_only' "
        "AND (summary.has_mapped_journal_match OR summary.has_mapped_pattern_match) "
        "AND NOT summary.has_vocab_entity_match "
        "AND summary.vocab_entity_signal_count = 0 "
        "AND summary.curated_entity_signal_count = 0 "
        "AND summary.mapped_entity_signal_count = 0 "
        "AND NOT summary.has_mapped_relation_match",
        "summary.evidence_priority_score DESC, summary.mapped_priority_score DESC",
    ),
    (
        "low_signal_review",
        "summary.current_status = 'mapped' "
        "AND summary.quality_warnings ? 'low_entity_signal'",
        "summary.evidence_priority_score DESC, summary.mapped_priority_score DESC",
    ),
)


def track_sql(column_name: str) -> str:
    return f"""
    SELECT
        track_value,
        count(*)::BIGINT AS rows,
        count(*) FILTER (WHERE summary.rag_eligible)::BIGINT AS rag_eligible_rows,
        count(*) FILTER (WHERE summary.has_cl_bridge)::BIGINT AS cl_bridge_rows,
        avg(summary.evidence_priority_score)::INTEGER AS avg_evidence_priority_score
    FROM solemd.paper_selection_summary summary
    CROSS JOIN LATERAL unnest(summary.{column_name}) track_value
    WHERE summary.corpus_selection_run_id = $1
      AND summary.current_status = 'mapped'
      AND cardinality(summary.{column_name}) > 0
    GROUP BY track_value
    ORDER BY rows DESC, track_value
    LIMIT $2
    """


def sample_sql(*, condition: str, order_clause: str) -> str:
    return f"""
    SELECT
        summary.corpus_id,
        papers.s2_paper_id,
        papers.pmid,
        papers.pmc_id,
        left(coalesce(text.title, pubmed.article_title, ''), 240) AS title,
        summary.normalized_venue,
        summary.publication_year,
        summary.content_status,
        summary.relevance_band,
        summary.rag_eligible,
        summary.has_cl_bridge,
        summary.mapped_priority_score,
        summary.evidence_priority_score,
        summary.mapped_entity_signal_count,
        summary.mapped_relation_signal_count,
        summary.curated_entity_signal_count,
        summary.incoming_citation_count,
        summary.publication_type_tracks[1:8] AS publication_type_tracks,
        summary.mesh_major_tracks[1:8] AS mesh_major_tracks,
        summary.s2_fields_of_study[1:8] AS s2_fields_of_study,
        summary.organ_system_tracks[1:8] AS organ_system_tracks,
        summary.quality_warnings
    FROM solemd.paper_selection_summary summary
    JOIN solemd.papers papers
      ON papers.corpus_id = summary.corpus_id
    LEFT JOIN solemd.paper_text text
      ON text.corpus_id = summary.corpus_id
    LEFT JOIN solemd.pubmed_metadata pubmed
      ON pubmed.pmid = papers.pmid
    WHERE summary.corpus_selection_run_id = $1
      AND {condition}
    ORDER BY {order_clause}, summary.corpus_id
    LIMIT $2
    """
