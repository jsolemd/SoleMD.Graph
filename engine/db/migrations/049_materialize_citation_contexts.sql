-- Migration 049: Materialize citation contexts into a runtime serving table
--
-- Why:
--   1. Runtime citation lookup was exploding JSONB arrays out of solemd.citations
--      on every request.
--   2. Citation contexts are a stable derived serving surface and should be
--      queryable without request-time JSONB expansion.

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.citation_contexts (
    citing_corpus_id        BIGINT NOT NULL,
    cited_corpus_id         BIGINT NOT NULL,
    context_ordinal         INTEGER NOT NULL,
    citation_id             BIGINT,
    context_text            TEXT NOT NULL,
    context_text_lower      TEXT GENERATED ALWAYS AS (lower(context_text)) STORED,
    intents                 JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_influential          BOOLEAN,
    source                  TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    source_release_id       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (citing_corpus_id, cited_corpus_id, context_ordinal),
    CONSTRAINT fk_citation_contexts_edge
        FOREIGN KEY (citing_corpus_id, cited_corpus_id)
        REFERENCES solemd.citations (citing_corpus_id, cited_corpus_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_citation_contexts_citing_corpus
    ON solemd.citation_contexts (citing_corpus_id, context_ordinal);

CREATE INDEX IF NOT EXISTS idx_citation_contexts_cited_corpus
    ON solemd.citation_contexts (cited_corpus_id, context_ordinal);

COMMENT ON TABLE solemd.citation_contexts IS
    'One runtime-serving row per citation context, derived from solemd.citations.';
COMMENT ON COLUMN solemd.citation_contexts.context_text_lower IS
    'Lowercased serving surface for runtime term matching without request-time normalization.';

ANALYZE solemd.citation_contexts;

COMMIT;
