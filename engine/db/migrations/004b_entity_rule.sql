-- Migration 004b: Entity-based promotion rules
-- Creates solemd.entity_rule for promoting candidate papers to graph tier
-- based on PubTator3 entity annotations.
--
-- Entity rules complement venue rules: venue rules promote by journal identity,
-- entity rules promote by specific concept annotations (behaviors, neuropsych
-- diseases, neurotransmitter genes).
--
-- Composite PK required: Gene IDs like 6531, 6532 exist under both
-- 'gene' AND 'species' entity_types in PubTator3.
-- All JOINs must match on BOTH entity_type AND concept_id.
--
-- Seeds validated against live pubtator.entity_annotations (2026-03-19).
-- See docs/map/pubtator-entity-analysis.md for full audit.

BEGIN;

-- ── DDL ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solemd.entity_rule (
    entity_type         TEXT NOT NULL,
    concept_id          TEXT NOT NULL,
    canonical_name      TEXT NOT NULL,
    rule_category       TEXT NOT NULL,
    confidence          TEXT NOT NULL DEFAULT 'high',
    min_citation_count  INTEGER NOT NULL DEFAULT 0,
    added_at            TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (entity_type, concept_id),
    CONSTRAINT entity_rule_confidence_check
        CHECK (confidence IN ('high', 'moderate', 'requires_second_gate'))
);

COMMENT ON TABLE solemd.entity_rule IS
    'Entity-based promotion rules: promote candidate papers to graph tier '
    'when they have PubTator3 annotations matching these concept IDs.';

COMMENT ON COLUMN solemd.entity_rule.confidence IS
    'high/moderate: promote if citation gate passes. '
    'requires_second_gate: promote only if paper ALSO has a high-confidence '
    'entity_rule match OR a treat/cause relation.';

-- ── SEED: HIGH confidence — behavior (8 rules) ─────────────

INSERT INTO solemd.entity_rule (entity_type, concept_id, canonical_name, rule_category, confidence, min_citation_count)
VALUES
    ('disease', 'MESH:D010554', 'Aggression', 'behavior', 'high', 10),
    ('disease', 'MESH:D007174', 'Impulsivity', 'behavior', 'high', 10),
    ('disease', 'MESH:D009771', 'OCD behaviors', 'behavior', 'high', 10),
    ('disease', 'MESH:D003072', 'Cognitive impairment', 'behavior', 'high', 20),
    ('disease', 'MESH:D008569', 'Memory impairment', 'behavior', 'high', 10),
    ('disease', 'MESH:D003193', 'Compulsive behaviors', 'behavior', 'high', 5),
    ('disease', 'MESH:D000073932', 'Compulsions', 'behavior', 'high', 10),
    ('disease', 'MESH:D020921', 'Arousal disorders', 'behavior', 'high', 10)
ON CONFLICT DO NOTHING;

-- ── SEED: HIGH confidence — neuropsych disease (5 rules) ────

INSERT INTO solemd.entity_rule (entity_type, concept_id, canonical_name, rule_category, confidence, min_citation_count)
VALUES
    ('disease', 'MESH:D004833', 'Epilepsy', 'neuropsych_disease', 'high', 10),
    ('disease', 'MESH:D000341', 'Affective psychosis', 'neuropsych_disease', 'high', 5),
    ('disease', 'MESH:D057174', 'Frontotemporal dementia', 'neuropsych_disease', 'high', 5),
    ('disease', 'MESH:D017109', 'Akathisia', 'neuropsych_disease', 'high', 0),
    ('disease', 'MESH:D000091323', 'PNES', 'neuropsych_disease', 'high', 0)
ON CONFLICT DO NOTHING;

-- ── SEED: REQUIRES_SECOND_GATE — gene (5 rules) ────────────
-- These promote ONLY if the paper also has a high-confidence entity match
-- or a treat/cause relation, preventing noise from gene-only papers.

INSERT INTO solemd.entity_rule (entity_type, concept_id, canonical_name, rule_category, confidence, min_citation_count)
VALUES
    ('gene', '627',  'BDNF',  'neurotransmitter_gene', 'requires_second_gate', 10),
    ('gene', '6531', 'DAT',   'neurotransmitter_gene', 'requires_second_gate', 10),
    ('gene', '6532', 'SERT',  'neurotransmitter_gene', 'requires_second_gate', 10),
    ('gene', '1312', 'COMT',  'neurotransmitter_gene', 'requires_second_gate', 10),
    ('gene', '4128', 'MAOA',  'neurotransmitter_gene', 'requires_second_gate', 5)
ON CONFLICT DO NOTHING;

COMMIT;
