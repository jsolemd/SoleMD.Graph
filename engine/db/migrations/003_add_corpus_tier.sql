-- Migration 003: Add corpus_tier column for warehouse/graph tiered corpus
--
-- warehouse = broad candidate pool (~17M papers, metadata only)
-- graph     = promoted subset (~2.5M papers, gets SPECTER2 embeddings + Cosmograph)
--
-- Phase 1: core journal papers → graph tier
-- Phase 1.5: C-L bridge papers promoted from warehouse based on entity signal

BEGIN;

-- Add column idempotently
DO $$ BEGIN
  ALTER TABLE solemd.corpus
  ADD COLUMN corpus_tier TEXT NOT NULL DEFAULT 'warehouse';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add CHECK constraint idempotently
DO $$ BEGIN
  ALTER TABLE solemd.corpus
  ADD CONSTRAINT corpus_corpus_tier_check CHECK (corpus_tier IN ('warehouse', 'graph'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_corpus_graph_only
ON solemd.corpus(corpus_id) WHERE corpus_tier = 'graph';

COMMENT ON COLUMN solemd.corpus.corpus_tier IS
  'warehouse = broad candidate pool (metadata only), graph = promoted for SPECTER2 + Cosmograph';

COMMIT;
