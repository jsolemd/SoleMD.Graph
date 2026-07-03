SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.pubmed_metadata_fetch_tasks
    DROP CONSTRAINT IF EXISTS ck_pubmed_metadata_fetch_tasks_status;
ALTER TABLE solemd.pubmed_metadata_fetch_tasks
    ADD CONSTRAINT ck_pubmed_metadata_fetch_tasks_status
        CHECK (status IN ('pending', 'running', 'complete', 'not_found', 'failed'));

ALTER TABLE solemd.s2_graph_enrichment_tasks
    DROP CONSTRAINT IF EXISTS ck_s2_graph_enrichment_tasks_status;
ALTER TABLE solemd.s2_graph_enrichment_tasks
    ADD CONSTRAINT ck_s2_graph_enrichment_tasks_status
        CHECK (status IN ('pending', 'running', 'complete', 'not_found', 'failed'));

CREATE TABLE IF NOT EXISTS solemd.corpus_selection_summary_refresh_runs (
    corpus_selection_summary_refresh_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    corpus_selection_run_id UUID NOT NULL
        REFERENCES solemd.corpus_selection_runs (corpus_selection_run_id)
        ON DELETE RESTRICT,
    selector_version TEXT NOT NULL,
    s2_graph_enrichment_run_id UUID
        REFERENCES solemd.s2_graph_enrichment_runs (s2_graph_enrichment_run_id)
        ON DELETE SET NULL,
    pubmed_metadata_fetch_run_id UUID
        REFERENCES solemd.pubmed_metadata_fetch_runs (pubmed_metadata_fetch_run_id)
        ON DELETE SET NULL,
    requested_by TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    plan_checksum TEXT NOT NULL,
    summary_row_count BIGINT,
    chunk_count INTEGER,
    s2_enrichment_row_count BIGINT,
    s2_not_found_count BIGINT,
    pubmed_metadata_row_count BIGINT,
    pubmed_not_found_count BIGINT,
    pre_refresh_detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    post_refresh_detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message TEXT,
    CONSTRAINT ck_corpus_selection_summary_refresh_runs_status
        CHECK (status IN ('running', 'complete', 'failed')),
    CONSTRAINT ck_corpus_selection_summary_refresh_runs_counts
        CHECK (
            (summary_row_count IS NULL OR summary_row_count >= 0)
            AND (chunk_count IS NULL OR chunk_count >= 1)
            AND (s2_enrichment_row_count IS NULL OR s2_enrichment_row_count >= 0)
            AND (s2_not_found_count IS NULL OR s2_not_found_count >= 0)
            AND (pubmed_metadata_row_count IS NULL OR pubmed_metadata_row_count >= 0)
            AND (pubmed_not_found_count IS NULL OR pubmed_not_found_count >= 0)
        )
);
ALTER TABLE solemd.corpus_selection_summary_refresh_runs SET (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_summary_refresh_runs_selection_started
    ON solemd.corpus_selection_summary_refresh_runs (
        corpus_selection_run_id,
        started_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_summary_refresh_runs_status_started
    ON solemd.corpus_selection_summary_refresh_runs (status, started_at DESC);

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.corpus_selection_summary_refresh_runs
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.corpus_selection_summary_refresh_runs
TO engine_warehouse_read;

COMMENT ON TABLE solemd.corpus_selection_summary_refresh_runs IS
    'Logged operator/audit ledger for rerunning only selection_summary after S2 Graph and PubMed enrichment complete for a published corpus-selection run.';
COMMENT ON COLUMN solemd.corpus_selection_summary_refresh_runs.pre_refresh_detail IS
    'Small pre-refresh summary counts used to audit which enrichment-derived summary fields changed.';
COMMENT ON COLUMN solemd.corpus_selection_summary_refresh_runs.post_refresh_detail IS
    'Small post-refresh summary counts after the selection_summary chunk drain completed.';
COMMENT ON COLUMN solemd.corpus_selection_summary_refresh_runs.plan_checksum IS
    'CorpusPlan checksum from the published selection run whose summary was refreshed.';

RESET ROLE;
