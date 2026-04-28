SET ROLE engine_warehouse_admin;

ALTER TABLE pubtator.entity_annotations_stage
    DROP CONSTRAINT IF EXISTS entity_annotations_stage_pkey;

ALTER TABLE pubtator.entity_annotations
    DROP CONSTRAINT IF EXISTS entity_annotations_pkey;

ALTER TABLE pubtator.relations_stage
    DROP CONSTRAINT IF EXISTS relations_stage_pkey;

ALTER TABLE pubtator.relations
    DROP CONSTRAINT IF EXISTS relations_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pubtator_entity_annotations_stage_digest_key
    ON pubtator.entity_annotations_stage (
        source_release_id,
        pmid,
        start_offset,
        end_offset,
        entity_type,
        (digest(concept_id_raw, 'sha256')),
        resource
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_pubtator_entity_annotations_digest_key
    ON pubtator.entity_annotations (
        corpus_id,
        start_offset,
        end_offset,
        entity_type,
        (digest(concept_id_raw, 'sha256')),
        resource
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_pubtator_relations_stage_digest_key
    ON pubtator.relations_stage (
        source_release_id,
        pmid,
        (digest(subject_entity_id, 'sha256')),
        relation_type,
        (digest(object_entity_id, 'sha256')),
        relation_source
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_pubtator_relations_digest_key
    ON pubtator.relations (
        corpus_id,
        (digest(subject_entity_id, 'sha256')),
        relation_type,
        (digest(object_entity_id, 'sha256'))
    );

COMMENT ON INDEX pubtator.uq_pubtator_entity_annotations_stage_digest_key IS
    'Digest-backed natural key for PubTator stage entities; avoids btree tuple overflow from pathological source concept identifiers while preserving raw concept_id_raw text.';

COMMENT ON INDEX pubtator.uq_pubtator_entity_annotations_digest_key IS
    'Digest-backed natural key for mapped PubTator entities; avoids btree tuple overflow from pathological source concept identifiers while preserving raw concept_id_raw text.';

COMMENT ON INDEX pubtator.uq_pubtator_relations_stage_digest_key IS
    'Digest-backed natural key for PubTator stage relations; avoids btree tuple overflow from pathological source relation endpoint identifiers while preserving raw endpoint text.';

COMMENT ON INDEX pubtator.uq_pubtator_relations_digest_key IS
    'Digest-backed natural key for mapped PubTator relations; avoids btree tuple overflow from pathological source relation endpoint identifiers while preserving raw endpoint text.';

RESET ROLE;
