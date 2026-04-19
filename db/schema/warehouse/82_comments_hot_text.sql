SET ROLE engine_warehouse_admin;

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

RESET ROLE;
