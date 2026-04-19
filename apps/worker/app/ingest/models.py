from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


SourceCode = Literal["s2", "pt3"]
TriggerKind = Literal["manual", "manifest"]
ContentKind = Literal["jsonl_gz", "tsv_gz", "tar_gz", "manifest_json", "sqlite"]


class StartReleaseRequest(BaseModel):
    source_code: SourceCode
    release_tag: str = Field(min_length=1)
    force_new_run: bool = False
    trigger: TriggerKind = "manual"
    requested_by: str | None = None
    family_allowlist: tuple[str, ...] | None = None
    max_files_per_family: int | None = Field(default=None, ge=1)
    max_records_per_file: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def normalize(self) -> "StartReleaseRequest":
        if self.family_allowlist:
            self.family_allowlist = tuple(sorted({value.strip() for value in self.family_allowlist if value.strip()}))
        return self


class FilePlan(BaseModel):
    dataset: str
    path: Path
    byte_count: int = Field(ge=0)
    content_kind: ContentKind
    manifest_path: Path | None = None


class FamilyPlan(BaseModel):
    family: str
    source_datasets: tuple[str, ...]
    files: tuple[FilePlan, ...]
    target_tables: tuple[str, ...]


class IngestPlan(BaseModel):
    schema_version: int = 1
    source_code: SourceCode
    release_tag: str
    release_dir: Path
    manifest_uri: str
    release_checksum: str
    source_published_at: datetime | None = None
    families: tuple[FamilyPlan, ...]
    deferred_families: tuple[str, ...] = ()

    @property
    def family_names(self) -> tuple[str, ...]:
        return tuple(family.family for family in self.families)


class IngestRunRecord(BaseModel):
    ingest_run_id: UUID
    source_release_id: int
    status: int
    families_loaded: tuple[str, ...] = ()
    last_loaded_family: str | None = None
    manifest_uri: str | None = None
    plan_manifest: dict | None = None


class CopyStats(BaseModel):
    family: str
    row_count: int = 0
    file_count: int = 0
