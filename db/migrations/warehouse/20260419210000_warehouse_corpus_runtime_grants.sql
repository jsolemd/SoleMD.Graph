SET ROLE engine_warehouse_admin;

GRANT SELECT, UPDATE ON TABLE solemd.corpus TO engine_ingest_write;

RESET ROLE;
