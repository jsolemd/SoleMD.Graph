-- 011_add_bulk_citation_checkpoints.sql
-- Persistent per-batch checkpoints for the Semantic Scholar bulk citations ingest.

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.bulk_citation_ingest_batches (
    release_id              TEXT NOT NULL,
    batch_index             INTEGER NOT NULL,
    shard_names             JSONB NOT NULL DEFAULT '[]'::jsonb,
    shards_scanned          INTEGER NOT NULL DEFAULT 0,
    total_candidate_edges   BIGINT,
    total_domain_edges      BIGINT NOT NULL DEFAULT 0,
    loaded_edges            BIGINT NOT NULL DEFAULT 0,
    staging_bytes           BIGINT NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    error_message           TEXT,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (release_id, batch_index),
    CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_bulk_citation_ingest_batches_status
    ON solemd.bulk_citation_ingest_batches (release_id, status, batch_index);

COMMENT ON TABLE solemd.bulk_citation_ingest_batches IS
    'Per-batch checkpoints for resumable Semantic Scholar bulk citations ingest.';

COMMENT ON COLUMN solemd.bulk_citation_ingest_batches.shard_names IS
    'Ordered shard file names included in this batch.';

COMMENT ON COLUMN solemd.bulk_citation_ingest_batches.metadata IS
    'Additional ingest metadata for this batch, including shard paths and timing.';

COMMIT;
