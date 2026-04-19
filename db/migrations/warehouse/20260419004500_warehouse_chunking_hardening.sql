SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.paper_blocks ALTER COLUMN text SET COMPRESSION lz4;
ALTER TABLE solemd.paper_sentences ALTER COLUMN text SET COMPRESSION lz4;
ALTER TABLE solemd.paper_chunks ALTER COLUMN text SET COMPRESSION lz4;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_documents'::regclass
          AND conname = 'ck_paper_documents_document_source_kind'
    ) THEN
        ALTER TABLE solemd.paper_documents
            ADD CONSTRAINT ck_paper_documents_document_source_kind
            CHECK (document_source_kind BETWEEN 1 AND 3);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_sections'::regclass
          AND conname = 'ck_paper_sections_section_role'
    ) THEN
        ALTER TABLE solemd.paper_sections
            ADD CONSTRAINT ck_paper_sections_section_role
            CHECK (section_role BETWEEN 0 AND 8);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_blocks'::regclass
          AND conname = 'ck_paper_blocks_block_kind'
    ) THEN
        ALTER TABLE solemd.paper_blocks
            ADD CONSTRAINT ck_paper_blocks_block_kind
            CHECK (block_kind BETWEEN 1 AND 7);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_blocks'::regclass
          AND conname = 'ck_paper_blocks_section_role'
    ) THEN
        ALTER TABLE solemd.paper_blocks
            ADD CONSTRAINT ck_paper_blocks_section_role
            CHECK (section_role BETWEEN 0 AND 8);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_sentences'::regclass
          AND conname = 'ck_paper_sentences_segmentation_source'
    ) THEN
        ALTER TABLE solemd.paper_sentences
            ADD CONSTRAINT ck_paper_sentences_segmentation_source
            CHECK (segmentation_source BETWEEN 1 AND 4);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_evidence_units'::regclass
          AND conname = 'ck_paper_evidence_units_evidence_kind'
    ) THEN
        ALTER TABLE solemd.paper_evidence_units
            ADD CONSTRAINT ck_paper_evidence_units_evidence_kind
            CHECK (evidence_kind BETWEEN 1 AND 4);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_evidence_units'::regclass
          AND conname = 'ck_paper_evidence_units_section_role'
    ) THEN
        ALTER TABLE solemd.paper_evidence_units
            ADD CONSTRAINT ck_paper_evidence_units_section_role
            CHECK (section_role BETWEEN 0 AND 8);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.paper_evidence_units'::regclass
          AND conname = 'ck_paper_evidence_units_sentence_span'
    ) THEN
        ALTER TABLE solemd.paper_evidence_units
            ADD CONSTRAINT ck_paper_evidence_units_sentence_span
            CHECK (sentence_end_ordinal >= sentence_start_ordinal);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'solemd.chunk_assembly_errors'::regclass
          AND conname = 'ck_chunk_assembly_errors_retry_count'
    ) THEN
        ALTER TABLE solemd.chunk_assembly_errors
            ADD CONSTRAINT ck_chunk_assembly_errors_retry_count
            CHECK (retry_count BETWEEN 0 AND 32);
    END IF;
END
$$;

RESET ROLE;
