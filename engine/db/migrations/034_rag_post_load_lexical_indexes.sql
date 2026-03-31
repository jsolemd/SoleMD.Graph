-- Migration 034: Apply post-load lexical fallback indexes for canonical blocks and chunks
--
-- Purpose:
--   1. Add the deferred GIN lexical-fallback indexes after canonical/chunk rows exist
--   2. Keep the schema lean by indexing a normalized text-search expression directly
--   3. Use the partition-safe parent-plus-child attach pattern so live builds stay concurrent
--
-- Notes:
--   - Do not wrap this migration in a transaction. CREATE INDEX CONCURRENTLY is required
--     on live partition children and is not allowed inside a transaction block.
--   - The parent indexes on ONLY remain invalid until all child indexes are attached.
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/034_rag_post_load_lexical_indexes.sql

CREATE INDEX IF NOT EXISTS idx_paper_blocks_search_tsv
    ON ONLY solemd.paper_blocks
    USING gin ((to_tsvector('english', coalesce(text, ''))));

SELECT format(
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS %I ON solemd.%I USING gin ((to_tsvector(''english'', coalesce(text, ''''))))',
    'idx_' || child.relname || '_search_tsv',
    child.relname
)
FROM pg_inherits inh
JOIN pg_class parent
  ON parent.oid = inh.inhparent
JOIN pg_class child
  ON child.oid = inh.inhrelid
JOIN pg_namespace child_ns
  ON child_ns.oid = child.relnamespace
WHERE parent.relname = 'paper_blocks'
  AND child_ns.nspname = 'solemd'
\gexec

SELECT format(
    'ALTER INDEX solemd.idx_paper_blocks_search_tsv ATTACH PARTITION solemd.%I',
    'idx_' || child.relname || '_search_tsv'
)
FROM pg_inherits inh
JOIN pg_class parent
  ON parent.oid = inh.inhparent
JOIN pg_class child
  ON child.oid = inh.inhrelid
JOIN pg_namespace child_ns
  ON child_ns.oid = child.relnamespace
WHERE parent.relname = 'paper_blocks'
  AND child_ns.nspname = 'solemd'
  AND to_regclass(format('solemd.%I', 'idx_' || child.relname || '_search_tsv')) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM pg_inherits idx_inh
      WHERE idx_inh.inhparent = to_regclass('solemd.idx_paper_blocks_search_tsv')
        AND idx_inh.inhrelid = to_regclass(format('solemd.%I', 'idx_' || child.relname || '_search_tsv'))
  )
\gexec

CREATE INDEX IF NOT EXISTS idx_paper_chunks_search_tsv
    ON ONLY solemd.paper_chunks
    USING gin ((to_tsvector('english', coalesce(text, ''))));

SELECT format(
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS %I ON solemd.%I USING gin ((to_tsvector(''english'', coalesce(text, ''''))))',
    'idx_' || child.relname || '_search_tsv',
    child.relname
)
FROM pg_inherits inh
JOIN pg_class parent
  ON parent.oid = inh.inhparent
JOIN pg_class child
  ON child.oid = inh.inhrelid
JOIN pg_namespace child_ns
  ON child_ns.oid = child.relnamespace
WHERE parent.relname = 'paper_chunks'
  AND child_ns.nspname = 'solemd'
\gexec

SELECT format(
    'ALTER INDEX solemd.idx_paper_chunks_search_tsv ATTACH PARTITION solemd.%I',
    'idx_' || child.relname || '_search_tsv'
)
FROM pg_inherits inh
JOIN pg_class parent
  ON parent.oid = inh.inhparent
JOIN pg_class child
  ON child.oid = inh.inhrelid
JOIN pg_namespace child_ns
  ON child_ns.oid = child.relnamespace
WHERE parent.relname = 'paper_chunks'
  AND child_ns.nspname = 'solemd'
  AND to_regclass(format('solemd.%I', 'idx_' || child.relname || '_search_tsv')) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM pg_inherits idx_inh
      WHERE idx_inh.inhparent = to_regclass('solemd.idx_paper_chunks_search_tsv')
        AND idx_inh.inhrelid = to_regclass(format('solemd.%I', 'idx_' || child.relname || '_search_tsv'))
  )
\gexec
