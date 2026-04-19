SET ROLE engine_warehouse_admin;

GRANT USAGE ON SCHEMA solemd TO engine_ingest_write;
GRANT USAGE ON SCHEMA pubtator TO engine_ingest_write;
GRANT USAGE ON SCHEMA solemd TO engine_warehouse_read;
GRANT USAGE ON SCHEMA pubtator TO engine_warehouse_read;
GRANT USAGE ON SCHEMA solemd TO warehouse_grounding_reader;

GRANT INSERT ON TABLE
    solemd.source_releases,
    solemd.ingest_runs,
    solemd.corpus,
    solemd.venues,
    solemd.authors,
    solemd.papers,
    solemd.paper_text,
    solemd.paper_authors,
    solemd.s2_papers_raw,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_references_raw,
    solemd.s2_paper_assets_raw
TO engine_ingest_write;
GRANT UPDATE ON TABLE
    solemd.source_releases,
    solemd.ingest_runs,
    solemd.venues,
    solemd.authors,
    solemd.papers,
    solemd.paper_text,
    solemd.s2_papers_raw,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_references_raw,
    solemd.s2_paper_assets_raw
TO engine_ingest_write;
GRANT DELETE ON TABLE
    solemd.paper_authors,
    solemd.s2_papers_raw,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_assets_raw,
    solemd.s2_paper_references_raw
TO engine_ingest_write;
GRANT SELECT ON TABLE
    solemd.source_releases,
    solemd.ingest_runs,
    solemd.venues,
    solemd.authors,
    solemd.papers,
    solemd.paper_text,
    solemd.paper_authors,
    solemd.s2_papers_raw,
    solemd.s2_paper_authors_raw,
    solemd.s2_paper_references_raw,
    solemd.s2_paper_assets_raw
TO engine_ingest_write;
GRANT SELECT ON ALL TABLES IN SCHEMA solemd TO engine_warehouse_read;
GRANT SELECT ON ALL TABLES IN SCHEMA pubtator TO engine_warehouse_read;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA solemd TO engine_ingest_write;

ALTER DEFAULT PRIVILEGES FOR ROLE engine_warehouse_admin IN SCHEMA solemd
    GRANT SELECT ON TABLES TO engine_warehouse_read;
ALTER DEFAULT PRIVILEGES FOR ROLE engine_warehouse_admin IN SCHEMA pubtator
    GRANT SELECT ON TABLES TO engine_warehouse_read;

RESET ROLE;
