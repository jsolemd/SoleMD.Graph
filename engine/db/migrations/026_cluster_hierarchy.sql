-- Migration 026: Add hierarchy columns to graph_clusters
--
-- Adds parent_cluster_id, parent_label, description, and hierarchy_level
-- to support hierarchical cluster relationships and LLM-generated descriptions.
--
-- Run from project root:
--   psql $DATABASE_URL -f engine/db/migrations/026_cluster_hierarchy.sql

BEGIN;

-- =========================================================================
-- Add hierarchy and description columns to graph_clusters
-- =========================================================================

ALTER TABLE solemd.graph_clusters
    ADD COLUMN IF NOT EXISTS parent_cluster_id   INTEGER,
    ADD COLUMN IF NOT EXISTS parent_label        TEXT,
    ADD COLUMN IF NOT EXISTS description         TEXT,
    ADD COLUMN IF NOT EXISTS hierarchy_level      INTEGER NOT NULL DEFAULT 0;

-- Self-referential FK: parent must be a cluster in the same graph run.
-- Deferred so bulk inserts (parent before child or child before parent) succeed.
ALTER TABLE solemd.graph_clusters
    DROP CONSTRAINT IF EXISTS fk_graph_clusters_parent;

ALTER TABLE solemd.graph_clusters
    ADD CONSTRAINT fk_graph_clusters_parent
        FOREIGN KEY (graph_run_id, parent_cluster_id)
        REFERENCES solemd.graph_clusters (graph_run_id, cluster_id)
        DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_graph_clusters_parent
    ON solemd.graph_clusters (graph_run_id, parent_cluster_id)
    WHERE parent_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_clusters_hierarchy_level
    ON solemd.graph_clusters (graph_run_id, hierarchy_level);

-- =========================================================================
-- Comments
-- =========================================================================

COMMENT ON COLUMN solemd.graph_clusters.parent_cluster_id IS
    'References the parent cluster_id within the same graph_run_id for hierarchical nesting.';

COMMENT ON COLUMN solemd.graph_clusters.parent_label IS
    'Denormalized label of the parent cluster for fast frontend lookups.';

COMMENT ON COLUMN solemd.graph_clusters.description IS
    'LLM-generated natural-language description of the cluster theme.';

COMMENT ON COLUMN solemd.graph_clusters.hierarchy_level IS
    'Position in the cluster tree: 0 = parent group, 1 = leaf topic cluster.';

COMMIT;
