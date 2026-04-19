SET ROLE engine_warehouse_admin;

CREATE INDEX IF NOT EXISTS idx_paper_documents_active_priority
    ON solemd.paper_documents (corpus_id, source_priority)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_paper_sections_role
    ON solemd.paper_sections (corpus_id, section_role, section_ordinal);

DO $$
DECLARE
    partition_idx INTEGER;
    partition_suffix TEXT;
BEGIN
    FOR partition_idx IN 0..31 LOOP
        partition_suffix := lpad(partition_idx::TEXT, 2, '0');

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_paper_blocks_p%s_section_block ON solemd.paper_blocks_p%s (corpus_id, section_ordinal, block_ordinal)',
            partition_suffix,
            partition_suffix
        );

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_paper_sentences_p%s_sentence ON solemd.paper_sentences_p%s (corpus_id, sentence_ordinal)',
            partition_suffix,
            partition_suffix
        );

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_paper_chunk_members_p%s_block ON solemd.paper_chunk_members_p%s (corpus_id, member_block_ordinal)',
            partition_suffix,
            partition_suffix
        );
    END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS idx_paper_evidence_units_lookup
    ON solemd.paper_evidence_units (
        corpus_id,
        chunk_version_key,
        block_ordinal,
        sentence_start_ordinal
    );
CREATE INDEX IF NOT EXISTS idx_paper_evidence_units_version
    ON solemd.paper_evidence_units (chunk_version_key, corpus_id);

CREATE INDEX IF NOT EXISTS idx_chunk_runs_status_started
    ON solemd.chunk_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_chunk_assembly_errors_recent
    ON solemd.chunk_assembly_errors (first_failure_at DESC);

RESET ROLE;
