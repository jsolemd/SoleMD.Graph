-- 006_add_s2_embedding_tracking.sql
-- Track whether embedding retrieval has already been attempted for a paper.
--
-- Problem:
--   `--embedding-only` currently reuses content nullability (`embedding IS NULL`)
--   as its retry selector. Papers checked by S2 but lacking an embedding get
--   re-fetched forever.
--
-- Solution:
--   Add a dedicated embedding check timestamp. Full enrichment also checks the
--   embedding field, so full runs should populate this sentinel too.

BEGIN;

ALTER TABLE solemd.papers
    ADD COLUMN IF NOT EXISTS s2_embedding_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN solemd.papers.s2_embedding_checked_at IS
    'When S2 embedding retrieval was last attempted, whether or not an embedding was returned.';

-- Backfill prior attempts.
UPDATE solemd.papers
SET s2_embedding_checked_at = COALESCE(
        s2_embedding_checked_at,
        s2_full_checked_at,
        updated_at
    )
WHERE s2_embedding_checked_at IS NULL
  AND (
      embedding IS NOT NULL
      OR s2_full_checked_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_papers_s2_embedding_checked_at
    ON solemd.papers (s2_embedding_checked_at)
    WHERE s2_embedding_checked_at IS NULL;

COMMIT;
