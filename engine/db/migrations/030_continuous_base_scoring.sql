-- Migration 030: Continuous domain-density scoring for base admission
--
-- Replaces binary has_rule_evidence → base with a continuous score.
-- Top target_base_count papers by domain_score enter base; the rest are universe.
--
-- The domain_score formula rewards:
--   - Entity rule family diversity (squared — 3 families = 9x vs 1 family = 1x)
--   - Core psych/neuro family matches (200 pts per core family)
--   - Relation rule hits (500 pts)
--   - Flagship journal membership (800 pts)
--   - Citation count (log-scaled, x40)
--   - Entity and relation annotation density (log-scaled)
--   - Recency (30 pts for 2020+)
--
-- Run from project root:
--   psql $DATABASE_URL -f engine/db/migrations/030_continuous_base_scoring.sql

BEGIN;

-- 1. Add family diversity columns to paper_evidence_summary
ALTER TABLE solemd.paper_evidence_summary
  ADD COLUMN IF NOT EXISTS entity_rule_families  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entity_rule_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entity_core_families  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN solemd.paper_evidence_summary.entity_rule_families IS
    'Distinct entity_rule family_keys matched (high confidence only)';
COMMENT ON COLUMN solemd.paper_evidence_summary.entity_rule_count IS
    'Distinct entity_rule concept_ids matched (high confidence only)';
COMMENT ON COLUMN solemd.paper_evidence_summary.entity_core_families IS
    'Distinct core family_keys matched (psychiatric_disorder, neurological_disorder, psychiatric_medication, neurotransmitter_system)';

-- 2. Update base policy target to 500K
UPDATE solemd.base_policy
SET target_base_count = 500000,
    description = 'Continuous domain-density scoring: top 500K papers by family diversity, '
                  'entity density, citations, and journal quality enter base; rest is universe.',
    updated_at = now()
WHERE is_active = true;

COMMIT;
