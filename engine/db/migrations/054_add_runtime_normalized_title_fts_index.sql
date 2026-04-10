-- Migration 054: Add normalized-title FTS index for metadata runtime lookup
--
-- Purpose:
--   Support punctuation-normalized metadata/evidence-type title rescue without
--   forcing full scans across the serving papers table.
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     on the live papers table and is not allowed inside a transaction block.
--   - Keep this aligned with the metadata search SQL in
--     ``engine/app/rag/_queries_metadata_search.py``.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_runtime_normalized_title_fts
    ON solemd.papers USING gin (
        to_tsvector(
            'english'::regconfig,
            solemd.normalize_title_key(COALESCE(title, ''::text))
        )
    );

ANALYZE solemd.papers;
