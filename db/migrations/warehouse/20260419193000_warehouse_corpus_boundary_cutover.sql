SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.s2orc_documents_raw (
    paper_id TEXT PRIMARY KEY,
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    text_hash BYTEA NOT NULL,
    document_payload TEXT NOT NULL,
    last_seen_run_id UUID
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE SET NULL
);
ALTER TABLE solemd.s2orc_documents_raw SET (fillfactor = 100);
ALTER TABLE solemd.s2orc_documents_raw ALTER COLUMN document_payload SET COMPRESSION lz4;

ALTER TABLE solemd.corpus_selection_runs
    DROP CONSTRAINT IF EXISTS ck_corpus_selection_runs_status;
ALTER TABLE solemd.corpus_selection_runs
    ADD CONSTRAINT ck_corpus_selection_runs_status
        CHECK (status BETWEEN 1 AND 8);

DROP INDEX IF EXISTS uq_corpus_selection_runs_active_lock;
CREATE UNIQUE INDEX IF NOT EXISTS uq_corpus_selection_runs_active_lock
    ON solemd.corpus_selection_runs (advisory_lock_key)
    WHERE advisory_lock_key IS NOT NULL
      AND status BETWEEN 1 AND 6;

CREATE INDEX IF NOT EXISTS idx_s2orc_documents_raw_release
    ON solemd.s2orc_documents_raw (source_release_id, paper_id);

COMMENT ON TABLE solemd.s2orc_documents_raw IS
    'Release-backed Semantic Scholar S2ORC raw document payloads before any canonical hot-wave parsing.';
COMMENT ON COLUMN solemd.s2orc_documents_raw.document_payload IS
    'Normalized parsed S2ORC document JSON retained on the raw side of the corpus boundary.';

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE solemd.s2orc_documents_raw TO engine_ingest_write;

RESET ROLE;
