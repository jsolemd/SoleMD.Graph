SET ROLE engine_warehouse_admin;

GRANT SELECT ON TABLE
    solemd.source_releases,
    solemd.ingest_runs
TO engine_ingest_write;

RESET ROLE;
