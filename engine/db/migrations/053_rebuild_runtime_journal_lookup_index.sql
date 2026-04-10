-- Migration 053: Rebuild invalid runtime journal lookup index
--
-- Purpose:
--   Repair the exact journal metadata lookup index if a prior concurrent build
--   left it catalog-visible but invalid.
--
-- Notes:
--   - Do not wrap this migration in a transaction. Both DROP INDEX CONCURRENTLY
--     and CREATE INDEX CONCURRENTLY require autocommit.

DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_papers_runtime_journal_lookup;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_runtime_journal_lookup
    ON solemd.papers ((solemd.clean_venue(COALESCE(journal_name, venue, ''::text))));
