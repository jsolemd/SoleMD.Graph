-- Migration 031: Create derived RAG serving tables for chunk versions and chunks
--
-- Purpose:
--   1. Add the derived chunk-serving tables after canonical spans and mentions exist
--   2. Keep chunk policy explicit through paper_chunk_versions
--   3. Preserve exact lineage from chunk rows back to canonical block/sentence members
--
-- Notes:
--   - This migration does not backfill any chunk rows.
--   - The first default chunk-version seed and any chunk backfill remain separate
--     operational steps behind the explicit chunk-runtime cutover.
--   - Heavier lexical fallback indexes remain deferred to the post-load phase.
--
-- Run from project root:
--   docker exec solemd-graph-db psql -U solemd -d solemd_graph \
--     -f /workspace/engine/db/migrations/031_rag_derived_serving.sql

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.paper_chunk_versions (
    chunk_version_key           TEXT PRIMARY KEY,
    source_revision_keys        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    parser_version              TEXT NOT NULL,
    text_normalization_version  TEXT NOT NULL,
    sentence_source_policy      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    included_section_roles      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    included_block_kinds        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    caption_merge_policy        TEXT NOT NULL,
    tokenizer_name              TEXT NOT NULL,
    tokenizer_version           TEXT,
    target_token_budget         BIGINT NOT NULL,
    hard_max_tokens             BIGINT NOT NULL,
    sentence_overlap_policy     TEXT NOT NULL,
    embedding_model             TEXT,
    lexical_normalization_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    retrieval_default_only      BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solemd.paper_chunks (
    chunk_version_key           TEXT NOT NULL
        REFERENCES solemd.paper_chunk_versions (chunk_version_key) ON DELETE CASCADE,
    corpus_id                   BIGINT NOT NULL
        REFERENCES solemd.paper_documents (corpus_id) ON DELETE CASCADE,
    chunk_ordinal               INTEGER NOT NULL,
    canonical_section_ordinal   INTEGER NOT NULL,
    section_role                TEXT NOT NULL,
    primary_block_kind          TEXT NOT NULL,
    text                        TEXT NOT NULL,
    token_count_estimate        BIGINT NOT NULL,
    is_retrieval_default        BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chunk_version_key, corpus_id, chunk_ordinal),
    CONSTRAINT fk_paper_chunks_section
        FOREIGN KEY (corpus_id, canonical_section_ordinal)
        REFERENCES solemd.paper_sections (corpus_id, section_ordinal)
        ON DELETE CASCADE
) PARTITION BY HASH (corpus_id);

DO $$
DECLARE
    remainder INTEGER;
BEGIN
    FOR remainder IN 0..15 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS solemd.paper_chunks_p%1$s PARTITION OF solemd.paper_chunks FOR VALUES WITH (MODULUS 16, REMAINDER %2$s)',
            lpad(remainder::text, 2, '0'),
            remainder
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_paper_chunks_lookup
    ON solemd.paper_chunks (chunk_version_key, corpus_id);

CREATE TABLE IF NOT EXISTS solemd.paper_chunk_members (
    chunk_version_key           TEXT NOT NULL,
    corpus_id                   BIGINT NOT NULL,
    chunk_ordinal               INTEGER NOT NULL,
    member_ordinal              INTEGER NOT NULL,
    member_kind                 TEXT NOT NULL,
    canonical_block_ordinal     INTEGER NOT NULL,
    canonical_sentence_ordinal  INTEGER,
    is_overlap_member           BOOLEAN NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chunk_version_key, corpus_id, chunk_ordinal, member_ordinal),
    CONSTRAINT fk_paper_chunk_members_chunk
        FOREIGN KEY (chunk_version_key, corpus_id, chunk_ordinal)
        REFERENCES solemd.paper_chunks (chunk_version_key, corpus_id, chunk_ordinal)
        ON DELETE CASCADE,
    CONSTRAINT fk_paper_chunk_members_block
        FOREIGN KEY (corpus_id, canonical_block_ordinal)
        REFERENCES solemd.paper_blocks (corpus_id, block_ordinal)
        ON DELETE CASCADE,
    CONSTRAINT fk_paper_chunk_members_sentence
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
            'CREATE TABLE IF NOT EXISTS solemd.paper_chunk_members_p%1$s PARTITION OF solemd.paper_chunk_members FOR VALUES WITH (MODULUS 16, REMAINDER %2$s)',
            lpad(remainder::text, 2, '0'),
            remainder
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_paper_chunk_members_block
    ON solemd.paper_chunk_members (corpus_id, canonical_block_ordinal);

CREATE INDEX IF NOT EXISTS idx_paper_chunk_members_sentence
    ON solemd.paper_chunk_members (
        corpus_id,
        canonical_block_ordinal,
        canonical_sentence_ordinal
    )
    WHERE canonical_sentence_ordinal IS NOT NULL;

COMMENT ON TABLE solemd.paper_chunk_versions IS
    'Versioned derived serving policy rows for chunk-backed retrieval.';

COMMENT ON TABLE solemd.paper_chunks IS
    'Derived retrieval chunks assembled from canonical block and sentence members.';

COMMENT ON TABLE solemd.paper_chunk_members IS
    'Explicit chunk lineage back to canonical blocks and sentences.';

COMMIT;
