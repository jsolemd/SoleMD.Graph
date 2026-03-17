-- SoleMD.Graph — Database Initialization
-- Runs automatically on first container start via docker-entrypoint-initdb.d

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram similarity for fuzzy text search

-- Create schemas
CREATE SCHEMA IF NOT EXISTS solemd;          -- Application data (papers, chunks, embeddings)
CREATE SCHEMA IF NOT EXISTS pubtator;        -- PubTator3 reference data (entities, relations)

-- Grant access
GRANT USAGE ON SCHEMA solemd TO solemd;
GRANT USAGE ON SCHEMA pubtator TO solemd;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA solemd TO solemd;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA pubtator TO solemd;
ALTER DEFAULT PRIVILEGES IN SCHEMA solemd GRANT ALL ON TABLES TO solemd;
ALTER DEFAULT PRIVILEGES IN SCHEMA pubtator GRANT ALL ON TABLES TO solemd;
