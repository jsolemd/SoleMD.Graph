SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.paper_documents (
    corpus_id BIGINT PRIMARY KEY
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    document_source_kind SMALLINT NOT NULL,
    source_priority SMALLINT NOT NULL,
    source_revision TEXT,
    text_hash BYTEA,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT ck_paper_documents_document_source_kind
        CHECK (document_source_kind BETWEEN 1 AND 3)
);
ALTER TABLE solemd.paper_documents SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.paper_sections (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    section_ordinal INTEGER NOT NULL,
    parent_section_ordinal INTEGER,
    section_role SMALLINT NOT NULL DEFAULT 0,
    numbering_token TEXT,
    display_label TEXT,
    PRIMARY KEY (corpus_id, section_ordinal),
    CONSTRAINT ck_paper_sections_section_role
        CHECK (section_role BETWEEN 0 AND 8)
);
ALTER TABLE solemd.paper_sections SET (fillfactor = 100);

CREATE TABLE IF NOT EXISTS solemd.paper_blocks (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    block_ordinal INTEGER NOT NULL,
    section_ordinal INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    block_kind SMALLINT NOT NULL,
    section_role SMALLINT NOT NULL DEFAULT 0,
    is_retrieval_default BOOLEAN NOT NULL DEFAULT true,
    linked_asset_ref TEXT,
    text TEXT NOT NULL,
    PRIMARY KEY (corpus_id, block_ordinal),
    CONSTRAINT ck_paper_blocks_block_kind
        CHECK (block_kind BETWEEN 1 AND 7),
    CONSTRAINT ck_paper_blocks_section_role
        CHECK (section_role BETWEEN 0 AND 8)
) PARTITION BY HASH (corpus_id);
ALTER TABLE solemd.paper_blocks ALTER COLUMN text SET COMPRESSION lz4;

DO $$
DECLARE
    partition_idx INTEGER;
    partition_suffix TEXT;
BEGIN
    FOR partition_idx IN 0..31 LOOP
        partition_suffix := lpad(partition_idx::TEXT, 2, '0');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_blocks_p%s PARTITION OF solemd.paper_blocks FOR VALUES WITH (modulus 32, remainder %s)',
            partition_suffix,
            partition_idx
        );
        EXECUTE format(
            'ALTER TABLE solemd.paper_blocks_p%s SET (fillfactor = 100)',
            partition_suffix
        );
    END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS solemd.paper_sentences (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    block_ordinal INTEGER NOT NULL,
    sentence_ordinal INTEGER NOT NULL,
    section_ordinal INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    segmentation_source SMALLINT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (corpus_id, block_ordinal, sentence_ordinal),
    CONSTRAINT ck_paper_sentences_segmentation_source
        CHECK (segmentation_source BETWEEN 1 AND 4)
) PARTITION BY HASH (corpus_id);
ALTER TABLE solemd.paper_sentences ALTER COLUMN text SET COMPRESSION lz4;

DO $$
DECLARE
    partition_idx INTEGER;
    partition_suffix TEXT;
BEGIN
    FOR partition_idx IN 0..31 LOOP
        partition_suffix := lpad(partition_idx::TEXT, 2, '0');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_sentences_p%s PARTITION OF solemd.paper_sentences FOR VALUES WITH (modulus 32, remainder %s)',
            partition_suffix,
            partition_idx
        );
        EXECUTE format(
            'ALTER TABLE solemd.paper_sentences_p%s SET (fillfactor = 100)',
            partition_suffix
        );
    END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS solemd.paper_chunks (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    chunk_id BIGINT NOT NULL,
    chunk_version_key UUID NOT NULL
        REFERENCES solemd.paper_chunk_versions (chunk_version_key)
        ON DELETE RESTRICT,
    start_block_ordinal INTEGER NOT NULL,
    end_block_ordinal INTEGER NOT NULL,
    start_sentence_ordinal INTEGER NOT NULL,
    end_sentence_ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (corpus_id, chunk_id)
) PARTITION BY HASH (corpus_id);
ALTER TABLE solemd.paper_chunks ALTER COLUMN text SET COMPRESSION lz4;

DO $$
DECLARE
    partition_idx INTEGER;
    partition_suffix TEXT;
BEGIN
    FOR partition_idx IN 0..31 LOOP
        partition_suffix := lpad(partition_idx::TEXT, 2, '0');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_chunks_p%s PARTITION OF solemd.paper_chunks FOR VALUES WITH (modulus 32, remainder %s)',
            partition_suffix,
            partition_idx
        );
        EXECUTE format(
            'ALTER TABLE solemd.paper_chunks_p%s SET (fillfactor = 100)',
            partition_suffix
        );
    END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS solemd.paper_chunk_members (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    chunk_id BIGINT NOT NULL,
    chunk_version_key UUID NOT NULL
        REFERENCES solemd.paper_chunk_versions (chunk_version_key)
        ON DELETE RESTRICT,
    member_ordinal SMALLINT NOT NULL,
    member_block_ordinal INTEGER NOT NULL,
    member_sentence_ordinal INTEGER NOT NULL,
    PRIMARY KEY (corpus_id, chunk_id, member_ordinal)
) PARTITION BY HASH (corpus_id);

DO $$
DECLARE
    partition_idx INTEGER;
    partition_suffix TEXT;
BEGIN
    FOR partition_idx IN 0..31 LOOP
        partition_suffix := lpad(partition_idx::TEXT, 2, '0');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_chunk_members_p%s PARTITION OF solemd.paper_chunk_members FOR VALUES WITH (modulus 32, remainder %s)',
            partition_suffix,
            partition_idx
        );
        EXECUTE format(
            'ALTER TABLE solemd.paper_chunk_members_p%s SET (fillfactor = 100)',
            partition_suffix
        );
    END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS solemd.paper_evidence_units (
    evidence_key UUID PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    chunk_version_key UUID NOT NULL
        REFERENCES solemd.paper_chunk_versions (chunk_version_key)
        ON DELETE RESTRICT,
    evidence_kind SMALLINT NOT NULL,
    section_ordinal INTEGER NOT NULL,
    block_ordinal INTEGER NOT NULL,
    sentence_start_ordinal INTEGER NOT NULL,
    sentence_end_ordinal INTEGER NOT NULL,
    section_role SMALLINT NOT NULL DEFAULT 0,
    derivation_revision SMALLINT NOT NULL DEFAULT 1,
    CONSTRAINT ck_paper_evidence_units_evidence_kind
        CHECK (evidence_kind BETWEEN 1 AND 4),
    CONSTRAINT ck_paper_evidence_units_section_role
        CHECK (section_role BETWEEN 0 AND 8),
    CONSTRAINT ck_paper_evidence_units_sentence_span
        CHECK (sentence_end_ordinal >= sentence_start_ordinal)
);
ALTER TABLE solemd.paper_evidence_units SET (fillfactor = 100);

CREATE TABLE IF NOT EXISTS solemd.chunk_runs (
    ingest_run_id UUID NOT NULL
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE CASCADE,
    chunk_version_key UUID NOT NULL
        REFERENCES solemd.paper_chunk_versions (chunk_version_key)
        ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status SMALLINT NOT NULL DEFAULT 1,
    PRIMARY KEY (ingest_run_id, chunk_version_key),
    CONSTRAINT ck_chunk_runs_status
        CHECK (status BETWEEN 1 AND 3)
);
ALTER TABLE solemd.chunk_runs SET (fillfactor = 80);

CREATE TABLE IF NOT EXISTS solemd.chunk_assembly_errors (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    chunk_version_key UUID NOT NULL
        REFERENCES solemd.paper_chunk_versions (chunk_version_key)
        ON DELETE RESTRICT,
    ingest_run_id UUID NOT NULL
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE CASCADE,
    first_failure_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retry_count SMALLINT NOT NULL DEFAULT 0,
    last_error_class TEXT,
    last_error_message TEXT,
    PRIMARY KEY (corpus_id, chunk_version_key),
    CONSTRAINT ck_chunk_assembly_errors_retry_count
        CHECK (retry_count BETWEEN 0 AND 32)
);
ALTER TABLE solemd.chunk_assembly_errors SET (fillfactor = 80);

RESET ROLE;
