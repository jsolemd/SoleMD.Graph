"""Repo-local temporary artifact inspection and cleanup helpers."""

from __future__ import annotations

import shutil
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings


@dataclass(frozen=True, slots=True)
class TempArtifactEntry:
    path: str
    artifact_type: str
    size_bytes: int
    age_hours: float


@dataclass(frozen=True, slots=True)
class TempCleanupRootSummary:
    root: str
    exists: bool
    size_bytes: int
    candidate_count: int


@dataclass(slots=True)
class TempCleanupReport:
    generated_at: str
    min_age_hours: float
    delete: bool
    include_pycache: bool
    include_graph_tmp: bool
    roots: list[TempCleanupRootSummary] = field(default_factory=list)
    largest_entries: list[TempArtifactEntry] = field(default_factory=list)
    matched_entries: list[TempArtifactEntry] = field(default_factory=list)
    removed_entries: list[TempArtifactEntry] = field(default_factory=list)
    total_root_bytes: int = 0
    matched_bytes: int = 0
    removed_bytes: int = 0

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def inspect_temp_artifacts(
    *,
    min_age_hours: float = 24.0,
    delete: bool = False,
    include_pycache: bool = False,
    include_graph_tmp: bool = False,
    project_root: Path | None = None,
    graph_tmp_root: Path | None = None,
    now: datetime | None = None,
    largest_limit: int = 20,
) -> TempCleanupReport:
    resolved_project_root = (project_root or settings.project_root_path).resolve(strict=False)
    resolved_graph_tmp_root = (
        graph_tmp_root if graph_tmp_root is not None else settings.graph_tmp_root_path
    )
    current_time = now or datetime.now(UTC)

    roots = [
        resolved_project_root / ".tmp",
        resolved_project_root / "engine" / ".tmp",
    ]
    if include_graph_tmp:
        roots.append(resolved_graph_tmp_root)

    root_summaries: list[TempCleanupRootSummary] = []
    candidate_entries: list[TempArtifactEntry] = []
    matched_entries: list[TempArtifactEntry] = []
    removed_entries: list[TempArtifactEntry] = []
    total_root_bytes = 0
    matched_bytes = 0
    removed_bytes = 0

    for root in roots:
        root_path = root.resolve(strict=False)
        if not root_path.exists():
            root_summaries.append(
                TempCleanupRootSummary(
                    root=str(root_path),
                    exists=False,
                    size_bytes=0,
                    candidate_count=0,
                )
            )
            continue

        root_size, _ = _measure_path(root_path)
        root_candidates = list(_iter_root_candidates(root_path))
        total_root_bytes += root_size
        root_summaries.append(
            TempCleanupRootSummary(
                root=str(root_path),
                exists=True,
                size_bytes=root_size,
                candidate_count=len(root_candidates),
            )
        )
        for candidate in root_candidates:
            artifact = _artifact_entry(candidate, now=current_time)
            candidate_entries.append(artifact)
            if artifact.age_hours < min_age_hours:
                continue
            matched_entries.append(artifact)
            matched_bytes += artifact.size_bytes
            if delete:
                _delete_path(candidate)
                removed_entries.append(artifact)
                removed_bytes += artifact.size_bytes

    if include_pycache:
        pycache_entries = list(_iter_pycaches(resolved_project_root))
        for path in pycache_entries:
            artifact = _artifact_entry(path, now=current_time)
            candidate_entries.append(artifact)
            if artifact.age_hours < min_age_hours:
                continue
            matched_entries.append(artifact)
            matched_bytes += artifact.size_bytes
            if delete:
                _delete_path(path)
                removed_entries.append(artifact)
                removed_bytes += artifact.size_bytes

    candidate_entries.sort(key=lambda item: item.size_bytes, reverse=True)
    matched_entries.sort(key=lambda item: item.size_bytes, reverse=True)
    removed_entries.sort(key=lambda item: item.size_bytes, reverse=True)

    return TempCleanupReport(
        generated_at=current_time.isoformat(),
        min_age_hours=min_age_hours,
        delete=delete,
        include_pycache=include_pycache,
        include_graph_tmp=include_graph_tmp,
        roots=root_summaries,
        largest_entries=candidate_entries[:largest_limit],
        matched_entries=matched_entries,
        removed_entries=removed_entries,
        total_root_bytes=total_root_bytes,
        matched_bytes=matched_bytes,
        removed_bytes=removed_bytes,
    )


def _iter_root_candidates(root: Path):
    for child in sorted(root.iterdir(), key=lambda item: item.name):
        if child.name == "__pycache__":
            continue
        if child.is_file():
            yield child
            continue
        if not child.is_dir():
            continue

        nested_items = list(sorted(child.iterdir(), key=lambda item: item.name))
        nested_dirs = [item for item in nested_items if item.is_dir()]
        nested_files = [item for item in nested_items if item.is_file()]

        yield from nested_files

        if nested_dirs:
            yield from nested_dirs
            continue

        yield child


def _iter_pycaches(project_root: Path):
    seen: set[Path] = set()
    for path in project_root.rglob("__pycache__"):
        resolved = path.resolve(strict=False)
        if resolved in seen:
            continue
        seen.add(resolved)
        yield resolved


def _artifact_entry(path: Path, *, now: datetime) -> TempArtifactEntry:
    size_bytes, latest_mtime = _measure_path(path)
    age_hours = max(0.0, (now.timestamp() - latest_mtime) / 3600.0)
    return TempArtifactEntry(
        path=str(path.resolve(strict=False)),
        artifact_type="directory" if path.is_dir() else "file",
        size_bytes=size_bytes,
        age_hours=round(age_hours, 3),
    )


def _measure_path(path: Path) -> tuple[int, float]:
    if path.is_file():
        stat = path.stat()
        return stat.st_size, stat.st_mtime

    total_bytes = 0
    latest_mtime = path.stat().st_mtime
    for nested in path.rglob("*"):
        try:
            stat = nested.stat()
        except OSError:
            continue
        latest_mtime = max(latest_mtime, stat.st_mtime)
        if nested.is_file():
            total_bytes += stat.st_size
    return total_bytes, latest_mtime


def _delete_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=False)
        return
    path.unlink(missing_ok=True)
