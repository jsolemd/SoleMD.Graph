BEGIN;

CREATE TABLE IF NOT EXISTS solemd.graph_paper_summary (
  corpus_id BIGINT PRIMARY KEY
    REFERENCES solemd.corpus (corpus_id) ON DELETE CASCADE,
  pmid INTEGER,
  graph_paper_ref TEXT NOT NULL UNIQUE,
  paper_id TEXT,
  title TEXT NOT NULL,
  journal_name TEXT NOT NULL DEFAULT '',
  year INTEGER,
  text_availability TEXT,
  reference_count INTEGER NOT NULL DEFAULT 0,
  citation_count INTEGER NOT NULL DEFAULT 0,
  author_count INTEGER NOT NULL DEFAULT 0,
  entity_count INTEGER NOT NULL DEFAULT 0,
  semantic_groups_csv TEXT,
  relation_count INTEGER NOT NULL DEFAULT 0,
  relation_categories_csv TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_paper_summary_pmid
  ON solemd.graph_paper_summary (pmid)
  WHERE pmid IS NOT NULL;

COMMENT ON TABLE solemd.graph_paper_summary IS
  'Canonical graph-facing paper summary serving table keyed by corpus_id. Runtime graph attachment and wiki paper-card lookups should read this surface instead of internal evidence-build tables.';

COMMENT ON COLUMN solemd.graph_paper_summary.graph_paper_ref IS
  'Canonical frontend/runtime paper reference. Uses paper_id when present, otherwise falls back to corpus:<corpus_id>.';

COMMENT ON COLUMN solemd.graph_paper_summary.journal_name IS
  'Display-ready venue for graph and wiki runtime surfaces, preferring papers.journal_name and falling back to papers.venue.';

COMMIT;
