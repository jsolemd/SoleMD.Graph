-- Migration 022: Schema hygiene for canonical base-admission naming
--
-- Purpose:
--   1. Rename the last graph_base_features index that still uses the old "source" term
--   2. Add explicit graph_base_features column comments for rule/journal-family audit fields

BEGIN;

ALTER INDEX IF EXISTS solemd.idx_graph_base_features_run_source
  RENAME TO idx_graph_base_features_run_reason;

COMMENT ON COLUMN solemd.graph_base_features.has_rule_evidence IS
  'True when the mapped paper has curated entity_rule or relation_rule support for base admission.';

COMMENT ON COLUMN solemd.graph_base_features.has_curated_journal_family IS
  'True when the mapped paper also matches a curated journal family via journal_rule.';

COMMENT ON COLUMN solemd.graph_base_features.journal_family_key IS
  'Matched curated journal family key, if any.';

COMMENT ON COLUMN solemd.graph_base_features.journal_family_label IS
  'Human-readable curated journal family label, if any.';

COMMENT ON COLUMN solemd.graph_base_features.journal_family_type IS
  'Curated journal family type used for audit and base-ranking context.';

COMMIT;
