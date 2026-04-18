SET ROLE engine_admin;

CREATE INDEX IF NOT EXISTS idx_graph_run_metrics_published
    ON solemd.graph_run_metrics (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_graph_clusters_size
    ON solemd.graph_clusters (graph_run_id, size DESC, cluster_id);
CREATE INDEX IF NOT EXISTS idx_graph_clusters_parent
    ON solemd.graph_clusters (graph_run_id, parent_cluster_id)
    WHERE parent_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_points_cluster
    ON solemd.graph_points (graph_run_id, cluster_id);
CREATE INDEX IF NOT EXISTS idx_graph_points_base_rank
    ON solemd.graph_points (graph_run_id, base_rank, corpus_id)
    WHERE is_in_base = true;

CREATE INDEX IF NOT EXISTS idx_paper_semantic_neighbors_reverse
    ON solemd.paper_semantic_neighbors (graph_run_id, neighbor_corpus_id, corpus_id);

CREATE INDEX IF NOT EXISTS idx_paper_api_cards_list
    ON solemd.paper_api_cards (
        current_graph_run_id,
        package_tier,
        citation_count DESC,
        corpus_id
    )
    INCLUDE (
        display_title,
        author_line,
        publication_year,
        venue_display,
        text_availability,
        has_full_grounding
    )
    WHERE current_graph_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paper_api_cards_retracted
    ON solemd.paper_api_cards (corpus_id)
    WHERE is_retracted = true;

CREATE INDEX IF NOT EXISTS idx_paper_api_profiles_full_title_trgm
    ON solemd.paper_api_profiles
    USING gin (full_title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_wiki_sync_runs_status
    ON solemd.wiki_sync_runs (build_status, built_at DESC, wiki_sync_run_id);
CREATE INDEX IF NOT EXISTS idx_wiki_sync_runs_checksum
    ON solemd.wiki_sync_runs (source_checksum, built_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_sync_run
    ON solemd.wiki_pages (wiki_sync_run_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_fts
    ON solemd.wiki_pages
    USING gin (fts_vector);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_outgoing_links
    ON solemd.wiki_pages
    USING gin (outgoing_links);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_entity
    ON solemd.wiki_pages (entity_type, concept_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_family
    ON solemd.wiki_pages (family_key);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_tags
    ON solemd.wiki_pages
    USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_graph_cluster_api_cards_size
    ON solemd.graph_cluster_api_cards (graph_run_id, size DESC, cluster_id);

CREATE INDEX IF NOT EXISTS idx_serving_runs_status
    ON solemd.serving_runs (build_status, build_completed_at DESC, serving_run_id);
CREATE INDEX IF NOT EXISTS idx_serving_runs_package_tier
    ON solemd.serving_runs (package_tier, build_status, build_completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_serving_artifacts_kind
    ON solemd.serving_artifacts (artifact_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_serving_cohorts_package_tier
    ON solemd.serving_cohorts (package_tier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_serving_members_corpus
    ON solemd.serving_members (corpus_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_serving_members_build_status
    ON solemd.serving_members (package_build_status, grounding_roundtrip_ok)
    WHERE package_build_status > 0;

CREATE INDEX IF NOT EXISTS idx_api_projection_runs_serving_run
    ON solemd.api_projection_runs (serving_run_id, built_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_projection_runs_source_graph_run
    ON solemd.api_projection_runs (source_graph_run_id, built_at DESC);

RESET ROLE;
