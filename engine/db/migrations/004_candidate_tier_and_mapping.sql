-- Migration 004: Candidate tier rename, mapping columns, venue_rule, graph_papers view
--
-- Changes:
--   1. Drop old CHECK constraint (must happen BEFORE renaming values)
--   2. Rename corpus_tier 'warehouse' → 'candidate' + update default
--   3. Add new CHECK constraint
--   4. Add is_mapped and is_default_visible columns (Phase 2 — populated after enrichment)
--   5. Create clean_venue() function mirroring Python/DuckDB normalization
--   6. Create venue_rule table for C-L specialty journal management
--   7. Populate venue_rule with initial C-L specialty journals
--   8. Promote venue_rule matches to graph tier
--   9. Create graph_papers quality filter view (Phase 2 export/bundle queries)
--  10. Update column comments

BEGIN;

-- 1. Drop old CHECK constraint FIRST — required before UPDATE can write 'candidate'
ALTER TABLE solemd.corpus DROP CONSTRAINT IF EXISTS corpus_corpus_tier_check;

-- 2. Rename warehouse → candidate + fix the column default
UPDATE solemd.corpus SET corpus_tier = 'candidate' WHERE corpus_tier = 'warehouse';
ALTER TABLE solemd.corpus ALTER COLUMN corpus_tier SET DEFAULT 'candidate';

-- 3. Add new CHECK constraint (now that all rows are 'candidate' or 'graph')
DO $$ BEGIN
  ALTER TABLE solemd.corpus ADD CONSTRAINT corpus_corpus_tier_check
    CHECK (corpus_tier IN ('candidate', 'graph'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add mapping/visibility columns idempotently
DO $$ BEGIN
  ALTER TABLE solemd.corpus ADD COLUMN is_mapped BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE solemd.corpus ADD COLUMN is_default_visible BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_corpus_mapped ON solemd.corpus(corpus_id) WHERE is_mapped = true;
CREATE INDEX IF NOT EXISTS idx_corpus_default_visible ON solemd.corpus(corpus_id) WHERE is_default_visible = true;

-- 5. Create clean_venue() SQL function — mirrors Python _clean_venue() and DuckDB clean_venue() macro
--    Used by venue_rule promotion to ensure normalization matches the filter pipeline.
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

-- 6. Create venue_rule table idempotently
CREATE TABLE IF NOT EXISTS solemd.venue_rule (
  venue_normalized TEXT PRIMARY KEY,
  rule_source TEXT NOT NULL,        -- 'nlm', 'pattern', 'manual_cl'
  specialty TEXT,                    -- 'critical_care', 'psycho_oncology', etc.
  added_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE solemd.venue_rule IS
  'Curated venue rules for corpus tier promotion. Exact normalized strings (via clean_venue()), not LIKE patterns.';

-- 7. Populate with C-L specialty journals
INSERT INTO solemd.venue_rule (venue_normalized, rule_source, specialty) VALUES
  ('critical care medicine', 'manual_cl', 'critical_care'),
  ('intensive care medicine', 'manual_cl', 'critical_care'),
  ('critical care', 'manual_cl', 'critical_care'),
  ('journal of critical care', 'manual_cl', 'critical_care'),
  ('journal of intensive care medicine', 'manual_cl', 'critical_care'),
  ('annals of intensive care', 'manual_cl', 'critical_care'),
  ('psycho-oncology', 'manual_cl', 'psycho_oncology'),
  ('brain, behavior, and immunity', 'manual_cl', 'neuroimmunology'),
  ('brain, behavior, & immunity - health', 'manual_cl', 'neuroimmunology'),
  ('palliative & supportive care', 'manual_cl', 'palliative'),
  ('journal of palliative medicine', 'manual_cl', 'palliative')
ON CONFLICT DO NOTHING;

-- 8. Promote venue_rule matches to graph tier
--    Uses solemd.clean_venue() for consistent normalization with the filter pipeline.
--    This is a one-time backfill. For ongoing promotion after future filter runs,
--    use: engine/app/corpus/filter.py promote_venue_rules() (see below).
UPDATE solemd.corpus c
SET corpus_tier = 'graph'
FROM solemd.papers p
JOIN solemd.venue_rule vr ON solemd.clean_venue(p.venue) = vr.venue_normalized
WHERE c.corpus_id = p.corpus_id
  AND c.corpus_tier = 'candidate';

-- 9. Create graph_papers quality filter view
--    Purpose: Phase 2 export queries (Parquet bundle builds, UMAP input, cluster labeling).
--    NOT used by enrichment — enrichment intentionally targets ALL graph-tier papers
--    (including low-cite letters/editorials) because we want SPECTER2 embeddings for
--    everything in the graph tier. The quality filter gates what appears on the MAP.
--
--    Null-safe logic: ANY(NULL) returns NULL, so guard with IS NOT NULL checks.
CREATE OR REPLACE VIEW solemd.graph_papers AS
SELECT p.*, c.corpus_tier, c.filter_reason, c.is_mapped, c.is_default_visible
FROM solemd.papers p
JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
WHERE c.corpus_tier = 'graph'
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

COMMENT ON VIEW solemd.graph_papers IS
  'Quality-filtered graph tier for Phase 2 export (Parquet bundles, UMAP, clustering). '
  'NOT used by enrichment — enrichment targets all graph-tier papers. '
  'Excludes pre-1945, low-cite letters/editorials/news, and null-type low-cite papers.';

-- 10. Update column comments
COMMENT ON COLUMN solemd.corpus.corpus_tier IS
  'candidate = broad candidate pool (metadata only), graph = promoted for SPECTER2 + Cosmograph';
COMMENT ON COLUMN solemd.corpus.is_mapped IS
  'Has SPECTER2 embedding + UMAP x/y coordinates. Can appear on canvas. Populated in Phase 2.';
COMMENT ON COLUMN solemd.corpus.is_default_visible IS
  'Included in baseline canvas load. Subset of is_mapped. Populated in Phase 2.';

COMMIT;
