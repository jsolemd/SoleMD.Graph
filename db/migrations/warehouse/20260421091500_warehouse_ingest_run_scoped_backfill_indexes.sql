SET ROLE engine_warehouse_admin;

CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_last_seen_run
    ON solemd.s2_papers_raw (last_seen_run_id, source_release_id, paper_id)
    WHERE last_seen_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_stage_last_seen_run
    ON pubtator.entity_annotations_stage (
        last_seen_run_id,
        source_release_id,
        resource,
        pmid
    )
    WHERE last_seen_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pubtator_relations_stage_last_seen_run
    ON pubtator.relations_stage (
        last_seen_run_id,
        source_release_id,
        relation_source,
        pmid
    )
    WHERE last_seen_run_id IS NOT NULL;

RESET ROLE;
