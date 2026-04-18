-- pg_stat_statements and pg_prewarm are kept in the structural baseline so
-- later tuning slices can turn them on without a schema churn patch. They
-- still require shared_preload_libraries before they provide runtime value.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_buffercache;
CREATE EXTENSION IF NOT EXISTS pg_prewarm;
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
