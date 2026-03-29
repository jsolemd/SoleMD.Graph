-- Migration 023: Create solemd.vocab_terms and load curated vocabulary
--
-- Purpose:
--   Load the 3,361 expertly curated psychiatric/neurological terms from
--   data/vocab_terms.tsv into PostgreSQL so they can be enriched with
--   MeSH crosswalks and used to generate entity_rules.
--
-- Run from project root:
--   psql $DATABASE_URL -f engine/db/migrations/023_vocab_terms_table.sql

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.vocab_terms (
    id                   UUID PRIMARY KEY,
    canonical_name       TEXT NOT NULL,
    category             TEXT NOT NULL,
    umls_cui             TEXT,
    rxnorm_cui           TEXT,
    semantic_types       TEXT[],
    semantic_groups      TEXT[],
    organ_systems        TEXT[],

    -- Enrichment columns (populated by engine/scripts/enrich_vocab_terms.py)
    mesh_id              TEXT,
    pubtator_entity_type TEXT,
    entity_rule_family   TEXT,
    pubtator_paper_count INTEGER,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vocab_terms_category
    ON solemd.vocab_terms (category);

CREATE INDEX IF NOT EXISTS idx_vocab_terms_umls_cui
    ON solemd.vocab_terms (umls_cui)
    WHERE umls_cui IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_terms_mesh_id
    ON solemd.vocab_terms (mesh_id)
    WHERE mesh_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_terms_entity_rule_family
    ON solemd.vocab_terms (entity_rule_family)
    WHERE entity_rule_family IS NOT NULL;

COMMENT ON TABLE solemd.vocab_terms IS
  'Curated psychiatric/neurological vocabulary with UMLS CUIs. '
  'Source: data/vocab_terms.tsv. Enriched by enrich_vocab_terms.py with MeSH crosswalk.';

COMMENT ON COLUMN solemd.vocab_terms.mesh_id IS
  'MeSH descriptor UI from UMLS CUI crosswalk (populated by enrichment script).';
COMMENT ON COLUMN solemd.vocab_terms.pubtator_entity_type IS
  'Mapped PubTator entity type: disease, chemical, or gene.';
COMMENT ON COLUMN solemd.vocab_terms.entity_rule_family IS
  'Assigned entity_rule family_key for rule generation.';
COMMENT ON COLUMN solemd.vocab_terms.pubtator_paper_count IS
  'Count of distinct PMIDs in pubtator.entity_annotations for this MeSH ID.';

COMMIT;

-- Load vocab terms from TSV (psql meta-command, runs outside transaction).
-- Requires running from project root so the relative path resolves.
\COPY solemd.vocab_terms (id, canonical_name, category, umls_cui, rxnorm_cui, semantic_types, semantic_groups, organ_systems) FROM 'data/vocab_terms.tsv' WITH (FORMAT csv, DELIMITER E'\t', HEADER true, NULL '')
