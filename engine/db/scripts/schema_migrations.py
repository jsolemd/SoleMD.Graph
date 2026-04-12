"""Apply and verify schema migrations through a durable migration ledger."""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Protocol

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pydantic import Field

from app import db
from app.config import settings
from app.rag.parse_contract import ParseContractModel

DEFAULT_MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"
DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_APPLIED_VIA = "engine/db/scripts/schema_migrations.py"
_AUTOCOMMIT_MARKERS = (
    r"\bCREATE\s+INDEX\s+CONCURRENTLY\b",
    r"\bDROP\s+INDEX\s+CONCURRENTLY\b",
    r"\bREINDEX\s+CONCURRENTLY\b",
    r"\bREFRESH\s+MATERIALIZED\s+VIEW\s+CONCURRENTLY\b",
    r"\bALTER\s+TABLE\b.*\bSET\s+LOGGED\b",
    r"\bALTER\s+TABLE\b.*\bSET\s+UNLOGGED\b",
    r"\bVACUUM\b",
)


class MigrationExecutionMode(StrEnum):
    TRANSACTIONAL = "transactional"
    AUTOCOMMIT = "autocommit"


@dataclass(frozen=True)
class MigrationFile:
    migration_name: str
    migration_file: str
    path: Path
    checksum_sha256: str
    sql_bytes: int
    execution_mode: MigrationExecutionMode


class MigrationFileRecord(ParseContractModel):
    migration_name: str
    migration_file: str
    checksum_sha256: str
    sql_bytes: int
    execution_mode: MigrationExecutionMode


class MigrationLedgerRecord(ParseContractModel):
    migration_name: str
    migration_file: str
    checksum_sha256: str
    execution_mode: MigrationExecutionMode
    status: str
    sql_bytes: int
    applied_at: str | None = None
    applied_by: str | None = None
    applied_via: str
    notes: str | None = None
    error_message: str | None = None
    recorded_at: str | None = None
    updated_at: str | None = None


class MigrationReadinessReport(ParseContractModel):
    ledger_present: bool
    ready: bool
    total_files: int
    recorded: int
    applied: int
    missing_migrations: list[str] = Field(default_factory=list)
    checksum_mismatches: list[str] = Field(default_factory=list)
    failed_migrations: list[str] = Field(default_factory=list)
    latest_applied_migration: str | None = None


class MigrationApplyReport(ParseContractModel):
    ready_after: bool
    applied_migrations: list[str] = Field(default_factory=list)
    skipped_migrations: list[str] = Field(default_factory=list)
    failed_migrations: list[str] = Field(default_factory=list)
    readiness: MigrationReadinessReport


class MigrationAdoptionReport(ParseContractModel):
    ready_after: bool
    selected_migrations: list[str] = Field(default_factory=list)
    adopted_migrations: list[str] = Field(default_factory=list)
    skipped_migrations: list[str] = Field(default_factory=list)
    conflicting_migrations: list[str] = Field(default_factory=list)
    readiness: MigrationReadinessReport


class MigrationExecutor(Protocol):
    def __call__(
        self,
        migration: MigrationFile,
        *,
        database_url: str,
        applied_via: str,
    ) -> None: ...


class MigrationLedgerRecorder(Protocol):
    def __call__(
        self,
        migration: MigrationFile,
        *,
        database_url: str,
        applied_via: str,
        notes: str | None,
    ) -> None: ...


_MIGRATION_FILENAME_RE = re.compile(r"^(?P<migration_name>.+)\.sql$")


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _looks_autocommit(sql_text: str) -> bool:
    for marker in _AUTOCOMMIT_MARKERS:
        if re.search(marker, sql_text, flags=re.IGNORECASE | re.DOTALL):
            return True
    return False


def _read_migration(path: Path) -> MigrationFile:
    match = _MIGRATION_FILENAME_RE.match(path.name)
    if match is None:
        raise ValueError(f"invalid migration filename: {path.name}")

    sql_text = path.read_text(encoding="utf-8")
    return MigrationFile(
        migration_name=match.group("migration_name"),
        migration_file=_migration_file_label(path),
        path=path,
        checksum_sha256=hashlib.sha256(sql_text.encode("utf-8")).hexdigest(),
        sql_bytes=len(sql_text.encode("utf-8")),
        execution_mode=(
            MigrationExecutionMode.AUTOCOMMIT
            if _looks_autocommit(sql_text)
            else MigrationExecutionMode.TRANSACTIONAL
        ),
    )


def _migration_file_label(path: Path) -> str:
    try:
        return str(path.relative_to(DEFAULT_REPO_ROOT))
    except ValueError:
        return path.name


def discover_migrations(*, migrations_dir: Path = DEFAULT_MIGRATIONS_DIR) -> list[MigrationFile]:
    migrations = [
        _read_migration(path)
        for path in sorted(migrations_dir.glob("*.sql"), key=lambda candidate: candidate.name)
    ]
    return migrations


def _ledger_row_from_mapping(row: dict[str, object]) -> MigrationLedgerRecord:
    return MigrationLedgerRecord(
        migration_name=str(row["migration_name"]),
        migration_file=str(row["migration_file"]),
        checksum_sha256=str(row["checksum_sha256"]),
        execution_mode=MigrationExecutionMode(str(row["execution_mode"])),
        status=str(row["status"]),
        sql_bytes=int(row["sql_bytes"]),
        applied_at=None if row["applied_at"] is None else str(row["applied_at"]),
        applied_by=None if row["applied_by"] is None else str(row["applied_by"]),
        applied_via=str(row["applied_via"]),
        notes=None if row["notes"] is None else str(row["notes"]),
        error_message=None if row["error_message"] is None else str(row["error_message"]),
        recorded_at=None if row["recorded_at"] is None else str(row["recorded_at"]),
        updated_at=None if row["updated_at"] is None else str(row["updated_at"]),
    )


def _load_ledger_rows() -> tuple[bool, list[MigrationLedgerRecord]]:
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT to_regclass('solemd.schema_migration_ledger') AS ledger_name")
        ledger_name = cur.fetchone()["ledger_name"]
        if ledger_name is None:
            return False, []

        cur.execute(
            """
            SELECT
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
            FROM solemd.schema_migration_ledger
            ORDER BY migration_name
            """
        )
        return True, [_ledger_row_from_mapping(row) for row in cur.fetchall()]


def compare_migrations_to_ledger(
    migrations: Sequence[MigrationFile],
    ledger_rows: Sequence[MigrationLedgerRecord],
    *,
    ledger_present: bool,
) -> MigrationReadinessReport:
    ledger_by_name = {row.migration_name: row for row in ledger_rows}

    missing_migrations: list[str] = []
    checksum_mismatches: list[str] = []
    failed_migrations: list[str] = []

    latest_applied_migration: str | None = None
    for row in ledger_rows:
        if row.status == "applied":
            latest_applied_migration = row.migration_name
        else:
            failed_migrations.append(row.migration_name)

    for migration in migrations:
        row = ledger_by_name.get(migration.migration_name)
        if row is None or row.status != "applied":
            missing_migrations.append(migration.migration_name)
            continue
        if row.checksum_sha256 != migration.checksum_sha256:
            checksum_mismatches.append(migration.migration_name)

    applied_count = sum(1 for row in ledger_rows if row.status == "applied")
    ready = (
        ledger_present
        and not missing_migrations
        and not checksum_mismatches
        and not failed_migrations
    )
    return MigrationReadinessReport(
        ledger_present=ledger_present,
        ready=ready,
        total_files=len(migrations),
        recorded=len(ledger_rows),
        applied=applied_count,
        missing_migrations=missing_migrations,
        checksum_mismatches=checksum_mismatches,
        failed_migrations=failed_migrations,
        latest_applied_migration=latest_applied_migration,
    )


def _load_migration_index(migrations: Sequence[MigrationFile]) -> dict[str, int]:
    return {migration.migration_name: index for index, migration in enumerate(migrations)}


def select_migrations_for_adoption(
    migrations: Sequence[MigrationFile],
    *,
    migration_names: Sequence[str] | None = None,
    from_migration: str | None = None,
    to_migration: str | None = None,
) -> list[MigrationFile]:
    if migration_names and (from_migration is not None or to_migration is not None):
        raise ValueError("choose either explicit migration_names or a from/to adoption range")
    if migration_names is None and (from_migration is None or to_migration is None):
        raise ValueError("adoption requires explicit migration_names or a from/to adoption range")

    migration_index = _load_migration_index(migrations)

    if migration_names is not None:
        selected: list[MigrationFile] = []
        missing: list[str] = []
        seen: set[str] = set()
        requested = set(migration_names)
        for migration in migrations:
            if migration.migration_name in requested:
                selected.append(migration)
                seen.add(migration.migration_name)
        missing = [
            migration_name
            for migration_name in migration_names
            if migration_name not in seen
        ]
        if missing:
            raise ValueError(f"unknown migration(s): {', '.join(missing)}")
        return selected

    start_index = migration_index.get(from_migration or "")
    end_index = migration_index.get(to_migration or "")
    if start_index is None:
        raise ValueError(f"unknown from_migration: {from_migration}")
    if end_index is None:
        raise ValueError(f"unknown to_migration: {to_migration}")
    if start_index > end_index:
        raise ValueError("from_migration must not come after to_migration")
    return list(migrations[start_index : end_index + 1])


def build_migration_record_footer(
    migration: MigrationFile,
    *,
    applied_via: str = DEFAULT_APPLIED_VIA,
) -> str:
    return (
        "SELECT solemd.record_schema_migration_application(\n"
        f"    {_sql_literal(migration.migration_name)},\n"
        f"    {_sql_literal(migration.migration_file)},\n"
        f"    {_sql_literal(migration.checksum_sha256)},\n"
        f"    {_sql_literal(applied_via)},\n"
        f"    {_sql_literal(migration.execution_mode.value)},\n"
        f"    {migration.sql_bytes},\n"
        "    NULL\n"
        ");\n"
    )


def build_migration_wrapper_sql(
    migration: MigrationFile,
    *,
    applied_via: str = DEFAULT_APPLIED_VIA,
) -> str:
    return (
        "\\set ON_ERROR_STOP on\n"
        f"\\i {migration.path}\n"
        f"{build_migration_record_footer(migration, applied_via=applied_via)}"
    )


def _execute_migration_via_psql(
    migration: MigrationFile,
    *,
    database_url: str,
    applied_via: str = DEFAULT_APPLIED_VIA,
) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(build_migration_wrapper_sql(migration, applied_via=applied_via))

    try:
        subprocess.run(
            [
                "psql",
                "-X",
                "-v",
                "ON_ERROR_STOP=1",
                "-d",
                database_url,
                "-f",
                str(temp_path),
            ],
            check=True,
        )
    finally:
        temp_path.unlink(missing_ok=True)


def _record_schema_migration_application(
    migration: MigrationFile,
    *,
    database_url: str,
    applied_via: str,
    notes: str | None = None,
) -> None:
    with db.connect(conninfo=database_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT solemd.record_schema_migration_application(%s, %s, %s, %s, %s, %s, %s)",
            (
                migration.migration_name,
                migration.migration_file,
                migration.checksum_sha256,
                applied_via,
                migration.execution_mode.value,
                migration.sql_bytes,
                notes,
            ),
        )
        conn.commit()


def _record_failed_migration(
    *,
    migration: MigrationFile,
    database_url: str,
    error_message: str,
    applied_via: str = DEFAULT_APPLIED_VIA,
) -> None:
    with db.connect(conninfo=database_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT to_regclass('solemd.schema_migration_ledger') AS ledger_name")
        ledger_name = cur.fetchone()["ledger_name"]
        if ledger_name is None:
            return

        cur.execute(
            """
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
            VALUES (%s, %s, %s, %s, 'failed', %s, now(), current_user, %s, NULL, %s, now(), now())
            ON CONFLICT (migration_name) DO UPDATE SET
                migration_file = EXCLUDED.migration_file,
                checksum_sha256 = EXCLUDED.checksum_sha256,
                execution_mode = EXCLUDED.execution_mode,
                status = 'failed',
                sql_bytes = EXCLUDED.sql_bytes,
                applied_at = CASE
                    WHEN solemd.schema_migration_ledger.status = 'applied'
                        THEN solemd.schema_migration_ledger.applied_at
                    ELSE EXCLUDED.applied_at
                END,
                applied_by = CASE
                    WHEN solemd.schema_migration_ledger.status = 'applied'
                        THEN solemd.schema_migration_ledger.applied_by
                    ELSE EXCLUDED.applied_by
                END,
                applied_via = EXCLUDED.applied_via,
                notes = solemd.schema_migration_ledger.notes,
                error_message = EXCLUDED.error_message,
                recorded_at = now(),
                updated_at = now()
            """,
            (
                migration.migration_name,
                migration.migration_file,
                migration.checksum_sha256,
                migration.execution_mode.value,
                migration.sql_bytes,
                applied_via,
                error_message,
            ),
        )
        conn.commit()


def apply_schema_migrations(
    *,
    migrations_dir: Path = DEFAULT_MIGRATIONS_DIR,
    database_url: str | None = None,
    dry_run: bool = False,
    ledger_rows: Sequence[MigrationLedgerRecord] | None = None,
    executor: MigrationExecutor | None = None,
    applied_via: str = DEFAULT_APPLIED_VIA,
) -> MigrationApplyReport:
    migrations = discover_migrations(migrations_dir=migrations_dir)
    if ledger_rows is None:
        ledger_present, loaded_rows = _load_ledger_rows()
        ledger_rows = loaded_rows
    else:
        ledger_present = len(ledger_rows) > 0
    ledger_rows = list(ledger_rows)
    readiness_before = compare_migrations_to_ledger(
        migrations,
        ledger_rows,
        ledger_present=ledger_present,
    )

    if dry_run:
        return MigrationApplyReport(
            ready_after=readiness_before.ready,
            applied_migrations=[],
            skipped_migrations=[
                migration.migration_name
                for migration in migrations
                if migration.migration_name in {row.migration_name for row in ledger_rows}
                and any(
                    row.migration_name == migration.migration_name and row.status == "applied"
                    for row in ledger_rows
                )
            ],
            failed_migrations=readiness_before.failed_migrations,
            readiness=readiness_before,
        )

    if database_url is None:
        database_url = settings.database_url

    executor = executor or _execute_migration_via_psql
    ledger_by_name = {row.migration_name: row for row in ledger_rows}
    applied_migrations: list[str] = []
    skipped_migrations: list[str] = []
    failed_migrations: list[str] = []

    for migration in migrations:
        recorded = ledger_by_name.get(migration.migration_name)
        if recorded is not None and recorded.status == "applied":
            if recorded.checksum_sha256 != migration.checksum_sha256:
                raise RuntimeError(
                    f"migration {migration.migration_name} checksum drift: "
                    f"ledger={recorded.checksum_sha256} file={migration.checksum_sha256}"
                )
            skipped_migrations.append(migration.migration_name)
            continue

        try:
            executor(migration, database_url=database_url, applied_via=applied_via)
            applied_migrations.append(migration.migration_name)
        except Exception as exc:
            failed_migrations.append(migration.migration_name)
            try:
                _record_failed_migration(
                    migration=migration,
                    database_url=database_url,
                    error_message=str(exc),
                    applied_via=applied_via,
                )
            except Exception:
                pass
            raise

    ledger_present_after, ledger_rows_after = _load_ledger_rows()
    readiness_after = compare_migrations_to_ledger(
        migrations,
        ledger_rows_after,
        ledger_present=ledger_present_after,
    )
    return MigrationApplyReport(
        ready_after=readiness_after.ready,
        applied_migrations=applied_migrations,
        skipped_migrations=skipped_migrations,
        failed_migrations=failed_migrations,
        readiness=readiness_after,
    )


def adopt_schema_migrations(
    *,
    migrations_dir: Path = DEFAULT_MIGRATIONS_DIR,
    database_url: str | None = None,
    ledger_rows: Sequence[MigrationLedgerRecord] | None = None,
    migration_names: Sequence[str] | None = None,
    from_migration: str | None = None,
    to_migration: str | None = None,
    notes: str | None = None,
    applied_via: str = DEFAULT_APPLIED_VIA,
    dry_run: bool = False,
    recorder: MigrationLedgerRecorder | None = None,
) -> MigrationAdoptionReport:
    migrations = discover_migrations(migrations_dir=migrations_dir)
    selected = select_migrations_for_adoption(
        migrations,
        migration_names=migration_names,
        from_migration=from_migration,
        to_migration=to_migration,
    )

    if ledger_rows is None:
        ledger_present, loaded_rows = _load_ledger_rows()
        ledger_rows = loaded_rows
    else:
        ledger_present = len(ledger_rows) > 0

    ledger_rows = list(ledger_rows)
    readiness = compare_migrations_to_ledger(
        migrations,
        ledger_rows,
        ledger_present=ledger_present,
    )

    ledger_by_name = {row.migration_name: row for row in ledger_rows}
    adopted_migrations: list[str] = []
    skipped_migrations: list[str] = []
    conflicting_migrations: list[str] = []

    if dry_run:
        return MigrationAdoptionReport(
            ready_after=readiness.ready,
            selected_migrations=[migration.migration_name for migration in selected],
            adopted_migrations=[migration.migration_name for migration in selected],
            skipped_migrations=[],
            conflicting_migrations=[],
            readiness=readiness,
        )

    for migration in selected:
        recorded = ledger_by_name.get(migration.migration_name)
        if recorded is not None:
            if recorded.checksum_sha256 != migration.checksum_sha256:
                conflicting_migrations.append(migration.migration_name)
                raise RuntimeError(
                    f"migration {migration.migration_name} checksum drift: "
                    f"ledger={recorded.checksum_sha256} file={migration.checksum_sha256}"
                )
            if recorded.status == "applied":
                skipped_migrations.append(migration.migration_name)
                continue

        adoptions = recorder or _record_schema_migration_application
        adoptions(
            migration,
            database_url=database_url or settings.database_url,
            applied_via=applied_via,
            notes=notes,
        )
        adopted_migrations.append(migration.migration_name)

    ledger_present_after, ledger_rows_after = _load_ledger_rows()
    readiness_after = compare_migrations_to_ledger(
        migrations,
        ledger_rows_after,
        ledger_present=ledger_present_after,
    )
    return MigrationAdoptionReport(
        ready_after=readiness_after.ready,
        selected_migrations=[migration.migration_name for migration in selected],
        adopted_migrations=adopted_migrations,
        skipped_migrations=skipped_migrations,
        conflicting_migrations=conflicting_migrations,
        readiness=readiness_after,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply and verify schema migrations through a durable ledger.",
    )
    parser.add_argument(
        "--migrations-dir",
        type=Path,
        default=DEFAULT_MIGRATIONS_DIR,
        help="Directory containing ordered SQL migration files.",
    )
    parser.add_argument(
        "--database-url",
        default=settings.database_url,
        help="Explicit PostgreSQL connection string for psql and ledger writes.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    apply_parser = subparsers.add_parser(
        "apply",
        help="Apply unapplied migrations in filename order and record them in the ledger.",
    )
    apply_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show the readiness report without running any migrations.",
    )

    adopt_parser = subparsers.add_parser(
        "adopt",
        help="Record an explicit set or range of pre-ledger migrations as already applied.",
    )
    adopt_selection = adopt_parser.add_mutually_exclusive_group(required=True)
    adopt_selection.add_argument(
        "--migration",
        dest="migration_names",
        action="append",
        help="Explicit migration name to adopt. Repeat for multiple selected migrations.",
    )
    adopt_selection.add_argument(
        "--from-migration",
        help="First migration name in an inclusive adoption range.",
    )
    adopt_parser.add_argument(
        "--to-migration",
        help="Last migration name in an inclusive adoption range. Required with --from-migration.",
    )
    adopt_parser.add_argument(
        "--notes",
        default=None,
        help="Optional operator note recorded with adopted migrations.",
    )
    adopt_parser.add_argument(
        "--applied-via",
        default=DEFAULT_APPLIED_VIA,
        help="Recorded source of the adoption action.",
    )
    adopt_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show which migrations would be adopted without writing ledger rows.",
    )

    subparsers.add_parser(
        "status",
        help="Report migration readiness by comparing filesystem migrations to the ledger.",
    )

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        if args.command == "apply":
            report = apply_schema_migrations(
                migrations_dir=args.migrations_dir,
                database_url=args.database_url,
                dry_run=args.dry_run,
            )
        elif args.command == "adopt":
            if args.from_migration is not None and args.to_migration is None:
                raise SystemExit("--to-migration is required with --from-migration")
            report = adopt_schema_migrations(
                migrations_dir=args.migrations_dir,
                database_url=args.database_url,
                migration_names=args.migration_names,
                from_migration=args.from_migration,
                to_migration=args.to_migration,
                notes=args.notes,
                applied_via=args.applied_via,
                dry_run=args.dry_run,
            )
        else:
            ledger_present, ledger_rows = _load_ledger_rows()
            report = compare_migrations_to_ledger(
                discover_migrations(migrations_dir=args.migrations_dir),
                ledger_rows,
                ledger_present=ledger_present,
            )
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
