-- Migration 059: Add the entity-to-corpus serving projection used by
-- graph overlays and wiki entity context.
--
-- Best-practice shape:
--   1. Build the replacement table with CTAS
--   2. Add constraints and indexes on the staged table
--   3. Swap the staged table into place in a short lock window
--   4. Analyze the live table after cutover

-- Phase 1: build the staged table with session-local ETL settings.
BEGIN;

SET LOCAL jit = off;
SET LOCAL work_mem = '1GB';
SET LOCAL maintenance_work_mem = '2GB';
SET LOCAL max_parallel_workers_per_gather = 8;
SET LOCAL max_parallel_maintenance_workers = 4;
SET LOCAL effective_io_concurrency = 200;
SET LOCAL random_page_cost = 1.1;
SET LOCAL parallel_tuple_cost = 0;
SET LOCAL parallel_setup_cost = 0;
SET LOCAL synchronous_commit = off;

DROP TABLE IF EXISTS solemd.entity_corpus_presence_next;
DROP TABLE IF EXISTS solemd.entity_corpus_presence_old;

CREATE TABLE solemd.entity_corpus_presence_next AS
WITH grouped_mentions AS MATERIALIZED (
    SELECT
        ea.pmid,
        ea.entity_type,
        ea.concept_id,
        COUNT(*)::INTEGER AS mention_count
    FROM pubtator.entity_annotations ea
    WHERE ea.concept_id != ''
      AND ea.concept_id != '-'
    GROUP BY ea.pmid, ea.entity_type, ea.concept_id
)
SELECT
    gm.entity_type,
    gm.concept_id,
    c.corpus_id,
    gm.pmid,
    gm.mention_count,
    now()::TIMESTAMPTZ AS created_at
FROM grouped_mentions gm
JOIN solemd.corpus c
  ON c.pmid = gm.pmid;

ALTER TABLE solemd.entity_corpus_presence_next
    ALTER COLUMN entity_type SET NOT NULL,
    ALTER COLUMN concept_id SET NOT NULL,
    ALTER COLUMN corpus_id SET NOT NULL,
    ALTER COLUMN pmid SET NOT NULL,
    ALTER COLUMN mention_count SET NOT NULL,
    ALTER COLUMN mention_count SET DEFAULT 0,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now();

COMMENT ON TABLE solemd.entity_corpus_presence_next IS
    'Derived serving projection: one row per (entity_type, concept_id, corpus_id)
     from PubTator joined onto the active SoleMD corpus.';

COMMENT ON COLUMN solemd.entity_corpus_presence_next.mention_count IS
    'Count of matching PubTator annotation rows for the entity within the corpus paper.';

ALTER TABLE solemd.entity_corpus_presence_next
    ADD CONSTRAINT entity_corpus_presence_next_pkey
        PRIMARY KEY (entity_type, concept_id, corpus_id),
    ADD CONSTRAINT entity_corpus_presence_next_corpus_id_fkey
        FOREIGN KEY (corpus_id)
        REFERENCES solemd.corpus(corpus_id)
        ON DELETE CASCADE;

CREATE INDEX idx_entity_corpus_presence_next_corpus_id
    ON solemd.entity_corpus_presence_next (corpus_id);

COMMIT;

-- Phase 2: short swap window.
BEGIN;

SET LOCAL lock_timeout = '10s';

DROP TABLE IF EXISTS solemd.entity_corpus_presence_old;

ALTER TABLE IF EXISTS solemd.entity_corpus_presence
    RENAME TO entity_corpus_presence_old;

ALTER TABLE solemd.entity_corpus_presence_next
    RENAME TO entity_corpus_presence;

ALTER TABLE solemd.entity_corpus_presence
    RENAME CONSTRAINT entity_corpus_presence_next_pkey
    TO entity_corpus_presence_pkey;

ALTER TABLE solemd.entity_corpus_presence
    RENAME CONSTRAINT entity_corpus_presence_next_corpus_id_fkey
    TO entity_corpus_presence_corpus_id_fkey;

ALTER INDEX solemd.idx_entity_corpus_presence_next_corpus_id
    RENAME TO idx_entity_corpus_presence_corpus_id;

DROP TABLE IF EXISTS solemd.entity_corpus_presence_old;

COMMIT;

ANALYZE solemd.entity_corpus_presence;
