from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class StartPubMedMetadataEnrichmentRequest(BaseModel):
    corpus_selection_run_id: UUID
    requested_by: str | None = None
    max_papers: int | None = Field(default=None, ge=1)
    force_refresh: bool = False


class StartS2GraphEnrichmentRequest(BaseModel):
    corpus_selection_run_id: UUID
    requested_by: str | None = None
    max_papers: int | None = Field(default=None, ge=1)
    force_refresh: bool = False
