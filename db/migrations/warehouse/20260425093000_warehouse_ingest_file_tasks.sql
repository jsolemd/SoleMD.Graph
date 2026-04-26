SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.ingest_file_tasks (
    ingest_run_id UUID NOT NULL
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE CASCADE,
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    family_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_byte_count BIGINT NOT NULL DEFAULT 0,
    status SMALLINT NOT NULL DEFAULT 1,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    input_bytes_read BIGINT NOT NULL DEFAULT 0,
    rows_written BIGINT NOT NULL DEFAULT 0,
    stage_row_count INTEGER NOT NULL DEFAULT 0,
    claim_token UUID,
    enqueued_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    PRIMARY KEY (ingest_run_id, family_name, file_name),
    CONSTRAINT ck_ingest_file_tasks_status
        CHECK (status BETWEEN 1 AND 4),
    CONSTRAINT ck_ingest_file_tasks_attempt_count
        CHECK (attempt_count >= 0)
);
ALTER TABLE solemd.ingest_file_tasks SET (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_ingest_file_tasks_release_family_status
    ON solemd.ingest_file_tasks (
        source_release_id,
        ingest_run_id,
        family_name,
        status,
        updated_at
    );

COMMENT ON TABLE solemd.ingest_file_tasks IS
    'Durable DB-backed file work queue for parallel ingest families; workers claim idempotent source files and finalizers merge completed stage rows.';
COMMENT ON COLUMN solemd.ingest_file_tasks.status IS
    'File task lifecycle code: 1=pending, 2=running, 3=completed, 4=failed.';
COMMENT ON COLUMN solemd.ingest_file_tasks.input_bytes_read IS
    'Best-effort per-file byte progress reported by the worker heartbeat.';
COMMENT ON COLUMN solemd.ingest_file_tasks.stage_row_count IS
    'Exact completed stage row count recorded after a file reaches its durable checkpoint.';
COMMENT ON COLUMN solemd.ingest_file_tasks.claim_token IS
    'Per-claim lease token. File workers must present the current token before heartbeat, stage merge, checkpoint, complete, or fail updates.';

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE
    solemd.ingest_file_tasks
TO engine_ingest_write;
GRANT SELECT ON TABLE
    solemd.ingest_file_tasks
TO engine_warehouse_read;

RESET ROLE;
