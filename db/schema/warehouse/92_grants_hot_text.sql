SET ROLE engine_warehouse_admin;

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.paper_text_acquisition_runs
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.paper_text_acquisition_runs
TO engine_warehouse_read;

RESET ROLE;
