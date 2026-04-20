SET ROLE engine_warehouse_admin;

COMMENT ON TABLE solemd.paper_text_acquisition_runs IS
    'Paper-level targeted full-text acquisition ledger for hot-path document refreshes.';
COMMENT ON VIEW solemd.paper_text_contract_audit IS
    'Read-only warehouse audit surface for evidence-text contract checks between active document spines and paper_text summary fields.';

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
COMMENT ON COLUMN solemd.paper_text_contract_audit.active_document_text_availability_mismatch IS
    'True when an active parsed document spine exists but paper_text.text_availability is still below full-text.';
COMMENT ON COLUMN solemd.paper_text_contract_audit.parsed_abstract_storage_mismatch IS
    'True when parsed abstract structure exists in the active document spine but paper_text.abstract is still empty.';

RESET ROLE;
