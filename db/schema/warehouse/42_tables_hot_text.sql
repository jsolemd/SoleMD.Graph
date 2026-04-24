SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.paper_text_acquisition_runs (
    paper_text_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    advisory_lock_key BIGINT,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    requested_by TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status SMALLINT NOT NULL DEFAULT 1,
    locator_kind TEXT,
    locator_value TEXT,
    resolved_pmc_id TEXT,
    resolver_kind TEXT,
    manifest_uri TEXT,
    response_checksum TEXT,
    error_message TEXT,
    CONSTRAINT ck_paper_text_acquisition_runs_status
        CHECK (status BETWEEN 1 AND 5),
    CONSTRAINT ck_paper_text_acquisition_runs_locator_kind
        CHECK (locator_kind IS NULL OR locator_kind IN ('pmcid', 'pmid')),
    CONSTRAINT ck_paper_text_acquisition_runs_resolver_kind
        CHECK (
            resolver_kind IS NULL
            OR resolver_kind IN (
                'paper_row_pmcid',
                'pmid_direct',
                'id_converter_pmid',
                'pubmed_esummary_pmid',
                'id_converter_doi'
            )
        )
);
ALTER TABLE solemd.paper_text_acquisition_runs SET (fillfactor = 80);

CREATE OR REPLACE VIEW solemd.paper_text_contract_audit AS
WITH active_documents AS (
    SELECT
        documents.corpus_id,
        documents.document_source_kind,
        documents.source_priority,
        documents.source_revision
    FROM solemd.paper_documents documents
    WHERE documents.is_active
),
section_stats AS (
    SELECT
        sections.corpus_id,
        count(*)::INTEGER AS section_count,
        count(*) FILTER (WHERE sections.section_role = 1)::INTEGER AS abstract_section_count
    FROM solemd.paper_sections sections
    GROUP BY sections.corpus_id
),
block_sentence_stats AS (
    SELECT
        blocks.corpus_id,
        count(*)::INTEGER AS block_count,
        count(*) FILTER (WHERE blocks.section_role = 1)::INTEGER AS abstract_block_count,
        count(*) FILTER (WHERE blocks.is_retrieval_default)::INTEGER AS retrieval_default_block_count,
        count(*) FILTER (
            WHERE sentence_rollup.block_ordinal IS NULL
        )::INTEGER AS blocks_without_sentences_count
    FROM solemd.paper_blocks blocks
    LEFT JOIN (
        SELECT DISTINCT
            sentences.corpus_id,
            sentences.block_ordinal
        FROM solemd.paper_sentences sentences
    ) AS sentence_rollup
      ON sentence_rollup.corpus_id = blocks.corpus_id
     AND sentence_rollup.block_ordinal = blocks.block_ordinal
    GROUP BY blocks.corpus_id
),
sentence_stats AS (
    SELECT
        sentences.corpus_id,
        count(*)::INTEGER AS sentence_count
    FROM solemd.paper_sentences sentences
    GROUP BY sentences.corpus_id
)
SELECT
    paper_text.corpus_id,
    active_documents.corpus_id IS NOT NULL AS has_active_document,
    active_documents.document_source_kind,
    active_documents.source_priority,
    active_documents.source_revision,
    paper_text.text_availability,
    NULLIF(btrim(paper_text.abstract), '') IS NOT NULL AS stored_abstract_present,
    (
        COALESCE(section_stats.abstract_section_count, 0) > 0
        OR COALESCE(block_sentence_stats.abstract_block_count, 0) > 0
    ) AS parsed_abstract_present,
    COALESCE(section_stats.section_count, 0) AS section_count,
    COALESCE(block_sentence_stats.block_count, 0) AS block_count,
    COALESCE(sentence_stats.sentence_count, 0) AS sentence_count,
    COALESCE(block_sentence_stats.abstract_block_count, 0) AS abstract_block_count,
    COALESCE(block_sentence_stats.retrieval_default_block_count, 0) AS retrieval_default_block_count,
    COALESCE(block_sentence_stats.blocks_without_sentences_count, 0) AS blocks_without_sentences_count,
    (
        active_documents.corpus_id IS NOT NULL
        AND paper_text.text_availability < 2
    ) AS active_document_text_availability_mismatch,
    (
        (
            COALESCE(section_stats.abstract_section_count, 0) > 0
            OR COALESCE(block_sentence_stats.abstract_block_count, 0) > 0
        )
        AND NULLIF(btrim(paper_text.abstract), '') IS NULL
    ) AS parsed_abstract_storage_mismatch
FROM solemd.paper_text
LEFT JOIN active_documents
  ON active_documents.corpus_id = paper_text.corpus_id
LEFT JOIN section_stats
  ON section_stats.corpus_id = paper_text.corpus_id
LEFT JOIN block_sentence_stats
  ON block_sentence_stats.corpus_id = paper_text.corpus_id
LEFT JOIN sentence_stats
  ON sentence_stats.corpus_id = paper_text.corpus_id;

RESET ROLE;
