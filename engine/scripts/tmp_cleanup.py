"""Repo-local temporary artifact inspection and cleanup helpers."""

from __future__ import annotations

import re
import shutil
from collections import defaultdict
from collections.abc import Sequence
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
    keep_latest_versions: int
    roots: list[TempCleanupRootSummary] = field(default_factory=list)
    largest_entries: list[TempArtifactEntry] = field(default_factory=list)
    stale_entries: list[TempArtifactEntry] = field(default_factory=list)
    superseded_entries: list[TempArtifactEntry] = field(default_factory=list)
    matched_entries: list[TempArtifactEntry] = field(default_factory=list)
    removed_entries: list[TempArtifactEntry] = field(default_factory=list)
    total_root_bytes: int = 0
    stale_bytes: int = 0
    superseded_bytes: int = 0
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
    keep_latest_versions: int = 0,
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
    candidate_paths: list[Path] = []
    candidate_entries: list[TempArtifactEntry] = []
    stale_entries: list[TempArtifactEntry] = []
    superseded_entries: list[TempArtifactEntry] = []
    matched_entries: list[TempArtifactEntry] = []
    removed_entries: list[TempArtifactEntry] = []
    total_root_bytes = 0
    stale_bytes = 0
    superseded_bytes = 0
    matched_bytes = 0
    removed_bytes = 0
    seen_candidate_paths: set[Path] = set()

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
            resolved_candidate = candidate.resolve(strict=False)
            if resolved_candidate in seen_candidate_paths:
                continue
            seen_candidate_paths.add(resolved_candidate)
            candidate_paths.append(resolved_candidate)

    if include_pycache:
        pycache_entries = list(_iter_pycaches(resolved_project_root))
        for path in pycache_entries:
            resolved_path = path.resolve(strict=False)
            if resolved_path in seen_candidate_paths:
                continue
            seen_candidate_paths.add(resolved_path)
            candidate_paths.append(resolved_path)

    artifact_by_path: dict[str, tuple[Path, TempArtifactEntry]] = {}
    for candidate_path in candidate_paths:
        artifact = _artifact_entry(candidate_path, now=current_time)
        artifact_by_path[artifact.path] = (candidate_path, artifact)
        candidate_entries.append(artifact)

    stale_paths: set[str] = set()
    for artifact in candidate_entries:
        if artifact.age_hours < min_age_hours:
            continue
        stale_entries.append(artifact)
        stale_paths.add(artifact.path)
        stale_bytes += artifact.size_bytes

    superseded_paths = {
        str(path.resolve(strict=False))
        for path in _find_superseded_versioned_paths(
            candidate_paths,
            keep_latest_versions=keep_latest_versions,
        )
    }
    for artifact in candidate_entries:
        if artifact.path not in superseded_paths:
            continue
        superseded_entries.append(artifact)
        superseded_bytes += artifact.size_bytes

    matched_paths = stale_paths | superseded_paths
    for matched_path in matched_paths:
        _path, artifact = artifact_by_path[matched_path]
        matched_entries.append(artifact)
        matched_bytes += artifact.size_bytes
        if delete:
            _delete_path(_path)
            removed_entries.append(artifact)
            removed_bytes += artifact.size_bytes

    candidate_entries.sort(key=lambda item: item.size_bytes, reverse=True)
    stale_entries.sort(key=lambda item: item.size_bytes, reverse=True)
    superseded_entries.sort(key=lambda item: item.size_bytes, reverse=True)
    matched_entries.sort(key=lambda item: item.size_bytes, reverse=True)
    removed_entries.sort(key=lambda item: item.size_bytes, reverse=True)

    return TempCleanupReport(
        generated_at=current_time.isoformat(),
        min_age_hours=min_age_hours,
        delete=delete,
        include_pycache=include_pycache,
        include_graph_tmp=include_graph_tmp,
        keep_latest_versions=keep_latest_versions,
        roots=root_summaries,
        largest_entries=candidate_entries[:largest_limit],
        stale_entries=stale_entries,
        superseded_entries=superseded_entries,
        matched_entries=matched_entries,
        removed_entries=removed_entries,
        total_root_bytes=total_root_bytes,
        stale_bytes=stale_bytes,
        superseded_bytes=superseded_bytes,
        matched_bytes=matched_bytes,
        removed_bytes=removed_bytes,
    )


_VERSION_SERIES_RE = re.compile(
    r"^(?P<prefix>.+)-v(?P<version>\d+)(?P<suffix>(?:[-.].*)?)$"
)
_RETENTION_EXTENSIONS = {".json", ".txt", ".stdout"}


def _find_superseded_versioned_paths(
    candidate_paths: Sequence[Path],
    *,
    keep_latest_versions: int,
) -> list[Path]:
    if keep_latest_versions <= 0:
        return []

    grouped_paths: dict[tuple[str, str], list[tuple[int, float, Path]]] = defaultdict(list)
    for path in candidate_paths:
        if not path.is_file():
            continue
        parsed = _version_retention_key(path)
        if parsed is None:
            continue
        series_key, version = parsed
        grouped_paths[(str(path.parent), series_key)].append(
            (version, path.stat().st_mtime, path)
        )

    superseded_paths: list[Path] = []
    for entries in grouped_paths.values():
        if len(entries) <= keep_latest_versions:
            continue
        ranked_entries = sorted(
            entries,
            key=lambda item: (item[0], item[1], item[2].name),
            reverse=True,
        )
        superseded_paths.extend(path for *_rest, path in ranked_entries[keep_latest_versions:])
    return superseded_paths


def _version_retention_key(path: Path) -> tuple[str, int] | None:
    if path.suffix not in _RETENTION_EXTENSIONS:
        return None
    match = _VERSION_SERIES_RE.match(path.name)
    if match is None:
        return None
    series_key = f"{match.group('prefix')}-v#{match.group('suffix')}"
    return series_key, int(match.group("version"))


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
