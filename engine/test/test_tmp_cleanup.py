from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from scripts.tmp_cleanup import inspect_temp_artifacts


def _write_file(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _set_age_hours(path: Path, *, hours: float, now: datetime) -> None:
    timestamp = (now - timedelta(hours=hours)).timestamp()
    for nested in [path, *path.rglob("*")]:
        os.utime(nested, (timestamp, timestamp))


def test_inspect_temp_artifacts_reports_repo_temp_roots_and_candidates(tmp_path: Path):
    now = datetime(2026, 3, 31, 20, 0, tzinfo=UTC)
    root_tmp = tmp_path / ".tmp"
    engine_tmp = tmp_path / "engine" / ".tmp"

    _write_file(root_tmp / "runtime-report.json", "report")
    _write_file(root_tmp / "rag_refresh" / "run-a" / "checkpoint.json", "checkpoint")
    _write_file(engine_tmp / "bioc_archive_campaign" / "run-b" / "result.json", "campaign")
    _set_age_hours(root_tmp / "runtime-report.json", hours=30, now=now)
    _set_age_hours(root_tmp / "rag_refresh" / "run-a", hours=30, now=now)
    _set_age_hours(engine_tmp / "bioc_archive_campaign" / "run-b", hours=3, now=now)

    report = inspect_temp_artifacts(
        min_age_hours=24,
        project_root=tmp_path,
        graph_tmp_root=tmp_path / "graph-tmp",
        now=now,
        largest_limit=10,
    )

    assert report.total_root_bytes > 0
    assert {Path(root.root).name for root in report.roots if root.exists} == {".tmp"}
    matched_paths = {Path(entry.path).name for entry in report.matched_entries}
    assert "runtime-report.json" in matched_paths
    assert "run-a" in matched_paths
    assert "run-b" not in matched_paths


def test_inspect_temp_artifacts_can_delete_stale_temp_entries_and_pycache(tmp_path: Path):
    now = datetime(2026, 3, 31, 20, 0, tzinfo=UTC)
    root_tmp = tmp_path / ".tmp"
    pycache_dir = tmp_path / "engine" / "app" / "__pycache__"

    _write_file(root_tmp / "stale.json", "old")
    _write_file(root_tmp / "fresh.json", "new")
    _write_file(pycache_dir / "module.cpython-313.pyc", "bytecode")
    _set_age_hours(root_tmp / "stale.json", hours=72, now=now)
    _set_age_hours(root_tmp / "fresh.json", hours=2, now=now)
    _set_age_hours(pycache_dir, hours=72, now=now)

    report = inspect_temp_artifacts(
        min_age_hours=24,
        delete=True,
        include_pycache=True,
        project_root=tmp_path,
        graph_tmp_root=tmp_path / "graph-tmp",
        now=now,
        largest_limit=10,
    )

    removed_paths = {Path(entry.path).name for entry in report.removed_entries}
    assert "stale.json" in removed_paths
    assert "__pycache__" in removed_paths
    assert not (root_tmp / "stale.json").exists()
    assert (root_tmp / "fresh.json").exists()
    assert not pycache_dir.exists()


def test_inspect_temp_artifacts_prunes_superseded_runtime_versions(tmp_path: Path):
    now = datetime(2026, 4, 1, 9, 0, tzinfo=UTC)
    root_tmp = tmp_path / ".tmp"

    newest = root_tmp / "rag-runtime-eval-current-all-families-v3.json"
    older = root_tmp / "rag-runtime-eval-current-all-families-v2.json"
    oldest = root_tmp / "rag-runtime-eval-current-all-families-v1.json"
    live_log = root_tmp / "rag-runtime-eval-current-all-families-v3.log"

    _write_file(newest, "v3")
    _write_file(older, "v2")
    _write_file(oldest, "v1")
    _write_file(live_log, "log")
    _set_age_hours(newest, hours=1, now=now)
    _set_age_hours(older, hours=1, now=now)
    _set_age_hours(oldest, hours=1, now=now)
    _set_age_hours(live_log, hours=1, now=now)

    report = inspect_temp_artifacts(
        min_age_hours=24,
        delete=True,
        keep_latest_versions=1,
        project_root=tmp_path,
        graph_tmp_root=tmp_path / "graph-tmp",
        now=now,
        largest_limit=10,
    )

    superseded_paths = {Path(entry.path).name for entry in report.superseded_entries}
    removed_paths = {Path(entry.path).name for entry in report.removed_entries}
    matched_paths = {Path(entry.path).name for entry in report.matched_entries}

    assert superseded_paths == {
        "rag-runtime-eval-current-all-families-v1.json",
        "rag-runtime-eval-current-all-families-v2.json",
    }
    assert removed_paths == superseded_paths
    assert matched_paths == superseded_paths
    assert newest.exists()
    assert live_log.exists()
    assert not older.exists()
    assert not oldest.exists()
