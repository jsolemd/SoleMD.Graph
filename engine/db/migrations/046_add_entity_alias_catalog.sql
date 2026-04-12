CREATE TABLE IF NOT EXISTS solemd.entity_aliases (
    concept_id    TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    alias_text    TEXT NOT NULL,
    alias_key     TEXT NOT NULL,
    is_canonical  BOOLEAN NOT NULL DEFAULT false,
    alias_source  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, concept_id, alias_key)
);

COMMENT ON TABLE solemd.entity_aliases IS
    'Warehouse-backed entity alias catalog for detail lookup and broader entity search, derived from solemd.entities canonical names and synonyms.';

COMMENT ON COLUMN solemd.entity_aliases.alias_key IS
    'Lowercased normalized alias key used for exact runtime lookup.';

COMMENT ON COLUMN solemd.entity_aliases.alias_source IS
    'Source surface for the alias row: canonical_name or synonym.';

CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias_key
    ON solemd.entity_aliases (alias_key);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias_key_entity_type
    ON solemd.entity_aliases (alias_key, entity_type);

TRUNCATE TABLE solemd.entity_aliases;

WITH alias_candidates AS (
    SELECT
        e.concept_id,
        e.entity_type,
        regexp_replace(trim(e.canonical_name), '\s+', ' ', 'g') AS alias_text,
        lower(regexp_replace(trim(e.canonical_name), '\s+', ' ', 'g')) AS alias_key,
        TRUE AS is_canonical,
        'canonical_name'::TEXT AS alias_source
    FROM solemd.entities e
    WHERE e.concept_id != '-'
      AND NULLIF(trim(e.canonical_name), '') IS NOT NULL
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        regexp_replace(trim(synonym), '\s+', ' ', 'g') AS alias_text,
        lower(regexp_replace(trim(synonym), '\s+', ' ', 'g')) AS alias_key,
        FALSE AS is_canonical,
        'synonym'::TEXT AS alias_source
    FROM solemd.entities e
    CROSS JOIN LATERAL unnest(COALESCE(e.synonyms, ARRAY[]::TEXT[])) AS synonym
    WHERE e.concept_id != '-'
      AND NULLIF(trim(synonym), '') IS NOT NULL
),
ranked_aliases AS (
    SELECT
        concept_id,
        entity_type,
        alias_text,
        alias_key,
        is_canonical,
        alias_source,
        ROW_NUMBER() OVER (
            PARTITION BY concept_id, entity_type, alias_key
            ORDER BY is_canonical DESC, alias_text
        ) AS alias_rank
    FROM alias_candidates
)
INSERT INTO solemd.entity_aliases (
    concept_id,
    entity_type,
    alias_text,
    alias_key,
    is_canonical,
    alias_source
)
SELECT
    concept_id,
    entity_type,
    alias_text,
    alias_key,
    is_canonical,
    alias_source
FROM ranked_aliases
WHERE alias_rank = 1;

DROP INDEX IF EXISTS solemd.idx_paper_entity_mentions_text_lower;
