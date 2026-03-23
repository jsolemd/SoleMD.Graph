-- 010_extend_citations_for_bulk_dataset.sql
-- Extend citation edges so the Semantic Scholar bulk citations dataset can be
-- the canonical graph-edge source while paper_references remains the richer
-- per-paper bibliography path.

BEGIN;

ALTER TABLE solemd.citations
    ADD COLUMN IF NOT EXISTS citation_id BIGINT,
    ADD COLUMN IF NOT EXISTS contexts JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS intents JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS is_influential BOOLEAN,
    ADD COLUMN IF NOT EXISTS context_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_citations_citation_id
    ON solemd.citations (citation_id)
    WHERE citation_id IS NOT NULL;

COMMENT ON COLUMN solemd.citations.citation_id IS
    'Semantic Scholar bulk citations dataset citation identifier when available.';
COMMENT ON COLUMN solemd.citations.contexts IS
    'Citation contexts from the Semantic Scholar bulk citations dataset.';
COMMENT ON COLUMN solemd.citations.intents IS
    'Citation intent labels from the Semantic Scholar bulk citations dataset.';
COMMENT ON COLUMN solemd.citations.is_influential IS
    'Whether the citation is marked influential in the Semantic Scholar bulk citations dataset.';
COMMENT ON COLUMN solemd.citations.context_count IS
    'Convenience count of citation contexts stored in contexts.';

COMMIT;
