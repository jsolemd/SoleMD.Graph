from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


LocatorKind = Literal["pmcid", "pmid"]
ResolverKind = Literal[
    "paper_row_pmcid",
    "pmid_direct",
    "id_converter_pmid",
    "pubmed_esummary_pmid",
    "id_converter_doi",
]


class AcquirePaperTextRequest(BaseModel):
    corpus_id: int = Field(ge=1)
    force_refresh: bool = False
    requested_by: str | None = None


class PaperMetadata(BaseModel):
    corpus_id: int
    pmid: int | None = None
    pmc_id: str | None = None
    doi_norm: str | None = None
    title: str


class ResolvedLocator(BaseModel):
    locator_kind: LocatorKind
    locator_value: str
    resolver_kind: ResolverKind
    resolved_pmc_id: str | None = None


class FetchManifest(BaseModel):
    source_name: str = "pmc_bioc_api"
    locator_kind: LocatorKind
    locator_value: str
    resolver_kind: ResolverKind
    resolved_pmc_id: str | None = None
    manifest_uri: str
    response_checksum: str
    fetched_at: datetime


class PaperTextRunRecord(BaseModel):
    paper_text_run_id: UUID
    status: int
