-- Migration 004d: Final pre-freeze baseline expansion
--
-- Purpose:
--   1. Add respiratory brain-failure bridge entities to entity_rule
--   2. Expand relation_rule with final high-yield baseline toxicity families
--
-- Notes:
--   - Sleep apnea remains an overlay-reservoir target, not a baseline entity.
--   - Withdrawal/intoxication and endocrine-metabolic syndromes are audited
--     separately before freeze and are not seeded here.

BEGIN;

-- ── 1. Respiratory bridge entities ──────────────────────────────────────

INSERT INTO solemd.entity_rule (
    entity_type,
    concept_id,
    canonical_name,
    rule_category,
    confidence,
    min_citation_count
)
VALUES
    ('disease', 'MESH:D006996', 'Hypoxia', 'systemic_bridge', 'high', 10),
    ('disease', 'MESH:D011656', 'Respiratory Insufficiency', 'systemic_bridge', 'high', 10),
    ('disease', 'MESH:D000471', 'Acute Lung Injury', 'systemic_bridge', 'high', 5)
ON CONFLICT DO NOTHING;

-- ── 2. Final baseline toxicity families (chemical -> cause -> disease) ─

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
    ('chemical', 'cause', 'disease', 'MESH:D012640', 'Seizures', 'neurologic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D007674', 'Kidney Injury', 'renal_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D009325', 'Nephritis', 'renal_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D007680', 'Kidney Failure, Acute', 'renal_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D064420', 'Toxic Epidermal Necrolysis', 'dermatologic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D012877', 'Stevens-Johnson Syndrome', 'dermatologic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D008107', 'Pancreatitis', 'hepatic_pancreatic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D006528', 'Hepatitis', 'hepatic_pancreatic_toxicity', 'baseline', 5),
    ('chemical', 'cause', 'disease', 'MESH:D018281', 'Drug-Induced Liver Injury', 'hepatic_pancreatic_toxicity', 'baseline', 5)
ON CONFLICT DO NOTHING;

COMMIT;
