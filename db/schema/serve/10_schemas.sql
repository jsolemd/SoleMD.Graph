CREATE SCHEMA IF NOT EXISTS solemd;
ALTER SCHEMA solemd OWNER TO engine_admin;
ALTER TABLE IF EXISTS solemd.schema_migration_ledger OWNER TO engine_admin;

CREATE SCHEMA IF NOT EXISTS auth;
ALTER SCHEMA auth OWNER TO engine_admin;

CREATE SCHEMA IF NOT EXISTS warehouse_grounding;
ALTER SCHEMA warehouse_grounding OWNER TO engine_admin;

CREATE SCHEMA IF NOT EXISTS pgbouncer_auth AUTHORIZATION CURRENT_USER;
