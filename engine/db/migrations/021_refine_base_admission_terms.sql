-- Migration 021: Refine base admission naming and source semantics
--
-- Purpose:
--   1. Replace old visibility-era naming with explicit base-admission terms
--   2. Rename direct/journal flags to clearer evidence/journal-family names
--   3. Collapse graph_base_features.base_reason to rule / flagship / vocab / NULL
--   4. Activate the simpler curated base policy target around ~1.0M base points

BEGIN;

-- ── 1. paper_evidence_summary naming cleanup ─────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'paper_evidence_summary'
      AND column_name = 'is_direct_evidence'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'paper_evidence_summary'
      AND column_name = 'has_rule_evidence'
  ) THEN
    ALTER TABLE solemd.paper_evidence_summary
      RENAME COLUMN is_direct_evidence TO has_rule_evidence;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'paper_evidence_summary'
      AND column_name = 'is_journal_base'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'paper_evidence_summary'
      AND column_name = 'has_curated_journal_family'
  ) THEN
    ALTER TABLE solemd.paper_evidence_summary
      RENAME COLUMN is_journal_base TO has_curated_journal_family;
  END IF;
END $$;

UPDATE solemd.paper_evidence_summary
SET
  has_rule_evidence = (has_entity_rule_hit OR has_relation_rule_hit),
  updated_at = now();

DROP INDEX IF EXISTS solemd.idx_paper_evidence_summary_direct;
CREATE INDEX IF NOT EXISTS idx_paper_evidence_summary_rule_evidence
  ON solemd.paper_evidence_summary (has_rule_evidence);

COMMENT ON COLUMN solemd.paper_evidence_summary.has_rule_evidence IS
  'True when the paper has curated entity_rule or relation_rule support for base admission.';

COMMENT ON COLUMN solemd.paper_evidence_summary.has_curated_journal_family IS
  'True when the paper matches any curated journal family via journal_rule.';

-- ── 2. graph_base_features naming cleanup ────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_base_features'
      AND column_name = 'is_direct_evidence'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_base_features'
      AND column_name = 'has_rule_evidence'
  ) THEN
    ALTER TABLE solemd.graph_base_features
      RENAME COLUMN is_direct_evidence TO has_rule_evidence;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_base_features'
      AND column_name = 'is_journal_base'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_base_features'
      AND column_name = 'has_curated_journal_family'
  ) THEN
    ALTER TABLE solemd.graph_base_features
      RENAME COLUMN is_journal_base TO has_curated_journal_family;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_base_features'
      AND column_name = 'base_source'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_base_features'
      AND column_name = 'base_reason'
  ) THEN
    ALTER TABLE solemd.graph_base_features
      RENAME COLUMN base_source TO base_reason;
  END IF;
END $$;

ALTER TABLE solemd.graph_base_features
  ALTER COLUMN base_reason DROP NOT NULL,
  ALTER COLUMN base_reason DROP DEFAULT;

ALTER TABLE solemd.graph_base_features
  DROP CONSTRAINT IF EXISTS graph_base_features_source_check;

UPDATE solemd.graph_base_features
SET
  has_rule_evidence = (has_entity_rule_hit OR has_relation_rule_hit),
  base_reason = CASE
    WHEN (has_entity_rule_hit OR has_relation_rule_hit) THEN 'rule'
    WHEN journal_family_key IN ('domain_flagship', 'general_flagship') THEN 'flagship'
    WHEN admission_reason = 'vocab_entity_match'
     AND (
        journal_family_key IS NULL
        OR journal_family_key NOT IN ('critical_care_specialty', 'palliative_specialty')
     )
    THEN 'vocab'
    ELSE NULL
  END;

ALTER TABLE solemd.graph_base_features
  DROP CONSTRAINT IF EXISTS graph_base_features_reason_check;

ALTER TABLE solemd.graph_base_features
  ADD CONSTRAINT graph_base_features_reason_check
  CHECK (base_reason IS NULL OR base_reason IN ('rule', 'flagship', 'vocab'));

COMMENT ON TABLE solemd.graph_base_features IS
  'Run-scoped audit of why a mapped paper entered base_points.';

COMMENT ON COLUMN solemd.graph_base_features.base_reason IS
  'Base admission reason: rule, flagship, vocab, or NULL when the paper stays in universe.';

-- ── 3. Active base policy version ────────────────────────────────────────

UPDATE solemd.base_policy
SET is_active = false,
    updated_at = now()
WHERE is_active = true;

INSERT INTO solemd.base_policy (
  policy_version,
  description,
  target_base_count,
  is_active
)
VALUES (
  'curated_base_v2',
  'Base points include curated rule evidence, flagship journals, and a narrow vocab-anchor slice; everything else remains in universe.',
  1000000,
  true
)
ON CONFLICT (policy_version) DO UPDATE
SET description = EXCLUDED.description,
    target_base_count = EXCLUDED.target_base_count,
    is_active = EXCLUDED.is_active,
    updated_at = now();

UPDATE solemd.base_policy
SET is_active = (policy_version = 'curated_base_v2'),
    updated_at = now();

COMMIT;
