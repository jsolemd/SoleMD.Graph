-- Migration 037: Add exact-title runtime index for RAG paper retrieval
--
-- Purpose:
--   1. Short-circuit exact title lookups before broad lexical fallback
--   2. Keep title-seeded runtime and eval queries on a cheap indexed path
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     on the live papers table and is not allowed inside a transaction block.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_lower_title
    ON solemd.papers ((lower(coalesce(title, ''))));

ANALYZE solemd.papers;
