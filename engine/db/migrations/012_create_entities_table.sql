-- 012_create_entities_table.sql
-- Canonical entity records aggregated from PubTator mentions.
-- Composite PK (concept_id, entity_type) because gene IDs overlap across types.
-- Embedding column created but left NULL until SapBERT enrichment.

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.entities (
    concept_id     TEXT NOT NULL,
    entity_type    TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    synonyms       TEXT[],
    embedding      vector(768),
    paper_count    INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (concept_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_entities_type
    ON solemd.entities (entity_type);

CREATE INDEX IF NOT EXISTS idx_entities_paper_count
    ON solemd.entities (paper_count DESC);

CREATE INDEX IF NOT EXISTS idx_entities_canonical_name_trgm
    ON solemd.entities USING gin (lower(canonical_name) gin_trgm_ops);

COMMENT ON TABLE solemd.entities IS
    'Canonical entity records aggregated from PubTator mentions. '
    'Preferred names derived from most-frequent mention form, overridden by entity_rule canonical_name where curated.';

COMMIT;
