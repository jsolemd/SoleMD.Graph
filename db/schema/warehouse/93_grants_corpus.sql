SET ROLE engine_warehouse_admin;

GRANT USAGE, CREATE ON SCHEMA solemd_scratch TO engine_ingest_write;
GRANT USAGE ON SCHEMA solemd_scratch TO engine_warehouse_read;

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.vocab_terms,
    solemd.vocab_term_aliases,
    solemd.corpus_selection_runs,
    solemd.corpus_selection_signals,
    solemd.paper_corpus_assignments,
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks,
    solemd.paper_entity_signal_builds,
    solemd.paper_entity_signals,
    solemd.paper_selection_summary,
    solemd.pubmed_metadata_fetch_runs,
    solemd.pubmed_metadata_fetch_tasks,
    solemd.pubmed_metadata,
    solemd.s2_graph_enrichment_runs,
    solemd.s2_graph_enrichment_tasks,
    solemd.s2_paper_enrichment,
    solemd.corpus_wave_runs,
    solemd.corpus_wave_members
TO engine_ingest_write;

GRANT DELETE ON TABLE
    solemd.vocab_term_aliases,
    solemd.vocab_terms,
    solemd.corpus_selection_signals,
    solemd.paper_corpus_assignments,
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks,
    solemd.paper_entity_signal_builds,
    solemd.paper_entity_signals,
    solemd.paper_selection_summary,
    solemd.pubmed_metadata_fetch_tasks,
    solemd.s2_graph_enrichment_tasks,
    solemd.corpus_wave_members
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.vocab_terms,
    solemd.vocab_term_aliases,
    solemd.corpus_selection_runs,
    solemd.corpus_selection_signals,
    solemd.paper_corpus_assignments,
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks,
    solemd.paper_entity_signal_builds,
    solemd.paper_entity_signals,
    solemd.paper_selection_summary,
    solemd.pubmed_metadata_fetch_runs,
    solemd.pubmed_metadata_fetch_tasks,
    solemd.pubmed_metadata,
    solemd.s2_graph_enrichment_runs,
    solemd.s2_graph_enrichment_tasks,
    solemd.s2_paper_enrichment,
    solemd.corpus_wave_runs,
    solemd.corpus_wave_members
TO engine_warehouse_read;

RESET ROLE;
