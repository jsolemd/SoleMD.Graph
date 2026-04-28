SET ROLE engine_warehouse_admin;

WITH duplicate_authors AS (
    SELECT
        normalized_name,
        min(author_id) AS retained_author_id,
        array_remove(array_agg(author_id ORDER BY author_id), min(author_id))
            AS duplicate_author_ids
    FROM solemd.authors
    WHERE source_author_id IS NULL
    GROUP BY normalized_name
    HAVING count(*) > 1
),
remapped AS (
    UPDATE solemd.paper_authors paper_authors
    SET author_id = duplicate_authors.retained_author_id
    FROM duplicate_authors
    WHERE paper_authors.author_id = ANY(duplicate_authors.duplicate_author_ids)
)
DELETE FROM solemd.authors authors
USING duplicate_authors
WHERE authors.author_id = ANY(duplicate_authors.duplicate_author_ids);

CREATE UNIQUE INDEX IF NOT EXISTS uq_authors_anonymous_normalized_name
    ON solemd.authors (normalized_name)
    WHERE source_author_id IS NULL;

COMMENT ON INDEX solemd.uq_authors_anonymous_normalized_name IS
    'Serializes anonymous S2 author fallback upserts during parallel mapped materialization.';

RESET ROLE;
