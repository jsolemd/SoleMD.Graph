SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.paper_corpus_assignments (
    s2_source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    paper_id TEXT NOT NULL,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    assigned_by_run_id UUID
        REFERENCES solemd.corpus_selection_runs (corpus_selection_run_id)
        ON DELETE SET NULL,
    selector_version TEXT NOT NULL,
    admission_reason TEXT NOT NULL DEFAULT 'corpus_pending',
    entity_signal_checksum TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (s2_source_release_id, paper_id)
);
ALTER TABLE solemd.paper_corpus_assignments SET (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_paper_corpus_assignments_corpus
    ON solemd.paper_corpus_assignments (corpus_id);
CREATE INDEX IF NOT EXISTS idx_paper_corpus_assignments_release_corpus
    ON solemd.paper_corpus_assignments (s2_source_release_id, corpus_id);
CREATE INDEX IF NOT EXISTS idx_paper_corpus_assignments_run
    ON solemd.paper_corpus_assignments (assigned_by_run_id, corpus_id)
    WHERE assigned_by_run_id IS NOT NULL;

COMMENT ON TABLE solemd.paper_corpus_assignments IS
    'Logged S2-release paper-to-corpus assignment map used to resume corpus admission without mutating raw S2 rows.';
COMMENT ON COLUMN solemd.paper_corpus_assignments.assigned_by_run_id IS
    'Selection run that first created or most recently refreshed this S2-release paper assignment.';
COMMENT ON COLUMN solemd.paper_corpus_assignments.entity_signal_checksum IS
    'Entity asset checksum used by the admission run that created this assignment, when entity signals contributed to the plan.';

GRANT INSERT, UPDATE, SELECT ON TABLE
    solemd.paper_corpus_assignments
TO engine_ingest_write;

GRANT DELETE ON TABLE
    solemd.paper_corpus_assignments
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.paper_corpus_assignments
TO engine_warehouse_read;

RESET ROLE;
