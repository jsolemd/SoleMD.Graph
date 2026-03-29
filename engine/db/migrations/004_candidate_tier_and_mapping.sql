-- Migration 004: Current-run membership flags, journal_rule, mapped_papers view
--
-- Changes:
--   1. Add current-run membership flags for the published map/base
--   2. Create clean_venue() function mirroring Python/DuckDB normalization
--   3. Create journal_rule table for curated mapped-universe promotion
--   4. Populate journal_rule with initial specialty overlap journals
--   5. Promote journal_rule matches to mapped layout
--   6. Create mapped_papers quality filter view
--   7. Update column comments

BEGIN;

-- 1. Add current-run membership columns idempotently
DO $$ BEGIN
  ALTER TABLE solemd.corpus ADD COLUMN is_in_current_map BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE solemd.corpus ADD COLUMN is_in_current_base BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_corpus_current_map ON solemd.corpus(corpus_id) WHERE is_in_current_map = true;
CREATE INDEX IF NOT EXISTS idx_corpus_current_base ON solemd.corpus(corpus_id) WHERE is_in_current_base = true;

-- 2. Create clean_venue() SQL function — mirrors Python _clean_venue() and DuckDB clean_venue() macro
--    Used by journal_rule promotion to ensure normalization matches the filter pipeline.
CREATE OR REPLACE FUNCTION solemd.clean_venue(v TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(trim(v)),
            '\.$', ''           -- strip trailing dot
          ),
          '^\s*the\s+', ''     -- strip leading "the "
        ),
        '\s*:\s+.*$', ''       -- strip subtitle after ":"
      ),
      '\s*\(.*?\)\s*$', ''    -- strip trailing parenthetical
    )
  )
$$;

COMMENT ON FUNCTION solemd.clean_venue(TEXT) IS
  'Normalize venue names for matching. Mirrors Python _clean_venue() and DuckDB clean_venue() macro.';

-- 3. Create journal_rule table idempotently
CREATE TABLE IF NOT EXISTS solemd.journal_rule (
  venue_normalized TEXT PRIMARY KEY,
  family_key TEXT NOT NULL,
  include_in_corpus BOOLEAN NOT NULL DEFAULT true,
  rule_source TEXT NOT NULL,        -- 'nlm', 'pattern', 'manual'
  added_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE solemd.journal_rule IS
  'Curated journal-family rules for mapped-universe promotion. Exact normalized strings (via clean_venue()), not LIKE patterns.';

-- 4. Populate with initial specialty overlap journals
INSERT INTO solemd.journal_rule (venue_normalized, family_key, include_in_corpus, rule_source) VALUES
  ('critical care medicine', 'critical_care_specialty', true, 'manual'),
  ('intensive care medicine', 'critical_care_specialty', true, 'manual'),
  ('critical care', 'critical_care_specialty', true, 'manual'),
  ('journal of critical care', 'critical_care_specialty', true, 'manual'),
  ('journal of intensive care medicine', 'critical_care_specialty', true, 'manual'),
  ('annals of intensive care', 'critical_care_specialty', true, 'manual'),
  ('psycho-oncology', 'psycho_oncology_specialty', true, 'manual'),
  ('brain, behavior, and immunity', 'neuroimmunology_specialty', true, 'manual'),
  ('brain, behavior, & immunity - health', 'neuroimmunology_specialty', true, 'manual'),
  ('palliative & supportive care', 'palliative_specialty', true, 'manual'),
  ('journal of palliative medicine', 'palliative_specialty', true, 'manual')
ON CONFLICT DO NOTHING;

-- 5. Promote journal_rule matches to mapped layout
--    Uses solemd.clean_venue() for consistent normalization with the filter pipeline.
--    This is a one-time backfill. For ongoing promotion after future filter runs,
--    use: engine/app/corpus/filter.py promote_journal_rules().
UPDATE solemd.corpus c
SET layout_status = 'mapped'
FROM solemd.papers p
JOIN solemd.journal_rule jr ON solemd.clean_venue(p.venue) = jr.venue_normalized
WHERE c.corpus_id = p.corpus_id
  AND c.layout_status = 'candidate'
  AND jr.include_in_corpus = true;

-- 6. Create mapped_papers quality filter view
--    Purpose: Phase 2 export queries (Parquet bundle builds, UMAP input, cluster labeling).
--    NOT used by enrichment — enrichment intentionally targets ALL mapped papers
--    (including low-cite letters/editorials) because we want SPECTER2 embeddings for
--    everything in the mapped universe. The quality filter gates what appears on the map.
--
--    Null-safe logic: ANY(NULL) returns NULL, so guard with IS NOT NULL checks.
CREATE OR REPLACE VIEW solemd.mapped_papers AS
SELECT p.*, c.layout_status, c.admission_reason, c.is_in_current_map, c.is_in_current_base
FROM solemd.papers p
JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
WHERE c.layout_status = 'mapped'
  -- Pre-1945 papers are mostly metadata errors
  AND (p.year >= 1945 OR p.year IS NULL)
  -- Null/empty publication types: keep if well-cited (>=50)
  AND NOT (
    (p.publication_types IS NULL OR CARDINALITY(p.publication_types) = 0)
    AND COALESCE(p.citation_count, 0) < 50
  )
  -- News: keep if well-cited (>=50)
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'News' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 50
  )
  -- LettersAndComments: keep if >= 50 cites
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'LettersAndComments' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 50
  )
  -- Editorial: keep if >= 20 cites
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'Editorial' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 20
  );

COMMENT ON VIEW solemd.mapped_papers IS
  'Quality-filtered mapped universe for graph layout, base admission, and bundle export. '
  'NOT used by enrichment — enrichment targets all mapped papers. '
  'Excludes pre-1945, low-cite letters/editorials/news, and null-type low-cite papers.';

-- 7. Update column comments
COMMENT ON COLUMN solemd.corpus.layout_status IS
  'candidate = domain corpus member awaiting mapped layout, mapped = promoted into the coordinate universe';
COMMENT ON COLUMN solemd.corpus.is_in_current_map IS
  'Current published run membership sync: paper exists in the current graph_points run.';
COMMENT ON COLUMN solemd.corpus.is_in_current_base IS
  'Current published run sync: paper is admitted into the current base_points opening scaffold.';

COMMIT;
