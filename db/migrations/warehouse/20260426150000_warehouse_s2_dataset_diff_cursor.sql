SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.s2_dataset_cursors (
    dataset_name TEXT PRIMARY KEY,
    family_name TEXT NOT NULL,
    base_release_key TEXT NOT NULL,
    current_release_key TEXT NOT NULL,
    current_source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    cursor_status TEXT NOT NULL DEFAULT 'base_loaded',
    diff_apply_enabled BOOLEAN NOT NULL DEFAULT false,
    hot_source_delete_safe_at TIMESTAMPTZ,
    last_diff_checked_at TIMESTAMPTZ,
    last_diff_plan_checksum TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_s2_dataset_cursors_status
        CHECK (cursor_status IN ('base_loaded', 'diff_planned', 'diff_applying', 'diff_loaded', 'blocked')),
    CONSTRAINT ck_s2_dataset_cursors_hot_delete_requires_apply
        CHECK (hot_source_delete_safe_at IS NULL OR diff_apply_enabled)
);
ALTER TABLE solemd.s2_dataset_cursors SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.s2_dataset_diff_manifests (
    s2_diff_manifest_id UUID PRIMARY KEY DEFAULT uuidv7(),
    dataset_name TEXT NOT NULL,
    family_name TEXT NOT NULL,
    start_release_key TEXT NOT NULL,
    end_release_key TEXT NOT NULL,
    from_release_key TEXT NOT NULL,
    to_release_key TEXT NOT NULL,
    diff_ordinal INTEGER NOT NULL,
    update_file_count INTEGER NOT NULL DEFAULT 0,
    delete_file_count INTEGER NOT NULL DEFAULT 0,
    payload_checksum TEXT NOT NULL,
    api_url TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_s2_dataset_diff_manifests_step UNIQUE (
        dataset_name,
        start_release_key,
        end_release_key,
        diff_ordinal
    ),
    CONSTRAINT ck_s2_dataset_diff_manifests_counts
        CHECK (update_file_count >= 0 AND delete_file_count >= 0)
);
ALTER TABLE solemd.s2_dataset_diff_manifests SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.s2_dataset_diff_files (
    s2_diff_manifest_id UUID NOT NULL
        REFERENCES solemd.s2_dataset_diff_manifests (s2_diff_manifest_id)
        ON DELETE CASCADE,
    operation TEXT NOT NULL,
    file_ordinal INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    file_status SMALLINT NOT NULL DEFAULT 1,
    file_byte_count BIGINT NOT NULL DEFAULT 0,
    input_bytes_read BIGINT NOT NULL DEFAULT 0,
    rows_written BIGINT NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (s2_diff_manifest_id, operation, file_ordinal),
    CONSTRAINT ck_s2_dataset_diff_files_operation
        CHECK (operation IN ('update', 'delete')),
    CONSTRAINT ck_s2_dataset_diff_files_status
        CHECK (file_status BETWEEN 1 AND 4),
    CONSTRAINT ck_s2_dataset_diff_files_counts
        CHECK (
            file_ordinal >= 0
            AND file_byte_count >= 0
            AND input_bytes_read >= 0
            AND rows_written >= 0
        )
);
ALTER TABLE solemd.s2_dataset_diff_files SET (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_s2_dataset_cursors_current_release
    ON solemd.s2_dataset_cursors (current_source_release_id, family_name);
CREATE INDEX IF NOT EXISTS idx_s2_dataset_diff_manifests_range
    ON solemd.s2_dataset_diff_manifests (
        start_release_key,
        end_release_key,
        dataset_name
    );
CREATE INDEX IF NOT EXISTS idx_s2_dataset_diff_files_status
    ON solemd.s2_dataset_diff_files (
        operation,
        file_status,
        updated_at
    );

COMMENT ON TABLE solemd.s2_dataset_cursors IS
    'Semantic Scholar Datasets API current-state cursor per dataset. Full ingest seeds the base cursor; diff application must explicitly mark hot source deletion safe.';
COMMENT ON COLUMN solemd.s2_dataset_cursors.hot_source_delete_safe_at IS
    'Non-null only after the dataset has a tested diff-application path. Source retention refuses hot deletion without this marker.';
COMMENT ON TABLE solemd.s2_dataset_diff_manifests IS
    'Semantic Scholar Datasets API diff manifest ledger returned by /datasets/v1/diffs/{start}/to/{end}/{dataset}.';
COMMENT ON TABLE solemd.s2_dataset_diff_files IS
    'Durable per-file ledger for S2 diff update/delete file URLs before streamed application.';

GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE
    solemd.s2_dataset_cursors,
    solemd.s2_dataset_diff_manifests,
    solemd.s2_dataset_diff_files
TO engine_ingest_write;
GRANT SELECT ON TABLE
    solemd.s2_dataset_cursors,
    solemd.s2_dataset_diff_manifests,
    solemd.s2_dataset_diff_files
TO engine_warehouse_read;

RESET ROLE;
