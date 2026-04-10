DELETE FROM solemd.entities
WHERE concept_id = '-';

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
