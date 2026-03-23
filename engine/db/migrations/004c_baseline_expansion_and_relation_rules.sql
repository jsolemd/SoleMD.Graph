-- Migration 004c: Baseline entity expansion + relation-gated toxicity families
--
-- Purpose:
--   1. Add a second wave of high-yield baseline entity_rule seeds for
--      bedside neurobehavior, systemic encephalopathy, and iatrogenic syndromes
--   2. Create solemd.relation_rule for high-precision chemical->cause promotion
--      families (baseline now, overlay-ready later)
--
-- Notes:
--   - Apathy and anhedonia remain important, but are not seeded as entity_rule
--     here because the currently observed PubTator concept mappings are noisy.
--   - Circuit/network concepts remain vocab/pinning work, not entity_rule work.

BEGIN;

-- ── 1. Expand entity_rule with high-yield baseline concepts ──────────────

INSERT INTO solemd.entity_rule (
    entity_type,
    concept_id,
    canonical_name,
    rule_category,
    confidence,
    min_citation_count
)
VALUES
    ('disease', 'MESH:D003693', 'Delirium', 'behavior', 'high', 10),
    ('disease', 'MESH:D011595', 'Agitation', 'behavior', 'high', 10),
    ('disease', 'MESH:D002389', 'Catatonia', 'behavior', 'high', 5),
    ('disease', 'MESH:D006212', 'Hallucinations', 'behavior', 'high', 5),
    ('disease', 'MESH:D063726', 'Delusions', 'behavior', 'high', 5),
    ('disease', 'MESH:D010259', 'Paranoia', 'behavior', 'high', 5),
    ('disease', 'MESH:D001927', 'Encephalopathy', 'systemic_bridge', 'high', 10),
    ('disease', 'MESH:D006501', 'Hepatic encephalopathy', 'systemic_bridge', 'high', 5),
    ('disease', 'MESH:D014511', 'Uremia', 'systemic_bridge', 'high', 5),
    ('disease', 'MESH:D007010', 'Hyponatremia', 'systemic_bridge', 'high', 10),
    ('disease', 'MESH:D020230', 'Serotonin syndrome', 'iatrogenic_syndrome', 'high', 0),
    ('disease', 'MESH:D009459', 'Neuroleptic malignant syndrome', 'iatrogenic_syndrome', 'high', 0),
    ('disease', 'MESH:D001480', 'Extrapyramidal symptoms', 'iatrogenic_syndrome', 'high', 5),
    ('disease', 'MESH:D010302', 'Drug-induced parkinsonism', 'iatrogenic_syndrome', 'high', 0),
    ('disease', 'MESH:D008133', 'QT prolongation', 'iatrogenic_syndrome', 'high', 5),
    ('disease', 'MESH:D016171', 'Torsades de pointes', 'iatrogenic_syndrome', 'high', 0)
ON CONFLICT DO NOTHING;

-- ── 2. Create relation_rule for high-precision chemical->cause families ──

CREATE TABLE IF NOT EXISTS solemd.relation_rule (
    subject_type         TEXT NOT NULL,
    relation_type        TEXT NOT NULL,
    object_type          TEXT NOT NULL,
    object_id            TEXT NOT NULL,
    canonical_name       TEXT NOT NULL,
    rule_category        TEXT NOT NULL,
    target_layer         TEXT NOT NULL DEFAULT 'baseline',
    min_citation_count   INTEGER NOT NULL DEFAULT 0,
    added_at             TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (subject_type, relation_type, object_type, object_id),
    CONSTRAINT relation_rule_target_layer_check
        CHECK (target_layer IN ('baseline', 'overlay'))
);

COMMENT ON TABLE solemd.relation_rule IS
    'Relation-gated promotion rules. Baseline rules promote now; overlay rules are staged for future mapped-reservoir work.';

COMMENT ON COLUMN solemd.relation_rule.target_layer IS
    'baseline = promote to graph tier now, overlay = count/stage for future overlay reservoir work.';

-- ── 3. Seed baseline toxicity families (chemical -> cause -> syndrome) ───
-- These are intentionally relation-gated rather than direct entity promotion
-- because they are most valuable as medication/adverse-effect bridges.

INSERT INTO solemd.relation_rule (
    subject_type,
    relation_type,
    object_type,
    object_id,
    canonical_name,
    rule_category,
    target_layer,
    min_citation_count
)
VALUES
    ('chemical', 'cause', 'disease', 'MESH:D015430', 'Weight gain', 'metabolic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D024821', 'Metabolic syndrome', 'metabolic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D006943', 'Hyperglycemia', 'metabolic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D009205', 'Myocarditis', 'cardiac_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D000380', 'Agranulocytosis', 'hematologic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D009503', 'Neutropenia', 'hematologic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D045823', 'Ileus', 'gi_toxicity', 'baseline', 5)
ON CONFLICT DO NOTHING;

COMMIT;
