-- Migration 001: Core schema creation (first-time-only, not idempotent)
-- Re-running requires DROP SCHEMA solemd CASCADE first
--
-- 001_core_schema.sql
-- Core tables for SoleMD.Graph corpus definition and data loading.
--
-- Prerequisites (created by docker/init.sql):
--   CREATE EXTENSION IF NOT EXISTS vector;
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE SCHEMA IF NOT EXISTS solemd;
--   CREATE SCHEMA IF NOT EXISTS pubtator;

BEGIN;

-- ─── solemd.corpus ──────────────────────────────────────────
-- Authoritative membership list: which papers are in our domain.
-- Populated first (fast, just IDs from DuckDB filtering).
-- PubTator filtering and batch API both read from this table.

CREATE TABLE solemd.corpus (
    corpus_id   BIGINT      PRIMARY KEY,
    pmid        INTEGER     UNIQUE,
    doi         TEXT,
    pmc_id      TEXT,
    filter_reason TEXT      NOT NULL,   -- 'venue_match', 'mesh_query', 'citation_neighbor'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corpus_pmid ON solemd.corpus (pmid) WHERE pmid IS NOT NULL;
CREATE INDEX idx_corpus_filter ON solemd.corpus (filter_reason);

-- ─── solemd.papers ──────────────────────────────────────────
-- Rich paper metadata. Populated from S2 bulk data during filtering,
-- then enriched incrementally via the S2 batch API.

CREATE TABLE solemd.papers (
    corpus_id               BIGINT      PRIMARY KEY REFERENCES solemd.corpus (corpus_id),
    title                   TEXT        NOT NULL,
    year                    INTEGER,
    venue                   TEXT,
    journal_name            TEXT,
    publication_date        DATE,
    publication_types       TEXT[],
    fields_of_study         TEXT[],
    reference_count         INTEGER,
    citation_count          INTEGER,
    influential_citation_count INTEGER,
    is_open_access          BOOLEAN,
    s2_url                  TEXT,

    -- Enrichment (batch API, initially NULL)
    abstract                TEXT,
    tldr                    TEXT,
    embedding               vector(768),    -- SPECTER2
    text_availability       TEXT,           -- 'fulltext', 'abstract', 'none'

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_papers_year ON solemd.papers (year);
CREATE INDEX idx_papers_venue ON solemd.papers (venue);
CREATE INDEX idx_papers_citation_count ON solemd.papers (citation_count DESC);

-- GIN index for array containment queries (publication_types, fields_of_study)
CREATE INDEX idx_papers_pub_types ON solemd.papers USING gin (publication_types);
CREATE INDEX idx_papers_fos ON solemd.papers USING gin (fields_of_study);

-- Full-text search on title (tsvector)
CREATE INDEX idx_papers_title_fts ON solemd.papers
    USING gin (to_tsvector('english', coalesce(title, '')));

-- ─── solemd.load_history ────────────────────────────────────
-- Tracks ETL operations for debugging and resume support.

CREATE TABLE solemd.load_history (
    id              SERIAL      PRIMARY KEY,
    operation       TEXT        NOT NULL,   -- 'filter_papers', 'filter_pubtator', 'batch_api', etc.
    source          TEXT,                   -- filename or API endpoint
    rows_processed  INTEGER     DEFAULT 0,
    rows_loaded     INTEGER     DEFAULT 0,
    status          TEXT        NOT NULL DEFAULT 'running',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    metadata        JSONB
);

-- ─── pubtator.entity_annotations ────────────────────────────
-- PubTator3 entity mentions filtered to domain PMIDs.
-- UNLOGGED for fast bulk loading. If lost, re-run the filter.

CREATE UNLOGGED TABLE pubtator.entity_annotations (
    pmid            INTEGER     NOT NULL,
    entity_type     TEXT        NOT NULL,   -- gene, disease, chemical, species, mutation, cellline
    concept_id      TEXT        NOT NULL,   -- MESH:D009461, Gene:1234, etc.
    mentions        TEXT        NOT NULL,   -- pipe-delimited mention strings
    resource        TEXT        NOT NULL DEFAULT 'PubTator3'
);

-- Indexes created after bulk load (see filter_pubtator.py)

-- ─── pubtator.relations ─────────────────────────────────────
-- PubTator3 entity-entity relations filtered to domain PMIDs.
-- UNLOGGED for fast bulk loading.

CREATE UNLOGGED TABLE pubtator.relations (
    pmid            INTEGER     NOT NULL,
    relation_type   TEXT        NOT NULL,   -- treat, associate, stimulate, inhibit, etc.
    subject_type    TEXT        NOT NULL,   -- chemical, disease, gene, etc.
    subject_id      TEXT        NOT NULL,   -- MESH:D009461, Gene:1234, etc.
    object_type     TEXT        NOT NULL,
    object_id       TEXT        NOT NULL
);

-- Indexes created after bulk load (see filter_pubtator.py)

COMMIT;
