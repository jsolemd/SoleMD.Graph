-- Migration 055: Rebuild invalid runtime normalized-title FTS index
--
-- Purpose:
--   Repair the punctuation-normalized title lookup index if a prior concurrent
--   build left it catalog-visible but invalid. Metadata/evidence-type rescue
--   depends on this index to avoid full scans across solemd.papers.
--
-- Notes:
--   - Do not wrap this migration in a transaction. DROP INDEX CONCURRENTLY and
--     CREATE INDEX CONCURRENTLY both require autocommit.
--   - Keep the expression aligned with
--     ``engine/app/rag/_queries_metadata_search.py``.

DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_papers_runtime_normalized_title_fts;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_runtime_normalized_title_fts
    ON solemd.papers USING gin (
        to_tsvector(
            'english'::regconfig,
            solemd.normalize_title_key(COALESCE(title, ''::text))
        )
    );

ANALYZE solemd.papers;
