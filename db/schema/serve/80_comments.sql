SET ROLE engine_admin;

COMMENT ON TABLE solemd.graph_run_metrics IS
    'One row per published graph run exposed to the serve-side graph bootstrap path.';
COMMENT ON TABLE solemd.graph_clusters IS
    'Serve-local cluster metadata for one graph run.';
COMMENT ON TABLE solemd.graph_points IS
    'Render-facing per-paper point metadata scoped to a graph run.';
COMMENT ON TABLE solemd.paper_semantic_neighbors IS
    'Per-paper nearest-neighbor cache scoped to a graph run and model.';
COMMENT ON TABLE solemd.paper_api_cards IS
    'Canonical list-query projection for serve-side paper listings and graph side panels.';
COMMENT ON TABLE solemd.paper_api_profiles IS
    'Serve-local detail projection for paper detail and wiki context reads.';
COMMENT ON TABLE solemd.wiki_sync_runs IS
    'Audit ledger for wiki sync and activation cycles.';
COMMENT ON TABLE solemd.wiki_pages IS
    'Serve-local active wiki projection for request-path reads.';
COMMENT ON TABLE solemd.graph_cluster_api_cards IS
    'Compact cluster-summary projection for graph cluster panels.';
COMMENT ON TABLE solemd.serving_runs IS
    'One row per release-scoped serving package spanning graph, projection, and search cutover.';
COMMENT ON TABLE solemd.serving_artifacts IS
    'Physical artifacts emitted by a serving run.';
COMMENT ON TABLE solemd.serving_cohorts IS
    'Cohort definitions used to build serving packages.';
COMMENT ON TABLE solemd.serving_members IS
    'Membership rows for one serving cohort.';
COMMENT ON TABLE solemd.api_projection_runs IS
    'One row per API projection build cycle.';
COMMENT ON TABLE solemd.active_runtime_pointer IS
    'Singleton row naming the currently-live serving, graph, and API projection run ids.';
COMMENT ON SCHEMA auth IS
    'Reserved Better Auth schema. No auth tables are created in the serve baseline.';
COMMENT ON SCHEMA warehouse_grounding IS
    'Local schema reserved for bounded FDW grounding tables from the warehouse cluster.';

COMMENT ON COLUMN solemd.paper_api_cards.package_tier IS
    'Serve package tier code from db/schema/enum-codes.yaml.package_tier.';
COMMENT ON COLUMN solemd.paper_api_profiles.package_tier IS
    'Serve package tier code from db/schema/enum-codes.yaml.package_tier.';
COMMENT ON COLUMN solemd.wiki_sync_runs.build_status IS
    'Wiki sync lifecycle code from db/schema/enum-codes.yaml.wiki_sync_status.';
COMMENT ON COLUMN solemd.serving_runs.build_status IS
    'Serving lifecycle code from db/schema/enum-codes.yaml.serving_build_status.';
COMMENT ON COLUMN solemd.serving_runs.opensearch_alias_swap_status IS
    'OpenSearch alias-swap state code from db/schema/enum-codes.yaml.opensearch_alias_swap_status.';
COMMENT ON COLUMN solemd.serving_runs.package_tier IS
    'Serve package tier code from db/schema/enum-codes.yaml.package_tier.';
COMMENT ON COLUMN solemd.serving_runs.vector_mode IS
    'Vector-mode code from db/schema/enum-codes.yaml.vector_mode.';
COMMENT ON COLUMN solemd.serving_runs.cohort_manifest IS
    'Frozen build manifest for the serving cohort and table family plan.';
COMMENT ON COLUMN solemd.serving_runs.tables_built IS
    'Projection families successfully built for this serving run.';
COMMENT ON COLUMN solemd.serving_runs.last_built_family IS
    'Most recent projection family completed during the serving run.';
COMMENT ON COLUMN solemd.serving_artifacts.artifact_kind IS
    'Artifact-kind code from db/schema/enum-codes.yaml.serving_artifact_kind.';
COMMENT ON COLUMN solemd.serving_cohorts.cohort_kind IS
    'Cohort-kind code from db/schema/enum-codes.yaml.serving_cohort_kind.';
COMMENT ON COLUMN solemd.api_projection_runs.advisory_lock_keys IS
    'Advisory-lock keys held during the projection run.';
COMMENT ON COLUMN solemd.api_projection_runs.swap_duration_ms IS
    'Wall-clock duration of the projection swap transaction.';
COMMENT ON COLUMN solemd.api_projection_runs.admin_connection_id IS
    'Backend pid that ran the swap transaction.';
COMMENT ON COLUMN solemd.active_runtime_pointer.singleton_key IS
    'Always true. Enforces a single-row active runtime pointer.';

RESET ROLE;

COMMENT ON SCHEMA pgbouncer_auth IS
    'Dedicated schema for the PgBouncer auth_query SECURITY DEFINER function.';
COMMENT ON FUNCTION solemd.drop_projection_prev_tables() IS
    'Drop stale projection _prev tables retained for rollback after a swap.';
COMMENT ON FUNCTION solemd.audit_active_runtime_pointer() IS
    'Validate that the active runtime pointer names published serving and API projection rows.';
COMMENT ON FUNCTION solemd.freeze_published_serving_run() IS
    'Prevent immutable serving_run cohort-shape fields from changing after publish.';
COMMENT ON FUNCTION solemd.validate_active_runtime_pointer() IS
    'Reject active_runtime_pointer writes that target unpublished rows.';
COMMENT ON FUNCTION pgbouncer_auth.user_lookup(TEXT) IS
    'SECURITY DEFINER auth_query helper for the serve-side PgBouncer auth allowlist.';
