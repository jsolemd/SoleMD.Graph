-- Migration 004c: Base entity expansion + relation-gated toxicity families
--
-- Purpose:
--   1. Add a second wave of high-yield base entity_rule seeds for
--      bedside neurobehavior, systemic encephalopathy, and iatrogenic syndromes
--   2. Create solemd.relation_rule for high-precision chemical->cause promotion
--      families (base now, overlay-ready later)
--
-- Notes:
--   - Apathy and anhedonia remain important, but are not seeded as entity_rule
--     here because the currently observed PubTator concept mappings are noisy.
--   - Circuit/network concepts remain vocab/pinning work, not entity_rule work.

BEGIN;

-- ── 1. Expand entity_rule with high-yield base concepts ──────────────────

INSERT INTO solemd.entity_rule (
    entity_type,
    concept_id,
    canonical_name,
    family_key,
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
    family_key           TEXT NOT NULL,
    target_scope         TEXT NOT NULL DEFAULT 'base',
    min_citation_count   INTEGER NOT NULL DEFAULT 0,
    added_at             TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (subject_type, relation_type, object_type, object_id),
    CONSTRAINT relation_rule_target_scope_check
        CHECK (target_scope IN ('base', 'overlay'))
);

COMMENT ON TABLE solemd.relation_rule IS
    'Relation-gated promotion rules. Base rules promote now; overlay rules are staged for future overlay activation.';

COMMENT ON COLUMN solemd.relation_rule.target_scope IS
    'base = promote to mapped layout now, overlay = count/stage for later overlay activation.';

-- ── 3. Seed base toxicity families (chemical -> cause -> syndrome) ───────
-- These are intentionally relation-gated rather than direct entity promotion
-- because they are most valuable as medication/adverse-effect bridges.

INSERT INTO solemd.relation_rule (
    subject_type,
    relation_type,
    object_type,
    object_id,
    canonical_name,
    family_key,
    target_scope,
    min_citation_count
)
VALUES
    ('chemical', 'cause', 'disease', 'MESH:D015430', 'Weight gain', 'metabolic_toxicity', 'base', 5),
    ('chemical', 'cause', 'disease', 'MESH:D024821', 'Metabolic syndrome', 'metabolic_toxicity', 'base', 5),
    ('chemical', 'cause', 'disease', 'MESH:D006943', 'Hyperglycemia', 'metabolic_toxicity', 'base', 5),
    ('chemical', 'cause', 'disease', 'MESH:D009205', 'Myocarditis', 'cardiac_toxicity', 'base', 5),
    ('chemical', 'cause', 'disease', 'MESH:D000380', 'Agranulocytosis', 'hematologic_toxicity', 'base', 5),
    ('chemical', 'cause', 'disease', 'MESH:D009503', 'Neutropenia', 'hematologic_toxicity', 'base', 5),
    ('chemical', 'cause', 'disease', 'MESH:D045823', 'Ileus', 'gi_toxicity', 'base', 5)
ON CONFLICT DO NOTHING;

COMMIT;
