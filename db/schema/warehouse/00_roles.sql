DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'engine_warehouse_admin') THEN
        CREATE ROLE engine_warehouse_admin LOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'engine_ingest_write') THEN
        CREATE ROLE engine_ingest_write LOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'engine_warehouse_read') THEN
        CREATE ROLE engine_warehouse_read LOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warehouse_grounding_reader') THEN
        CREATE ROLE warehouse_grounding_reader LOGIN NOINHERIT;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE warehouse TO engine_warehouse_admin;
GRANT CONNECT ON DATABASE warehouse TO engine_ingest_write;
GRANT CONNECT ON DATABASE warehouse TO engine_warehouse_read;
GRANT CONNECT ON DATABASE warehouse TO warehouse_grounding_reader;

ALTER ROLE engine_warehouse_read IN DATABASE warehouse
    SET default_transaction_read_only = on;
ALTER ROLE warehouse_grounding_reader IN DATABASE warehouse
    SET default_transaction_read_only = on;
