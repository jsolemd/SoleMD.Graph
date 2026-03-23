-- 008_add_s2_reference_tracking.sql
-- Release-aware tracking for Semantic Scholar outgoing reference sync.

BEGIN;

ALTER TABLE solemd.papers
    ADD COLUMN IF NOT EXISTS s2_references_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS s2_references_release_id TEXT;

COMMENT ON COLUMN solemd.papers.s2_references_checked_at IS
    'Timestamp of the latest outgoing-reference sync against the Semantic Scholar Graph API.';
COMMENT ON COLUMN solemd.papers.s2_references_release_id IS
    'Semantic Scholar release ID used for the latest outgoing-reference sync.';

COMMIT;
