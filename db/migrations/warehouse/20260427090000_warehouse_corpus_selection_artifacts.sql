RESET ROLE;
CREATE SCHEMA IF NOT EXISTS solemd_scratch AUTHORIZATION engine_warehouse_admin;
SET ROLE engine_warehouse_admin;
ALTER SCHEMA solemd_scratch OWNER TO engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.corpus_selection_artifacts (
    corpus_selection_artifact_id UUID PRIMARY KEY DEFAULT uuidv7(),
    corpus_selection_run_id UUID NOT NULL
        REFERENCES solemd.corpus_selection_runs (corpus_selection_run_id)
        ON DELETE CASCADE,
    s2_source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    pt3_source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    selector_version TEXT NOT NULL,
    phase_name TEXT NOT NULL,
    artifact_kind TEXT NOT NULL,
    storage_schema TEXT NOT NULL,
    storage_table TEXT NOT NULL,
    is_logged BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'building',
    plan_checksum TEXT NOT NULL,
    row_count BIGINT,
    byte_size BIGINT,
    detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    dropped_at TIMESTAMPTZ,
    error_message TEXT,
    CONSTRAINT ck_corpus_selection_artifacts_status
        CHECK (status IN ('building', 'complete', 'failed', 'stale', 'dropped')),
    CONSTRAINT uq_corpus_selection_artifacts_run_kind
        UNIQUE (corpus_selection_run_id, artifact_kind)
);
ALTER TABLE solemd.corpus_selection_artifacts SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.corpus_selection_chunks (
    corpus_selection_run_id UUID NOT NULL
        REFERENCES solemd.corpus_selection_runs (corpus_selection_run_id)
        ON DELETE CASCADE,
    phase_name TEXT NOT NULL,
    bucket_id INTEGER NOT NULL,
    bucket_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    row_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_selection_run_id, phase_name, bucket_id),
    CONSTRAINT ck_corpus_selection_chunks_status
        CHECK (status IN ('pending', 'running', 'complete', 'failed')),
    CONSTRAINT ck_corpus_selection_chunks_bucket
        CHECK (bucket_id >= 0 AND bucket_count > 0 AND bucket_id < bucket_count),
    CONSTRAINT ck_corpus_selection_chunks_attempts
        CHECK (attempts >= 0)
);
ALTER TABLE solemd.corpus_selection_chunks SET (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_corpus_selection_artifacts_run_status
    ON solemd.corpus_selection_artifacts (
        corpus_selection_run_id,
        status,
        artifact_kind
    );
CREATE INDEX IF NOT EXISTS idx_corpus_selection_artifacts_pair_kind
    ON solemd.corpus_selection_artifacts (
        s2_source_release_id,
        pt3_source_release_id,
        selector_version,
        artifact_kind,
        created_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_corpus_selection_chunks_claim
    ON solemd.corpus_selection_chunks (
        corpus_selection_run_id,
        phase_name,
        status,
        bucket_id
    );

GRANT USAGE, CREATE ON SCHEMA solemd_scratch TO engine_ingest_write;
GRANT USAGE ON SCHEMA solemd_scratch TO engine_warehouse_read;

GRANT INSERT, UPDATE, SELECT, DELETE ON TABLE
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.corpus_selection_artifacts,
    solemd.corpus_selection_chunks
TO engine_warehouse_read;

COMMENT ON TABLE solemd.corpus_selection_artifacts IS
    'Durable logged ledger for rebuildable corpus-selection scratch artifacts. Artifact tables are unlogged and run-scoped; this table survives crashes and drives resume/GC.';
COMMENT ON TABLE solemd.corpus_selection_chunks IS
    'Logged chunk ledger for parallel-safe mapped surface materialization by corpus_id hash bucket.';

RESET ROLE;
