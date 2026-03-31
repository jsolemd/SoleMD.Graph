-- Migration 032: Add worker-safe source-unit claims for RAG warehouse refresh runs
--
-- Purpose:
--   1. Track S2 shard / BioC archive progress per refresh run in PostgreSQL
--   2. Support atomic worker-safe unit claims with FOR UPDATE SKIP LOCKED
--   3. Keep filesystem checkpoints focused on worker-local reports only
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/032_rag_refresh_source_units.sql

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.rag_refresh_source_units (
    run_id                  TEXT NOT NULL,
    source_kind             TEXT NOT NULL,
    unit_name               TEXT NOT NULL,
    unit_path               TEXT NOT NULL,
    assigned_worker_index   INTEGER NOT NULL DEFAULT 0,
    worker_count            INTEGER NOT NULL DEFAULT 1,
    worker_key              TEXT,
    status                  TEXT NOT NULL DEFAULT 'pending',
    claim_attempts          INTEGER NOT NULL DEFAULT 0,
    started_at              TIMESTAMPTZ,
    heartbeat_at            TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    error_message           TEXT,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (run_id, source_kind, unit_name),
    CHECK (source_kind IN ('s2_shard', 'bioc_archive')),
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    CHECK (worker_count > 0),
    CHECK (assigned_worker_index >= 0),
    CHECK (assigned_worker_index < worker_count),
    CHECK (claim_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rag_refresh_source_units_status
    ON solemd.rag_refresh_source_units (
        run_id,
        source_kind,
        worker_count,
        assigned_worker_index,
        status,
        unit_name
    );

CREATE INDEX IF NOT EXISTS idx_rag_refresh_source_units_running
    ON solemd.rag_refresh_source_units (run_id, source_kind, status, heartbeat_at)
    WHERE status = 'running';

COMMENT ON TABLE solemd.rag_refresh_source_units IS
    'Atomic source-unit claim table for resumable parallel RAG warehouse refresh runs.';

COMMENT ON COLUMN solemd.rag_refresh_source_units.source_kind IS
    'Refresh source unit class. s2_shard = Semantic Scholar S2ORC shard; bioc_archive = PubTator BioC tar archive.';

COMMENT ON COLUMN solemd.rag_refresh_source_units.assigned_worker_index IS
    'Deterministic worker slot for this source unit within the run worker_count.';

COMMIT;
