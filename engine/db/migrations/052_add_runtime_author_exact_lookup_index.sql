-- Migration 052: Runtime exact author lookup index
--
-- Purpose:
--   Support exact author matching for citation-style metadata retrieval without
--   falling back to a full paper_authors scan.
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     for this live runtime lookup index on a large serving table.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_paper_authors_name_lower
    ON solemd.paper_authors ((lower(name)), corpus_id, author_position)
    WHERE COALESCE(name, ''::text) <> '';
