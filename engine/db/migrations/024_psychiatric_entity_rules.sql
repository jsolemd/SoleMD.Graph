-- Migration 024: Generate entity_rules, relation_rules, and journal_rules from enriched vocab_terms
--
-- Prerequisites:
--   1. Migration 023 (vocab_terms table + TSV load)
--   2. engine/scripts/enrich_vocab_terms.py has run (mesh_id, entity_rule_family, pubtator_paper_count populated)
--
-- Run from project root:
--   psql $DATABASE_URL -f engine/db/migrations/024_psychiatric_entity_rules.sql

BEGIN;

-- =========================================================================
-- Entity rules from enriched vocab_terms
-- =========================================================================

INSERT INTO solemd.entity_rule (entity_type, concept_id, canonical_name, family_key, confidence, min_citation_count)
SELECT
    vt.pubtator_entity_type,
    'MESH:' || vt.mesh_id,
    vt.canonical_name,
    vt.entity_rule_family,
    'high',
    CASE
        WHEN vt.pubtator_paper_count > 100000 THEN 20
        WHEN vt.pubtator_paper_count > 50000  THEN 15
        WHEN vt.pubtator_paper_count > 10000  THEN 10
        ELSE 5
    END
FROM solemd.vocab_terms vt
WHERE vt.mesh_id IS NOT NULL
  AND vt.pubtator_entity_type IS NOT NULL
  AND vt.entity_rule_family IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM pubtator.entity_annotations ea
      WHERE ea.concept_id = 'MESH:' || vt.mesh_id
      LIMIT 1
  )
ON CONFLICT DO NOTHING;


-- =========================================================================
-- Relation rules: chemical -> treat -> disease for core psychiatric disorders
-- =========================================================================

INSERT INTO solemd.relation_rule (subject_type, relation_type, object_type, object_id, canonical_name, family_key, target_scope, min_citation_count)
SELECT DISTINCT
    'chemical',
    'treat',
    'disease',
    'MESH:' || vt.mesh_id,
    vt.canonical_name || ' treatment',
    'psychiatric_treatment',
    'base',
    5
FROM solemd.vocab_terms vt
WHERE vt.category = 'clinical.diagnosis'
  AND vt.organ_systems @> '{psychiatric}'
  AND vt.mesh_id IS NOT NULL
  AND vt.pubtator_paper_count >= 1000
ON CONFLICT DO NOTHING;


-- =========================================================================
-- Journal rules: mid-tier psychiatry + neuroimaging journals
-- =========================================================================

INSERT INTO solemd.journal_rule (venue_normalized, family_key, include_in_corpus, rule_source) VALUES
    -- Mid-tier psychiatry journals
    ('schizophrenia bulletin', 'domain_base', true, 'manual'),
    ('schizophrenia research', 'domain_base', true, 'manual'),
    ('journal of clinical psychiatry', 'domain_base', true, 'manual'),
    ('comprehensive psychiatry', 'domain_base', true, 'manual'),
    ('psychological medicine', 'domain_base', true, 'manual'),
    ('british journal of psychiatry', 'domain_base', true, 'manual'),
    ('journal of psychopharmacology', 'domain_base', true, 'manual'),
    ('international journal of neuropsychopharmacology', 'domain_base', true, 'manual'),
    ('journal of affective disorders', 'domain_base', true, 'manual'),
    ('psychoneuroendocrinology', 'domain_base', true, 'manual'),
    ('psychiatric services', 'domain_base', true, 'manual'),
    ('acta psychiatrica scandinavica', 'domain_base', true, 'manual'),
    ('journal of psychiatric research', 'domain_base', true, 'manual'),
    ('psychiatry research', 'domain_base', true, 'manual'),
    ('european psychiatry', 'domain_base', true, 'manual'),
    -- Neuroimaging journals (brain region/circuit coverage since PubTator lacks anatomy)
    ('neuroimage', 'domain_base', true, 'manual'),
    ('human brain mapping', 'domain_base', true, 'manual'),
    ('cerebral cortex', 'domain_base', true, 'manual'),
    ('brain structure and function', 'domain_base', true, 'manual'),
    ('brain connectivity', 'domain_base', true, 'manual'),
    ('cortex', 'domain_base', true, 'manual'),
    ('journal of cognitive neuroscience', 'domain_base', true, 'manual'),
    ('social cognitive and affective neuroscience', 'domain_base', true, 'manual'),
    ('neuropsychologia', 'domain_base', true, 'manual'),
    ('brain imaging and behavior', 'domain_base', true, 'manual'),
    ('brain topography', 'domain_base', true, 'manual'),
    ('magnetic resonance imaging', 'domain_base', true, 'manual')
ON CONFLICT DO NOTHING;


-- =========================================================================
-- Summary comments
-- =========================================================================

COMMENT ON TABLE solemd.entity_rule IS
  'Curated entity rules for base admission. Expanded by migration 024 from vocab_terms vocabulary.';

COMMIT;
