-- Migration 036: Add runtime lexical-search indexes for paper retrieval
--
-- Purpose:
--   1. Stop recomputing weighted title+abstract FTS over the live papers table at query time
--   2. Support title fallback and similarity with a native pg_trgm index
--   3. Keep runtime RAG lexical retrieval fast for global and selected-paper queries
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     on the live papers table and is not allowed inside a transaction block.
--   - pg_trgm is already provisioned in the base schema bootstrap.
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/036_add_runtime_paper_search_indexes.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_title_abstract_fts
    ON solemd.papers
    USING gin ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(abstract, '')), 'B')
    ));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_title_trgm
    ON solemd.papers
    USING gin (lower(coalesce(title, '')) gin_trgm_ops);

ANALYZE solemd.papers;
