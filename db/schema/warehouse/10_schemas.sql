CREATE SCHEMA IF NOT EXISTS solemd;
ALTER SCHEMA solemd OWNER TO engine_warehouse_admin;
ALTER TABLE IF EXISTS solemd.schema_migration_ledger OWNER TO engine_warehouse_admin;

CREATE SCHEMA IF NOT EXISTS pubtator;
ALTER SCHEMA pubtator OWNER TO engine_warehouse_admin;

CREATE SCHEMA IF NOT EXISTS umls;
ALTER SCHEMA umls OWNER TO engine_warehouse_admin;
