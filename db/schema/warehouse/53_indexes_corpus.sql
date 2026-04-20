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
CREATE INDEX IF NOT EXISTS idx_s2_paper_references_raw_release_citing
    ON solemd.s2_paper_references_raw (
        source_release_id,
        citing_paper_id,
        is_influential
    );
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_release_corpus
    ON pubtator.entity_annotations (source_release_id, corpus_id);
CREATE INDEX IF NOT EXISTS idx_pubtator_relations_release_corpus
    ON pubtator.relations (source_release_id, corpus_id);

RESET ROLE;
