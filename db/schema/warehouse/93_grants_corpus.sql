SET ROLE engine_warehouse_admin;

GRANT USAGE, CREATE ON SCHEMA solemd_scratch TO engine_ingest_write;
GRANT USAGE ON SCHEMA solemd_scratch TO engine_warehouse_read;

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.vocab_terms,
    solemd.vocab_term_aliases,
    solemd.corpus_selection_runs,
    solemd.corpus_selection_signals,
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks,
    solemd.paper_selection_summary,
    solemd.corpus_wave_runs,
    solemd.corpus_wave_members
TO engine_ingest_write;

GRANT DELETE ON TABLE
    solemd.vocab_term_aliases,
    solemd.vocab_terms,
    solemd.corpus_selection_signals,
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks,
    solemd.paper_selection_summary,
    solemd.corpus_wave_members
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.vocab_terms,
    solemd.vocab_term_aliases,
    solemd.corpus_selection_runs,
    solemd.corpus_selection_signals,
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks,
    solemd.paper_selection_summary,
    solemd.corpus_wave_runs,
    solemd.corpus_wave_members
TO engine_warehouse_read;

RESET ROLE;
