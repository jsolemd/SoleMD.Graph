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

RESET ROLE;
