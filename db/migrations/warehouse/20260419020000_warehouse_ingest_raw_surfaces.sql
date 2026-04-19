SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.venues
    ADD COLUMN IF NOT EXISTS source_venue_id TEXT;

ALTER TABLE solemd.authors
    ADD COLUMN IF NOT EXISTS source_author_id TEXT;

ALTER TABLE solemd.s2_papers_raw
    ADD COLUMN IF NOT EXISTS source_venue_id TEXT,
    ADD COLUMN IF NOT EXISTS tldr TEXT,
    ADD COLUMN IF NOT EXISTS is_open_access BOOLEAN;

ALTER TABLE solemd.s2_papers_raw ALTER COLUMN tldr SET COMPRESSION lz4;

CREATE TABLE IF NOT EXISTS pubtator.entity_annotations_stage (
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    pmid INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    entity_type SMALLINT NOT NULL,
    mention_text TEXT NOT NULL,
    concept_id_raw TEXT NOT NULL,
    resource SMALLINT NOT NULL,
    corpus_id BIGINT
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE SET NULL,
    last_seen_run_id UUID
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE SET NULL,
    PRIMARY KEY (
        source_release_id,
        pmid,
        start_offset,
        end_offset,
        concept_id_raw,
        resource
    ),
    CONSTRAINT ck_pubtator_entity_annotations_stage_entity_type
        CHECK (entity_type BETWEEN 1 AND 6),
    CONSTRAINT ck_pubtator_entity_annotations_stage_resource
        CHECK (resource BETWEEN 1 AND 2),
    CONSTRAINT ck_pubtator_entity_annotations_stage_offset_span
        CHECK (end_offset >= start_offset)
);
ALTER TABLE pubtator.entity_annotations_stage SET (fillfactor = 100);
ALTER TABLE pubtator.entity_annotations_stage ALTER COLUMN mention_text SET COMPRESSION lz4;

CREATE TABLE IF NOT EXISTS pubtator.entity_annotations (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    pmid INTEGER,
    entity_type SMALLINT NOT NULL,
    mention_text TEXT NOT NULL,
    concept_id_raw TEXT NOT NULL,
    resource SMALLINT NOT NULL,
    PRIMARY KEY (corpus_id, start_offset, end_offset, concept_id_raw),
    CONSTRAINT ck_pubtator_entity_annotations_entity_type
        CHECK (entity_type BETWEEN 1 AND 6),
    CONSTRAINT ck_pubtator_entity_annotations_resource
        CHECK (resource BETWEEN 1 AND 2),
    CONSTRAINT ck_pubtator_entity_annotations_offset_span
        CHECK (end_offset >= start_offset)
) PARTITION BY HASH (corpus_id);
ALTER TABLE pubtator.entity_annotations ALTER COLUMN mention_text SET COMPRESSION lz4;

DO $$
DECLARE
    partition_idx INTEGER;
    partition_suffix TEXT;
BEGIN
    FOR partition_idx IN 0..31 LOOP
        partition_suffix := lpad(partition_idx::TEXT, 2, '0');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS pubtator.entity_annotations_p%s PARTITION OF pubtator.entity_annotations FOR VALUES WITH (modulus 32, remainder %s)',
            partition_suffix,
            partition_idx
        );
        EXECUTE format(
            'ALTER TABLE pubtator.entity_annotations_p%s SET (fillfactor = 100)',
            partition_suffix
        );
    END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS pubtator.relations_stage (
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    pmid INTEGER NOT NULL,
    relation_type SMALLINT NOT NULL,
    subject_entity_id TEXT NOT NULL,
    object_entity_id TEXT NOT NULL,
    subject_type SMALLINT NOT NULL,
    object_type SMALLINT NOT NULL,
    relation_source SMALLINT NOT NULL,
    corpus_id BIGINT
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE SET NULL,
    last_seen_run_id UUID
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE SET NULL,
    PRIMARY KEY (
        source_release_id,
        pmid,
        subject_entity_id,
        relation_type,
        object_entity_id,
        relation_source
    ),
    CONSTRAINT ck_pubtator_relations_stage_relation_type
        CHECK (relation_type BETWEEN 1 AND 12),
    CONSTRAINT ck_pubtator_relations_stage_subject_type
        CHECK (subject_type BETWEEN 1 AND 6),
    CONSTRAINT ck_pubtator_relations_stage_object_type
        CHECK (object_type BETWEEN 1 AND 6),
    CONSTRAINT ck_pubtator_relations_stage_relation_source
        CHECK (relation_source BETWEEN 1 AND 2)
);
ALTER TABLE pubtator.relations_stage SET (fillfactor = 100);

CREATE TABLE IF NOT EXISTS pubtator.relations (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    pmid INTEGER,
    relation_type SMALLINT NOT NULL,
    subject_entity_id TEXT NOT NULL,
    object_entity_id TEXT NOT NULL,
    subject_type SMALLINT NOT NULL,
    object_type SMALLINT NOT NULL,
    relation_source SMALLINT NOT NULL,
    PRIMARY KEY (corpus_id, subject_entity_id, relation_type, object_entity_id),
    CONSTRAINT ck_pubtator_relations_relation_type
        CHECK (relation_type BETWEEN 1 AND 12),
    CONSTRAINT ck_pubtator_relations_subject_type
        CHECK (subject_type BETWEEN 1 AND 6),
    CONSTRAINT ck_pubtator_relations_object_type
        CHECK (object_type BETWEEN 1 AND 6),
    CONSTRAINT ck_pubtator_relations_relation_source
        CHECK (relation_source BETWEEN 1 AND 2)
) PARTITION BY HASH (corpus_id);

DO $$
DECLARE
    partition_idx INTEGER;
    partition_suffix TEXT;
BEGIN
    FOR partition_idx IN 0..31 LOOP
        partition_suffix := lpad(partition_idx::TEXT, 2, '0');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS pubtator.relations_p%s PARTITION OF pubtator.relations FOR VALUES WITH (modulus 32, remainder %s)',
            partition_suffix,
            partition_idx
        );
        EXECUTE format(
            'ALTER TABLE pubtator.relations_p%s SET (fillfactor = 100)',
            partition_suffix
        );
    END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_source_venue_id
    ON solemd.venues (source_venue_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_authors_source_author_id
    ON solemd.authors (source_author_id);

CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_source_venue_id
    ON solemd.s2_papers_raw (source_venue_id)
    WHERE source_venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_stage_release_pmid
    ON pubtator.entity_annotations_stage (source_release_id, pmid);
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_stage_corpus
    ON pubtator.entity_annotations_stage (corpus_id)
    WHERE corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_concept
    ON pubtator.entity_annotations (corpus_id, concept_id_raw);
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_pmid
    ON pubtator.entity_annotations (pmid, start_offset)
    WHERE pmid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pubtator_relations_stage_release_pmid
    ON pubtator.relations_stage (source_release_id, pmid);
CREATE INDEX IF NOT EXISTS idx_pubtator_relations_stage_corpus
    ON pubtator.relations_stage (corpus_id)
    WHERE corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pubtator_relations_reverse
    ON pubtator.relations (corpus_id, object_entity_id, relation_type, subject_entity_id);

COMMENT ON SCHEMA pubtator IS
    'Raw and canonical PubTator ingest schema for the warehouse refresh lane.';
COMMENT ON TABLE pubtator.entity_annotations_stage IS
    'Release-scoped PubTator entity staging rows before canonical corpus-id promotion.';
COMMENT ON TABLE pubtator.entity_annotations IS
    'Canonical PubTator entity annotations keyed to warehouse corpus ids.';
COMMENT ON TABLE pubtator.relations_stage IS
    'Release-scoped PubTator relation staging rows before canonical corpus-id promotion.';
COMMENT ON TABLE pubtator.relations IS
    'Canonical PubTator relation rows keyed to warehouse corpus ids.';
COMMENT ON COLUMN solemd.venues.source_venue_id IS
    'Stable upstream Semantic Scholar publication-venue identifier when present.';
COMMENT ON COLUMN solemd.authors.source_author_id IS
    'Stable upstream Semantic Scholar author identifier when present.';
COMMENT ON COLUMN pubtator.entity_annotations_stage.entity_type IS
    'PubTator entity-type code from db/schema/enum-codes.yaml.pubtator_entity_type.';
COMMENT ON COLUMN pubtator.entity_annotations_stage.resource IS
    'PubTator entity resource code from db/schema/enum-codes.yaml.pubtator_entity_resource.';
COMMENT ON COLUMN pubtator.entity_annotations.entity_type IS
    'PubTator entity-type code from db/schema/enum-codes.yaml.pubtator_entity_type.';
COMMENT ON COLUMN pubtator.entity_annotations.resource IS
    'PubTator entity resource code from db/schema/enum-codes.yaml.pubtator_entity_resource.';
COMMENT ON COLUMN pubtator.relations_stage.relation_type IS
    'PubTator relation-type code from db/schema/enum-codes.yaml.pubtator_relation_type.';
COMMENT ON COLUMN pubtator.relations_stage.relation_source IS
    'PubTator relation-source code from db/schema/enum-codes.yaml.pubtator_relation_source.';
COMMENT ON COLUMN pubtator.relations.relation_type IS
    'PubTator relation-type code from db/schema/enum-codes.yaml.pubtator_relation_type.';
COMMENT ON COLUMN pubtator.relations.relation_source IS
    'PubTator relation-source code from db/schema/enum-codes.yaml.pubtator_relation_source.';

GRANT UPDATE ON TABLE
    solemd.venues,
    solemd.authors,
    solemd.papers,
    solemd.paper_text,
    solemd.s2_papers_raw,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_references_raw,
    solemd.s2_paper_assets_raw
TO engine_ingest_write;

GRANT DELETE ON TABLE
    solemd.paper_authors,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_assets_raw,
    solemd.s2_paper_references_raw
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.venues,
    solemd.authors,
    solemd.papers,
    solemd.paper_text,
    solemd.paper_authors,
    solemd.s2_papers_raw,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_references_raw,
    solemd.s2_paper_assets_raw
TO engine_ingest_write;

GRANT UPDATE ON TABLE
    solemd.paper_documents,
    solemd.paper_sections,
    solemd.paper_blocks,
    solemd.paper_sentences
TO engine_ingest_write;

GRANT DELETE ON TABLE
    solemd.paper_documents,
    solemd.paper_sections,
    solemd.paper_blocks,
    solemd.paper_sentences
TO engine_ingest_write;

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE
    pubtator.entity_annotations_stage,
    pubtator.entity_annotations,
    pubtator.relations_stage,
    pubtator.relations
TO engine_ingest_write;

GRANT SELECT ON TABLE
    pubtator.entity_annotations,
    pubtator.relations
TO engine_warehouse_read;

RESET ROLE;
