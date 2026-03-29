-- Migration 019: Simplify graph admission to canonical base/universe semantics
--
-- Purpose:
--   1. Replace default-visible/core-rescue-bridge naming with base admission
--   2. Rename graph/run tables to canonical names used by the runtime bundle
--   3. Normalize curated journal families into base_journal_family + journal_rule
--   4. Drop legacy visibility policy tables and cluster rescue metadata

BEGIN;

-- ── 1. Canonical corpus naming ────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'filter_reason'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'admission_reason'
  ) THEN
    ALTER TABLE solemd.corpus RENAME COLUMN filter_reason TO admission_reason;
  END IF;
END $$;

ALTER TABLE solemd.relation_rule DROP CONSTRAINT IF EXISTS relation_rule_target_layer_check;
ALTER TABLE solemd.relation_rule DROP CONSTRAINT IF EXISTS relation_rule_target_scope_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'corpus_tier'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'layout_status'
  ) THEN
    ALTER TABLE solemd.corpus RENAME COLUMN corpus_tier TO layout_status;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'is_mapped'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'is_in_current_map'
  ) THEN
    ALTER TABLE solemd.corpus RENAME COLUMN is_mapped TO is_in_current_map;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'is_default_visible'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'corpus'
      AND column_name = 'is_in_current_base'
  ) THEN
    ALTER TABLE solemd.corpus RENAME COLUMN is_default_visible TO is_in_current_base;
  END IF;
END $$;

ALTER TABLE solemd.corpus DROP CONSTRAINT IF EXISTS corpus_corpus_tier_check;
ALTER TABLE solemd.corpus DROP CONSTRAINT IF EXISTS corpus_layout_status_check;

UPDATE solemd.corpus
SET layout_status = 'mapped'
WHERE layout_status = 'graph';

ALTER TABLE solemd.corpus
  ALTER COLUMN layout_status SET DEFAULT 'candidate';

DO $$ BEGIN
  ALTER TABLE solemd.corpus
    ADD CONSTRAINT corpus_layout_status_check
    CHECK (layout_status IN ('candidate', 'mapped'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS solemd.idx_corpus_graph_only;
DROP INDEX IF EXISTS solemd.idx_corpus_mapped;
DROP INDEX IF EXISTS solemd.idx_corpus_default_visible;

CREATE INDEX IF NOT EXISTS idx_corpus_layout_mapped
  ON solemd.corpus (corpus_id)
  WHERE layout_status = 'mapped';

CREATE INDEX IF NOT EXISTS idx_corpus_current_map
  ON solemd.corpus (corpus_id)
  WHERE is_in_current_map = true;

CREATE INDEX IF NOT EXISTS idx_corpus_current_base
  ON solemd.corpus (corpus_id)
  WHERE is_in_current_base = true;

COMMENT ON COLUMN solemd.corpus.admission_reason IS
  'Primary domain-admission reason assigned during corpus filtering.';

COMMENT ON COLUMN solemd.corpus.layout_status IS
  'candidate = domain corpus member awaiting mapped layout, mapped = promoted into the coordinate universe.';

COMMENT ON COLUMN solemd.corpus.is_in_current_map IS
  'Current published run membership sync: paper exists in the current graph_points run.';

COMMENT ON COLUMN solemd.corpus.is_in_current_base IS
  'Current published run sync: paper is admitted into the current base_points opening scaffold.';

-- ── 2. Canonical graph table names ────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'solemd'
      AND table_name = 'graph'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_points'
  ) THEN
    ALTER TABLE solemd.graph RENAME TO graph_points;
  END IF;
END $$;

DROP INDEX IF EXISTS solemd.idx_graph_point_index;
DROP INDEX IF EXISTS solemd.idx_graph_run_cluster_id;
DROP INDEX IF EXISTS solemd.idx_graph_run_micro_cluster_id;
DROP INDEX IF EXISTS solemd.idx_graph_run_default_visibility_lane;
DROP INDEX IF EXISTS solemd.idx_graph_run_default_visibility_rank;

DO $$ BEGIN
  ALTER TABLE solemd.graph_points
    ADD COLUMN is_in_base BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE solemd.graph_points
    ADD COLUMN base_rank REAL NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_points'
      AND column_name = 'default_visibility_lane'
  ) THEN
    EXECUTE $sql$
      UPDATE solemd.graph_points
      SET is_in_base = (COALESCE(default_visibility_lane, 'hidden') <> 'hidden'),
          base_rank = COALESCE(default_visibility_rank, 0)
    $sql$;
  END IF;
END $$;

ALTER TABLE solemd.graph_points DROP CONSTRAINT IF EXISTS graph_default_visibility_lane_check;
ALTER TABLE solemd.graph_points DROP COLUMN IF EXISTS default_visibility_lane;
ALTER TABLE solemd.graph_points DROP COLUMN IF EXISTS default_visibility_rank;
ALTER TABLE solemd.graph_points DROP COLUMN IF EXISTS render_override;

CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_points_point_index
  ON solemd.graph_points (graph_run_id, point_index)
  WHERE point_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_points_run_cluster_id
  ON solemd.graph_points (graph_run_id, cluster_id)
  WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_points_run_micro_cluster_id
  ON solemd.graph_points (graph_run_id, micro_cluster_id)
  WHERE micro_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_points_run_is_in_base
  ON solemd.graph_points (graph_run_id, is_in_base);

CREATE INDEX IF NOT EXISTS idx_graph_points_run_base_rank
  ON solemd.graph_points (graph_run_id, base_rank DESC);

COMMENT ON TABLE solemd.graph_points IS
  'Mapped-paper coordinates and cluster assignments for a specific graph build run.';

COMMENT ON COLUMN solemd.graph_points.is_in_base IS
  'Whether the mapped paper is admitted into the opening base_points scaffold for this run.';

COMMENT ON COLUMN solemd.graph_points.base_rank IS
  'Compact ordering signal used inside the base_points scaffold for export and QA.';

-- ── 3. Simplified cluster metadata ────────────────────────────────────────

ALTER TABLE solemd.graph_clusters DROP COLUMN IF EXISTS domain_core_count;
ALTER TABLE solemd.graph_clusters DROP COLUMN IF EXISTS domain_core_fraction;
ALTER TABLE solemd.graph_clusters DROP COLUMN IF EXISTS rescue_enabled;
ALTER TABLE solemd.graph_clusters DROP COLUMN IF EXISTS rescue_count;
ALTER TABLE solemd.graph_clusters DROP COLUMN IF EXISTS bridge_count;

-- ── 4. Canonical rule naming ──────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'entity_rule'
      AND column_name = 'rule_category'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'entity_rule'
      AND column_name = 'family_key'
  ) THEN
    ALTER TABLE solemd.entity_rule RENAME COLUMN rule_category TO family_key;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'relation_rule'
      AND column_name = 'rule_category'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'relation_rule'
      AND column_name = 'family_key'
  ) THEN
    ALTER TABLE solemd.relation_rule RENAME COLUMN rule_category TO family_key;
  END IF;
END $$;

COMMENT ON COLUMN solemd.entity_rule.family_key IS
  'Canonical domain family key for this entity rule.';

COMMENT ON COLUMN solemd.relation_rule.family_key IS
  'Canonical domain family key for this relation rule.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'relation_rule'
      AND column_name = 'target_layer'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'relation_rule'
      AND column_name = 'target_scope'
  ) THEN
    ALTER TABLE solemd.relation_rule RENAME COLUMN target_layer TO target_scope;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'solemd'
      AND table_name = 'relation_rule'
      AND column_name = 'target_scope'
  ) THEN
    UPDATE solemd.relation_rule
    SET target_scope = 'base'
    WHERE target_scope = 'baseline';
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE solemd.relation_rule
    ADD CONSTRAINT relation_rule_target_scope_check
    CHECK (target_scope IN ('base', 'overlay'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN solemd.relation_rule.target_scope IS
  'base = promote into mapped layout now, overlay = count/stage for later overlay activation.';

-- ── 5. Canonical journal-family curation ──────────────────────────────────

CREATE TABLE IF NOT EXISTS solemd.base_journal_family (
  family_key TEXT PRIMARY KEY,
  family_label TEXT NOT NULL,
  family_type TEXT NOT NULL,
  include_in_base BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT base_journal_family_type_check
    CHECK (family_type IN ('general_flagship', 'domain_flagship', 'domain_base', 'organ_overlap', 'specialty'))
);

CREATE TABLE IF NOT EXISTS solemd.journal_rule (
  venue_normalized TEXT PRIMARY KEY,
  family_key TEXT NOT NULL REFERENCES solemd.base_journal_family (family_key) ON DELETE CASCADE,
  include_in_corpus BOOLEAN NOT NULL DEFAULT true,
  rule_source TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE solemd.base_journal_family IS
  'Curated journal families that can top up the opening base_points scaffold.';

COMMENT ON TABLE solemd.journal_rule IS
  'Per-venue family membership used for mapped promotion and journal-based base admission.';

INSERT INTO solemd.base_journal_family (
  family_key,
  family_label,
  family_type,
  include_in_base,
  description
)
VALUES
  ('general_flagship', 'General Flagship', 'general_flagship', true, 'Top-tier general medicine and science journals included in base by default.'),
  ('domain_flagship', 'Domain Flagship', 'domain_flagship', true, 'Flagship neurology, psychiatry, psychology, neuroscience, and neuropsychology journals.'),
  ('domain_base', 'Domain Base', 'domain_base', true, 'High-quality canonical neuro and psych journals that broaden core domain representation.'),
  ('cardiology_overlap', 'Cardiology Overlap', 'organ_overlap', true, 'Cardiovascular overlap journals with consistent neuropsychiatric relevance.'),
  ('dermatology_overlap', 'Dermatology Overlap', 'organ_overlap', true, 'Dermatology overlap journals with medication and systemic neuro relevance.'),
  ('endocrinology_overlap', 'Endocrinology Overlap', 'organ_overlap', true, 'Endocrine and metabolic overlap journals.'),
  ('gastroenterology_overlap', 'Gastroenterology Overlap', 'organ_overlap', true, 'GI overlap journals for systemic and medication-related brain effects.'),
  ('hematology_overlap', 'Hematology Overlap', 'organ_overlap', true, 'Hematology overlap journals for toxicity and systemic overlap.'),
  ('immunology_overlap', 'Immunology Overlap', 'organ_overlap', true, 'Immunology overlap journals for inflammation and neuroimmune overlap.'),
  ('infectious_disease_overlap', 'Infectious Disease Overlap', 'organ_overlap', true, 'Infectious disease journals with neuropsychiatric/systemic overlap.'),
  ('nephrology_overlap', 'Nephrology Overlap', 'organ_overlap', true, 'Renal overlap journals for encephalopathy, toxicity, and systemic effects.'),
  ('obgyn_overlap', 'OB-GYN Overlap', 'organ_overlap', true, 'Women''s health journals with endocrine and neuropsychiatric overlap.'),
  ('oncology_overlap', 'Oncology Overlap', 'organ_overlap', true, 'Cancer journals with treatment-toxicity and neuropsychiatric overlap.'),
  ('pain_overlap', 'Pain Overlap', 'organ_overlap', true, 'Pain journals explicitly included to preserve domain-rich overlap in base.'),
  ('pulmonology_overlap', 'Pulmonology Overlap', 'organ_overlap', true, 'Pulmonology overlap journals for hypoxia and respiratory brain-failure overlap.'),
  ('rehabilitation_overlap', 'Rehabilitation Overlap', 'organ_overlap', true, 'Rehabilitation journals that preserve post-injury and recovery representation.'),
  ('rheumatology_overlap', 'Rheumatology Overlap', 'organ_overlap', true, 'Rheumatology journals with inflammatory and systemic overlap.'),
  ('sleep_overlap', 'Sleep Overlap', 'organ_overlap', true, 'Sleep journals explicitly included to preserve neurobehavioral overlap in base.'),
  ('critical_care_specialty', 'Critical Care Specialty', 'specialty', true, 'Curated specialty journals for ICU and brain-failure overlap.'),
  ('neuroimmunology_specialty', 'Neuroimmunology Specialty', 'specialty', true, 'Curated cross-specialty neuroimmunology journals.'),
  ('palliative_specialty', 'Palliative Specialty', 'specialty', true, 'Curated palliative journals with neuropsychiatric symptom overlap.'),
  ('psycho_oncology_specialty', 'Psycho-oncology Specialty', 'specialty', true, 'Curated psycho-oncology journals with psychiatric overlap.')
ON CONFLICT (family_key) DO UPDATE
SET family_label = EXCLUDED.family_label,
    family_type = EXCLUDED.family_type,
    include_in_base = EXCLUDED.include_in_base,
    description = EXCLUDED.description;

DO $$ BEGIN
  ALTER TABLE solemd.journal_rule
    ADD CONSTRAINT journal_rule_family_key_fk
    FOREIGN KEY (family_key)
    REFERENCES solemd.base_journal_family (family_key)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'solemd'
      AND table_name = 'journal_family'
  ) THEN
    INSERT INTO solemd.journal_rule (
      venue_normalized,
      family_key,
      include_in_corpus,
      rule_source
    )
    SELECT
      jf.venue_normalized,
      CASE jf.family_key
        WHEN 'flagship.general' THEN 'general_flagship'
        WHEN 'flagship.neuropsych' THEN 'domain_flagship'
        WHEN 'rescue.canonical_neuro' THEN 'domain_base'
        WHEN 'bridge.cardiology' THEN 'cardiology_overlap'
        WHEN 'bridge.dermatology' THEN 'dermatology_overlap'
        WHEN 'bridge.endocrinology' THEN 'endocrinology_overlap'
        WHEN 'bridge.gastroenterology' THEN 'gastroenterology_overlap'
        WHEN 'bridge.hematology' THEN 'hematology_overlap'
        WHEN 'bridge.immunology' THEN 'immunology_overlap'
        WHEN 'bridge.infectious_disease' THEN 'infectious_disease_overlap'
        WHEN 'bridge.nephrology' THEN 'nephrology_overlap'
        WHEN 'bridge.obgyn' THEN 'obgyn_overlap'
        WHEN 'bridge.oncology' THEN 'oncology_overlap'
        WHEN 'bridge.pain' THEN 'pain_overlap'
        WHEN 'bridge.pulmonology' THEN 'pulmonology_overlap'
        WHEN 'bridge.rehabilitation' THEN 'rehabilitation_overlap'
        WHEN 'bridge.rheumatology' THEN 'rheumatology_overlap'
        WHEN 'bridge.sleep' THEN 'sleep_overlap'
        ELSE jf.family_key
      END AS family_key,
      true AS include_in_corpus,
      jf.rule_source
    FROM solemd.journal_family jf
    ON CONFLICT (venue_normalized) DO UPDATE
    SET family_key = EXCLUDED.family_key,
        include_in_corpus = EXCLUDED.include_in_corpus,
        rule_source = EXCLUDED.rule_source;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'solemd'
      AND table_name = 'venue_rule'
  ) THEN
    INSERT INTO solemd.journal_rule (
      venue_normalized,
      family_key,
      include_in_corpus,
      rule_source
    )
    SELECT
      vr.venue_normalized,
      CASE vr.specialty
        WHEN 'critical_care' THEN 'critical_care_specialty'
        WHEN 'neuroimmunology' THEN 'neuroimmunology_specialty'
        WHEN 'palliative' THEN 'palliative_specialty'
        WHEN 'psycho_oncology' THEN 'psycho_oncology_specialty'
        ELSE vr.specialty
      END AS family_key,
      true AS include_in_corpus,
      vr.rule_source
    FROM solemd.venue_rule vr
    ON CONFLICT (venue_normalized) DO UPDATE
    SET family_key = EXCLUDED.family_key,
        include_in_corpus = EXCLUDED.include_in_corpus,
        rule_source = EXCLUDED.rule_source;
  END IF;
END $$;

DROP TABLE IF EXISTS solemd.journal_family CASCADE;
DROP TABLE IF EXISTS solemd.venue_rule CASCADE;

-- ── 6. Canonical base policy ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solemd.base_policy (
  policy_version TEXT PRIMARY KEY,
  description TEXT,
  target_base_count INTEGER NOT NULL DEFAULT 1160000,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_base_policy_active
  ON solemd.base_policy ((is_active))
  WHERE is_active = true;

INSERT INTO solemd.base_policy (
  policy_version,
  description,
  target_base_count,
  is_active
)
VALUES (
  'domain_rich_base_v1',
  'Renderable mapped papers enter base_points when they have direct domain evidence or belong to a curated base journal family.',
  1160000,
  true
)
ON CONFLICT (policy_version) DO UPDATE
SET description = EXCLUDED.description,
    target_base_count = EXCLUDED.target_base_count,
    is_active = EXCLUDED.is_active,
    updated_at = now();

UPDATE solemd.base_policy
SET is_active = (policy_version = 'domain_rich_base_v1'),
    updated_at = now();

DROP TABLE IF EXISTS solemd.default_visibility_family CASCADE;
DROP TABLE IF EXISTS solemd.default_visibility_policy CASCADE;

-- ── 7. Canonical run-scoped base features ─────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_visibility_features'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'solemd'
      AND table_name = 'graph_base_features'
  ) THEN
    ALTER TABLE solemd.graph_visibility_features RENAME TO graph_base_features;
  END IF;
END $$;

DROP TABLE IF EXISTS solemd.graph_base_features CASCADE;

CREATE TABLE solemd.graph_base_features (
  graph_run_id UUID NOT NULL,
  corpus_id BIGINT NOT NULL,
  admission_reason TEXT NOT NULL,
  has_vocab_match BOOLEAN NOT NULL DEFAULT false,
  has_entity_rule_hit BOOLEAN NOT NULL DEFAULT false,
  has_relation_rule_hit BOOLEAN NOT NULL DEFAULT false,
  is_direct_evidence BOOLEAN NOT NULL DEFAULT false,
  is_journal_base BOOLEAN NOT NULL DEFAULT false,
  journal_family_key TEXT,
  journal_family_label TEXT,
  journal_family_type TEXT,
  base_source TEXT NOT NULL DEFAULT 'hidden',
  citation_count INTEGER NOT NULL DEFAULT 0,
  paper_entity_count INTEGER NOT NULL DEFAULT 0,
  paper_relation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (graph_run_id, corpus_id),
  CONSTRAINT graph_base_features_graph_fk
    FOREIGN KEY (graph_run_id, corpus_id)
    REFERENCES solemd.graph_points (graph_run_id, corpus_id) ON DELETE CASCADE,
  CONSTRAINT graph_base_features_source_check
    CHECK (base_source IN ('hidden', 'direct', 'journal', 'direct+journal'))
);

CREATE INDEX idx_graph_base_features_run_source
  ON solemd.graph_base_features (graph_run_id, base_source);

CREATE INDEX idx_graph_base_features_run_family
  ON solemd.graph_base_features (graph_run_id, journal_family_key);

COMMENT ON TABLE solemd.graph_base_features IS
  'Run-scoped derived features used to admit mapped papers into base_points.';

-- ── 8. Canonical mapped-paper view ────────────────────────────────────────

DROP VIEW IF EXISTS solemd.mapped_papers;
DROP VIEW IF EXISTS solemd.graph_papers;

CREATE OR REPLACE VIEW solemd.mapped_papers AS
SELECT
  p.*,
  c.layout_status,
  c.admission_reason,
  c.is_in_current_map,
  c.is_in_current_base
FROM solemd.papers p
JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
WHERE c.layout_status = 'mapped'
  AND (p.year >= 1945 OR p.year IS NULL)
  AND NOT (
    (p.publication_types IS NULL OR CARDINALITY(p.publication_types) = 0)
    AND COALESCE(p.citation_count, 0) < 50
  )
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'News' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 50
  )
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'LettersAndComments' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 50
  )
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'Editorial' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 20
  );

COMMENT ON VIEW solemd.mapped_papers IS
  'Quality-filtered mapped universe used for graph layout, base admission, and bundle export.';

COMMIT;
