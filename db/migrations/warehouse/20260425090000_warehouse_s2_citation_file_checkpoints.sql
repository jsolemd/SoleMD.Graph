SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.s2_paper_reference_metrics_file_checkpoints (
    ingest_run_id UUID NOT NULL
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE CASCADE,
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    file_name TEXT NOT NULL,
    file_byte_count BIGINT NOT NULL DEFAULT 0,
    stage_row_count INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ingest_run_id, source_release_id, file_name)
);
ALTER TABLE solemd.s2_paper_reference_metrics_file_checkpoints SET (fillfactor = 100);

COMMENT ON TABLE solemd.s2_paper_reference_metrics_file_checkpoints IS
    'Durable Semantic Scholar citation file checkpoints that let long citation metric sweeps resume by file after worker failure.';
COMMENT ON COLUMN solemd.s2_paper_reference_metrics_file_checkpoints.stage_row_count IS
    'Number of per-file citation metric stage rows present when the source file was marked complete.';

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE
    solemd.s2_paper_reference_metrics_file_checkpoints
TO engine_ingest_write;
GRANT SELECT ON TABLE
    solemd.s2_paper_reference_metrics_file_checkpoints
TO engine_warehouse_read;

RESET ROLE;
