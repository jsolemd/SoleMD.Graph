BEGIN;

ALTER TABLE solemd.wiki_pages
  ADD COLUMN IF NOT EXISTS semantic_group TEXT;

COMMENT ON COLUMN solemd.wiki_pages.semantic_group IS
  'Canonical primary semantic group for wiki runtime coloring, derived from vocab_terms when available and falling back to entity_type when needed.';

WITH resolved_semantic_groups AS (
  SELECT
    wp.slug,
    COALESCE(
      (
        SELECT NULLIF(vt.semantic_groups[1], '')
        FROM solemd.vocab_terms vt
        WHERE (
          wp.concept_id = 'UMLS:' || vt.umls_cui
          OR wp.concept_id = 'MESH:' || vt.mesh_id
        )
        ORDER BY
          CASE
            WHEN wp.concept_id = 'UMLS:' || vt.umls_cui THEN 0
            WHEN wp.concept_id = 'MESH:' || vt.mesh_id THEN 1
            ELSE 2
          END,
          vt.updated_at DESC NULLS LAST,
          vt.created_at DESC NULLS LAST
        LIMIT 1
      ),
      CASE lower(COALESCE(wp.entity_type, ''))
        WHEN 'disease' THEN 'DISO'
        WHEN 'chemical' THEN 'CHEM'
        WHEN 'gene' THEN 'GENE'
        WHEN 'receptor' THEN 'GENE'
        WHEN 'anatomy' THEN 'ANAT'
        WHEN 'network' THEN 'PHYS'
        WHEN 'biological process' THEN 'PHYS'
        WHEN 'species' THEN 'LIVB'
        WHEN 'mutation' THEN 'GENE'
        WHEN 'dnamutation' THEN 'GENE'
        WHEN 'proteinmutation' THEN 'GENE'
        WHEN 'snp' THEN 'GENE'
        WHEN 'cellline' THEN 'ANAT'
        ELSE NULL
      END
    ) AS semantic_group
  FROM solemd.wiki_pages wp
)
UPDATE solemd.wiki_pages wp
SET semantic_group = resolved.semantic_group
FROM resolved_semantic_groups resolved
WHERE wp.slug = resolved.slug
  AND wp.semantic_group IS DISTINCT FROM resolved.semantic_group;

ANALYZE solemd.wiki_pages;

COMMIT;
