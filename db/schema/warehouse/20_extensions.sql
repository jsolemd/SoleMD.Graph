-- Slice 3 keeps the warehouse baseline on stock postgres:18.3-bookworm
-- extensions that can be created on a fresh empty cluster today. Non-stock
-- extensions (`vector`, `hypopg`, `pg_cron`, `pg_partman`) are deferred until
-- the warehouse image/config slice lands.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_buffercache;
