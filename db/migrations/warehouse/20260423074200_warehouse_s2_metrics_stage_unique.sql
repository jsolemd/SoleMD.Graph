SET ROLE engine_warehouse_admin;

-- s2_paper_reference_metrics_stage is UNLOGGED staging for parallel citation
-- workers. Without a uniqueness constraint, duplicate fragments silently
-- double-count during the final ordered merge into s2_paper_reference_metrics_raw.
--
-- Natural key: one fragment per (ingest_run, source_release, file, batch,
-- citing_paper). file_name + batch_ordinal disambiguate the producing worker
-- slice; citing_paper_id is the per-row grain.

ALTER TABLE solemd.s2_paper_reference_metrics_stage
    ADD CONSTRAINT s2_paper_reference_metrics_stage_pk
    PRIMARY KEY (
        ingest_run_id,
        source_release_id,
        file_name,
        batch_ordinal,
        citing_paper_id
    );

COMMENT ON CONSTRAINT s2_paper_reference_metrics_stage_pk
    ON solemd.s2_paper_reference_metrics_stage IS
    'Prevents duplicate citation metric fragments from double-counting during the ordered merge. Grain: one row per citing paper per worker batch per file per release per ingest run.';

RESET ROLE;
