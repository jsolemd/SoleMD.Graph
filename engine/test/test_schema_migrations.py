from __future__ import annotations

from pathlib import Path

from db.scripts.schema_migrations import (
    MigrationExecutionMode,
    MigrationFile,
    MigrationLedgerRecord,
    adopt_schema_migrations,
    apply_schema_migrations,
    build_migration_wrapper_sql,
    compare_migrations_to_ledger,
    discover_migrations,
    select_migrations_for_adoption,
)


def test_discover_migrations_sorts_and_classifies_autocommit(tmp_path: Path):
    (tmp_path / "010_second.sql").write_text(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x ON solemd.papers (year);",
        encoding="utf-8",
    )
    (tmp_path / "001_first.sql").write_text("BEGIN; SELECT 1; COMMIT;", encoding="utf-8")

    migrations = discover_migrations(migrations_dir=tmp_path)

    assert [migration.migration_name for migration in migrations] == [
        "001_first",
        "010_second",
    ]
    assert migrations[0].execution_mode is MigrationExecutionMode.TRANSACTIONAL
    assert migrations[1].execution_mode is MigrationExecutionMode.AUTOCOMMIT


def test_build_migration_wrapper_sql_records_after_include(tmp_path: Path):
    migration_path = tmp_path / "067_schema_migration_ledger.sql"
    migration_path.write_text("BEGIN;\nSELECT 1;\nCOMMIT;\n", encoding="utf-8")
    migration = discover_migrations(migrations_dir=tmp_path)[0]

    wrapper_sql = build_migration_wrapper_sql(
        migration,
        applied_via="engine/db/scripts/schema_migrations.py",
    )

    assert wrapper_sql.startswith("\\set ON_ERROR_STOP on")
    assert f"\\i {migration.path}" in wrapper_sql
    assert "solemd.record_schema_migration_application" in wrapper_sql
    assert migration.checksum_sha256 in wrapper_sql


def test_compare_migrations_to_ledger_reports_missing_and_ready_state(tmp_path: Path):
    (tmp_path / "001_first.sql").write_text("BEGIN; SELECT 1; COMMIT;", encoding="utf-8")
    (tmp_path / "002_second.sql").write_text("BEGIN; SELECT 2; COMMIT;", encoding="utf-8")
    migrations = discover_migrations(migrations_dir=tmp_path)
    ledger_rows = [
        MigrationLedgerRecord(
            migration_name="001_first",
            migration_file="engine/db/migrations/001_first.sql",
            checksum_sha256=migrations[0].checksum_sha256,
            execution_mode=MigrationExecutionMode.TRANSACTIONAL,
            status="applied",
            sql_bytes=migrations[0].sql_bytes,
            applied_at="2026-04-11T00:00:00Z",
            applied_by="solemd",
            applied_via="engine/db/scripts/schema_migrations.py",
            recorded_at="2026-04-11T00:00:00Z",
            updated_at="2026-04-11T00:00:00Z",
        )
    ]

    report = compare_migrations_to_ledger(migrations, ledger_rows, ledger_present=True)

    assert report.ledger_present is True
    assert report.ready is False
    assert report.missing_migrations == ["002_second"]
    assert report.checksum_mismatches == []
    assert report.latest_applied_migration == "001_first"


def test_apply_schema_migrations_skips_ledgered_files_and_records_new_ones(tmp_path: Path):
    (tmp_path / "067_schema_migration_ledger.sql").write_text(
        "BEGIN; SELECT 1; COMMIT;",
        encoding="utf-8",
    )
    (tmp_path / "068_followup.sql").write_text("BEGIN; SELECT 2; COMMIT;", encoding="utf-8")
    migrations = discover_migrations(migrations_dir=tmp_path)
    ledger_rows = [
        MigrationLedgerRecord(
            migration_name="067_schema_migration_ledger",
            migration_file="engine/db/migrations/067_schema_migration_ledger.sql",
            checksum_sha256=migrations[0].checksum_sha256,
            execution_mode=MigrationExecutionMode.TRANSACTIONAL,
            status="applied",
            sql_bytes=migrations[0].sql_bytes,
            applied_at="2026-04-11T00:00:00Z",
            applied_by="solemd",
            applied_via="engine/db/scripts/schema_migrations.py",
            recorded_at="2026-04-11T00:00:00Z",
            updated_at="2026-04-11T00:00:00Z",
        )
    ]
    executed: list[str] = []

    def fake_executor(migration: MigrationFile, *, database_url: str, applied_via: str) -> None:
        assert database_url == "postgresql://solemd@localhost:5433/solemd_graph"
        assert applied_via == "engine/db/scripts/schema_migrations.py"
        executed.append(migration.migration_name)

    report = apply_schema_migrations(
        migrations_dir=tmp_path,
        database_url="postgresql://solemd@localhost:5433/solemd_graph",
        ledger_rows=ledger_rows,
        executor=fake_executor,  # type: ignore[arg-type]
    )

    assert executed == ["068_followup"]
    assert report.applied_migrations == ["068_followup"]
    assert report.skipped_migrations == ["067_schema_migration_ledger"]
    assert report.ready_after is False


def test_select_migrations_for_adoption_supports_named_range_and_explicit_selection(tmp_path: Path):
    (tmp_path / "001_first.sql").write_text("BEGIN; SELECT 1; COMMIT;", encoding="utf-8")
    (tmp_path / "002_second.sql").write_text("BEGIN; SELECT 2; COMMIT;", encoding="utf-8")
    (tmp_path / "003_third.sql").write_text("BEGIN; SELECT 3; COMMIT;", encoding="utf-8")
    migrations = discover_migrations(migrations_dir=tmp_path)

    selected = select_migrations_for_adoption(
        migrations,
        migration_names=["003_third", "001_first"],
    )
    ranged = select_migrations_for_adoption(
        migrations,
        from_migration="001_first",
        to_migration="002_second",
    )

    assert [migration.migration_name for migration in selected] == [
        "001_first",
        "003_third",
    ]
    assert [migration.migration_name for migration in ranged] == [
        "001_first",
        "002_second",
    ]


def test_adopt_schema_migrations_records_notes_and_applied_via(tmp_path: Path):
    (tmp_path / "001_first.sql").write_text("BEGIN; SELECT 1; COMMIT;", encoding="utf-8")
    (tmp_path / "002_second.sql").write_text("BEGIN; SELECT 2; COMMIT;", encoding="utf-8")
    ledger_rows: list[MigrationLedgerRecord] = []
    recorded: list[tuple[str, str, str | None]] = []

    def fake_recorder(
        migration: MigrationFile,
        *,
        database_url: str,
        applied_via: str,
        notes: str | None,
    ) -> None:
        assert database_url == "postgresql://solemd@localhost:5433/solemd_graph"
        recorded.append((migration.migration_name, applied_via, notes))

    report = adopt_schema_migrations(
        migrations_dir=tmp_path,
        database_url="postgresql://solemd@localhost:5433/solemd_graph",
        ledger_rows=ledger_rows,
        migration_names=["001_first", "002_second"],
        notes="bootstrap adoption after ledger 067",
        applied_via="engine/db/scripts/schema_migrations.py adopt",
        recorder=fake_recorder,  # type: ignore[arg-type]
    )

    assert [item[0] for item in recorded] == ["001_first", "002_second"]
    assert all(item[1] == "engine/db/scripts/schema_migrations.py adopt" for item in recorded)
    assert all(item[2] == "bootstrap adoption after ledger 067" for item in recorded)
    assert report.selected_migrations == ["001_first", "002_second"]
    assert report.adopted_migrations == ["001_first", "002_second"]


def test_adopt_schema_migrations_refuses_checksum_drift(tmp_path: Path):
    (tmp_path / "001_first.sql").write_text("BEGIN; SELECT 1; COMMIT;", encoding="utf-8")
    migration = discover_migrations(migrations_dir=tmp_path)[0]
    ledger_rows = [
        MigrationLedgerRecord(
            migration_name="001_first",
            migration_file="engine/db/migrations/001_first.sql",
            checksum_sha256="deadbeef",
            execution_mode=MigrationExecutionMode.TRANSACTIONAL,
            status="applied",
            sql_bytes=migration.sql_bytes,
            applied_at="2026-04-11T00:00:00Z",
            applied_by="solemd",
            applied_via="engine/db/scripts/schema_migrations.py",
            recorded_at="2026-04-11T00:00:00Z",
            updated_at="2026-04-11T00:00:00Z",
        )
    ]

    try:
        adopt_schema_migrations(
            migrations_dir=tmp_path,
            database_url="postgresql://solemd@localhost:5433/solemd_graph",
            ledger_rows=ledger_rows,
            migration_names=["001_first"],
        )
        raise AssertionError("expected checksum drift to fail")
    except RuntimeError as exc:
        assert "checksum drift" in str(exc)
