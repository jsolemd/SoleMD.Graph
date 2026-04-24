from __future__ import annotations

from collections.abc import Iterable
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
import errno
import json
from pathlib import Path
import shutil
from typing import Literal

import asyncpg

from app.config import Settings
from app.db import open_named_connection
from app.ingest.manifest_registry import (
    ManifestRegistryError,
    SourceFamilySpec,
    family_specs_for_source,
    read_manifest_file_plans,
    release_manifest_checksum,
    resolve_release_dir,
)
from app.ingest.models import SourceCode
from app.ingest.runtime import (
    INGEST_STATUS_ABORTED,
    INGEST_STATUS_FAILED,
    INGEST_STATUS_PUBLISHED,
    resolve_release_advisory_lock_key,
)


RetentionAction = Literal[
    "keep",
    "archive_candidate",
    "delete_candidate",
    "manual_review",
    "blocked",
]
RetentionApplyAction = Literal["archive", "delete"]

_TERMINAL_INGEST_STATUSES = frozenset(
    {INGEST_STATUS_PUBLISHED, INGEST_STATUS_FAILED, INGEST_STATUS_ABORTED}
)
_ALWAYS_KEEP_DATASETS = frozenset({"manifests"})


class SourceRetentionError(RuntimeError):
    pass


class SourceRetentionBlocked(SourceRetentionError):
    pass


@dataclass(frozen=True, slots=True)
class SourceRetentionRunState:
    source_release_id: int | None
    release_status: str | None
    manifest_checksum: str | None
    ingest_run_id: str | None
    ingest_status: int | None
    requested_status: int | None
    families_loaded: tuple[str, ...]
    has_active_run: bool = False


@dataclass(frozen=True, slots=True)
class SourceRetentionItem:
    dataset: str
    family: str | None
    path: str
    action: RetentionAction
    reason: str
    byte_count: int | None
    safe_to_archive: bool
    safe_to_delete: bool


@dataclass(frozen=True, slots=True)
class SourceRetentionReport:
    source_code: SourceCode
    release_tag: str
    release_dir: str
    dry_run: bool
    execution_blocked: bool
    blockers: tuple[str, ...]
    run_state: SourceRetentionRunState | None
    items: tuple[SourceRetentionItem, ...]

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True)


async def run_source_retention_operation(
    runtime_settings: Settings,
    *,
    source_code: SourceCode,
    release_tag: str,
    execute: bool,
    action: RetentionApplyAction,
    archive_root: Path | None,
    provenance_ok: bool,
) -> tuple[int, str]:
    try:
        async with open_named_connection(runtime_settings, name="ingest_write") as connection:
            async with hold_source_retention_lock(
                connection,
                source_code=source_code,
                release_tag=release_tag,
            ):
                run_state = await load_source_retention_run_state(
                    connection,
                    source_code=source_code,
                    release_tag=release_tag,
                )
                report = build_source_retention_report(
                    runtime_settings,
                    source_code=source_code,
                    release_tag=release_tag,
                    run_state=run_state,
                    dry_run=not execute,
                )
                changed: tuple[str, ...] = ()
                if execute:
                    changed = apply_source_retention_report(
                        report,
                        action=action,
                        archive_root=archive_root,
                        provenance_ok=provenance_ok,
                    )
                return 0, _retention_payload_json(report=report, changed=changed)
    except SourceRetentionError as exc:
        payload = {
            "changed": (),
            "error": str(exc),
            "report": {
                "source_code": source_code,
                "release_tag": release_tag,
                "dry_run": not execute,
                "execution_blocked": True,
                "blockers": (str(exc),),
                "items": (),
            },
        }
        return (1 if execute else 0), json.dumps(payload, indent=2, sort_keys=True)


@asynccontextmanager
async def hold_source_retention_lock(
    connection: asyncpg.Connection,
    *,
    source_code: SourceCode,
    release_tag: str,
):
    lock_key = await resolve_release_advisory_lock_key(
        connection,
        source_code=source_code,
        release_tag=release_tag,
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise SourceRetentionBlocked(
            f"release {source_code}:{release_tag} is locked by an active ingest"
        )
    try:
        yield lock_key
    finally:
        await connection.execute("SELECT pg_advisory_unlock($1)", lock_key)


async def load_source_retention_run_state(
    connection: asyncpg.Connection,
    *,
    source_code: SourceCode,
    release_tag: str,
) -> SourceRetentionRunState:
    row = await connection.fetchrow(
        """
        WITH release AS (
            SELECT source_release_id, release_status, manifest_checksum
            FROM solemd.source_releases
            WHERE source_name = $1
              AND source_release_key = $2
        ),
        latest_run AS (
            SELECT ir.ingest_run_id,
                   ir.status,
                   ir.requested_status,
                   ir.families_loaded
            FROM solemd.ingest_runs ir
            JOIN release r ON r.source_release_id = ir.source_release_id
            ORDER BY ir.started_at DESC
            LIMIT 1
        ),
        active_run AS (
            SELECT EXISTS (
                SELECT 1
                FROM solemd.ingest_runs ir
                JOIN release r ON r.source_release_id = ir.source_release_id
                WHERE ir.status BETWEEN 1 AND 4
                   OR ir.requested_status IS NOT NULL
            ) AS has_active_run
        )
        SELECT r.source_release_id,
               r.release_status,
               r.manifest_checksum,
               lr.ingest_run_id::text AS ingest_run_id,
               lr.status AS ingest_status,
               lr.requested_status,
               lr.families_loaded,
               coalesce(ar.has_active_run, false) AS has_active_run
        FROM release r
        LEFT JOIN latest_run lr ON true
        LEFT JOIN active_run ar ON true
        """,
        source_code,
        release_tag,
    )
    if row is None:
        return SourceRetentionRunState(
            source_release_id=None,
            release_status=None,
            manifest_checksum=None,
            ingest_run_id=None,
            ingest_status=None,
            requested_status=None,
            families_loaded=(),
        )
    return SourceRetentionRunState(
        source_release_id=row["source_release_id"],
        release_status=row["release_status"],
        manifest_checksum=row["manifest_checksum"],
        ingest_run_id=row["ingest_run_id"],
        ingest_status=row["ingest_status"],
        requested_status=row["requested_status"],
        families_loaded=tuple(row["families_loaded"] or ()),
        has_active_run=bool(row["has_active_run"]),
    )


def build_source_retention_report(
    runtime_settings: Settings,
    *,
    source_code: SourceCode,
    release_tag: str,
    run_state: SourceRetentionRunState | None,
    dry_run: bool,
) -> SourceRetentionReport:
    if source_code != "s2":
        raise SourceRetentionError("source-retention currently supports s2 releases only")

    release_dir = _validated_release_dir(runtime_settings, source_code, release_tag)
    blockers = _retention_blockers(
        release_dir=release_dir,
        source_code=source_code,
        run_state=run_state,
    )
    execution_blocked = bool(blockers)
    family_specs = family_specs_for_source(source_code)
    specs_by_dataset = _family_specs_by_dataset(family_specs)
    loaded_families = set(run_state.families_loaded if run_state else ())
    items = ()
    if release_dir.exists():
        items = tuple(
            _classify_dataset_path(
                release_dir=release_dir,
                dataset_path=dataset_path,
                spec=specs_by_dataset.get(dataset_path.name),
                loaded_families=loaded_families,
                release_loaded=(run_state.release_status == "loaded" if run_state else False),
                execution_blocked=execution_blocked,
            )
            for dataset_path in sorted(release_dir.iterdir(), key=lambda item: item.name)
        )
    return SourceRetentionReport(
        source_code=source_code,
        release_tag=release_tag,
        release_dir=str(release_dir),
        dry_run=dry_run,
        execution_blocked=execution_blocked,
        blockers=tuple(blockers),
        run_state=run_state,
        items=items,
    )


def apply_source_retention_report(
    report: SourceRetentionReport,
    *,
    action: RetentionApplyAction,
    archive_root: Path | None = None,
    provenance_ok: bool = False,
) -> tuple[str, ...]:
    if report.execution_blocked:
        raise SourceRetentionBlocked("; ".join(report.blockers))
    if action == "delete" and not provenance_ok:
        raise SourceRetentionError("--provenance-ok is required before deleting source archives")

    release_dir = Path(report.release_dir).resolve(strict=True)
    archive_root = _validated_archive_root(archive_root, release_dir) if action == "archive" else None
    changed: list[str] = []
    for item in report.items:
        if action == "archive" and not item.safe_to_archive:
            continue
        if action == "delete" and not item.safe_to_delete:
            continue
        source_path = Path(item.path).resolve(strict=True)
        _validate_mutation_path(source_path, release_dir)
        if action == "delete":
            _delete_path(source_path)
            changed.append(str(source_path))
        else:
            assert archive_root is not None
            target_path = _archive_target_path(
                archive_root=archive_root,
                source_code=report.source_code,
                release_tag=report.release_tag,
                source_path=source_path,
            )
            _archive_path(source_path, target_path)
            changed.append(f"{source_path} -> {target_path}")
    return tuple(changed)


def _retention_blockers(
    *,
    release_dir: Path,
    source_code: SourceCode,
    run_state: SourceRetentionRunState | None,
) -> list[str]:
    blockers: list[str] = []
    if not release_dir.exists():
        blockers.append(f"missing release directory: {release_dir}")
    if run_state is None or run_state.source_release_id is None:
        blockers.append("missing solemd.source_releases row")
        return blockers
    if run_state.has_active_run:
        blockers.append("release has an active ingest run or pending requested_status")
    if run_state.ingest_status not in _TERMINAL_INGEST_STATUSES:
        blockers.append(f"latest ingest run is not terminal: {run_state.ingest_status}")
    if source_code == "s2":
        try:
            current_checksum = release_manifest_checksum(release_dir)
        except ManifestRegistryError as exc:
            blockers.append(str(exc))
        else:
            if run_state.manifest_checksum and run_state.manifest_checksum != current_checksum:
                blockers.append("current manifest checksum differs from source_releases.manifest_checksum")
    return blockers


def _retention_payload_json(
    *,
    report: SourceRetentionReport,
    changed: tuple[str, ...],
) -> str:
    return json.dumps(
        {
            "changed": changed,
            "report": asdict(report),
        },
        indent=2,
        sort_keys=True,
    )


def _classify_dataset_path(
    *,
    release_dir: Path,
    dataset_path: Path,
    spec: SourceFamilySpec | None,
    loaded_families: set[str],
    release_loaded: bool,
    execution_blocked: bool,
) -> SourceRetentionItem:
    dataset = dataset_path.name
    if dataset_path.is_symlink():
        return SourceRetentionItem(
            dataset=dataset,
            family=spec.family if spec else None,
            path=str(dataset_path),
            action="manual_review",
            reason="source-retention never mutates symlink aliases automatically",
            byte_count=None,
            safe_to_archive=False,
            safe_to_delete=False,
        )
    byte_count = _manifest_dataset_byte_count(release_dir, dataset)
    if execution_blocked:
        return SourceRetentionItem(
            dataset=dataset,
            family=spec.family if spec else None,
            path=str(dataset_path),
            action="blocked",
            reason="retention execution is blocked by release-level safety checks",
            byte_count=byte_count,
            safe_to_archive=False,
            safe_to_delete=False,
        )
    if dataset in _ALWAYS_KEEP_DATASETS:
        return SourceRetentionItem(
            dataset=dataset,
            family=None,
            path=str(dataset_path),
            action="keep",
            reason="manifests are retained for provenance and checksum validation",
            byte_count=byte_count,
            safe_to_archive=False,
            safe_to_delete=False,
        )
    if spec is None:
        return SourceRetentionItem(
            dataset=dataset,
            family=None,
            path=str(dataset_path),
            action="manual_review",
            reason="dataset is not part of the current ingest family registry",
            byte_count=byte_count,
            safe_to_archive=False,
            safe_to_delete=False,
        )
    if spec.family in loaded_families:
        return SourceRetentionItem(
            dataset=dataset,
            family=spec.family,
            path=str(dataset_path),
            action="archive_candidate",
            reason="family is recorded in ingest_runs.families_loaded",
            byte_count=byte_count,
            safe_to_archive=True,
            safe_to_delete=release_loaded,
        )
    if spec.enabled_by_default:
        return SourceRetentionItem(
            dataset=dataset,
            family=spec.family,
            path=str(dataset_path),
            action="keep",
            reason="default ingest family is not yet recorded in families_loaded",
            byte_count=byte_count,
            safe_to_archive=False,
            safe_to_delete=False,
        )
    return SourceRetentionItem(
        dataset=dataset,
        family=spec.family,
        path=str(dataset_path),
        action="keep",
        reason=f"{spec.tier} family is deferred from default ingest and has not been consumed yet",
        byte_count=byte_count,
        safe_to_archive=False,
        safe_to_delete=False,
    )


def _family_specs_by_dataset(
    family_specs: Iterable[SourceFamilySpec],
) -> dict[str, SourceFamilySpec]:
    result: dict[str, SourceFamilySpec] = {}
    for spec in family_specs:
        for dataset in spec.datasets:
            result[dataset] = spec
    return result


def _manifest_dataset_byte_count(release_dir: Path, dataset: str) -> int | None:
    try:
        return sum(
            file_plan.byte_count
            for file_plan in read_manifest_file_plans(
                release_dir=release_dir,
                dataset=dataset,
            )
        )
    except ManifestRegistryError:
        return None


def _validated_release_dir(
    runtime_settings: Settings,
    source_code: SourceCode,
    release_tag: str,
) -> Path:
    release_dir = resolve_release_dir(runtime_settings, source_code, release_tag)
    root = runtime_settings.semantic_scholar_root.resolve(strict=False)
    resolved = release_dir.resolve(strict=False)
    if release_dir.is_symlink():
        raise SourceRetentionError(f"release directory must not be a symlink: {release_dir}")
    if not resolved.is_relative_to(root):
        raise SourceRetentionError(f"release directory escapes source root: {release_dir}")
    return resolved


def _validate_mutation_path(source_path: Path, release_dir: Path) -> None:
    if source_path == release_dir or not source_path.is_relative_to(release_dir):
        raise SourceRetentionError(f"refusing to mutate path outside release directory: {source_path}")
    if source_path.name in _ALWAYS_KEEP_DATASETS:
        raise SourceRetentionError(f"refusing to mutate provenance directory: {source_path}")
    if source_path.is_symlink():
        raise SourceRetentionError(f"refusing to mutate symlinked source path: {source_path}")


def _validated_archive_root(archive_root: Path | None, release_dir: Path) -> Path:
    if archive_root is None:
        raise SourceRetentionError("--archive-root is required for archive action")
    resolved = archive_root.resolve(strict=False)
    if resolved == release_dir or resolved.is_relative_to(release_dir):
        raise SourceRetentionError("archive root must not be inside the source release directory")
    return resolved


def _delete_path(source_path: Path) -> None:
    if source_path.is_dir():
        shutil.rmtree(source_path)
        return
    source_path.unlink()


def _archive_target_path(
    *,
    archive_root: Path,
    source_code: SourceCode,
    release_tag: str,
    source_path: Path,
) -> Path:
    target_path = archive_root.resolve(strict=False) / source_code / release_tag / source_path.name
    if target_path.exists():
        raise SourceRetentionError(f"archive target already exists: {target_path}")
    return target_path


def _archive_path(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        source_path.rename(target_path)
    except OSError as exc:
        if exc.errno == errno.EXDEV:
            raise SourceRetentionError(
                "archive action requires same-filesystem rename; copy/delete is intentionally not automated"
            ) from exc
        raise
