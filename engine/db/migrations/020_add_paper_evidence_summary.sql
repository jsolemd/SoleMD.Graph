-- Migration 020: Persistent paper_evidence_summary for restartable base admission
--
-- Purpose:
--   1. Add a durable paper-level evidence summary table keyed by corpus_id
--   2. Add composite PubTator indexes that match the base-admission join shapes
--
-- Notes:
--   - This table is a durable derived stage, not a new source of truth.
--   - Raw evidence remains in pubtator.*.
--   - graph_base_features remains run-scoped audit output.

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.paper_evidence_summary (
  corpus_id BIGINT PRIMARY KEY
    REFERENCES solemd.corpus (corpus_id) ON DELETE CASCADE,
  admission_reason TEXT NOT NULL,
  pmid INTEGER,
  citation_count INTEGER NOT NULL DEFAULT 0,
  venue_normalized TEXT NOT NULL DEFAULT '',
  has_vocab_match BOOLEAN NOT NULL DEFAULT false,
  paper_entity_count INTEGER NOT NULL DEFAULT 0,
  has_entity_rule_hit BOOLEAN NOT NULL DEFAULT false,
  paper_relation_count INTEGER NOT NULL DEFAULT 0,
  has_relation_rule_hit BOOLEAN NOT NULL DEFAULT false,
  is_direct_evidence BOOLEAN NOT NULL DEFAULT false,
  is_journal_base BOOLEAN NOT NULL DEFAULT false,
  journal_family_key TEXT,
  journal_family_label TEXT,
  journal_family_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paper_evidence_summary_pmid
  ON solemd.paper_evidence_summary (pmid)
  WHERE pmid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paper_evidence_summary_direct
  ON solemd.paper_evidence_summary (is_direct_evidence);

CREATE INDEX IF NOT EXISTS idx_paper_evidence_summary_journal_family
  ON solemd.paper_evidence_summary (journal_family_key)
  WHERE journal_family_key IS NOT NULL;

COMMENT ON TABLE solemd.paper_evidence_summary IS
  'Durable per-paper evidence summary used to admit mapped papers into base_points without rescanning raw PubTator evidence on every publish.';

COMMENT ON COLUMN solemd.paper_evidence_summary.venue_normalized IS
  'Normalized venue derived via solemd.clean_venue(). Stored once so base admission does not repeat venue normalization on every graph publish.';

COMMENT ON COLUMN solemd.paper_evidence_summary.is_direct_evidence IS
  'True when the paper has direct domain evidence through vocab-bearing corpus admission, entity_rule, or relation_rule matches.';

COMMENT ON COLUMN solemd.paper_evidence_summary.is_journal_base IS
  'True when the paper also matches a curated base_journal_family via journal_rule.';

COMMIT;

CREATE INDEX IF NOT EXISTS idx_pt_entity_pmid_type_concept
  ON pubtator.entity_annotations (pmid, entity_type, concept_id);

CREATE INDEX IF NOT EXISTS idx_pt_relation_pmid_signature
  ON pubtator.relations (pmid, subject_type, relation_type, object_type, object_id);
