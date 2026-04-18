SET ROLE engine_admin;

CREATE OR REPLACE FUNCTION solemd.drop_projection_prev_tables()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_name TEXT;
    dropped_count INTEGER := 0;
    target_names CONSTANT TEXT[] := ARRAY[
        'paper_api_cards_prev',
        'paper_api_profiles_prev',
        'graph_cluster_api_cards_prev',
        'graph_points_prev',
        'graph_clusters_prev',
        'paper_semantic_neighbors_prev',
        'wiki_pages_prev'
    ];
BEGIN
    FOREACH target_name IN ARRAY target_names LOOP
        IF to_regclass(format('solemd.%I', target_name)) IS NOT NULL THEN
            EXECUTE format('DROP TABLE solemd.%I', target_name);
            dropped_count := dropped_count + 1;
        END IF;
    END LOOP;

    RETURN dropped_count;
END
$$;

CREATE OR REPLACE FUNCTION solemd.audit_active_runtime_pointer()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    pointer_row solemd.active_runtime_pointer%ROWTYPE;
    serving_status SMALLINT;
    projection_status SMALLINT;
BEGIN
    SELECT *
    INTO pointer_row
    FROM solemd.active_runtime_pointer
    WHERE singleton_key = true;

    IF NOT FOUND THEN
        RETURN true;
    END IF;

    SELECT build_status
    INTO serving_status
    FROM solemd.serving_runs
    WHERE serving_run_id = pointer_row.serving_run_id;

    -- db/schema/enum-codes.yaml.serving_build_status: 2 = published
    IF serving_status IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION
            'active_runtime_pointer.serving_run_id % is not published',
            pointer_row.serving_run_id;
    END IF;

    SELECT build_status
    INTO projection_status
    FROM solemd.api_projection_runs
    WHERE api_projection_run_id = pointer_row.api_projection_run_id;

    -- db/schema/enum-codes.yaml.serving_build_status: 2 = published
    IF projection_status IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION
            'active_runtime_pointer.api_projection_run_id % is not published',
            pointer_row.api_projection_run_id;
    END IF;

    PERFORM 1
    FROM solemd.graph_run_metrics
    WHERE graph_run_id = pointer_row.graph_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'active_runtime_pointer.graph_run_id % does not exist',
            pointer_row.graph_run_id;
    END IF;

    RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION solemd.freeze_published_serving_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- db/schema/enum-codes.yaml.serving_build_status: 2 = published
    IF OLD.build_status = 2 THEN
        IF NEW.chunk_version_key IS DISTINCT FROM OLD.chunk_version_key
           OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
           OR NEW.synonym_version IS DISTINCT FROM OLD.synonym_version
           OR NEW.analyzer_version IS DISTINCT FROM OLD.analyzer_version
           OR NEW.vector_mode IS DISTINCT FROM OLD.vector_mode
           OR NEW.package_tier IS DISTINCT FROM OLD.package_tier
           OR NEW.cohort_manifest IS DISTINCT FROM OLD.cohort_manifest THEN
            RAISE EXCEPTION
                'published serving_runs row % is immutable outside operational tail fields',
                OLD.serving_run_id;
        END IF;
    END IF;

    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION solemd.validate_active_runtime_pointer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    serving_status SMALLINT;
    projection_status SMALLINT;
BEGIN
    SELECT build_status
    INTO serving_status
    FROM solemd.serving_runs
    WHERE serving_run_id = NEW.serving_run_id;

    -- db/schema/enum-codes.yaml.serving_build_status: 2 = published
    IF serving_status IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION
            'active runtime pointer requires a published serving_run_id, got %',
            NEW.serving_run_id;
    END IF;

    SELECT build_status
    INTO projection_status
    FROM solemd.api_projection_runs
    WHERE api_projection_run_id = NEW.api_projection_run_id;

    -- db/schema/enum-codes.yaml.serving_build_status: 2 = published
    IF projection_status IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION
            'active runtime pointer requires a published api_projection_run_id, got %',
            NEW.api_projection_run_id;
    END IF;

    RETURN NEW;
END
$$;

RESET ROLE;

CREATE OR REPLACE FUNCTION pgbouncer_auth.user_lookup(
    IN i_username TEXT,
    OUT usename TEXT,
    OUT passwd TEXT
)
RETURNS RECORD
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF i_username NOT IN ('engine_serve_read') THEN
        RETURN;
    END IF;

    SELECT
        authid.rolname,
        CASE
            WHEN authid.rolvaliduntil < pg_catalog.now() THEN NULL
            ELSE authid.rolpassword
        END
    INTO usename, passwd
    FROM pg_catalog.pg_authid AS authid
    WHERE authid.rolname = i_username
      AND authid.rolcanlogin;
END
$$;

ALTER FUNCTION pgbouncer_auth.user_lookup(TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION solemd.drop_projection_prev_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solemd.drop_projection_prev_tables() TO engine_admin;
REVOKE ALL ON FUNCTION solemd.audit_active_runtime_pointer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solemd.audit_active_runtime_pointer() TO engine_admin;
REVOKE ALL ON FUNCTION solemd.freeze_published_serving_run() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solemd.freeze_published_serving_run() TO engine_admin;
REVOKE ALL ON FUNCTION solemd.validate_active_runtime_pointer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solemd.validate_active_runtime_pointer() TO engine_admin;
REVOKE ALL ON FUNCTION pgbouncer_auth.user_lookup(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pgbouncer_auth.user_lookup(TEXT) TO pgbouncer_auth;
