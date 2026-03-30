-- Migration 027: Second-gate confidence for broad metabolic/biochemistry entity rules
--
-- Purpose:
--   1. Mark broad metabolic/biochemistry terms as 'requires_second_gate' so they
--      contribute to paper_entity_count (scoring) but don't drive base admission alone.
--   2. Mark non-psychiatric medications (immunosuppressants, antibiotics, chemo) as
--      'requires_second_gate' for the same reason.
--   3. Mark brain tumors and neuro-adjacent conditions as 'requires_second_gate'
--      (neuropsychiatric presentations are relevant WITH psychiatric overlap).
--   4. Delete "disorder" (literally the word, not a diagnosis).
--
-- The evidence pipeline (paper_evidence.py) enforces the gate:
--   has_entity_rule_hit = BOOL_OR(er IS NOT NULL AND (er.confidence != 'requires_second_gate' OR citation >= 100))
--
-- Run from project root:
--   psql $DATABASE_URL -f engine/db/migrations/027_entity_rule_confidence_gates.sql

BEGIN;

-- =========================================================================
-- 1. Broad metabolic/biochemistry terms → requires_second_gate
-- =========================================================================

UPDATE solemd.entity_rule
SET confidence = 'requires_second_gate'
WHERE concept_id IN (
    'MESH:D008055',   -- lipids
    'MESH:D005947',   -- glucose
    'MESH:D010100',   -- oxygen
    'MESH:D002784',   -- cholesterol
    'MESH:D002241',   -- carbohydrates
    'MESH:D013256',   -- steroid
    'MESH:D014280',   -- triglycerides
    'MESH:D003404',   -- creatinine
    'MESH:D014508',   -- urea
    'MESH:D007328',   -- insulin
    'MESH:D000641',   -- ammonia
    'MESH:D009569',   -- Nitric Oxide
    'MESH:D002248',   -- Carbon Monoxide
    'MESH:D005998',   -- Glycine (amino acid, also neurotransmitter)
    'MESH:D000085',   -- Acetate
    'MESH:D013654',   -- Taurine
    'MESH:D007785',   -- lactose
    'MESH:D000431'    -- alcohol (substance use is core, but PubTator tags all chemistry)
);

-- =========================================================================
-- 2. Non-psychiatric medications → requires_second_gate
-- =========================================================================

UPDATE solemd.entity_rule
SET confidence = 'requires_second_gate'
WHERE concept_id IN (
    'MESH:D003520',   -- cyclophosphamide (chemotherapy)
    'MESH:D011241',   -- prednisone (corticosteroid)
    'MESH:D000069283', -- Rituximab (immunotherapy)
    'MESH:D012293',   -- rifampicin (antibiotic)
    'MESH:D002939',   -- ciprofloxacin (antibiotic)
    'MESH:D008775',   -- methylprednisolone (corticosteroid)
    'MESH:D015742',   -- propofol (anesthetic)
    'MESH:D001379',   -- azathioprine (immunosuppressant)
    'MESH:D009173',   -- mycophenolate mofetil (immunosuppressant)
    'MESH:D015725',   -- fluconazole (antifungal)
    'MESH:D002217'    -- Carbachol (cholinergic, mostly ophthalmology)
);

-- =========================================================================
-- 3. Brain tumors / neuro-adjacent conditions → requires_second_gate
--    (neuropsychiatric presentations are domain-relevant when co-occurring
--     with a psychiatric diagnosis or treatment)
-- =========================================================================

-- Use INSERT ON CONFLICT to handle the case where a prior version of this
-- migration may have deleted these rules instead of gating them.
INSERT INTO solemd.entity_rule (entity_type, concept_id, canonical_name, family_key, confidence)
VALUES
    ('disease', 'MESH:D005909', 'Glioblastoma', 'psychiatric_disorder', 'requires_second_gate'),
    ('disease', 'MESH:D008579', 'Meningioma', 'psychiatric_disorder', 'requires_second_gate'),
    ('disease', 'MESH:D010673', 'Pheochromocytoma', 'psychiatric_disorder', 'requires_second_gate'),
    ('disease', 'MESH:D004415', 'Functional Dyspepsia', 'psychiatric_disorder', 'requires_second_gate')
ON CONFLICT (entity_type, concept_id) DO UPDATE SET
    confidence = 'requires_second_gate';

-- =========================================================================
-- 4. Delete truly non-diagnostic terms
-- =========================================================================

DELETE FROM solemd.entity_rule
WHERE concept_id IN (
    'MESH:D004194'    -- "disorder" (literally the word, not a diagnosis)
);

COMMIT;
