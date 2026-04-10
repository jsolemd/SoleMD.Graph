-- Migration 051: Runtime exact author lookup index
--
-- Purpose:
--   Support exact author-name equality lookups across all author positions for
--   metadata-aware biomedical retrieval.
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     for these live runtime lookup indexes on large serving tables.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_paper_authors_name_lower
    ON solemd.paper_authors ((lower(name)), corpus_id, author_position)
    WHERE name IS NOT NULL;
