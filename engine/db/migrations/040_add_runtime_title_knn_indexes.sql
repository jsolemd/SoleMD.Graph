-- Migration 040: Add GiST trigram indexes for runtime title KNN retrieval
--
-- Purpose:
--   1. Support pg_trgm nearest-neighbor ordering for title-lookups
--   2. Keep global title-seeded runtime queries fast without scanning broad match sets
--
-- Notes:
--   - PostgreSQL pg_trgm documents GiST as the operator class that supports
--     nearest-neighbor ordering with <<-> and <<<->.
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     on the live papers table and is not allowed inside a transaction block.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_title_gist_trgm
    ON solemd.papers
    USING gist ((lower(coalesce(title, ''))) gist_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_normalized_title_key_gist_trgm
    ON solemd.papers
    USING gist ((solemd.normalize_title_key(title)) gist_trgm_ops);

ANALYZE solemd.papers;
