-- Accelerate wiki entity-page context lookups.
--
-- The wiki runtime resolves entity-wide corpus/graph counts and top graph papers by
-- filtering PubTator annotations on (entity_type, concept_id) and then joining by PMID.
-- Existing indexes lead with PMID or concept_id only, which forces high-volume concepts
-- to scan and post-filter more rows than necessary.

CREATE INDEX IF NOT EXISTS idx_pt_entity_type_concept_pmid_lookup
    ON pubtator.entity_annotations (entity_type, concept_id, pmid);
