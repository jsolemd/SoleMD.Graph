from pathlib import Path
from uuid import UUID

from app.graph import build


def test_cleanup_unkept_runtime_directories_removes_only_unkept_dirs(tmp_path: Path) -> None:
    keep_dir = tmp_path / "keep-me"
    drop_dir = tmp_path / "drop-me"
    keep_dir.mkdir()
    drop_dir.mkdir()
    (keep_dir / "file.txt").write_text("keep")
    (drop_dir / "file.txt").write_text("drop")

    build._cleanup_unkept_runtime_directories(tmp_path, keep_names={"keep-me"})

    assert keep_dir.exists()
    assert not drop_dir.exists()


class _Cursor:
    def __init__(self, rows) -> None:
        self._rows = list(rows)
        self.executed: list[str] = []

    def execute(self, sql: str, params=None) -> None:
        self.executed.append(sql.strip())

    def fetchone(self):
        if not self._rows:
            return None
        return self._rows.pop(0)


def test_load_cleanup_keep_run_ids_prefers_is_current_run() -> None:
    cur = _Cursor([{"id": "current-run"}])

    keep = build._load_cleanup_keep_run_ids(cur, {"resume-run"})

    assert keep == {"resume-run", "current-run"}
    assert len(cur.executed) == 1


def test_load_cleanup_keep_run_ids_normalizes_uuid_rows_to_strings() -> None:
    cur = _Cursor([{"id": UUID("2b96f229-2c48-407a-8d32-d9db15c8bca9")}])

    keep = build._load_cleanup_keep_run_ids(cur, set())

    assert keep == {"2b96f229-2c48-407a-8d32-d9db15c8bca9"}


def test_load_cleanup_keep_run_ids_falls_back_to_latest_completed_run() -> None:
    cur = _Cursor([None, {"id": "latest-completed"}])

    keep = build._load_cleanup_keep_run_ids(cur, set())

    assert keep == {"latest-completed"}
    assert len(cur.executed) == 2
