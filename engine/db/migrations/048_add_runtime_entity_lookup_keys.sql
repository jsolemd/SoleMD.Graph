-- Migration 048: Persist canonical runtime lookup keys for paper_entity_mentions
--
-- Why:
--   1. Runtime entity search currently recomputes normalized entity type,
--      namespace, and concept-id keys inside every retrieval query.
--   2. The live indexes are on raw mention columns, which do not match the
--      runtime join contract exactly.
--   3. Persisting the canonical keys keeps warehouse writes and runtime reads
--      on one normalized contract.

BEGIN;

ALTER TABLE solemd.paper_entity_mentions
    ADD COLUMN IF NOT EXISTS runtime_entity_type_key TEXT GENERATED ALWAYS AS (
        CASE
            WHEN lower(COALESCE(entity_type, '')) IN ('dnamutation', 'proteinmutation', 'snp', 'mutation')
                THEN 'mutation'
            WHEN lower(COALESCE(entity_type, '')) = 'cellline'
                THEN 'cellline'
            ELSE lower(COALESCE(entity_type, ''))
        END
    ) STORED,
    ADD COLUMN IF NOT EXISTS runtime_concept_namespace_key TEXT GENERATED ALWAYS AS (
        NULLIF(lower(COALESCE(concept_namespace, '')), '')
    ) STORED,
    ADD COLUMN IF NOT EXISTS runtime_concept_id_key TEXT GENERATED ALWAYS AS (
        CASE
            WHEN upper(COALESCE(concept_id, '')) LIKE 'MESH:%'
                THEN split_part(COALESCE(concept_id, ''), ':', 2)
            ELSE COALESCE(concept_id, '')
        END
    ) STORED;

COMMENT ON COLUMN solemd.paper_entity_mentions.runtime_entity_type_key IS
    'Canonical runtime entity-type key for exact biomedical entity retrieval.';
COMMENT ON COLUMN solemd.paper_entity_mentions.runtime_concept_namespace_key IS
    'Canonical runtime concept namespace key for exact biomedical entity retrieval.';
COMMENT ON COLUMN solemd.paper_entity_mentions.runtime_concept_id_key IS
    'Canonical runtime concept identifier key for exact biomedical entity retrieval.';

DROP INDEX IF EXISTS solemd.idx_paper_entity_mentions_concept;
DROP INDEX IF EXISTS solemd.idx_paper_entity_mentions_runtime_type_concept;

CREATE INDEX IF NOT EXISTS idx_paper_entity_mentions_runtime_namespace_concept
    ON solemd.paper_entity_mentions (
        runtime_concept_namespace_key,
        runtime_concept_id_key,
        corpus_id
    )
    WHERE runtime_concept_namespace_key IS NOT NULL
      AND runtime_concept_id_key <> '';

CREATE INDEX IF NOT EXISTS idx_paper_entity_mentions_runtime_type_concept
    ON solemd.paper_entity_mentions (
        runtime_entity_type_key,
        runtime_concept_id_key,
        corpus_id
    )
    WHERE runtime_concept_namespace_key IS NULL
      AND runtime_concept_id_key <> '';

COMMENT ON INDEX solemd.idx_paper_entity_mentions_runtime_namespace_concept IS
    'Runtime RAG entity retrieval index keyed by canonical namespace + concept id + corpus.';
COMMENT ON INDEX solemd.idx_paper_entity_mentions_runtime_type_concept IS
    'Runtime RAG entity retrieval index keyed by canonical type + concept id + corpus when namespace is absent.';

ANALYZE solemd.paper_entity_mentions;

COMMIT;
