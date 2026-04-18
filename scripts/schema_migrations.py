#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13,<3.14"
# dependencies = [
#   "psycopg[binary]==3.2.10",
# ]
# ///

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row
from psycopg import sql


REPO_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_ROOT = REPO_ROOT / "db" / "migrations"
APPLIED_VIA = "scripts/schema_migrations.py"
LEDGER_TABLE_REF = "solemd.schema_migration_ledger"
INCLUDE_RE = re.compile(r"^\s*\\i(?:r)?\s+(.+?)\s*$")
MIGRATION_FILENAME_RE = re.compile(r"^(?P<name>.+)\.sql$")
AUTOCOMMIT_MARKERS = (
    r"\bCREATE\s+INDEX\s+CONCURRENTLY\b",
    r"\bDROP\s+INDEX\s+CONCURRENTLY\b",
    r"\bREINDEX\s+CONCURRENTLY\b",
    r"\bREFRESH\s+MATERIALIZED\s+VIEW\s+CONCURRENTLY\b",
    r"\bALTER\s+TABLE\b.*\bSET\s+LOGGED\b",
    r"\bALTER\s+TABLE\b.*\bSET\s+UNLOGGED\b",
    r"\bVACUUM\b",
)

BOOTSTRAP_SQL = """
CREATE SCHEMA IF NOT EXISTS solemd;

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
    'Durable record of schema migration application state, checksum, and execution mode.';
"""

LEDGER_COLUMNS = """
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
"""


class Cluster(StrEnum):
    SERVE = "serve"
    WAREHOUSE = "warehouse"


class ExecutionMode(StrEnum):
    TRANSACTIONAL = "transactional"
    AUTOCOMMIT = "autocommit"


@dataclass(frozen=True, slots=True)
class MigrationFile:
    name: str
    file_label: str
    path: Path
    checksum_sha256: str
    sql_bytes: int
    execution_mode: ExecutionMode


@dataclass(frozen=True, slots=True)
class LedgerRecord:
    migration_name: str
    migration_file: str
    checksum_sha256: str
    execution_mode: str
    status: str
    sql_bytes: int
    applied_at: str | None
    applied_by: str | None
    applied_via: str
    notes: str | None
    error_message: str | None
    recorded_at: str | None
    updated_at: str | None


@dataclass(frozen=True, slots=True)
class RolePassword:
    role: str
    password: str


@dataclass(frozen=True, slots=True)
class ClusterConfig:
    cluster: Cluster
    migrations_dir: Path
    admin_env: str
    bootstrap_dsn: str | None = None


@dataclass(slots=True)
class ReadinessReport:
    cluster: str
    ledger_present: bool
    ready: bool
    total_files: int
    recorded: int
    applied: int
    missing_migrations: list[str] = field(default_factory=list)
    checksum_mismatches: list[str] = field(default_factory=list)
    failed_migrations: list[str] = field(default_factory=list)
    unexpected_ledger_migrations: list[str] = field(default_factory=list)
    latest_applied_migration: str | None = None


@dataclass(slots=True)
class ApplyReport:
    cluster: str
    connection_dsn: str
    ready_after: bool
    applied_migrations: list[str] = field(default_factory=list)
    skipped_migrations: list[str] = field(default_factory=list)
    failed_migrations: list[str] = field(default_factory=list)
    synced_roles: list[str] = field(default_factory=list)
    readiness: ReadinessReport | None = None


@dataclass(slots=True)
class AdoptReport:
    cluster: str
    connection_dsn: str
    ready_after: bool
    adopted_migrations: list[str] = field(default_factory=list)
    skipped_migrations: list[str] = field(default_factory=list)
    conflicting_migrations: list[str] = field(default_factory=list)
    readiness: ReadinessReport | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply and verify SoleMD.Graph SQL migrations.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    apply_parser = subparsers.add_parser("apply", help="Apply pending migrations for one cluster.")
    add_cluster_arg(apply_parser)
    add_dsn_arg(apply_parser)
    apply_parser.add_argument("--note", default=None, help="Optional note recorded with each applied migration.")
    apply_parser.add_argument(
        "--sync-serve-role-passwords",
        action="store_true",
        help="After serve migrations succeed, set local role passwords from the environment.",
    )

    adopt_parser = subparsers.add_parser("adopt", help="Record existing migrations without executing SQL.")
    add_cluster_arg(adopt_parser)
    add_dsn_arg(adopt_parser)
    adopt_parser.add_argument("--note", default=None, help="Optional note recorded with adopted rows.")
    adopt_group = adopt_parser.add_mutually_exclusive_group(required=True)
    adopt_group.add_argument(
        "--migration",
        dest="migration_names",
        action="append",
        default=None,
        help="Migration name to adopt; repeat for more than one migration.",
    )
    adopt_group.add_argument("--through", dest="through_name", default=None, help="Adopt every migration through this name.")

    verify_parser = subparsers.add_parser("verify", help="Compare the ledger against on-disk migrations.")
    add_cluster_arg(verify_parser)
    add_dsn_arg(verify_parser)
    verify_parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when drift is detected. Without this flag, the report still prints.",
    )

    return parser.parse_args()


def add_cluster_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--cluster", choices=[cluster.value for cluster in Cluster], required=True)


def add_dsn_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--dsn",
        default=None,
        help="Override the admin/bootstrap connection DSN for this invocation.",
    )


def main() -> int:
    args = parse_args()
    cluster = Cluster(args.cluster)

    if args.command == "apply":
        report = apply_migrations(
            cluster=cluster,
            dsn_override=args.dsn,
            note=args.note,
            sync_serve_role_passwords=args.sync_serve_role_passwords,
        )
        emit_report(report)
        return 0 if report.ready_after else 1

    if args.command == "adopt":
        report = adopt_migrations(
            cluster=cluster,
            dsn_override=args.dsn,
            note=args.note,
            migration_names=args.migration_names,
            through_name=args.through_name,
        )
        emit_report(report)
        return 0 if report.ready_after else 1

    readiness = verify_migrations(cluster=cluster, dsn_override=args.dsn)
    emit_report(readiness)
    if args.check and not readiness.ready:
        return 1
    return 0


def apply_migrations(
    *,
    cluster: Cluster,
    dsn_override: str | None,
    note: str | None,
    sync_serve_role_passwords: bool,
) -> ApplyReport:
    config = resolve_cluster_config(cluster)
    migrations = discover_migrations(config.migrations_dir)
    connection_dsn = resolve_runner_dsn(
        config=config,
        dsn_override=dsn_override,
        allow_bootstrap=True,
        prefer_bootstrap=cluster == Cluster.SERVE,
    )

    ensure_ledger(connection_dsn)
    ledger_rows = load_ledger_rows(connection_dsn)
    readiness_before = compare_migrations(
        cluster=cluster,
        migrations=migrations,
        ledger_rows=ledger_rows,
        ledger_present=True,
    )
    del readiness_before

    applied: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []

    for migration in migrations:
        existing = find_ledger_row(ledger_rows, migration.name)
        if existing is not None and existing.status == "applied":
            if existing.checksum_sha256 != migration.checksum_sha256:
                raise RuntimeError(
                    f"checksum drift for {migration.name}: "
                    f"ledger={existing.checksum_sha256} file={migration.checksum_sha256}"
                )
            skipped.append(migration.name)
            continue

        expanded_sql = expand_sql_includes(migration.path)
        try:
            execute_migration(
                connection_dsn=connection_dsn,
                migration=migration,
                expanded_sql=expanded_sql,
                note=note,
            )
            applied.append(migration.name)
            ledger_rows = load_ledger_rows(connection_dsn)
        except Exception as exc:
            failed.append(migration.name)
            record_failed_migration(
                connection_dsn=connection_dsn,
                migration=migration,
                error_message=str(exc),
            )
            raise

    synced_roles: list[str] = []
    if cluster == Cluster.SERVE and sync_serve_role_passwords:
        synced_roles = sync_serve_role_passwords_from_environment(connection_dsn)

    readiness_after = verify_migrations(cluster=cluster, dsn_override=connection_dsn)
    return ApplyReport(
        cluster=cluster.value,
        connection_dsn=scrub_dsn_password(connection_dsn),
        ready_after=readiness_after.ready,
        applied_migrations=applied,
        skipped_migrations=skipped,
        failed_migrations=failed,
        synced_roles=synced_roles,
        readiness=readiness_after,
    )


def adopt_migrations(
    *,
    cluster: Cluster,
    dsn_override: str | None,
    note: str | None,
    migration_names: list[str] | None,
    through_name: str | None,
) -> AdoptReport:
    config = resolve_cluster_config(cluster)
    migrations = discover_migrations(config.migrations_dir)
    selected = select_migrations_for_adoption(
        migrations=migrations,
        migration_names=migration_names,
        through_name=through_name,
    )
    connection_dsn = resolve_runner_dsn(
        config=config,
        dsn_override=dsn_override,
        allow_bootstrap=True,
        prefer_bootstrap=cluster == Cluster.SERVE,
    )

    ensure_ledger(connection_dsn)
    ledger_rows = load_ledger_rows(connection_dsn)

    adopted: list[str] = []
    skipped: list[str] = []
    conflicting: list[str] = []

    for migration in selected:
        existing = find_ledger_row(ledger_rows, migration.name)
        if existing is not None and existing.status == "applied":
            if existing.checksum_sha256 != migration.checksum_sha256:
                conflicting.append(migration.name)
                continue
            skipped.append(migration.name)
            continue

        record_applied_migration(
            connection_dsn=connection_dsn,
            migration=migration,
            note=note,
        )
        adopted.append(migration.name)
        ledger_rows = load_ledger_rows(connection_dsn)

    readiness = verify_migrations(cluster=cluster, dsn_override=connection_dsn)
    return AdoptReport(
        cluster=cluster.value,
        connection_dsn=scrub_dsn_password(connection_dsn),
        ready_after=readiness.ready and not conflicting,
        adopted_migrations=adopted,
        skipped_migrations=skipped,
        conflicting_migrations=conflicting,
        readiness=readiness,
    )


def verify_migrations(*, cluster: Cluster, dsn_override: str | None) -> ReadinessReport:
    config = resolve_cluster_config(cluster)
    migrations = discover_migrations(config.migrations_dir)
    connection_dsn = resolve_runner_dsn(config=config, dsn_override=dsn_override, allow_bootstrap=True)

    ledger_present = ledger_exists(connection_dsn)
    ledger_rows = load_ledger_rows(connection_dsn) if ledger_present else []
    return compare_migrations(
        cluster=cluster,
        migrations=migrations,
        ledger_rows=ledger_rows,
        ledger_present=ledger_present,
    )


def resolve_cluster_config(cluster: Cluster) -> ClusterConfig:
    if cluster == Cluster.SERVE:
        return ClusterConfig(
            cluster=cluster,
            migrations_dir=MIGRATIONS_ROOT / cluster.value,
            admin_env="SERVE_DSN_ADMIN",
            bootstrap_dsn=build_serve_bootstrap_dsn(),
        )

    return ClusterConfig(
        cluster=cluster,
        migrations_dir=MIGRATIONS_ROOT / cluster.value,
        admin_env="WAREHOUSE_DSN_ADMIN",
        bootstrap_dsn=None,
    )


def build_serve_bootstrap_dsn() -> str | None:
    host_port = os.getenv("GRAPH_DB_SERVE_HOST_PORT")
    database = os.getenv("GRAPH_DB_SERVE_POSTGRES_DB")
    user = os.getenv("GRAPH_DB_SERVE_POSTGRES_USER")
    password = os.getenv("GRAPH_DB_SERVE_POSTGRES_PASSWORD")
    host = "127.0.0.1"
    if not all((host_port, database, user, password)):
        return None

    return build_postgres_dsn(
        user=user,
        password=password,
        host=host,
        port=int(host_port),
        database=database,
        application_name="schema-migrations-bootstrap",
    )


def build_postgres_dsn(
    *,
    user: str,
    password: str,
    host: str,
    port: int,
    database: str,
    application_name: str,
) -> str:
    authority = f"{quote(user)}:{quote(password)}@{host}:{port}"
    query = f"application_name={quote(application_name)}"
    return urlunsplit(("postgresql", authority, f"/{database}", query, ""))


def resolve_runner_dsn(
    *,
    config: ClusterConfig,
    dsn_override: str | None,
    allow_bootstrap: bool,
    prefer_bootstrap: bool = False,
) -> str:
    if dsn_override:
        return dsn_override

    admin_dsn = os.getenv(config.admin_env)
    if prefer_bootstrap and allow_bootstrap and config.bootstrap_dsn and connection_works(config.bootstrap_dsn):
        return config.bootstrap_dsn
    if admin_dsn and connection_works(admin_dsn):
        return admin_dsn

    if allow_bootstrap and config.bootstrap_dsn and connection_works(config.bootstrap_dsn):
        return config.bootstrap_dsn

    if admin_dsn:
        return admin_dsn
    if allow_bootstrap and config.bootstrap_dsn:
        return config.bootstrap_dsn
    raise RuntimeError(f"no usable DSN found for cluster {config.cluster.value}")


def connection_works(dsn: str) -> bool:
    try:
        with psycopg.connect(dsn, connect_timeout=5):
            return True
    except psycopg.Error:
        return False


def discover_migrations(migrations_dir: Path) -> list[MigrationFile]:
    if not migrations_dir.exists():
        return []

    migrations: list[MigrationFile] = []
    for path in sorted(migrations_dir.glob("*.sql"), key=lambda candidate: candidate.name):
        match = MIGRATION_FILENAME_RE.match(path.name)
        if match is None:
            raise ValueError(f"invalid migration filename: {path.name}")

        raw_sql = path.read_text(encoding="utf-8")
        expanded_sql = expand_sql_includes(path)
        execution_mode = (
            ExecutionMode.AUTOCOMMIT
            if looks_autocommit(expanded_sql)
            else ExecutionMode.TRANSACTIONAL
        )
        migrations.append(
            MigrationFile(
                name=match.group("name"),
                file_label=path.relative_to(REPO_ROOT).as_posix(),
                path=path,
                checksum_sha256=hashlib.sha256(raw_sql.encode("utf-8")).hexdigest(),
                sql_bytes=len(raw_sql.encode("utf-8")),
                execution_mode=execution_mode,
            )
        )
    return migrations


def expand_sql_includes(path: Path, *, seen: tuple[Path, ...] = ()) -> str:
    resolved_path = path.resolve()
    if resolved_path in seen:
        chain = " -> ".join(candidate.name for candidate in (*seen, resolved_path))
        raise RuntimeError(f"recursive migration include detected: {chain}")

    lines: list[str] = []
    for line in resolved_path.read_text(encoding="utf-8").splitlines(keepends=True):
        match = INCLUDE_RE.match(line)
        if match is None:
            lines.append(line)
            continue

        include_token = match.group(1).strip()
        include_path = resolve_include_path(resolved_path.parent, include_token)
        expanded = expand_sql_includes(include_path, seen=(*seen, resolved_path))
        lines.append(f"-- begin include: {include_path.relative_to(REPO_ROOT).as_posix()}\n")
        lines.append(expanded)
        if expanded and not expanded.endswith("\n"):
            lines.append("\n")
        lines.append(f"-- end include: {include_path.relative_to(REPO_ROOT).as_posix()}\n")
    return "".join(lines)


def resolve_include_path(base_dir: Path, include_token: str) -> Path:
    cleaned = include_token.strip().strip("'\"")
    include_path = (base_dir / cleaned).resolve()
    allowed_root = (REPO_ROOT / "db").resolve()
    try:
        include_path.relative_to(allowed_root)
    except ValueError as exc:
        raise ValueError(
            f"included SQL path must stay under {allowed_root}: {cleaned}"
        ) from exc
    if not include_path.exists():
        raise FileNotFoundError(f"included SQL file not found: {cleaned}")
    return include_path


def looks_autocommit(sql_text: str) -> bool:
    return any(
        re.search(marker, sql_text, flags=re.IGNORECASE | re.DOTALL)
        for marker in AUTOCOMMIT_MARKERS
    )


def ensure_ledger(connection_dsn: str) -> None:
    with psycopg.connect(connection_dsn, autocommit=True) as conn:
        conn.execute(BOOTSTRAP_SQL)


def ledger_exists(connection_dsn: str) -> bool:
    with psycopg.connect(connection_dsn, row_factory=dict_row) as conn:
        result = conn.execute(
            "SELECT to_regclass(%s) AS ledger_name",
            (LEDGER_TABLE_REF,),
        ).fetchone()
    return bool(result and result["ledger_name"])


def load_ledger_rows(connection_dsn: str) -> list[LedgerRecord]:
    with psycopg.connect(connection_dsn, row_factory=dict_row) as conn:
        rows = conn.execute(
            f"""
            SELECT {LEDGER_COLUMNS}
            FROM {LEDGER_TABLE_REF}
            ORDER BY migration_name
            """
        ).fetchall()
    return [LedgerRecord(**coerce_ledger_row(row)) for row in rows]


def coerce_ledger_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "migration_name": row["migration_name"],
        "migration_file": row["migration_file"],
        "checksum_sha256": row["checksum_sha256"],
        "execution_mode": row["execution_mode"],
        "status": row["status"],
        "sql_bytes": int(row["sql_bytes"]),
        "applied_at": stringify_optional(row["applied_at"]),
        "applied_by": stringify_optional(row["applied_by"]),
        "applied_via": row["applied_via"],
        "notes": stringify_optional(row["notes"]),
        "error_message": stringify_optional(row["error_message"]),
        "recorded_at": stringify_optional(row["recorded_at"]),
        "updated_at": stringify_optional(row["updated_at"]),
    }


def stringify_optional(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def compare_migrations(
    *,
    cluster: Cluster,
    migrations: list[MigrationFile],
    ledger_rows: list[LedgerRecord],
    ledger_present: bool,
) -> ReadinessReport:
    file_names = {migration.name for migration in migrations}
    ledger_by_name = {row.migration_name: row for row in ledger_rows}

    missing_migrations: list[str] = []
    checksum_mismatches: list[str] = []
    failed_migrations = [row.migration_name for row in ledger_rows if row.status != "applied"]
    unexpected_ledger_migrations = [
        row.migration_name for row in ledger_rows if row.migration_name not in file_names
    ]

    latest_applied: str | None = None
    for row in ledger_rows:
        if row.status == "applied":
            latest_applied = row.migration_name

    for migration in migrations:
        ledger_row = ledger_by_name.get(migration.name)
        if ledger_row is None or ledger_row.status != "applied":
            missing_migrations.append(migration.name)
            continue
        if ledger_row.checksum_sha256 != migration.checksum_sha256:
            checksum_mismatches.append(migration.name)

    applied_count = sum(1 for row in ledger_rows if row.status == "applied")
    ready = (
        ledger_present
        and not missing_migrations
        and not checksum_mismatches
        and not failed_migrations
        and not unexpected_ledger_migrations
    )
    return ReadinessReport(
        cluster=cluster.value,
        ledger_present=ledger_present,
        ready=ready,
        total_files=len(migrations),
        recorded=len(ledger_rows),
        applied=applied_count,
        missing_migrations=missing_migrations,
        checksum_mismatches=checksum_mismatches,
        failed_migrations=failed_migrations,
        unexpected_ledger_migrations=unexpected_ledger_migrations,
        latest_applied_migration=latest_applied,
    )


def execute_migration(
    *,
    connection_dsn: str,
    migration: MigrationFile,
    expanded_sql: str,
    note: str | None,
) -> None:
    autocommit = migration.execution_mode == ExecutionMode.AUTOCOMMIT
    with psycopg.connect(connection_dsn, autocommit=autocommit) as conn:
        if autocommit:
            conn.execute(expanded_sql)
            insert_ledger_row(conn, migration=migration, status="applied", note=note, error_message=None)
            return

        with conn.transaction():
            conn.execute(expanded_sql)
            insert_ledger_row(conn, migration=migration, status="applied", note=note, error_message=None)


def record_applied_migration(
    *,
    connection_dsn: str,
    migration: MigrationFile,
    note: str | None,
) -> None:
    with psycopg.connect(connection_dsn, autocommit=True) as conn:
        insert_ledger_row(
            conn,
            migration=migration,
            status="applied",
            note=note,
            error_message=None,
        )


def record_failed_migration(
    *,
    connection_dsn: str,
    migration: MigrationFile,
    error_message: str,
) -> None:
    with psycopg.connect(connection_dsn, autocommit=True) as conn:
        if not ledger_exists(connection_dsn):
            return
        insert_ledger_row(
            conn,
            migration=migration,
            status="failed",
            note=None,
            error_message=error_message,
        )


def insert_ledger_row(
    conn: psycopg.Connection[Any],
    *,
    migration: MigrationFile,
    status: str,
    note: str | None,
    error_message: str | None,
) -> None:
    conn.execute(
        f"""
        INSERT INTO {LEDGER_TABLE_REF} (
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
            %(migration_name)s,
            %(migration_file)s,
            %(checksum_sha256)s,
            %(execution_mode)s,
            %(status)s,
            %(sql_bytes)s,
            now(),
            current_user,
            %(applied_via)s,
            %(notes)s,
            %(error_message)s,
            now(),
            now()
        )
        ON CONFLICT (migration_name) DO UPDATE SET
            migration_file = EXCLUDED.migration_file,
            checksum_sha256 = EXCLUDED.checksum_sha256,
            execution_mode = EXCLUDED.execution_mode,
            status = EXCLUDED.status,
            sql_bytes = EXCLUDED.sql_bytes,
            applied_at = CASE
                WHEN EXCLUDED.status = 'applied' THEN now()
                ELSE {LEDGER_TABLE_REF}.applied_at
            END,
            applied_by = CASE
                WHEN EXCLUDED.status = 'applied' THEN current_user
                ELSE {LEDGER_TABLE_REF}.applied_by
            END,
            applied_via = EXCLUDED.applied_via,
            notes = COALESCE(EXCLUDED.notes, {LEDGER_TABLE_REF}.notes),
            error_message = EXCLUDED.error_message,
            recorded_at = now(),
            updated_at = now()
        """,
        {
            "migration_name": migration.name,
            "migration_file": migration.file_label,
            "checksum_sha256": migration.checksum_sha256,
            "execution_mode": migration.execution_mode.value,
            "status": status,
            "sql_bytes": migration.sql_bytes,
            "applied_via": APPLIED_VIA,
            "notes": note,
            "error_message": error_message,
        },
    )


def find_ledger_row(ledger_rows: list[LedgerRecord], migration_name: str) -> LedgerRecord | None:
    for row in ledger_rows:
        if row.migration_name == migration_name:
            return row
    return None


def select_migrations_for_adoption(
    *,
    migrations: list[MigrationFile],
    migration_names: list[str] | None,
    through_name: str | None,
) -> list[MigrationFile]:
    if migration_names:
        selected: list[MigrationFile] = []
        missing: list[str] = []
        by_name = {migration.name: migration for migration in migrations}
        for name in migration_names:
            migration = by_name.get(name)
            if migration is None:
                missing.append(name)
                continue
            selected.append(migration)
        if missing:
            raise ValueError(f"unknown migration(s): {', '.join(missing)}")
        return selected

    assert through_name is not None
    selected = []
    found = False
    for migration in migrations:
        selected.append(migration)
        if migration.name == through_name:
            found = True
            break
    if not found:
        raise ValueError(f"unknown through migration: {through_name}")
    return selected


def sync_serve_role_passwords_from_environment(connection_dsn: str) -> list[str]:
    roles = resolve_serve_role_passwords()
    if not roles:
        return []

    with psycopg.connect(connection_dsn, autocommit=True) as conn:
        for role in roles:
            conn.execute(
                sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                    sql.Identifier(role.role),
                    sql.Literal(role.password),
                )
            )
    return [role.role for role in roles]


def resolve_serve_role_passwords() -> list[RolePassword]:
    read_dsn = os.getenv("SERVE_DSN_READ")
    admin_dsn = os.getenv("SERVE_DSN_ADMIN")
    pgbouncer_auth_password = os.getenv("PGBOUNCER_AUTH_PASSWORD")

    resolved: list[RolePassword] = []
    for env_name, dsn in (("SERVE_DSN_READ", read_dsn), ("SERVE_DSN_ADMIN", admin_dsn)):
        if not dsn:
            raise RuntimeError(f"{env_name} is required when syncing serve role passwords")
        parsed = urlsplit(dsn)
        if not parsed.username or parsed.password is None:
            raise RuntimeError(f"{env_name} must include a username and password for local role sync")
        resolved.append(RolePassword(role=parsed.username, password=parsed.password))

    if not pgbouncer_auth_password:
        raise RuntimeError("PGBOUNCER_AUTH_PASSWORD is required when syncing serve role passwords")
    resolved.append(RolePassword(role="pgbouncer_auth", password=pgbouncer_auth_password))
    return resolved


def scrub_dsn_password(dsn: str) -> str:
    parsed = urlsplit(dsn)
    if parsed.password is None:
        return dsn

    if parsed.username is None:
        return dsn
    authority = f"{quote(parsed.username)}:***@{parsed.hostname or ''}"
    if parsed.port:
        authority = f"{authority}:{parsed.port}"
    return urlunsplit((parsed.scheme, authority, parsed.path, parsed.query, parsed.fragment))


def emit_report(report: Any) -> None:
    print(json.dumps(asdict(report), indent=2, sort_keys=True))


if __name__ == "__main__":
    raise SystemExit(main())
