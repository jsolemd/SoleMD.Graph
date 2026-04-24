SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.paper_text_acquisition_runs
    DROP CONSTRAINT IF EXISTS ck_paper_text_acquisition_runs_status;

ALTER TABLE solemd.paper_text_acquisition_runs
    ADD CONSTRAINT ck_paper_text_acquisition_runs_status
        CHECK (status BETWEEN 1 AND 5);

RESET ROLE;
