-- Migration 029: Create canonical RAG span and aligned-mention tables
--
-- Purpose:
--   1. Add the canonical block/sentence span spine for warehouse-backed RAG
--   2. Add aligned citation/entity mention tables keyed to that canonical spine
--   3. Keep heavy span-bearing tables hash-partitioned by corpus_id from day one
--
-- Notes:
--   - paper_references remains the current physical bibliography substrate.
--   - chunk tables are intentionally deferred until chunk policy and writer
--     behavior are stable.
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/029_rag_canonical_spans_and_mentions.sql

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.paper_blocks (
    corpus_id                   BIGINT NOT NULL,
    block_ordinal               INTEGER NOT NULL,
    section_ordinal             INTEGER NOT NULL,
    section_role                TEXT NOT NULL,
    block_kind                  TEXT NOT NULL,
    text                        TEXT NOT NULL,
    is_retrieval_default        BOOLEAN NOT NULL DEFAULT true,
    linked_asset_ref            TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_id, block_ordinal),
    CONSTRAINT fk_paper_blocks_section
        FOREIGN KEY (corpus_id, section_ordinal)
        REFERENCES solemd.paper_sections (corpus_id, section_ordinal)
        ON DELETE CASCADE
) PARTITION BY HASH (corpus_id);

DO $$
DECLARE
    remainder INTEGER;
BEGIN
    FOR remainder IN 0..15 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_blocks_p%1$s PARTITION OF solemd.paper_blocks FOR VALUES WITH (MODULUS 16, REMAINDER %2$s)',
            lpad(remainder::text, 2, '0'),
            remainder
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_paper_blocks_section
    ON solemd.paper_blocks (corpus_id, section_ordinal, block_ordinal);

CREATE INDEX IF NOT EXISTS idx_paper_blocks_retrieval_default
    ON solemd.paper_blocks (corpus_id, section_role, block_kind)
    WHERE is_retrieval_default;

CREATE TABLE IF NOT EXISTS solemd.paper_sentences (
    corpus_id                   BIGINT NOT NULL,
    block_ordinal               INTEGER NOT NULL,
    sentence_ordinal            INTEGER NOT NULL,
    section_ordinal             INTEGER NOT NULL,
    segmentation_source         TEXT NOT NULL,
    text                        TEXT NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_id, block_ordinal, sentence_ordinal),
    CONSTRAINT fk_paper_sentences_block
        FOREIGN KEY (corpus_id, block_ordinal)
        REFERENCES solemd.paper_blocks (corpus_id, block_ordinal)
        ON DELETE CASCADE
) PARTITION BY HASH (corpus_id);

DO $$
DECLARE
    remainder INTEGER;
BEGIN
    FOR remainder IN 0..15 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_sentences_p%1$s PARTITION OF solemd.paper_sentences FOR VALUES WITH (MODULUS 16, REMAINDER %2$s)',
            lpad(remainder::text, 2, '0'),
            remainder
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_paper_sentences_block
    ON solemd.paper_sentences (corpus_id, block_ordinal, sentence_ordinal);

CREATE TABLE IF NOT EXISTS solemd.paper_citation_mentions (
    corpus_id                   BIGINT NOT NULL,
    source_system               TEXT NOT NULL,
    source_revision             TEXT NOT NULL,
    source_document_key         TEXT NOT NULL,
    source_plane                TEXT NOT NULL,
    parser_version              TEXT NOT NULL,
    raw_attrs_json              JSONB NOT NULL DEFAULT '{}'::jsonb,
    span_origin                 TEXT NOT NULL,
    alignment_status            TEXT NOT NULL,
    alignment_confidence        REAL,
    source_start_offset         INTEGER NOT NULL,
    source_end_offset           INTEGER NOT NULL,
    text                        TEXT NOT NULL,
    canonical_section_ordinal   INTEGER,
    canonical_block_ordinal     INTEGER,
    canonical_sentence_ordinal  INTEGER,
    source_citation_key         TEXT NOT NULL,
    source_reference_key        TEXT,
    matched_paper_id            TEXT,
    matched_corpus_id           BIGINT REFERENCES solemd.corpus (corpus_id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        corpus_id,
        source_system,
        source_revision,
        source_citation_key,
        source_start_offset
    ),
    CONSTRAINT fk_paper_citation_mentions_block
        FOREIGN KEY (corpus_id, canonical_block_ordinal)
        REFERENCES solemd.paper_blocks (corpus_id, block_ordinal)
        ON DELETE CASCADE,
    CONSTRAINT fk_paper_citation_mentions_sentence
        FOREIGN KEY (corpus_id, canonical_block_ordinal, canonical_sentence_ordinal)
        REFERENCES solemd.paper_sentences (corpus_id, block_ordinal, sentence_ordinal)
        ON DELETE CASCADE
) PARTITION BY HASH (corpus_id);

DO $$
DECLARE
    remainder INTEGER;
BEGIN
    FOR remainder IN 0..15 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_citation_mentions_p%1$s PARTITION OF solemd.paper_citation_mentions FOR VALUES WITH (MODULUS 16, REMAINDER %2$s)',
            lpad(remainder::text, 2, '0'),
            remainder
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_paper_citation_mentions_canonical_span
    ON solemd.paper_citation_mentions (
        corpus_id,
        canonical_block_ordinal,
        canonical_sentence_ordinal
    )
    WHERE canonical_block_ordinal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paper_citation_mentions_source_key
    ON solemd.paper_citation_mentions (corpus_id, source_citation_key);

CREATE INDEX IF NOT EXISTS idx_paper_citation_mentions_matched_corpus
    ON solemd.paper_citation_mentions (matched_corpus_id)
    WHERE matched_corpus_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS solemd.paper_entity_mentions (
    corpus_id                   BIGINT NOT NULL,
    source_system               TEXT NOT NULL,
    source_revision             TEXT NOT NULL,
    source_document_key         TEXT NOT NULL,
    source_plane                TEXT NOT NULL,
    parser_version              TEXT NOT NULL,
    raw_attrs_json              JSONB NOT NULL DEFAULT '{}'::jsonb,
    span_origin                 TEXT NOT NULL,
    alignment_status            TEXT NOT NULL,
    alignment_confidence        REAL,
    source_start_offset         INTEGER NOT NULL,
    source_end_offset           INTEGER NOT NULL,
    text                        TEXT NOT NULL,
    canonical_section_ordinal   INTEGER,
    canonical_block_ordinal     INTEGER,
    canonical_sentence_ordinal  INTEGER,
    entity_type                 TEXT NOT NULL,
    source_identifier           TEXT,
    concept_namespace           TEXT,
    concept_id                  TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        corpus_id,
        source_system,
        source_revision,
        source_start_offset,
        source_end_offset
    ),
    CONSTRAINT fk_paper_entity_mentions_block
        FOREIGN KEY (corpus_id, canonical_block_ordinal)
        REFERENCES solemd.paper_blocks (corpus_id, block_ordinal)
        ON DELETE CASCADE,
    CONSTRAINT fk_paper_entity_mentions_sentence
        FOREIGN KEY (corpus_id, canonical_block_ordinal, canonical_sentence_ordinal)
        REFERENCES solemd.paper_sentences (corpus_id, block_ordinal, sentence_ordinal)
        ON DELETE CASCADE
) PARTITION BY HASH (corpus_id);

DO $$
DECLARE
    remainder INTEGER;
BEGIN
    FOR remainder IN 0..15 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_entity_mentions_p%1$s PARTITION OF solemd.paper_entity_mentions FOR VALUES WITH (MODULUS 16, REMAINDER %2$s)',
            lpad(remainder::text, 2, '0'),
            remainder
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_paper_entity_mentions_concept
    ON solemd.paper_entity_mentions (concept_namespace, concept_id, corpus_id)
    WHERE concept_namespace IS NOT NULL AND concept_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paper_entity_mentions_canonical_span
    ON solemd.paper_entity_mentions (
        corpus_id,
        canonical_block_ordinal,
        canonical_sentence_ordinal
    )
    WHERE canonical_block_ordinal IS NOT NULL;

COMMENT ON TABLE solemd.paper_blocks IS
    'Canonical block-level text spine for warehouse-backed RAG. Hash-partitioned by corpus_id for scale.';

COMMENT ON TABLE solemd.paper_sentences IS
    'Canonical sentence-level text spine derived inside canonical block boundaries.';

COMMENT ON TABLE solemd.paper_citation_mentions IS
    'Aligned in-text citation mentions with canonical block/sentence lineage when available.';

COMMENT ON TABLE solemd.paper_entity_mentions IS
    'Aligned entity mentions with canonical block/sentence lineage and normalized concept identifiers when available.';

COMMIT;
