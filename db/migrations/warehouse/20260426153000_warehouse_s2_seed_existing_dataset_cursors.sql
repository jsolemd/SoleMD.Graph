SET ROLE engine_warehouse_admin;

WITH latest_loaded_s2 AS (
    SELECT sr.source_release_id,
           sr.source_release_key
    FROM solemd.source_releases sr
    WHERE sr.source_name = 's2'
      AND sr.release_status = 'loaded'
    ORDER BY sr.source_ingested_at DESC
    LIMIT 1
),
latest_published_run AS (
    SELECT ir.source_release_id,
           ir.families_loaded
    FROM solemd.ingest_runs ir
    JOIN latest_loaded_s2 latest
      ON latest.source_release_id = ir.source_release_id
    WHERE ir.status = 5
    ORDER BY ir.completed_at DESC NULLS LAST, ir.started_at DESC
    LIMIT 1
),
registry(dataset_name, family_name) AS (
    VALUES
        ('publication-venues', 'publication_venues'),
        ('authors', 'authors'),
        ('papers', 'papers'),
        ('abstracts', 'abstracts'),
        ('tldrs', 'tldrs'),
        ('embeddings-specter_v2', 'embeddings_specter_v2'),
        ('citations', 'citations'),
        ('s2orc_v2', 's2orc_v2')
)
INSERT INTO solemd.s2_dataset_cursors (
    dataset_name,
    family_name,
    base_release_key,
    current_release_key,
    current_source_release_id,
    cursor_status,
    diff_apply_enabled,
    hot_source_delete_safe_at,
    updated_at
)
SELECT registry.dataset_name,
       registry.family_name,
       latest.source_release_key,
       latest.source_release_key,
       latest.source_release_id,
       'base_loaded',
       false,
       NULL,
       now()
FROM latest_loaded_s2 latest
JOIN latest_published_run run
  ON run.source_release_id = latest.source_release_id
JOIN registry
  ON registry.family_name = ANY(run.families_loaded)
ON CONFLICT (dataset_name)
DO NOTHING;

RESET ROLE;
