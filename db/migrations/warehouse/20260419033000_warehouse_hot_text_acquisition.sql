SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.paper_documents
    DROP CONSTRAINT IF EXISTS ck_paper_documents_document_source_kind;

ALTER TABLE solemd.paper_documents
    ADD CONSTRAINT ck_paper_documents_document_source_kind
        CHECK (document_source_kind BETWEEN 1 AND 4);

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
        CHECK (status BETWEEN 1 AND 4),
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

CREATE INDEX IF NOT EXISTS idx_paper_text_acquisition_runs_corpus_recent
    ON solemd.paper_text_acquisition_runs (corpus_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_paper_text_acquisition_runs_status_recent
    ON solemd.paper_text_acquisition_runs (status, started_at DESC);

COMMENT ON TABLE solemd.paper_text_acquisition_runs IS
    'Paper-level targeted full-text acquisition ledger for hot-path document refreshes.';

COMMENT ON COLUMN solemd.paper_text_acquisition_runs.status IS
    'Paper-text acquisition lifecycle code from db/schema/enum-codes.yaml.paper_text_acquisition_run_status.';
COMMENT ON COLUMN solemd.paper_text_acquisition_runs.locator_kind IS
    'External locator family used for the fetch attempt; PMCID is preferred, PMID is the fallback.';
COMMENT ON COLUMN solemd.paper_text_acquisition_runs.resolver_kind IS
    'How the fetch locator was chosen or resolved before the live PMC BioC request.';
COMMENT ON COLUMN solemd.paper_text_acquisition_runs.manifest_uri IS
    'Exact live endpoint URL used for the winning PMC BioC fetch attempt.';
COMMENT ON COLUMN solemd.paper_text_acquisition_runs.response_checksum IS
    'SHA-1 checksum of the fetched PMC BioC payload used for this run.';

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.paper_text_acquisition_runs
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.paper_text_acquisition_runs
TO engine_warehouse_read;

RESET ROLE;
