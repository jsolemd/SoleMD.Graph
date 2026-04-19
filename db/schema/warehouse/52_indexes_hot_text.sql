SET ROLE engine_warehouse_admin;

CREATE INDEX IF NOT EXISTS idx_paper_text_acquisition_runs_corpus_recent
    ON solemd.paper_text_acquisition_runs (corpus_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_paper_text_acquisition_runs_status_recent
    ON solemd.paper_text_acquisition_runs (status, started_at DESC);

RESET ROLE;
