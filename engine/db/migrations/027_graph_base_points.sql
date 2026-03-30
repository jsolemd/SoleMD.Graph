-- Migration 027: Replace full-table UPDATE with INSERT-only base points table
--
-- graph_points.is_in_base and graph_points.base_rank required a full-table
-- UPDATE on every materialize_base_admission() call (2.4M rows, 15+ min).
-- At 200M papers this would take hours.
--
-- Instead, we INSERT only admitted papers into a lean join table
-- (graph_base_points). All consumers JOIN to it instead of reading columns
-- off graph_points.

-- 1. Create the lean INSERT-only table
CREATE TABLE IF NOT EXISTS solemd.graph_base_points (
    graph_run_id  UUID    NOT NULL,
    corpus_id     BIGINT  NOT NULL,
    base_reason   TEXT    NOT NULL,
    base_rank     REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (graph_run_id, corpus_id)
);

-- 2. Drop the columns we no longer need on graph_points
ALTER TABLE solemd.graph_points DROP COLUMN IF EXISTS is_in_base;
ALTER TABLE solemd.graph_points DROP COLUMN IF EXISTS base_rank;

-- 3. Drop associated indexes (they reference the dropped columns)
DROP INDEX IF EXISTS solemd.idx_graph_points_run_is_in_base;
DROP INDEX IF EXISTS solemd.idx_graph_points_run_base_rank;
