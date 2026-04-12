-- Migration 062: Remove redundant PubTator entity partial indexes.
--
-- The older disease/chemical/gene partial indexes on (pmid, concept_id) are
-- superseded by the general serving indexes on:
--   - (pmid, entity_type, concept_id)
--   - (entity_type, concept_id, pmid)
-- Keeping all of them bloats the entity_annotations index surface materially.
--
-- Non-transactional: DROP INDEX CONCURRENTLY avoids blocking live readers.

DROP INDEX CONCURRENTLY IF EXISTS pubtator.idx_pt_entity_disease;
DROP INDEX CONCURRENTLY IF EXISTS pubtator.idx_pt_entity_chemical;
DROP INDEX CONCURRENTLY IF EXISTS pubtator.idx_pt_entity_gene;
