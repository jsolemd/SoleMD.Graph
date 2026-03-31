-- Migration 033: Add run-global budgeting for source-driven parallel RAG refreshes
--
-- Purpose:
--   1. Track source-driven refresh runs separately from unit claims
--   2. Reserve globally selected target corpus ids without per-worker overshoot
--   3. Support bounded source-driven parallel refresh with a real shared limit
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/033_rag_refresh_run_budget.sql

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.rag_refresh_runs (
    run_id                  TEXT PRIMARY KEY,
    source_driven           BOOLEAN NOT NULL DEFAULT false,
    worker_count            INTEGER NOT NULL DEFAULT 1,
    requested_limit         INTEGER,
    selected_target_count   INTEGER NOT NULL DEFAULT 0,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (worker_count > 0),
    CHECK (requested_limit IS NULL OR requested_limit > 0),
    CHECK (selected_target_count >= 0)
);

CREATE TABLE IF NOT EXISTS solemd.rag_refresh_selected_targets (
    run_id                  TEXT NOT NULL
        REFERENCES solemd.rag_refresh_runs (run_id) ON DELETE CASCADE,
    corpus_id               BIGINT NOT NULL
        REFERENCES solemd.papers (corpus_id) ON DELETE CASCADE,
    source_kind             TEXT NOT NULL,
    unit_name               TEXT NOT NULL,
    selected_worker_index   INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, corpus_id),
    CHECK (source_kind IN ('s2_shard', 'bioc_archive')),
    CHECK (selected_worker_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rag_refresh_selected_targets_run_worker
    ON solemd.rag_refresh_selected_targets (run_id, selected_worker_index, created_at, corpus_id);

COMMENT ON TABLE solemd.rag_refresh_runs IS
    'Run-global state for source-driven RAG refreshes, including shared worker count and target budget.';

COMMENT ON TABLE solemd.rag_refresh_selected_targets IS
    'Globally reserved target corpus ids for a source-driven RAG refresh run.';

COMMIT;
