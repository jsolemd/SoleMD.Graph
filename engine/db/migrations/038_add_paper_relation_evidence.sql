-- Migration 038: Durable per-paper relation-type evidence for fast runtime recall
--
-- Purpose:
--   1. Add a compact per-paper relation-type summary keyed by (corpus_id, relation_type)
--   2. Let runtime exact relation searches avoid rescanning pubtator.relations on hot paths
--
-- Notes:
--   - Raw relation evidence remains in pubtator.relations.
--   - This table is a durable derived stage refreshed alongside paper_evidence_summary.

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.paper_relation_evidence (
  corpus_id BIGINT NOT NULL
    REFERENCES solemd.corpus (corpus_id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  relation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (corpus_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_paper_relation_evidence_type_count
  ON solemd.paper_relation_evidence (relation_type, relation_count DESC, corpus_id);

COMMENT ON TABLE solemd.paper_relation_evidence IS
  'Durable per-paper relation-type counts used by runtime relation recall so the service does not rescan raw PubTator relation rows on every request.';

COMMENT ON COLUMN solemd.paper_relation_evidence.relation_type IS
  'Normalized lower-case PubTator relation_type surface keyed once per corpus_id.';

COMMENT ON COLUMN solemd.paper_relation_evidence.relation_count IS
  'Count of raw PubTator relation rows for the given (corpus_id, relation_type).';

COMMIT;
