DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'engine_admin') THEN
        CREATE ROLE engine_admin LOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'engine_serve_read') THEN
        CREATE ROLE engine_serve_read LOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgbouncer_auth') THEN
        CREATE ROLE pgbouncer_auth LOGIN NOINHERIT;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE serve TO engine_admin;
GRANT CONNECT ON DATABASE serve TO engine_serve_read;
GRANT CONNECT ON DATABASE serve TO pgbouncer_auth;

-- Per docs/rag/06-async-stack.md §7.1, the serve read role stays
-- default-read-only but still receives one narrow UPDATE grant on
-- solemd.api_projection_runs for projection-worker status writes.
ALTER ROLE engine_serve_read IN DATABASE serve SET default_transaction_read_only = on;
