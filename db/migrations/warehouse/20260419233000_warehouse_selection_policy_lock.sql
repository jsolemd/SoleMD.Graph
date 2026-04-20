SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.paper_selection_summary
    ADD COLUMN IF NOT EXISTS publication_year SMALLINT,
    ADD COLUMN IF NOT EXISTS has_mapped_pattern_match BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_mapped_entity_match BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_mapped_relation_match BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mapped_entity_signal_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mapped_relation_signal_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS has_locator_candidate BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_evidence_wave_scan
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        current_status,
        publication_year DESC,
        has_locator_candidate,
        evidence_priority_score DESC,
        corpus_id
    );

COMMENT ON COLUMN solemd.paper_selection_summary.publication_year IS
    'Release-scoped publication year copied from s2_papers_raw so mapped and evidence policy can gate without rescanning raw rows.';
COMMENT ON COLUMN solemd.paper_selection_summary.has_locator_candidate IS
    'True when the canonical paper row has at least one current PMC/PMID/DOI locator candidate for the evidence acquisition lane.';

RESET ROLE;
