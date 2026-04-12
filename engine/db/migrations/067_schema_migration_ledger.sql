-- Migration 067: Durable schema migration ledger.
--
-- Purpose:
--   Record every future schema migration explicitly, with checksum and execution
--   mode, so live DB readiness can be machine-verified instead of inferred from
--   ad hoc relation presence.
--
-- Operational contract:
--   - Apply this migration first through engine/db/scripts/schema_migrations.py.
--   - Future migrations should also be applied through that runner so each
--     execution is recorded in the ledger table below.
--   - The runner rejects checksum drift, so the ledger is durable rather than
--     "best effort" logging.

BEGIN;

CREATE TABLE IF NOT EXISTS solemd.schema_migration_ledger (
    migration_name      TEXT        PRIMARY KEY,
    migration_file      TEXT        NOT NULL UNIQUE,
    checksum_sha256     TEXT        NOT NULL,
    execution_mode      TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'applied',
    sql_bytes           BIGINT      NOT NULL DEFAULT 0,
    applied_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by          TEXT        NOT NULL DEFAULT current_user,
    applied_via         TEXT        NOT NULL,
    notes               TEXT,
    error_message       TEXT,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schema_migration_ledger_execution_mode_check
        CHECK (execution_mode IN ('transactional', 'autocommit')),
    CONSTRAINT schema_migration_ledger_status_check
        CHECK (status IN ('applied', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_schema_migration_ledger_status
    ON solemd.schema_migration_ledger (status);

CREATE INDEX IF NOT EXISTS idx_schema_migration_ledger_applied_at
    ON solemd.schema_migration_ledger (applied_at DESC);

COMMENT ON TABLE solemd.schema_migration_ledger IS
    'Durable record of schema migration application state, checksum, and execution mode. Apply future migrations through engine/db/scripts/schema_migrations.py so this table stays authoritative.';

CREATE OR REPLACE FUNCTION solemd.record_schema_migration_application(
    p_migration_name TEXT,
    p_migration_file TEXT,
    p_checksum_sha256 TEXT,
    p_applied_via TEXT,
    p_execution_mode TEXT,
    p_sql_bytes BIGINT DEFAULT 0,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    existing_checksum TEXT;
BEGIN
    SELECT checksum_sha256
    INTO existing_checksum
    FROM solemd.schema_migration_ledger
    WHERE migration_name = p_migration_name;

    IF FOUND AND existing_checksum <> p_checksum_sha256 THEN
        RAISE EXCEPTION
            'migration % already recorded with checksum %, refusing checksum drift to %',
            p_migration_name,
            existing_checksum,
            p_checksum_sha256;
    END IF;

    INSERT INTO solemd.schema_migration_ledger (
        migration_name,
        migration_file,
        checksum_sha256,
        execution_mode,
        status,
        sql_bytes,
        applied_at,
        applied_by,
        applied_via,
        notes,
        error_message,
        recorded_at,
        updated_at
    )
    VALUES (
        p_migration_name,
        p_migration_file,
        p_checksum_sha256,
        p_execution_mode,
        'applied',
        p_sql_bytes,
        now(),
        current_user,
        p_applied_via,
        p_notes,
        NULL,
        now(),
        now()
    )
    ON CONFLICT (migration_name) DO UPDATE SET
        migration_file = EXCLUDED.migration_file,
        checksum_sha256 = EXCLUDED.checksum_sha256,
        execution_mode = EXCLUDED.execution_mode,
        status = 'applied',
        sql_bytes = EXCLUDED.sql_bytes,
        applied_at = CASE
            WHEN solemd.schema_migration_ledger.status = 'applied' THEN solemd.schema_migration_ledger.applied_at
            ELSE EXCLUDED.applied_at
        END,
        applied_by = CASE
            WHEN solemd.schema_migration_ledger.status = 'applied' THEN solemd.schema_migration_ledger.applied_by
            ELSE EXCLUDED.applied_by
        END,
        applied_via = EXCLUDED.applied_via,
        notes = COALESCE(EXCLUDED.notes, solemd.schema_migration_ledger.notes),
        error_message = NULL,
        recorded_at = now(),
        updated_at = now();
END;
$$;

COMMENT ON FUNCTION solemd.record_schema_migration_application(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) IS
    'Record a successful schema migration application in the durable migration ledger. Used by engine/db/scripts/schema_migrations.py.';

COMMIT;
