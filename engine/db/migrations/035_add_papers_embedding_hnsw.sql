-- Migration 035: Add runtime paper-embedding ANN index for selected-paper semantic neighbors
--
-- Purpose:
--   1. Move selected-paper semantic neighbor retrieval onto pgvector's native HNSW path
--   2. Avoid exact cosine scans over the full papers table at runtime
--   3. Keep the index partial so null embeddings do not bloat the structure
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     on the live papers table and is not allowed inside a transaction block.
--   - This index accelerates runtime paper-level retrieval only. It does not change the
--     canonical warehouse boundary for span-level serving tables.
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/035_add_papers_embedding_hnsw.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_embedding_hnsw
    ON solemd.papers
    USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

ANALYZE solemd.papers;
