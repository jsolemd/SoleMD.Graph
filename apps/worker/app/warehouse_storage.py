from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
import os
from pathlib import Path
import re
from uuid import uuid4
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Settings


RUNNING_BLOCK_DEVICE_STATES = frozenset({"running", "live"})


class WarehouseStorageError(RuntimeError):
    """Raised when the local warehouse filesystem is not safe for writes."""


@dataclass(frozen=True, slots=True)
class MountInfo:
    mount_point: Path
    source: str
    fs_type: str
    options: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class WarehouseStorageHealth:
    ok: bool
    path: str
    enabled: bool
    issues: tuple[str, ...] = ()
    mount_source: str | None = None
    mount_point: str | None = None
    fs_type: str | None = None
    mount_options: tuple[str, ...] = ()
    block_device_state: str | None = None
    block_device_read_only: bool | None = None
    total_bytes: int | None = None
    available_bytes: int | None = None
    used_percent: float | None = None
    host_path: str | None = None
    host_total_bytes: int | None = None
    host_available_bytes: int | None = None
    host_used_percent: float | None = None
    host_file_bytes: int | None = None

    def as_probe_check(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "name": "warehouse_storage",
            "ok": self.ok,
            "enabled": self.enabled,
            "path": self.path,
        }
        if self.issues:
            payload["error"] = "; ".join(self.issues)
        if self.mount_source is not None:
            payload["mount_source"] = self.mount_source
        if self.mount_point is not None:
            payload["mount_point"] = self.mount_point
        if self.fs_type is not None:
            payload["fs_type"] = self.fs_type
        if self.mount_options:
            payload["mount_options"] = ",".join(self.mount_options)
        if self.block_device_state is not None:
            payload["block_device_state"] = self.block_device_state
        if self.block_device_read_only is not None:
            payload["block_device_read_only"] = self.block_device_read_only
        if self.total_bytes is not None:
            payload["total_bytes"] = self.total_bytes
        if self.available_bytes is not None:
            payload["available_bytes"] = self.available_bytes
        if self.used_percent is not None:
            payload["used_percent"] = round(self.used_percent, 2)
        if self.host_path is not None:
            payload["host_path"] = self.host_path
        if self.host_total_bytes is not None:
            payload["host_total_bytes"] = self.host_total_bytes
        if self.host_available_bytes is not None:
            payload["host_available_bytes"] = self.host_available_bytes
        if self.host_used_percent is not None:
            payload["host_used_percent"] = round(self.host_used_percent, 2)
        if self.host_file_bytes is not None:
            payload["host_file_bytes"] = self.host_file_bytes
        return payload


def check_warehouse_storage(settings: Settings) -> WarehouseStorageHealth:
    path = Path(settings.warehouse_storage_path).expanduser()
    expected_mount_path = Path(settings.warehouse_storage_mount_path).expanduser()
    if not settings.warehouse_storage_check_enabled:
        return WarehouseStorageHealth(ok=True, enabled=False, path=str(path))

    issues: list[str] = []
    mounts = _read_mountinfo()
    mount = _find_mount_for_path(path, mounts=mounts)
    expected_mount = _find_mount_point(expected_mount_path, mounts=mounts)
    block_device_state: str | None = None
    block_device_read_only: bool | None = None
    total_bytes: int | None = None
    available_bytes: int | None = None
    used_percent: float | None = None
    host_path: Path | None = None
    host_total_bytes: int | None = None
    host_available_bytes: int | None = None
    host_used_percent: float | None = None
    host_file_bytes: int | None = None

    if expected_mount is None:
        issues.append(f"{expected_mount_path} is not mounted")
    elif mount is None or not _path_is_relative_to(path.absolute(), expected_mount.mount_point):
        issues.append(f"{path} is not on expected mount {expected_mount_path}")

    if mount is None:
        issues.append(f"{path} is not mounted")
    else:
        if (
            settings.warehouse_storage_expected_fs_type
            and mount.fs_type != settings.warehouse_storage_expected_fs_type
        ):
            issues.append(
                f"{path} filesystem is {mount.fs_type}, expected "
                f"{settings.warehouse_storage_expected_fs_type}"
            )
        if "rw" not in mount.options:
            issues.append(f"{path} is mounted without rw access")
        if (
            settings.warehouse_storage_require_device_running
            and mount.source.startswith("/dev/")
        ):
            block_device_state = _read_block_device_state(mount.source)
            block_device_read_only = _read_block_device_read_only(mount.source)
            if (
                block_device_state is not None
                and block_device_state not in RUNNING_BLOCK_DEVICE_STATES
            ):
                issues.append(
                    f"{mount.source} state is {block_device_state}, not running"
                )
            if block_device_read_only is True:
                issues.append(f"{mount.source} is read-only")

    try:
        stat = os.statvfs(path)
    except OSError as exc:
        issues.append(f"statvfs failed for {path}: {exc.strerror or exc}")
    else:
        total_bytes = stat.f_blocks * stat.f_frsize
        available_bytes = stat.f_bavail * stat.f_frsize
        if total_bytes > 0:
            used_percent = ((total_bytes - available_bytes) / total_bytes) * 100.0
            if used_percent > settings.warehouse_storage_max_used_percent:
                issues.append(
                    "warehouse storage is "
                    f"{used_percent:.2f}% used; limit is "
                    f"{settings.warehouse_storage_max_used_percent:.2f}%"
                )
        if available_bytes < settings.warehouse_storage_min_free_bytes:
            issues.append(
                "warehouse storage has "
                f"{_format_bytes(available_bytes)} available; minimum is "
                f"{_format_bytes(settings.warehouse_storage_min_free_bytes)}"
            )

    if settings.warehouse_storage_fsync_check_enabled:
        try:
            _probe_fsync_write(path)
        except OSError as exc:
            issues.append(f"fsync write probe failed for {path}: {exc.strerror or exc}")

    if settings.warehouse_storage_host_check_enabled:
        host_path = Path(settings.warehouse_storage_host_path).expanduser()
        host_parent = host_path.parent
        try:
            host_stat = os.statvfs(host_parent)
        except OSError as exc:
            issues.append(
                f"host storage statvfs failed for {host_parent}: {exc.strerror or exc}"
            )
        else:
            host_total_bytes = host_stat.f_blocks * host_stat.f_frsize
            host_available_bytes = host_stat.f_bavail * host_stat.f_frsize
            if host_total_bytes > 0:
                host_used_percent = (
                    (host_total_bytes - host_available_bytes) / host_total_bytes
                ) * 100.0
            if host_available_bytes < settings.warehouse_storage_host_min_free_bytes:
                issues.append(
                    "warehouse VHD host drive has "
                    f"{_format_bytes(host_available_bytes)} available; minimum is "
                    f"{_format_bytes(settings.warehouse_storage_host_min_free_bytes)}"
                )
        try:
            host_file_bytes = host_path.stat().st_size
        except OSError as exc:
            issues.append(
                f"warehouse VHD host file stat failed for {host_path}: "
                f"{exc.strerror or exc}"
            )

    return WarehouseStorageHealth(
        ok=not issues,
        enabled=True,
        path=str(path),
        issues=tuple(issues),
        mount_source=mount.source if mount is not None else None,
        mount_point=str(mount.mount_point) if mount is not None else None,
        fs_type=mount.fs_type if mount is not None else None,
        mount_options=mount.options if mount is not None else (),
        block_device_state=block_device_state,
        block_device_read_only=block_device_read_only,
        total_bytes=total_bytes,
        available_bytes=available_bytes,
        used_percent=used_percent,
        host_path=str(host_path) if host_path is not None else None,
        host_total_bytes=host_total_bytes,
        host_available_bytes=host_available_bytes,
        host_used_percent=host_used_percent,
        host_file_bytes=host_file_bytes,
    )


def require_warehouse_storage_ready(settings: Settings) -> None:
    health = check_warehouse_storage(settings)
    if health.ok:
        return
    raise WarehouseStorageError(
        "warehouse storage health check failed: "
        + "; ".join(health.issues)
        + ". Stop warehouse writers, run wsl.exe --shutdown from Windows, "
        + "reopen NVIDIA-Workbench, then verify the mount before restarting ingest."
    )


def _find_mount_for_path(
    path: Path,
    *,
    mounts: tuple[MountInfo, ...] | None = None,
) -> MountInfo | None:
    target = path.absolute()
    candidates = [
        mount
        for mount in mounts or _read_mountinfo()
        if _path_is_relative_to(target, mount.mount_point)
    ]
    if not candidates:
        return None
    return max(candidates, key=_mount_priority)


def _find_mount_point(
    path: Path,
    *,
    mounts: tuple[MountInfo, ...] | None = None,
) -> MountInfo | None:
    target = path.absolute()
    candidates = [
        mount for mount in mounts or _read_mountinfo() if mount.mount_point == target
    ]
    if not candidates:
        return None
    return max(candidates, key=_mount_priority)


def _mount_priority(mount: MountInfo) -> tuple[int, bool, bool]:
    return (
        len(mount.mount_point.parts),
        mount.fs_type != "autofs",
        mount.source.startswith("/dev/"),
    )


def _read_mountinfo(path: Path = Path("/proc/self/mountinfo")) -> tuple[MountInfo, ...]:
    mounts: list[MountInfo] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return ()
    for line in lines:
        try:
            left, right = line.split(" - ", 1)
            left_fields = left.split()
            right_fields = right.split()
            mount_point = Path(_decode_mount_field(left_fields[4]))
            options = tuple(left_fields[5].split(","))
            fs_type = right_fields[0]
            source = _decode_mount_field(right_fields[1])
        except (IndexError, ValueError):
            continue
        mounts.append(
            MountInfo(
                mount_point=mount_point,
                source=source,
                fs_type=fs_type,
                options=options,
            )
        )
    return tuple(mounts)


def _path_is_relative_to(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def _decode_mount_field(value: str) -> str:
    return re.sub(r"\\([0-7]{3})", lambda match: chr(int(match.group(1), 8)), value)


def _read_block_device_state(source: str) -> str | None:
    device_name = Path(source).name
    candidates = (
        Path("/sys/class/block") / device_name / "device" / "state",
        Path("/sys/block") / device_name / "device" / "state",
    )
    for candidate in candidates:
        try:
            state = candidate.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if state:
            return state
    return None


def _read_block_device_read_only(source: str) -> bool | None:
    device_name = Path(source).name
    candidates = (
        Path("/sys/class/block") / device_name / "ro",
        Path("/sys/block") / device_name / "ro",
    )
    for candidate in candidates:
        try:
            value = candidate.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if value in {"0", "1"}:
            return value == "1"
    return None


def _probe_fsync_write(path: Path) -> None:
    probe_path = path / f".warehouse-storage-healthcheck.{os.getpid()}.{uuid4().hex}"
    fd: int | None = None
    write_complete = False
    close_error: OSError | None = None
    try:
        fd = os.open(probe_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.write(fd, b"warehouse storage healthcheck\n")
        os.fsync(fd)
        write_complete = True
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError as exc:
                close_error = exc
        if write_complete:
            os.unlink(probe_path)
            _fsync_directory(path)
            if close_error is not None:
                raise close_error
        else:
            with suppress(OSError):
                os.unlink(probe_path)


def _fsync_directory(path: Path) -> None:
    dir_fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


def _format_bytes(value: int) -> str:
    gib = value / float(1024 * 1024 * 1024)
    return f"{gib:.1f} GiB"
