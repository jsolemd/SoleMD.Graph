SET ROLE engine_warehouse_admin;

ALTER TABLE pubtator.entity_annotations_stage
    DROP CONSTRAINT IF EXISTS entity_annotations_stage_pkey;

ALTER TABLE pubtator.entity_annotations_stage
    ADD PRIMARY KEY (
        source_release_id,
        pmid,
        start_offset,
        end_offset,
        entity_type,
        concept_id_raw,
        resource
    );

ALTER TABLE pubtator.entity_annotations
    DROP CONSTRAINT IF EXISTS entity_annotations_pkey;

ALTER TABLE pubtator.entity_annotations
    ADD PRIMARY KEY (
        corpus_id,
        start_offset,
        end_offset,
        entity_type,
        concept_id_raw,
        resource
    );

RESET ROLE;
