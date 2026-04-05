-- Migration 043: Data-driven journal score multiplier
--
-- Adds score_multiplier to base_journal_family so the domain_score formula
-- reads multipliers from the DB instead of hardcoding family keys in Python.
-- Also introduces 'penalized' family_type for animal/plant journals.

-- 1. Add score_multiplier column (default 1.0 = no effect)
ALTER TABLE solemd.base_journal_family
  ADD COLUMN IF NOT EXISTS score_multiplier REAL NOT NULL DEFAULT 1.0;

-- 2. Set multipliers for existing flagship family types
UPDATE solemd.base_journal_family SET score_multiplier = 1.5
  WHERE family_type IN ('domain_flagship', 'general_flagship');
-- organ_overlap, specialty, domain_base stay at 1.0 (default)

-- 3. Expand family_type constraint to include 'penalized'
ALTER TABLE solemd.base_journal_family
  DROP CONSTRAINT IF EXISTS base_journal_family_type_check;
ALTER TABLE solemd.base_journal_family
  ADD CONSTRAINT base_journal_family_type_check
  CHECK (family_type IN ('general_flagship', 'domain_flagship', 'domain_base',
                         'organ_overlap', 'specialty', 'penalized'));

-- 4. Insert penalized families
INSERT INTO solemd.base_journal_family
  (family_key, family_label, family_type, include_in_base, score_multiplier)
VALUES
  ('animal_behavior', 'Animal Behavior & Ecology', 'penalized', true, 0.3),
  ('plant_ecology', 'Plant Biology & Ecology', 'penalized', true, 0.3)
ON CONFLICT (family_key) DO UPDATE
  SET family_type = EXCLUDED.family_type,
      score_multiplier = EXCLUDED.score_multiplier;

-- 5. Assign journals to penalized families
INSERT INTO solemd.journal_rule (venue_normalized, family_key, include_in_corpus, rule_source)
VALUES
  ('animals', 'animal_behavior', true, 'manual'),
  ('hormones and behavior', 'animal_behavior', true, 'manual'),
  ('animal behaviour', 'animal_behavior', true, 'manual'),
  ('frontiers in veterinary science', 'animal_behavior', true, 'manual'),
  ('american journal of primatology', 'animal_behavior', true, 'manual'),
  ('behavioral ecology and sociobiology', 'animal_behavior', true, 'manual'),
  ('bmc veterinary research', 'animal_behavior', true, 'manual'),
  ('evolutionary applications', 'animal_behavior', true, 'manual'),
  ('ecology and evolution', 'animal_behavior', true, 'manual'),
  ('frontiers in plant science', 'plant_ecology', true, 'manual'),
  ('chemosphere', 'plant_ecology', true, 'manual')
ON CONFLICT (venue_normalized) DO UPDATE
  SET family_key = EXCLUDED.family_key;

-- 6. Add journal_score_multiplier to paper_evidence_summary
ALTER TABLE solemd.paper_evidence_summary
  ADD COLUMN IF NOT EXISTS journal_score_multiplier REAL NOT NULL DEFAULT 1.0;
