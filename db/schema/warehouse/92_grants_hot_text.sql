SET ROLE engine_warehouse_admin;

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.paper_text_acquisition_runs
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.paper_text_contract_audit
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.paper_text_acquisition_runs,
    solemd.paper_text_contract_audit
TO engine_warehouse_read;

RESET ROLE;
