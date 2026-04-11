-- Migration 056: Add highlight_mode policy column to entity_aliases
--
-- Replaces the interim `is_canonical = true` filter with an explicit
-- highlight_mode enum: disabled, exact, case_sensitive_exact, search_only.
--
-- Non-transactional: uses CREATE INDEX CONCURRENTLY which cannot run
-- inside a transaction block. Each statement is independently idempotent.

-- 1. Add column with safe default
ALTER TABLE solemd.entity_aliases
  ADD COLUMN IF NOT EXISTS highlight_mode TEXT NOT NULL DEFAULT 'disabled';

-- 2. Add named CHECK constraint idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entity_aliases_highlight_mode_check'
      AND conrelid = 'solemd.entity_aliases'::regclass
  ) THEN
    ALTER TABLE solemd.entity_aliases
      ADD CONSTRAINT entity_aliases_highlight_mode_check
      CHECK (highlight_mode IN ('disabled', 'exact', 'case_sensitive_exact', 'search_only'));
  END IF;
END $$;

-- 3. Backfill highlight_mode from existing data
UPDATE solemd.entity_aliases SET highlight_mode = CASE
  WHEN NOT is_canonical THEN 'search_only'
  WHEN alias_text = upper(alias_text) AND length(alias_text) <= 6
    THEN 'case_sensitive_exact'
  ELSE 'exact'
END;

-- 4. Explicit ambiguity suppression for common-English canonical aliases
UPDATE solemd.entity_aliases SET highlight_mode = 'disabled'
WHERE is_canonical = true
  AND alias_key IN (
    'text', 'set', 'map', 'here', 'rest', 'fast', 'can', 'and',
    'for', 'not', 'has', 'had', 'was', 'all', 'may', 'use',
    'act', 'key', 'lead', 'case', 'cell', 'part', 'role',
    'gene', 'test', 'risk', 'rate', 'loss', 'form', 'type',
    'name', 'time', 'data', 'well'
  );

-- 5. Replacement indexes (CONCURRENTLY for production safety)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_aliases_alias_key_highlight
    ON solemd.entity_aliases (alias_key)
    WHERE highlight_mode IN ('exact', 'case_sensitive_exact');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_aliases_alias_key_type_highlight
    ON solemd.entity_aliases (alias_key, entity_type)
    WHERE highlight_mode IN ('exact', 'case_sensitive_exact');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_aliases_alias_key_all
    ON solemd.entity_aliases (alias_key);

-- 6. Drop superseded indexes
DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_entity_aliases_alias_key;
DROP INDEX CONCURRENTLY IF EXISTS solemd.idx_entity_aliases_alias_key_entity_type;
