SET ROLE engine_warehouse_admin;

CREATE UNLOGGED TABLE IF NOT EXISTS solemd.s2_paper_reference_metrics_stage (
    ingest_run_id UUID NOT NULL,
    source_release_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    batch_ordinal INTEGER NOT NULL,
    citing_paper_id TEXT NOT NULL,
    reference_out_count INTEGER NOT NULL DEFAULT 0,
    influential_reference_count INTEGER NOT NULL DEFAULT 0,
    linked_reference_count INTEGER NOT NULL DEFAULT 0,
    orphan_reference_count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE solemd.s2_paper_reference_metrics_stage SET (fillfactor = 100);

COMMENT ON TABLE solemd.s2_paper_reference_metrics_stage IS
    'Transient unlogged Semantic Scholar citation metric fragments before the single ordered final merge.';
COMMENT ON COLUMN solemd.s2_paper_reference_metrics_stage.ingest_run_id IS
    'Ingest run whose parallel citation workers produced this staging fragment.';

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE solemd.s2_paper_reference_metrics_stage TO engine_ingest_write;
GRANT SELECT ON TABLE solemd.s2_paper_reference_metrics_stage TO engine_warehouse_read;

RESET ROLE;
