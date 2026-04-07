-- Migration 044: Papers table rebuild — stored fts_vector + index optimization
--
-- Purpose:
--   1. Add stored fts_vector column (eliminates on-the-fly tsvector computation)
--   2. Drop 6 redundant indexes (~9 GB saved, 30% fewer index updates per write)
--   3. Add missing s2_references_checked_at partial index
--   4. Rebuild table via CTAS+swap for zero bloat (60 GB → ~32 GB)
--
-- Indexes dropped (with justification):
--   - idx_papers_title_trgm (GIN, 3.5 GB)         — redundant: GiST handles same operators
--   - idx_papers_normalized_title_key_trgm (GIN, 3.5 GB) — redundant: GiST handles same operators
--   - idx_papers_title_abstract_fts (GIN, 1.2 GB)  — replaced by idx_papers_fts_vector
--   - idx_papers_citation_count (btree, 212 MB)    — never used in WHERE; only ORDER BY secondary
--   - idx_papers_year (btree, 220 MB)              — never used in WHERE; only in SELECT
--   - idx_papers_venue (btree, 217 MB)             — never used in WHERE; only in SELECT
--   - idx_papers_fos (GIN, 74 MB)                  — never used in WHERE; only in SELECT
--   - idx_papers_pub_types (GIN, 55 MB)            — never used in WHERE; only in SELECT
--
-- Indexes kept (13 total):
--   - papers_pkey (btree)                          — PK, used by every JOIN/UPDATE
--   - idx_papers_paper_id (btree, unique)          — dedup on enrichment
--   - idx_papers_lower_title (btree)               — exact/prefix title matching
--   - idx_papers_normalized_title_key (btree)      — exact/prefix normalized title
--   - idx_papers_title_gist_trgm (GiST)           — KNN title similarity + containment
--   - idx_papers_normalized_title_key_gist_trgm    — KNN normalized similarity + containment
--   - idx_papers_title_fts (GIN)                   — title-only phrase search
--   - idx_papers_fts_vector (GIN, NEW)             — stored title+abstract FTS
--   - idx_papers_embedding_hnsw (HNSW)             — vector similarity search
--   - idx_papers_s2_full_checked_at (partial)      — find un-enriched papers
--   - idx_papers_s2_embedding_checked_at (partial)  — find un-embedded papers
--   - idx_papers_s2_references_checked_at (partial, NEW) — find un-referenced papers
--   - idx_papers_retracted (partial)               — filter retracted papers
--
-- Strategy:
--   Phase 1: CTAS with parallel workers (~5-10 min)
--   Phase 2: NOT NULL constraints + defaults (instant)
--   Phase 3: Build 13 indexes (~60-90 min, HNSW dominates)
--   Phase 4: FK constraints (~5 min)
--   Phase 5: fts_vector sync trigger (instant)
--   Phase 6: Atomic swap (instant)
--   Phase 7: SET LOGGED + cleanup (~10-15 min)
--
-- Net result:
--   Before: 60 GB table + 41 GB indexes (19) = 101 GB
--   After:  ~32 GB table + ~33 GB indexes (13) = ~65 GB
--
-- Notes:
--   - Do NOT wrap in a transaction — cannot mix DDL phases
--   - Run during low-activity window (total ~2 hours)
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/044_papers_fts_vector.sql

-- ============================================================
-- Phase 1: Create new table with fts_vector baked in
-- ============================================================

SET max_parallel_workers_per_gather = 4;
SET parallel_tuple_cost = 0;
SET parallel_setup_cost = 0;
SET maintenance_work_mem = '2GB';

DROP TABLE IF EXISTS solemd.papers_new;

CREATE UNLOGGED TABLE solemd.papers_new AS
SELECT
    corpus_id,
    title,
    year,
    venue,
    journal_name,
    publication_date,
    publication_types,
    fields_of_study,
    reference_count,
    citation_count,
    influential_citation_count,
    is_open_access,
    s2_url,
    abstract,
    tldr,
    embedding,
    text_availability,
    created_at,
    updated_at,
    is_retracted,
    s2_full_checked_at,
    s2_found,
    s2_embedding_checked_at,
    paper_id,
    paper_external_ids,
    publication_venue_id,
    journal_volume,
    journal_issue,
    journal_pages,
    s2_full_release_id,
    s2_embedding_release_id,
    s2_references_checked_at,
    s2_references_release_id,
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(abstract, '')), 'B')
        AS fts_vector
FROM solemd.papers;

RESET max_parallel_workers_per_gather;
RESET parallel_tuple_cost;
RESET parallel_setup_cost;

-- ============================================================
-- Phase 2: NOT NULL constraints and defaults
-- ============================================================

ALTER TABLE solemd.papers_new
    ALTER COLUMN corpus_id SET NOT NULL,
    ALTER COLUMN title SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN is_retracted SET NOT NULL,
    ALTER COLUMN is_retracted SET DEFAULT false,
    ALTER COLUMN paper_external_ids SET NOT NULL,
    ALTER COLUMN paper_external_ids SET DEFAULT '{}'::jsonb;

-- ============================================================
-- Phase 3: Build optimized index set (13 indexes)
-- ============================================================

-- Primary key
ALTER TABLE solemd.papers_new ADD CONSTRAINT papers_new_pkey PRIMARY KEY (corpus_id);

-- Btree indexes (essential lookups + ingestion)
CREATE INDEX idx_papers_new_lower_title
    ON solemd.papers_new USING btree (lower(COALESCE(title, ''::text)));
CREATE INDEX idx_papers_new_normalized_title_key
    ON solemd.papers_new USING btree (solemd.normalize_title_key(title));
CREATE UNIQUE INDEX idx_papers_new_paper_id
    ON solemd.papers_new USING btree (paper_id) WHERE (paper_id IS NOT NULL);
CREATE INDEX idx_papers_new_retracted
    ON solemd.papers_new USING btree (is_retracted) WHERE (is_retracted = true);

-- Partial btree indexes (ingestion: find un-processed papers)
CREATE INDEX idx_papers_new_s2_full_checked_at
    ON solemd.papers_new USING btree (s2_full_checked_at)
    WHERE (s2_full_checked_at IS NULL);
CREATE INDEX idx_papers_new_s2_embedding_checked_at
    ON solemd.papers_new USING btree (s2_embedding_checked_at)
    WHERE (s2_embedding_checked_at IS NULL);
CREATE INDEX idx_papers_new_s2_references_checked_at
    ON solemd.papers_new USING btree (s2_references_checked_at)
    WHERE (s2_references_checked_at IS NULL);

-- GIN indexes (FTS)
CREATE INDEX idx_papers_new_title_fts
    ON solemd.papers_new USING gin (to_tsvector('english'::regconfig, COALESCE(title, ''::text)));
CREATE INDEX idx_papers_new_fts_vector
    ON solemd.papers_new USING gin (fts_vector);
ALTER INDEX solemd.idx_papers_new_fts_vector SET (fastupdate = off);

-- GiST indexes (KNN similarity + containment — replaces redundant GIN trgm)
CREATE INDEX idx_papers_new_title_gist_trgm
    ON solemd.papers_new USING gist (lower(COALESCE(title, ''::text)) gist_trgm_ops);
CREATE INDEX idx_papers_new_normalized_title_key_gist_trgm
    ON solemd.papers_new USING gist (solemd.normalize_title_key(title) gist_trgm_ops);

-- HNSW vector index (slowest build — ~30-60 min for 768-dim, 14M rows)
CREATE INDEX idx_papers_new_embedding_hnsw
    ON solemd.papers_new USING hnsw (embedding vector_cosine_ops)
    WHERE (embedding IS NOT NULL);

-- ============================================================
-- Phase 4: FK constraints
-- ============================================================

ALTER TABLE solemd.papers_new
    ADD CONSTRAINT papers_new_corpus_id_fkey
        FOREIGN KEY (corpus_id) REFERENCES solemd.corpus(corpus_id),
    ADD CONSTRAINT papers_new_publication_venue_fk
        FOREIGN KEY (publication_venue_id) REFERENCES solemd.publication_venues(publication_venue_id);

-- ============================================================
-- Phase 5: fts_vector sync trigger
-- ============================================================

CREATE OR REPLACE FUNCTION solemd.papers_fts_vector_update()
RETURNS trigger AS $$
BEGIN
    NEW.fts_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.abstract, '')), 'B');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_papers_fts_vector
    BEFORE INSERT OR UPDATE OF title, abstract ON solemd.papers_new
    FOR EACH ROW EXECUTE FUNCTION solemd.papers_fts_vector_update();

-- ============================================================
-- Phase 6: Atomic swap
-- ============================================================

BEGIN;

-- Drop inbound FKs pointing at old table
ALTER TABLE solemd.paper_assets DROP CONSTRAINT IF EXISTS paper_assets_corpus_id_fkey;
ALTER TABLE solemd.paper_authors DROP CONSTRAINT IF EXISTS paper_authors_corpus_id_fkey;
ALTER TABLE solemd.paper_documents DROP CONSTRAINT IF EXISTS paper_documents_corpus_id_fkey;
ALTER TABLE solemd.paper_references DROP CONSTRAINT IF EXISTS paper_references_corpus_id_fkey;
ALTER TABLE solemd.rag_refresh_selected_targets DROP CONSTRAINT IF EXISTS rag_refresh_selected_targets_corpus_id_fkey;

-- Swap tables
ALTER TABLE solemd.papers RENAME TO papers_old;
ALTER TABLE solemd.papers_new RENAME TO papers;

-- Rename constraints to canonical names
ALTER TABLE solemd.papers RENAME CONSTRAINT papers_new_pkey TO papers_pkey;
ALTER TABLE solemd.papers RENAME CONSTRAINT papers_new_corpus_id_fkey TO papers_corpus_id_fkey;
ALTER TABLE solemd.papers RENAME CONSTRAINT papers_new_publication_venue_fk TO papers_publication_venue_fk;

-- Rename indexes to canonical names
ALTER INDEX solemd.idx_papers_new_lower_title RENAME TO idx_papers_lower_title;
ALTER INDEX solemd.idx_papers_new_normalized_title_key RENAME TO idx_papers_normalized_title_key;
ALTER INDEX solemd.idx_papers_new_paper_id RENAME TO idx_papers_paper_id;
ALTER INDEX solemd.idx_papers_new_retracted RENAME TO idx_papers_retracted;
ALTER INDEX solemd.idx_papers_new_s2_full_checked_at RENAME TO idx_papers_s2_full_checked_at;
ALTER INDEX solemd.idx_papers_new_s2_embedding_checked_at RENAME TO idx_papers_s2_embedding_checked_at;
ALTER INDEX solemd.idx_papers_new_s2_references_checked_at RENAME TO idx_papers_s2_references_checked_at;
ALTER INDEX solemd.idx_papers_new_title_fts RENAME TO idx_papers_title_fts;
ALTER INDEX solemd.idx_papers_new_fts_vector RENAME TO idx_papers_fts_vector;
ALTER INDEX solemd.idx_papers_new_title_gist_trgm RENAME TO idx_papers_title_gist_trgm;
ALTER INDEX solemd.idx_papers_new_normalized_title_key_gist_trgm RENAME TO idx_papers_normalized_title_key_gist_trgm;
ALTER INDEX solemd.idx_papers_new_embedding_hnsw RENAME TO idx_papers_embedding_hnsw;

-- Recreate inbound FKs pointing at new table
ALTER TABLE solemd.paper_assets
    ADD CONSTRAINT paper_assets_corpus_id_fkey
    FOREIGN KEY (corpus_id) REFERENCES solemd.papers(corpus_id) ON DELETE CASCADE;
ALTER TABLE solemd.paper_authors
    ADD CONSTRAINT paper_authors_corpus_id_fkey
    FOREIGN KEY (corpus_id) REFERENCES solemd.papers(corpus_id) ON DELETE CASCADE;
ALTER TABLE solemd.paper_documents
    ADD CONSTRAINT paper_documents_corpus_id_fkey
    FOREIGN KEY (corpus_id) REFERENCES solemd.papers(corpus_id) ON DELETE CASCADE;
ALTER TABLE solemd.paper_references
    ADD CONSTRAINT paper_references_corpus_id_fkey
    FOREIGN KEY (corpus_id) REFERENCES solemd.papers(corpus_id) ON DELETE CASCADE;
ALTER TABLE solemd.rag_refresh_selected_targets
    ADD CONSTRAINT rag_refresh_selected_targets_corpus_id_fkey
    FOREIGN KEY (corpus_id) REFERENCES solemd.papers(corpus_id) ON DELETE CASCADE;

COMMIT;

-- ============================================================
-- Phase 7: Finalize — make durable, clean up, update stats
-- ============================================================

-- Make the new table WAL-logged (durable)
ALTER TABLE solemd.papers SET LOGGED;

-- Drop the old bloated table (releases ~60 GB)
DROP TABLE IF EXISTS solemd.papers_old CASCADE;

-- Update planner statistics
ANALYZE solemd.papers;
