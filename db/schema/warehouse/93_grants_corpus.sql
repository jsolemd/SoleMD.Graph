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
    solemd.corpus_selection_summary_refresh_runs,
    solemd.corpus_quality_audit_runs,
    solemd.corpus_wave_runs,
    solemd.corpus_wave_members,
    solemd.pmc_fulltext_fetch_runs,
    solemd.pmc_fulltext_documents,
    solemd.pmc_fulltext_sections,
    solemd.pmc_fulltext_passages
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
    solemd.corpus_wave_members,
    solemd.pmc_fulltext_sections,
    solemd.pmc_fulltext_passages
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
    solemd.corpus_selection_summary_refresh_runs,
    solemd.corpus_quality_audit_runs,
    solemd.corpus_wave_runs,
    solemd.corpus_wave_members,
    solemd.pmc_fulltext_fetch_runs,
    solemd.pmc_fulltext_documents,
    solemd.pmc_fulltext_sections,
    solemd.pmc_fulltext_passages
TO engine_warehouse_read;

GRANT USAGE, SELECT ON SEQUENCE
    solemd.pmc_fulltext_sections_pmc_fulltext_section_id_seq,
    solemd.pmc_fulltext_passages_pmc_fulltext_passage_id_seq
TO engine_ingest_write;

RESET ROLE;
