-- 005_add_s2_enrichment_tracking.sql
-- Track whether full S2 enrichment has already been attempted for a paper.
--
-- Problem:
--   Using `abstract IS NULL` as the resume selector causes successful enrichments
--   with missing abstracts to be re-fetched forever.
--
-- Solution:
--   Add an explicit full-enrichment check timestamp plus whether the S2 record
--   was found. Backfill existing enriched rows from their current content.

BEGIN;

ALTER TABLE solemd.papers
    ADD COLUMN IF NOT EXISTS s2_full_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS s2_found BOOLEAN;

COMMENT ON COLUMN solemd.papers.s2_full_checked_at IS
    'When full S2 batch enrichment (abstract/TLDR/embedding/textAvailability) was last attempted.';

COMMENT ON COLUMN solemd.papers.s2_found IS
    'Whether Semantic Scholar returned a paper payload for the most recent attempted fetch.';

-- Backfill rows already touched by enrichment so reruns skip them correctly.
UPDATE solemd.papers
SET
    s2_full_checked_at = COALESCE(s2_full_checked_at, updated_at),
    s2_found = COALESCE(s2_found, true)
WHERE s2_full_checked_at IS NULL
  AND (
      abstract IS NOT NULL
      OR tldr IS NOT NULL
      OR embedding IS NOT NULL
      OR text_availability IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_papers_s2_full_checked_at
    ON solemd.papers (s2_full_checked_at)
    WHERE s2_full_checked_at IS NULL;

COMMIT;
