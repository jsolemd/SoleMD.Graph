from __future__ import annotations

from pathlib import Path

import pytest

from app.config import settings as default_settings
from app.warehouse_storage import (
    MountInfo,
    WarehouseStorageError,
    check_warehouse_storage,
    require_warehouse_storage_ready,
)


def test_warehouse_storage_check_can_be_disabled() -> None:
    runtime_settings = default_settings.model_copy(
        update={"warehouse_storage_check_enabled": False}
    )

    health = check_warehouse_storage(runtime_settings)

    assert health.ok is True
    assert health.enabled is False


def test_warehouse_storage_requires_running_block_device(monkeypatch) -> None:
    runtime_settings = default_settings.model_copy(
        update={
            "warehouse_storage_path": "/mnt/solemd-graph",
            "warehouse_storage_max_used_percent": 99.0,
            "warehouse_storage_min_free_bytes": 0,
            "warehouse_storage_fsync_check_enabled": False,
            "warehouse_storage_host_check_enabled": False,
        }
    )

    class FakeStat:
        f_blocks = 100
        f_bfree = 50
        f_bavail = 50
        f_frsize = 1024

    monkeypatch.setattr(
        "app.warehouse_storage._read_mountinfo",
        lambda: (
            _mount(
                source="/dev/sdd",
                mount_point="/mnt/solemd-graph",
                options=("rw", "relatime"),
            ),
        ),
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_state", lambda _: "offline"
    )
    monkeypatch.setattr("app.warehouse_storage.os.statvfs", lambda _: FakeStat())

    health = check_warehouse_storage(runtime_settings)

    assert health.ok is False
    assert health.block_device_state == "offline"
    assert health.block_device_read_only is False
    assert any("state is offline" in issue for issue in health.issues)


def test_warehouse_storage_enforces_usage_threshold(monkeypatch) -> None:
    runtime_settings = default_settings.model_copy(
        update={
            "warehouse_storage_path": "/mnt/solemd-graph",
            "warehouse_storage_max_used_percent": 90.0,
            "warehouse_storage_min_free_bytes": 0,
            "warehouse_storage_fsync_check_enabled": False,
            "warehouse_storage_host_check_enabled": False,
        }
    )

    class FakeStat:
        f_blocks = 100
        f_bfree = 50
        f_bavail = 7
        f_frsize = 1024

    monkeypatch.setattr(
        "app.warehouse_storage._read_mountinfo",
        lambda: (
            _mount(
                source="/dev/sdd",
                mount_point="/mnt/solemd-graph",
                options=("rw", "relatime"),
            ),
        ),
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_state", lambda _: "running"
    )
    monkeypatch.setattr("app.warehouse_storage.os.statvfs", lambda _: FakeStat())

    with pytest.raises(
        WarehouseStorageError,
        match="warehouse storage health check failed",
    ):
        require_warehouse_storage_ready(runtime_settings)


def test_warehouse_storage_requires_expected_mount(monkeypatch) -> None:
    runtime_settings = default_settings.model_copy(
        update={
            "warehouse_storage_path": "/mnt/solemd-graph",
            "warehouse_storage_min_free_bytes": 0,
            "warehouse_storage_fsync_check_enabled": False,
            "warehouse_storage_host_check_enabled": False,
        }
    )

    class FakeStat:
        f_blocks = 100
        f_bfree = 50
        f_bavail = 50
        f_frsize = 1024

    monkeypatch.setattr(
        "app.warehouse_storage._read_mountinfo",
        lambda: (
            _mount(
                source="/dev/sde",
                mount_point="/",
                options=("rw", "relatime"),
            ),
        ),
    )
    monkeypatch.setattr("app.warehouse_storage.os.statvfs", lambda _: FakeStat())

    health = check_warehouse_storage(runtime_settings)

    assert health.ok is False
    assert any("/mnt/solemd-graph is not mounted" in issue for issue in health.issues)


def test_warehouse_storage_prefers_concrete_mount_over_autofs(monkeypatch) -> None:
    runtime_settings = default_settings.model_copy(
        update={
            "warehouse_storage_path": "/mnt/solemd-graph",
            "warehouse_storage_max_used_percent": 99.0,
            "warehouse_storage_min_free_bytes": 0,
            "warehouse_storage_fsync_check_enabled": False,
            "warehouse_storage_host_check_enabled": False,
        }
    )

    class FakeStat:
        f_blocks = 100
        f_bfree = 50
        f_bavail = 50
        f_frsize = 1024

    monkeypatch.setattr(
        "app.warehouse_storage._read_mountinfo",
        lambda: (
            _mount(
                source="systemd-1",
                mount_point="/mnt/solemd-graph",
                fs_type="autofs",
                options=("rw", "relatime"),
            ),
            _mount(
                source="/dev/sde",
                mount_point="/mnt/solemd-graph",
                options=("rw", "relatime"),
            ),
        ),
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_state",
        lambda _: "running",
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_read_only",
        lambda _: False,
    )
    monkeypatch.setattr("app.warehouse_storage.os.statvfs", lambda _: FakeStat())

    health = check_warehouse_storage(runtime_settings)

    assert health.ok is True
    assert health.mount_source == "/dev/sde"
    assert health.fs_type == "ext4"


def test_warehouse_storage_reports_fsync_probe_failure(monkeypatch) -> None:
    runtime_settings = default_settings.model_copy(
        update={
            "warehouse_storage_path": "/mnt/solemd-graph",
            "warehouse_storage_max_used_percent": 99.0,
            "warehouse_storage_min_free_bytes": 0,
            "warehouse_storage_host_check_enabled": False,
        }
    )

    class FakeStat:
        f_blocks = 100
        f_bfree = 50
        f_bavail = 50
        f_frsize = 1024

    monkeypatch.setattr(
        "app.warehouse_storage._read_mountinfo",
        lambda: (
            _mount(
                source="/dev/sdd",
                mount_point="/mnt/solemd-graph",
                options=("rw", "relatime"),
            ),
        ),
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_state", lambda _: "running"
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_read_only",
        lambda _: False,
    )
    monkeypatch.setattr("app.warehouse_storage.os.statvfs", lambda _: FakeStat())
    monkeypatch.setattr(
        "app.warehouse_storage._probe_fsync_write",
        lambda _: (_ for _ in ()).throw(OSError("I/O error")),
    )

    health = check_warehouse_storage(runtime_settings)

    assert health.ok is False
    assert any("fsync write probe failed" in issue for issue in health.issues)


def test_warehouse_storage_enforces_host_drive_free_space(monkeypatch) -> None:
    runtime_settings = default_settings.model_copy(
        update={
            "warehouse_storage_path": "/mnt/solemd-graph",
            "warehouse_storage_max_used_percent": 99.0,
            "warehouse_storage_min_free_bytes": 0,
            "warehouse_storage_fsync_check_enabled": False,
            "warehouse_storage_host_path": "/mnt/e/wsl2-solemd-graph.vhdx",
            "warehouse_storage_host_min_free_bytes": 100 * 1024,
        }
    )

    class FakeWarehouseStat:
        f_blocks = 100
        f_bfree = 50
        f_bavail = 50
        f_frsize = 1024

    class FakeHostStat:
        f_blocks = 100
        f_bfree = 1
        f_bavail = 1
        f_frsize = 1024

    class FakePathStat:
        st_size = 1_999_479_242_752

    def fake_statvfs(path):
        if str(path) == "/mnt/e":
            return FakeHostStat()
        return FakeWarehouseStat()

    monkeypatch.setattr(
        "app.warehouse_storage._read_mountinfo",
        lambda: (
            _mount(
                source="/dev/sdd",
                mount_point="/mnt/solemd-graph",
                options=("rw", "relatime"),
            ),
        ),
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_state",
        lambda _: "running",
    )
    monkeypatch.setattr(
        "app.warehouse_storage._read_block_device_read_only",
        lambda _: False,
    )
    monkeypatch.setattr("app.warehouse_storage.os.statvfs", fake_statvfs)
    monkeypatch.setattr(
        "app.warehouse_storage.Path.stat",
        lambda self: FakePathStat(),
    )

    health = check_warehouse_storage(runtime_settings)

    assert health.ok is False
    assert health.host_available_bytes == 1024
    assert health.host_file_bytes == 1_999_479_242_752
    assert any("warehouse VHD host drive" in issue for issue in health.issues)


def _mount(
    *,
    source: str,
    mount_point: str,
    options: tuple[str, ...],
    fs_type: str = "ext4",
) -> MountInfo:
    return MountInfo(
        source=source,
        mount_point=Path(mount_point),
        fs_type=fs_type,
        options=options,
    )
