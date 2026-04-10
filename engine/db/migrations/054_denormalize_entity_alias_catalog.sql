-- Denormalize canonical_name and paper_count into entity_aliases
-- so the hot match path is a single-table scan with no JOIN.
--
-- After this migration, the alias rebuild path in engine/app/corpus/entities.py
-- also populates these columns. This migration is required once for existing
-- environments; fresh databases get them via the updated rebuild SQL.

ALTER TABLE solemd.entity_aliases
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS paper_count INTEGER;

UPDATE solemd.entity_aliases ea
SET
  canonical_name = COALESCE(NULLIF(trim(e.canonical_name), ''), ea.alias_text),
  paper_count = COALESCE(e.paper_count, 0)
FROM solemd.entities e
WHERE e.concept_id = ea.concept_id
  AND e.entity_type = ea.entity_type;

ALTER TABLE solemd.entity_aliases
  ALTER COLUMN canonical_name SET NOT NULL,
  ALTER COLUMN paper_count SET NOT NULL,
  ALTER COLUMN paper_count SET DEFAULT 0;
