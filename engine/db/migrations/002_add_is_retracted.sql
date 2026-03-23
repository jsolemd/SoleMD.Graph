-- 002_add_is_retracted.sql
-- Add retraction tracking column to solemd.papers.
-- S2 dataset has no retraction flag; populated post-build via PubMed E-utilities.

ALTER TABLE solemd.papers
    ADD COLUMN IF NOT EXISTS is_retracted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_retracted
    ON solemd.papers (is_retracted) WHERE is_retracted = true;
