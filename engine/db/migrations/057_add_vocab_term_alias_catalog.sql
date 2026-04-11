-- Migration 057: Add Postgres-backed curated vocab alias catalog
--
-- Purpose:
--   Promote data/vocab_aliases.tsv from file-only curation input into an indexed
--   runtime substrate for expert-language canonicalization and other serving-grade
--   lookup paths. The TSV may remain the editorial source, but serving code should
--   read this table, not parse the file on the hot path.

CREATE TABLE IF NOT EXISTS solemd.vocab_term_aliases (
    term_id         UUID NOT NULL REFERENCES solemd.vocab_terms(id) ON DELETE CASCADE,
    alias_text      TEXT NOT NULL,
    alias_key       TEXT NOT NULL,
    alias_type      TEXT,
    quality_score   INTEGER,
    is_preferred    BOOLEAN NOT NULL DEFAULT false,
    umls_cui        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (term_id, alias_key)
);

COMMENT ON TABLE solemd.vocab_term_aliases IS
    'Curated vocab alias catalog derived from data/vocab_aliases.tsv and used as the indexed runtime authority for vocab-term alias lookup.';

COMMENT ON COLUMN solemd.vocab_term_aliases.alias_key IS
    'Lowercased normalized alias key used for exact runtime lookup.';

CREATE INDEX IF NOT EXISTS idx_vocab_term_aliases_alias_key
    ON solemd.vocab_term_aliases (alias_key);

CREATE INDEX IF NOT EXISTS idx_vocab_term_aliases_term_id
    ON solemd.vocab_term_aliases (term_id);

CREATE INDEX IF NOT EXISTS idx_vocab_term_aliases_umls_cui
    ON solemd.vocab_term_aliases (umls_cui)
    WHERE umls_cui IS NOT NULL;
