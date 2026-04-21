SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.s2_authors_raw (
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    source_author_id TEXT NOT NULL,
    orcid TEXT,
    display_name TEXT NOT NULL,
    last_seen_run_id UUID
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE SET NULL,
    PRIMARY KEY (source_release_id, source_author_id)
);
ALTER TABLE solemd.s2_authors_raw SET (fillfactor = 100);

CREATE TABLE IF NOT EXISTS solemd.s2_paper_reference_metrics_raw (
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    citing_paper_id TEXT NOT NULL,
    reference_out_count INTEGER NOT NULL DEFAULT 0,
    influential_reference_count INTEGER NOT NULL DEFAULT 0,
    linked_reference_count INTEGER NOT NULL DEFAULT 0,
    orphan_reference_count INTEGER NOT NULL DEFAULT 0,
    last_seen_run_id UUID
        REFERENCES solemd.ingest_runs (ingest_run_id)
        ON DELETE SET NULL,
    PRIMARY KEY (source_release_id, citing_paper_id)
);
ALTER TABLE solemd.s2_paper_reference_metrics_raw SET (fillfactor = 100);

CREATE INDEX IF NOT EXISTS idx_s2_authors_raw_source_author
    ON solemd.s2_authors_raw (source_author_id);
CREATE INDEX IF NOT EXISTS idx_s2_paper_reference_metrics_raw_release_citing
    ON solemd.s2_paper_reference_metrics_raw (source_release_id, citing_paper_id);
CREATE INDEX IF NOT EXISTS idx_s2_paper_reference_metrics_raw_release_counts
    ON solemd.s2_paper_reference_metrics_raw (
        source_release_id,
        citing_paper_id,
        influential_reference_count
    );

COMMENT ON TABLE solemd.s2_authors_raw IS
    'Release-scoped Semantic Scholar author registry rows retained on the raw side of the corpus boundary.';
COMMENT ON TABLE solemd.s2_paper_reference_metrics_raw IS
    'Release-scoped aggregate citation metrics used for corpus and mapped gates without materializing full reference edges.';
COMMENT ON COLUMN solemd.s2_authors_raw.source_author_id IS
    'Stable upstream Semantic Scholar author identifier captured on the raw side before any canonical author promotion.';
COMMENT ON COLUMN solemd.s2_paper_reference_metrics_raw.source_release_id IS
    'Release whose aggregate citation metrics produced this per-paper row.';

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE solemd.s2_authors_raw TO engine_ingest_write;
GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE solemd.s2_paper_reference_metrics_raw TO engine_ingest_write;
GRANT SELECT ON TABLE solemd.s2_authors_raw TO engine_warehouse_read;
GRANT SELECT ON TABLE solemd.s2_paper_reference_metrics_raw TO engine_warehouse_read;

RESET ROLE;
