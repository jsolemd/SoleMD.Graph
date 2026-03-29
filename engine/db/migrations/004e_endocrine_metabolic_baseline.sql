-- Migration 004e: Final endocrine/metabolic base additions
--
-- Purpose:
--   Add the last clean, bedside-reversible endocrine/metabolic syndromes
--   before freezing Phase 1 base coverage.
--
-- Notes:
--   - Hypoglycemia was audited and is currently mapped under a dirty PubTator
--     concept dominated by hypotension/hypotensive mentions, so it is not
--     seeded here.
--   - Narrow alcohol-withdrawal concepts were audited and the currently
--     observed PubTator IDs are not clean enough for concept_id-only promotion.
--     They remain deferred pending mention-gated rules or better concept IDs.
--   - Thyrotoxicosis, adrenal insufficiency, and hypercalcemia were also
--     withheld because the current concept mappings are broader/noisier than
--     desired for base admission.

BEGIN;

INSERT INTO solemd.entity_rule (
    entity_type,
    concept_id,
    canonical_name,
    family_key,
    confidence,
    min_citation_count
)
VALUES
    ('disease', 'MESH:D016883', 'Diabetic Ketoacidosis', 'endocrine_metabolic', 'high', 5),
    ('disease', 'MESH:D009230', 'Myxedema', 'endocrine_metabolic', 'high', 5)
ON CONFLICT DO NOTHING;

COMMIT;
