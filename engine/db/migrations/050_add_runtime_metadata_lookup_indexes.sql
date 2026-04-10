-- Migration 050: Runtime metadata lookup indexes
--
-- Purpose:
--   Support author/journal/year/publication-type retrieval now exercised by the
--   biomedical metadata and evidence-type runtime benchmarks.
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     for these live runtime lookup indexes on large serving tables.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_publication_types_gin
    ON solemd.papers USING gin (publication_types);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_runtime_journal_lookup
    ON solemd.papers ((solemd.clean_venue(COALESCE(journal_name, venue, ''::text))));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_papers_runtime_journal_fts
    ON solemd.papers USING gin (
        to_tsvector(
            'simple'::regconfig,
            solemd.clean_venue(COALESCE(journal_name, venue, ''::text))
        )
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_paper_authors_name_fts
    ON solemd.paper_authors USING gin (
        to_tsvector('simple'::regconfig, COALESCE(name, ''::text))
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_paper_authors_first_author_name_lower
    ON solemd.paper_authors ((lower(name)), corpus_id)
    WHERE author_position = 1;
