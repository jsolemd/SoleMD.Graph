-- Migration 060: Remove the redundant non-unique PMID lookup index.
-- `solemd.corpus.pmid` already has an implicit unique index from the table
-- definition, so the extra partial index bloats the schema without changing the
-- hot lookup path.
--
-- Non-transactional: DROP INDEX CONCURRENTLY avoids blocking live readers.

DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_corpus_pmid;
