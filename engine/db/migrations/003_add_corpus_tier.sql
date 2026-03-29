-- Migration 003: Add layout_status column for candidate/mapped corpus state
--
-- candidate = broad domain corpus (~17M papers, metadata only)
-- mapped    = promoted subset with coordinates and bundle eligibility
--
-- Phase 1: direct domain and curated journal papers -> mapped
-- Phase 1.5: overlap papers promoted into the mapped universe based on evidence

BEGIN;

-- Add column idempotently
DO $$ BEGIN
  ALTER TABLE solemd.corpus
  ADD COLUMN layout_status TEXT NOT NULL DEFAULT 'candidate';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add CHECK constraint idempotently
DO $$ BEGIN
  ALTER TABLE solemd.corpus
  ADD CONSTRAINT corpus_layout_status_check CHECK (layout_status IN ('candidate', 'mapped'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_corpus_layout_mapped
ON solemd.corpus(corpus_id) WHERE layout_status = 'mapped';

COMMENT ON COLUMN solemd.corpus.layout_status IS
  'candidate = domain corpus member awaiting mapped layout, mapped = promoted into the coordinate universe';

COMMIT;
