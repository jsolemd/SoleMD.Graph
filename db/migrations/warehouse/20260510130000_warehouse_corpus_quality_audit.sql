SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.corpus_quality_audit_runs (
    corpus_quality_audit_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    corpus_selection_run_id UUID NOT NULL
        REFERENCES solemd.corpus_selection_runs (corpus_selection_run_id)
        ON DELETE RESTRICT,
    selector_version TEXT NOT NULL,
    requested_by TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    plan_checksum TEXT NOT NULL,
    sample_size INTEGER NOT NULL DEFAULT 12,
    summary_row_count BIGINT,
    mapped_row_count BIGINT,
    rag_eligible_row_count BIGINT,
    distributions JSONB NOT NULL DEFAULT '{}'::JSONB,
    relation_diagnostic JSONB NOT NULL DEFAULT '{}'::JSONB,
    top_signals JSONB NOT NULL DEFAULT '{}'::JSONB,
    samples JSONB NOT NULL DEFAULT '{}'::JSONB,
    findings JSONB NOT NULL DEFAULT '[]'::JSONB,
    error_message TEXT,
    CONSTRAINT ck_corpus_quality_audit_runs_status
        CHECK (status IN ('running', 'complete', 'failed')),
    CONSTRAINT ck_corpus_quality_audit_runs_counts
        CHECK (
            sample_size BETWEEN 1 AND 50
            AND (summary_row_count IS NULL OR summary_row_count >= 0)
            AND (mapped_row_count IS NULL OR mapped_row_count >= 0)
            AND (rag_eligible_row_count IS NULL OR rag_eligible_row_count >= 0)
        )
);
ALTER TABLE solemd.corpus_quality_audit_runs SET (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_corpus_quality_audit_runs_selection_started
    ON solemd.corpus_quality_audit_runs (
        corpus_selection_run_id,
        started_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_corpus_quality_audit_runs_status_started
    ON solemd.corpus_quality_audit_runs (status, started_at DESC);

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.corpus_quality_audit_runs
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.corpus_quality_audit_runs
TO engine_warehouse_read;

COMMENT ON TABLE solemd.corpus_quality_audit_runs IS
    'Logged run-level QA snapshots over paper_selection_summary for mapped/evidence calibration.';
COMMENT ON COLUMN solemd.corpus_quality_audit_runs.distributions IS
    'Aggregated status, content, relevance, warning, and evidence-publication-type distributions.';
COMMENT ON COLUMN solemd.corpus_quality_audit_runs.relation_diagnostic IS
    'Relation-rollup, relation-signal, and summary projection diagnostics for the audited run.';
COMMENT ON COLUMN solemd.corpus_quality_audit_runs.top_signals IS
    'Top venues, MeSH, publication types, fields of study, topic tracks, and organ tracks.';
COMMENT ON COLUMN solemd.corpus_quality_audit_runs.samples IS
    'Deterministic top-ranked paper samples by quality bucket for human review.';
COMMENT ON COLUMN solemd.corpus_quality_audit_runs.findings IS
    'Machine-readable audit findings that should drive the next selector calibration loop.';

RESET ROLE;
