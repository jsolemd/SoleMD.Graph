-- Migration 044: Add stored fts_vector column to papers
--
-- Purpose:
--   Eliminates on-the-fly tsvector computation for 14M rows during FTS queries.
--   The stored column + GIN index replaces the expression-based index
--   (idx_papers_title_abstract_fts) with a much faster lookup path.
--
-- Notes:
--   - Do NOT wrap this migration in a transaction. CREATE INDEX CONCURRENTLY
--     cannot run inside a transaction block.
--   - The UPDATE on 14M rows will take ~10-30 minutes. Run during low-activity.
--   - The CONCURRENTLY index build will not block reads.
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/044_papers_fts_vector.sql

-- 1. Add stored tsvector column
ALTER TABLE solemd.papers ADD COLUMN IF NOT EXISTS fts_vector tsvector;

-- 2. Backfill from existing data
UPDATE solemd.papers SET fts_vector =
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(abstract, '')), 'B')
WHERE fts_vector IS NULL;

-- 3. GIN index on the stored column
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_fts_vector
    ON solemd.papers USING gin (fts_vector);

-- 4. Disable fastupdate for read-heavy workload (fewer pending-list merges)
ALTER INDEX solemd.idx_papers_fts_vector SET (fastupdate = off);

-- 5. Trigger to keep fts_vector in sync on INSERT/UPDATE
CREATE OR REPLACE FUNCTION solemd.papers_fts_vector_update()
RETURNS trigger AS $$
BEGIN
    NEW.fts_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.abstract, '')), 'B');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_papers_fts_vector
    BEFORE INSERT OR UPDATE OF title, abstract ON solemd.papers
    FOR EACH ROW EXECUTE FUNCTION solemd.papers_fts_vector_update();

-- 6. Drop the old expression-based GIN index (redundant now)
DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_papers_title_abstract_fts;

-- 7. Update statistics
ANALYZE solemd.papers;
