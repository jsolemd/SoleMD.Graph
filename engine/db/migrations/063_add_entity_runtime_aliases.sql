-- Migration 063: Add a hot-path entity alias serving table.
-- This keeps match-time entity lookup off the full alias warehouse by storing
-- only highlight-eligible aliases used by the live runtime.

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.entity_runtime_aliases (
    concept_id      TEXT        NOT NULL,
    entity_type     TEXT        NOT NULL,
    alias_text      TEXT        NOT NULL,
    alias_key       TEXT        NOT NULL,
    is_canonical    BOOLEAN     NOT NULL DEFAULT false,
    alias_source    TEXT        NOT NULL,
    canonical_name  TEXT        NOT NULL,
    paper_count     INTEGER     NOT NULL DEFAULT 0,
    highlight_mode  TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, concept_id, alias_key)
);

COMMENT ON TABLE solemd.entity_runtime_aliases IS
    'Hot-path entity alias serving table containing only highlight-eligible aliases for live text matching.';

TRUNCATE TABLE solemd.entity_runtime_aliases;

INSERT INTO solemd.entity_runtime_aliases (
    concept_id,
    entity_type,
    alias_text,
    alias_key,
    is_canonical,
    alias_source,
    canonical_name,
    paper_count,
    highlight_mode
)
SELECT
    concept_id,
    entity_type,
    alias_text,
    alias_key,
    is_canonical,
    alias_source,
    canonical_name,
    paper_count,
    highlight_mode
FROM solemd.entity_aliases
WHERE highlight_mode IN ('exact', 'case_sensitive_exact');

CREATE INDEX IF NOT EXISTS idx_entity_runtime_aliases_alias_key
    ON solemd.entity_runtime_aliases (alias_key);

CREATE INDEX IF NOT EXISTS idx_entity_runtime_aliases_alias_key_entity_type
    ON solemd.entity_runtime_aliases (alias_key, entity_type);

ANALYZE solemd.entity_runtime_aliases;

COMMIT;
