SET ROLE engine_warehouse_admin;

CREATE INDEX IF NOT EXISTS idx_vocab_terms_normalized_name
    ON solemd.vocab_terms (normalized_name);
CREATE INDEX IF NOT EXISTS idx_vocab_terms_category
    ON solemd.vocab_terms (category);
CREATE INDEX IF NOT EXISTS idx_vocab_terms_umls_cui
    ON solemd.vocab_terms (umls_cui)
    WHERE umls_cui IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_term_aliases_normalized_alias
    ON solemd.vocab_term_aliases (
        normalized_alias,
        term_id,
        quality_score DESC,
        is_preferred DESC
    );
CREATE INDEX IF NOT EXISTS idx_vocab_term_aliases_umls_cui
    ON solemd.vocab_term_aliases (umls_cui)
    WHERE umls_cui IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corpus_selection_runs_pair_started
    ON solemd.corpus_selection_runs (
        s2_source_release_id,
        pt3_source_release_id,
        selector_version,
        started_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_corpus_selection_runs_status_started
    ON solemd.corpus_selection_runs (status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corpus_selection_runs_active_lock
    ON solemd.corpus_selection_runs (advisory_lock_key)
    WHERE advisory_lock_key IS NOT NULL
      AND status BETWEEN 1 AND 6;

CREATE INDEX IF NOT EXISTS idx_corpus_selection_signals_run_corpus
    ON solemd.corpus_selection_signals (corpus_selection_run_id, corpus_id);
CREATE INDEX IF NOT EXISTS idx_corpus_selection_signals_corpus_run
    ON solemd.corpus_selection_signals (corpus_id, corpus_selection_run_id);
CREATE INDEX IF NOT EXISTS idx_corpus_selection_signals_kind_run
    ON solemd.corpus_selection_signals (signal_kind, corpus_selection_run_id);

CREATE INDEX IF NOT EXISTS idx_paper_corpus_assignments_corpus
    ON solemd.paper_corpus_assignments (corpus_id);
CREATE INDEX IF NOT EXISTS idx_paper_corpus_assignments_release_corpus
    ON solemd.paper_corpus_assignments (s2_source_release_id, corpus_id);
CREATE INDEX IF NOT EXISTS idx_paper_corpus_assignments_run
    ON solemd.paper_corpus_assignments (assigned_by_run_id, corpus_id)
    WHERE assigned_by_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corpus_selection_artifacts_run_status
    ON solemd.corpus_selection_artifacts (
        corpus_selection_run_id,
        status,
        artifact_kind
    );
CREATE INDEX IF NOT EXISTS idx_corpus_selection_artifacts_pair_kind
    ON solemd.corpus_selection_artifacts (
        s2_source_release_id,
        pt3_source_release_id,
        selector_version,
        artifact_kind,
        created_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_corpus_selection_chunks_claim
    ON solemd.corpus_selection_chunks (
        corpus_selection_run_id,
        phase_name,
        status,
        bucket_id
    );

CREATE INDEX IF NOT EXISTS idx_paper_entity_signal_builds_status
    ON solemd.paper_entity_signal_builds (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_entity_signals_build_paper
    ON solemd.paper_entity_signals (
        s2_source_release_id,
        pt3_source_release_id,
        entity_signal_checksum,
        paper_id
    );
CREATE INDEX IF NOT EXISTS idx_paper_entity_signals_build_vocab_paper
    ON solemd.paper_entity_signals (
        s2_source_release_id,
        pt3_source_release_id,
        entity_signal_checksum,
        paper_id
    )
    WHERE term_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paper_entity_signals_build_term
    ON solemd.paper_entity_signals (
        s2_source_release_id,
        pt3_source_release_id,
        entity_signal_checksum,
        term_id,
        paper_id
    )
    WHERE term_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paper_entity_signals_build_rule
    ON solemd.paper_entity_signals (
        s2_source_release_id,
        pt3_source_release_id,
        entity_signal_checksum,
        rule_family_key,
        paper_id
    )
    WHERE rule_family_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_entity_signals_vocab
    ON solemd.paper_entity_signals (
        s2_source_release_id,
        pt3_source_release_id,
        entity_signal_checksum,
        paper_id,
        entity_type,
        concept_id_raw,
        term_id
    )
    WHERE term_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_entity_signals_rule
    ON solemd.paper_entity_signals (
        s2_source_release_id,
        pt3_source_release_id,
        entity_signal_checksum,
        paper_id,
        entity_type,
        concept_id_raw,
        rule_family_key
    )
    WHERE rule_family_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_status_corpus
    ON solemd.paper_selection_summary (current_status, corpus_id);
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_status_corpus
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        current_status,
        corpus_id
    );
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_status_evidence_rank
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        current_status,
        evidence_priority_score DESC,
        mapped_priority_score DESC,
        corpus_id
    );
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_evidence_wave_scan
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        current_status,
        publication_year DESC,
        has_locator_candidate,
        evidence_priority_score DESC,
        corpus_id
    );
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_rag_candidate
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        relevance_band,
        evidence_priority_score DESC,
        corpus_id
    )
    WHERE rag_candidate;
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_rag_eligible
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        content_status,
        evidence_priority_score DESC,
        corpus_id
    )
    WHERE rag_eligible;
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_content_status
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        content_status,
        corpus_id
    );
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_topic_tracks
    ON solemd.paper_selection_summary USING gin (topic_tracks);
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_organ_system_tracks
    ON solemd.paper_selection_summary USING gin (organ_system_tracks);
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_quality_warnings
    ON solemd.paper_selection_summary USING gin (quality_warnings jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_fetch_runs_status_started
    ON solemd.pubmed_metadata_fetch_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_fetch_tasks_claim
    ON solemd.pubmed_metadata_fetch_tasks (
        pubmed_metadata_fetch_run_id,
        status,
        attempts,
        pmid
    );
CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_publication_types
    ON solemd.pubmed_metadata USING gin (publication_types);
CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_mesh_major_terms
    ON solemd.pubmed_metadata USING gin (mesh_major_terms);

CREATE INDEX IF NOT EXISTS idx_s2_graph_enrichment_runs_status_started
    ON solemd.s2_graph_enrichment_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_s2_graph_enrichment_tasks_claim
    ON solemd.s2_graph_enrichment_tasks (
        s2_graph_enrichment_run_id,
        status,
        attempts,
        paper_id
    );
CREATE INDEX IF NOT EXISTS idx_s2_paper_enrichment_corpus
    ON solemd.s2_paper_enrichment (corpus_id);
CREATE INDEX IF NOT EXISTS idx_s2_paper_enrichment_fields_of_study
    ON solemd.s2_paper_enrichment USING gin (fields_of_study);

CREATE INDEX IF NOT EXISTS idx_summary_refresh_runs_selection_started
    ON solemd.corpus_selection_summary_refresh_runs (
        corpus_selection_run_id,
        started_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_summary_refresh_runs_status_started
    ON solemd.corpus_selection_summary_refresh_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_corpus_quality_audit_runs_selection_started
    ON solemd.corpus_quality_audit_runs (
        corpus_selection_run_id,
        started_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_corpus_quality_audit_runs_status_started
    ON solemd.corpus_quality_audit_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_corpus_wave_runs_selection_started
    ON solemd.corpus_wave_runs (
        corpus_selection_run_id,
        wave_policy_key,
        started_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_corpus_wave_runs_status_started
    ON solemd.corpus_wave_runs (status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corpus_wave_runs_active_lock
    ON solemd.corpus_wave_runs (advisory_lock_key)
    WHERE advisory_lock_key IS NOT NULL
      AND status BETWEEN 1 AND 3;

CREATE UNIQUE INDEX IF NOT EXISTS uq_corpus_wave_members_order
    ON solemd.corpus_wave_members (corpus_wave_run_id, member_ordinal);
CREATE INDEX IF NOT EXISTS idx_corpus_wave_members_pending
    ON solemd.corpus_wave_members (
        corpus_wave_run_id,
        enqueued_at,
        member_ordinal
    );

CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_release_corpus
    ON solemd.s2_papers_raw (source_release_id, corpus_id)
    WHERE corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_paper_reference_metrics_raw_release_counts
    ON solemd.s2_paper_reference_metrics_raw (
        source_release_id,
        citing_paper_id,
        influential_reference_count
    );
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_release_corpus
    ON pubtator.entity_annotations (source_release_id, corpus_id);
CREATE INDEX IF NOT EXISTS idx_pubtator_relations_release_corpus
    ON pubtator.relations (source_release_id, corpus_id);

CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_fetch_runs_status_started
    ON solemd.pmc_fulltext_fetch_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_documents_pmcid_status
    ON solemd.pmc_fulltext_documents (pmcid, status, source_provider, parser_version);
CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_documents_corpus_status
    ON solemd.pmc_fulltext_documents (corpus_id, status, parsed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_documents_provider_checksum
    ON solemd.pmc_fulltext_documents (source_provider, source_checksum, parser_version);
CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_documents_current
    ON solemd.pmc_fulltext_documents (pmcid, source_provider, parser_version, parsed_at DESC)
    WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_sections_document_path
    ON solemd.pmc_fulltext_sections (pmc_fulltext_document_id, section_ordinal_path);
CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_sections_pmcid_role
    ON solemd.pmc_fulltext_sections (pmcid, section_role, section_ordinal_path);

CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_passages_retrieval
    ON solemd.pmc_fulltext_passages (
        corpus_id,
        pmcid,
        passage_role,
        section_ordinal_path,
        passage_ordinal
    )
    WHERE is_retrievable;
CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_passages_document_role
    ON solemd.pmc_fulltext_passages (
        pmc_fulltext_document_id,
        passage_role,
        section_ordinal_path
    );
CREATE INDEX IF NOT EXISTS idx_pmc_fulltext_passages_checksum
    ON solemd.pmc_fulltext_passages (
        pmc_fulltext_document_id,
        text_checksum
    );

CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_pmc_fulltext_document
    ON solemd.paper_selection_summary (pmc_fulltext_document_id)
    WHERE pmc_fulltext_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_pmcid_rescue
    ON solemd.paper_selection_summary (
        current_status,
        content_status,
        has_pmc_id,
        evidence_priority_score DESC,
        corpus_id
    )
    WHERE has_pmc_id;

RESET ROLE;
