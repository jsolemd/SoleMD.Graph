SET ROLE engine_admin;

GRANT USAGE ON SCHEMA solemd TO engine_serve_read;
GRANT USAGE ON SCHEMA warehouse_grounding TO engine_serve_read;

GRANT SELECT ON ALL TABLES IN SCHEMA solemd TO engine_serve_read;
GRANT SELECT ON ALL TABLES IN SCHEMA warehouse_grounding TO engine_serve_read;
-- Intentional exception per docs/rag/06-async-stack.md §7.1: the read role
-- keeps one narrow UPDATE path for projection-worker status writes.
GRANT UPDATE ON TABLE solemd.api_projection_runs TO engine_serve_read;

ALTER DEFAULT PRIVILEGES FOR ROLE engine_admin IN SCHEMA solemd
    GRANT SELECT ON TABLES TO engine_serve_read;
ALTER DEFAULT PRIVILEGES FOR ROLE engine_admin IN SCHEMA warehouse_grounding
    GRANT SELECT ON TABLES TO engine_serve_read;

RESET ROLE;

REVOKE ALL ON SCHEMA pgbouncer_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA pgbouncer_auth TO pgbouncer_auth;
