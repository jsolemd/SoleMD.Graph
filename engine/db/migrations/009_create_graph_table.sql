-- 009_create_graph_table.sql
-- Canonical graph-build tables for mapped-paper coordinates, clusters, and
-- bundle publication metadata.
--
-- This migration is intentionally richer than the original scaffold because the
-- frontend already expects graph_runs-style bundle publication and the backend
-- now has enough metadata to publish more than bare x/y coordinates.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS solemd.graph_runs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    graph_name           VARCHAR(128) NOT NULL,
    node_kind            VARCHAR(64) NOT NULL,
    status               VARCHAR(32) NOT NULL,
    is_current           BOOLEAN NOT NULL DEFAULT false,
    bundle_uri           TEXT,
    bundle_format        VARCHAR(32),
    bundle_version       VARCHAR(32),
    bundle_checksum      VARCHAR(128),
    bundle_bytes         BIGINT,
    bundle_manifest      JSONB,
    qa_summary           JSONB,
    source_release_id    TEXT,
    embedding_release_id TEXT,
    citations_release_id TEXT,
    parameters           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_runs_current
    ON solemd.graph_runs (graph_name, node_kind)
    WHERE is_current = true;

CREATE TABLE IF NOT EXISTS solemd.graph_points (
    graph_run_id         UUID NOT NULL REFERENCES solemd.graph_runs (id) ON DELETE CASCADE,
    corpus_id            BIGINT NOT NULL REFERENCES solemd.corpus (corpus_id) ON DELETE CASCADE,
    point_index          INTEGER,
    x                    REAL NOT NULL,
    y                    REAL NOT NULL,
    cluster_id           INTEGER,
    micro_cluster_id     INTEGER,
    cluster_probability  REAL,
    outlier_score        REAL,
    is_noise             BOOLEAN NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (graph_run_id, corpus_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_points_point_index
    ON solemd.graph_points (graph_run_id, point_index)
    WHERE point_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_points_run_cluster_id
    ON solemd.graph_points (graph_run_id, cluster_id)
    WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_points_run_micro_cluster_id
    ON solemd.graph_points (graph_run_id, micro_cluster_id)
    WHERE micro_cluster_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS solemd.graph_clusters (
    graph_run_id               UUID NOT NULL REFERENCES solemd.graph_runs (id) ON DELETE CASCADE,
    cluster_id                 INTEGER NOT NULL,
    label                      TEXT,
    label_mode                 TEXT,
    label_source               TEXT,
    member_count               INTEGER NOT NULL,
    paper_count                INTEGER NOT NULL,
    centroid_x                 REAL NOT NULL,
    centroid_y                 REAL NOT NULL,
    representative_node_id     TEXT,
    representative_node_kind   TEXT,
    candidate_count            INTEGER,
    mean_cluster_probability   REAL,
    mean_outlier_score         REAL,
    is_noise                   BOOLEAN NOT NULL DEFAULT false,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (graph_run_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_graph_clusters_label
    ON solemd.graph_clusters (graph_run_id, label);

COMMENT ON TABLE solemd.graph_runs IS
    'Published graph build runs and bundle metadata consumed by the frontend.';

COMMENT ON TABLE solemd.graph_points IS
    'Mapped-paper coordinates and cluster assignments for a specific graph build run.';

COMMENT ON TABLE solemd.graph_clusters IS
    'Cluster-level summaries, labels, and centroids for a graph build run.';

COMMIT;
