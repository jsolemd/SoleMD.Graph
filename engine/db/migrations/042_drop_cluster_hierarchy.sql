-- Migration 042: Drop parent cluster hierarchy columns
--
-- Removes the parent_cluster_id / parent_label / hierarchy_level columns
-- and deletes hierarchy_level=1 (parent group) rows that were inserted by
-- the now-removed build_cluster_hierarchy() function.
-- The 'description' column is kept — it holds useful LLM-generated text
-- for leaf clusters.
--
-- Run from project root:
--   psql $DATABASE_URL -f engine/db/migrations/042_drop_cluster_hierarchy.sql

BEGIN;

-- Drop FK constraint first to avoid pending trigger events during DELETE
ALTER TABLE solemd.graph_clusters
    DROP CONSTRAINT IF EXISTS fk_graph_clusters_parent;

-- Delete parent-group rows (hierarchy_level = 1)
DELETE FROM solemd.graph_clusters WHERE hierarchy_level = 1;

-- Drop indexes
DROP INDEX IF EXISTS solemd.idx_graph_clusters_parent;
DROP INDEX IF EXISTS solemd.idx_graph_clusters_hierarchy_level;

-- Drop columns
ALTER TABLE solemd.graph_clusters
    DROP COLUMN IF EXISTS parent_cluster_id,
    DROP COLUMN IF EXISTS parent_label,
    DROP COLUMN IF EXISTS hierarchy_level;

COMMIT;
