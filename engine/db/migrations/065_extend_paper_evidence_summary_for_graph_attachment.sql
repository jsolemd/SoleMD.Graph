BEGIN;

ALTER TABLE solemd.paper_evidence_summary
  ADD COLUMN IF NOT EXISTS semantic_groups_csv TEXT,
  ADD COLUMN IF NOT EXISTS relation_categories_csv TEXT;

COMMENT ON COLUMN solemd.paper_evidence_summary.semantic_groups_csv IS
  'Distinct PubTator entity types observed for the paper, formatted for runtime graph attachment and lightweight paper summaries.';

COMMENT ON COLUMN solemd.paper_evidence_summary.relation_categories_csv IS
  'Top PubTator relation categories observed for the paper, ordered by descending frequency for runtime graph attachment.';

COMMIT;
