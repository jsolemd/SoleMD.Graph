-- Migration 028: Create canonical RAG document/source/section tables
--
-- Purpose:
--   1. Add canonical document/source/section tables for warehouse-backed RAG
--   2. Keep source provenance explicit from the first warehouse stage
--   3. Reuse existing solemd.paper_references / solemd.paper_assets physical
--      tables instead of duplicating them prematurely
--
-- Notes:
--   - This is the first real warehouse slice, not the final full warehouse.
--   - paper_references and paper_assets remain the current physical substrate
--     for bibliography/assets while the new canonical span spine is added.
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/028_rag_canonical_core.sql

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.paper_documents (
    corpus_id               BIGINT PRIMARY KEY
        REFERENCES solemd.papers (corpus_id) ON DELETE CASCADE,
    title                   TEXT,
    language                TEXT,
    source_availability     TEXT,
    primary_source_system   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solemd.paper_document_sources (
    corpus_id               BIGINT NOT NULL
        REFERENCES solemd.paper_documents (corpus_id) ON DELETE CASCADE,
    document_source_ordinal INTEGER NOT NULL,
    source_system           TEXT NOT NULL,
    source_revision         TEXT NOT NULL,
    source_document_key     TEXT NOT NULL,
    source_plane            TEXT NOT NULL,
    parser_version          TEXT NOT NULL,
    is_primary_text_source  BOOLEAN NOT NULL DEFAULT false,
    raw_attrs_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_id, document_source_ordinal)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_document_sources_source_identity
    ON solemd.paper_document_sources (
        source_system,
        source_revision,
        source_document_key,
        source_plane
    );

CREATE TABLE IF NOT EXISTS solemd.paper_sections (
    corpus_id               BIGINT NOT NULL
        REFERENCES solemd.paper_documents (corpus_id) ON DELETE CASCADE,
    section_ordinal         INTEGER NOT NULL,
    parent_section_ordinal  INTEGER,
    section_role            TEXT NOT NULL,
    display_label           TEXT,
    numbering_token         TEXT,
    text                    TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_id, section_ordinal)
);

ALTER TABLE solemd.paper_sections
    DROP CONSTRAINT IF EXISTS fk_paper_sections_parent;

ALTER TABLE solemd.paper_sections
    ADD CONSTRAINT fk_paper_sections_parent
        FOREIGN KEY (corpus_id, parent_section_ordinal)
        REFERENCES solemd.paper_sections (corpus_id, section_ordinal)
        DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_paper_sections_parent
    ON solemd.paper_sections (corpus_id, parent_section_ordinal)
    WHERE parent_section_ordinal IS NOT NULL;

COMMENT ON TABLE solemd.paper_documents IS
    'Canonical per-paper document metadata for the future RAG evidence warehouse.';

COMMENT ON TABLE solemd.paper_document_sources IS
    'Source-provenance rows for canonical RAG documents. One paper may have multiple structural sources.';

COMMENT ON TABLE solemd.paper_sections IS
    'Canonical section hierarchy for warehouse-backed RAG. Parent ordinals encode nested section structure per paper.';

COMMENT ON COLUMN solemd.paper_document_sources.is_primary_text_source IS
    'True when this source supplies the canonical text spine used for sections/blocks/sentences for the paper.';

COMMIT;
