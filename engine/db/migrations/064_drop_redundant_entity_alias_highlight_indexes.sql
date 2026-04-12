-- Migration 064: Drop redundant highlight-path indexes from entity_aliases.
--
-- Live highlight-grade entity matching now serves from solemd.entity_runtime_aliases.
-- The warehouse-backed entity_aliases table remains for broader search/detail
-- lookup, so the highlight-specific alias_key indexes are redundant.
--
-- Non-transactional: DROP INDEX CONCURRENTLY cannot run inside a transaction block.

DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_entity_aliases_alias_key_highlight;
DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_entity_aliases_alias_key_type_highlight;
