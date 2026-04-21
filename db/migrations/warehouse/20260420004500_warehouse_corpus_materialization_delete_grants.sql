SET ROLE engine_warehouse_admin;

GRANT DELETE ON TABLE
    solemd.papers,
    solemd.paper_text
TO engine_ingest_write;

RESET ROLE;
