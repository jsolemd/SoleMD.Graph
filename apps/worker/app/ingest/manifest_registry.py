from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

from app.config import Settings
from app.ingest.models import FilePlan, SourceCode


class ManifestRegistryError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class SourceFamilySpec:
    family: str
    datasets: tuple[str, ...]
    required: bool = True
    enabled_by_default: bool = True


S2_FAMILIES: tuple[SourceFamilySpec, ...] = (
    SourceFamilySpec("publication_venues", ("publication-venues",)),
    SourceFamilySpec("authors", ("authors",), required=False, enabled_by_default=False),
    SourceFamilySpec("papers", ("papers",)),
    SourceFamilySpec("abstracts", ("abstracts",)),
    SourceFamilySpec("tldrs", ("tldrs",), required=False, enabled_by_default=False),
    SourceFamilySpec("citations", ("citations",)),
    SourceFamilySpec("s2orc_v2", ("s2orc_v2",), required=False, enabled_by_default=False),
)

PT3_FAMILIES: tuple[SourceFamilySpec, ...] = (
    SourceFamilySpec("biocxml", ("biocxml",)),
    SourceFamilySpec("bioconcepts", ("bioconcepts2pubtator3.gz",)),
    SourceFamilySpec("relations", ("relation2pubtator3.gz",)),
)


def family_specs_for_source(source_code: SourceCode) -> tuple[SourceFamilySpec, ...]:
    if source_code == "s2":
        return S2_FAMILIES
    if source_code == "pt3":
        return PT3_FAMILIES
    raise ManifestRegistryError(f"unsupported source_code {source_code!r}")


def resolve_release_dir(settings: Settings, source_code: SourceCode, release_tag: str) -> Path:
    if source_code == "s2":
        return settings.semantic_scholar_release_dir(release_tag)
    if source_code == "pt3":
        return settings.pubtator_release_dir(release_tag)
    raise ManifestRegistryError(f"unsupported source_code {source_code!r}")


def manifest_dir_for_release(release_dir: Path) -> Path:
    return release_dir / "manifests"


def release_manifest_checksum(release_dir: Path) -> str:
    manifest_dir = manifest_dir_for_release(release_dir)
    if not manifest_dir.exists():
        raise ManifestRegistryError(f"missing manifest directory at {manifest_dir}")

    digest = hashlib.sha256()
    for manifest_path in sorted(manifest_dir.glob("*.json")):
        digest.update(manifest_path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(_canonical_json_bytes(json.loads(manifest_path.read_text())))
        digest.update(b"\0")
    return digest.hexdigest()


def read_manifest_file_plans(
    *,
    release_dir: Path,
    dataset: str,
    max_files: int | None = None,
) -> tuple[FilePlan, ...]:
    manifest_path = manifest_dir_for_release(release_dir) / f"{dataset}.manifest.json"
    if manifest_path.exists():
        payload = json.loads(manifest_path.read_text())
        files = payload.get("files", [])
        results: list[FilePlan] = []
        for item in files[:max_files]:
            path = _resolve_manifest_entry_path(
                release_dir=release_dir,
                dataset=dataset,
                output_dir=payload.get("output_dir"),
                file_name=str(item["name"]),
            )
            results.append(
                FilePlan(
                    dataset=dataset,
                    path=path,
                    byte_count=int(item["bytes"]),
                    content_kind=_content_kind_for_path(path),
                    manifest_path=manifest_path,
                )
            )
        return tuple(results)

    direct_path = release_dir / dataset
    if direct_path.is_file():
        return (
            FilePlan(
                dataset=dataset,
                path=direct_path,
                byte_count=direct_path.stat().st_size,
                content_kind=_content_kind_for_path(direct_path),
            ),
        )
    if direct_path.exists():
        files = sorted(path for path in direct_path.iterdir() if path.is_file())
        if max_files is not None:
            files = files[:max_files]
        return tuple(
            FilePlan(
                dataset=dataset,
                path=path,
                byte_count=path.stat().st_size,
                content_kind=_content_kind_for_path(path),
            )
            for path in files
        )
    raise ManifestRegistryError(f"missing manifest or dataset path for {dataset} under {release_dir}")


def _resolve_manifest_entry_path(
    *,
    release_dir: Path,
    dataset: str,
    output_dir: str | None,
    file_name: str,
) -> Path:
    if output_dir:
        output_path = Path(output_dir)
        if not output_path.is_absolute():
            output_path = release_dir / output_dir
        candidate = output_path / file_name
        if candidate.exists():
            return candidate
    return release_dir / dataset / file_name


def _content_kind_for_path(path: Path) -> str:
    name = path.name
    if name.endswith(".jsonl.gz"):
        return "jsonl_gz"
    if name.endswith(".tar.gz"):
        return "tar_gz"
    if name.endswith(".gz"):
        return "tsv_gz"
    if name.endswith(".sqlite"):
        return "sqlite"
    if name.endswith(".json"):
        return "manifest_json"
    raise ManifestRegistryError(f"unsupported file type for {path}")


def _canonical_json_bytes(payload: object) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
