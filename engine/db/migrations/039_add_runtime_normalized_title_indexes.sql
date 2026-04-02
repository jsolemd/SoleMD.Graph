-- Migration 039: Add normalized-title runtime search function and indexes
--
-- Purpose:
--   1. Centralize indexed normalized-title lookup for runtime RAG title retrieval
--   2. Keep SQL title matching aligned with the Python normalize_title_key contract
--   3. Support exact normalized-title equality plus pg_trgm similarity on the same key
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     on the live papers table and is not allowed inside a transaction block.
--   - PostgreSQL 16 provides native Unicode NFKC normalization, but not Python-style
--     casefold. The explicit replacements below mirror the live corpus deltas observed
--     between lower() and casefold(): sharp-s and the small set of Greek variants.

CREATE OR REPLACE FUNCTION solemd.normalize_title_key(input_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT trim(
        regexp_replace(
            replace(
                replace(
                    replace(
                        lower(normalize(input_text, NFKC)),
                        'ß',
                        'ss'
                    ),
                    'ς',
                    'σ'
                ),
                'ῳ',
                'ωι'
            ),
            '[^[:alnum:]]+',
            ' ',
            'g'
        )
    );
$$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_normalized_title_key
    ON solemd.papers ((solemd.normalize_title_key(title)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_normalized_title_key_trgm
    ON solemd.papers
    USING gin ((solemd.normalize_title_key(title)) gin_trgm_ops);

ANALYZE solemd.papers;
