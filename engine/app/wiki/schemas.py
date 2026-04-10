"""Pydantic request and response schemas for the wiki API."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class WikiSchema(BaseModel):
    """Shared Pydantic configuration for wiki schemas."""

    model_config = ConfigDict(extra="forbid")


class WikiPageResponse(WikiSchema):
    """Full wiki page returned by the page endpoint."""

    slug: str
    title: str
    content_md: str
    frontmatter: dict = Field(default_factory=dict)
    entity_type: str | None = None
    concept_id: str | None = None
    family_key: str | None = None
    tags: list[str] = Field(default_factory=list)
    outgoing_links: list[str] = Field(default_factory=list)
    paper_pmids: list[int] = Field(default_factory=list)
    paper_graph_refs: dict[int, str] = Field(
        default_factory=dict,
        description="Maps PMID → bundle-compatible paperId (COALESCE(paper_id, 'corpus:' || corpus_id))",
    )
    resolved_links: dict[str, str] = Field(
        default_factory=dict,
        description="Maps raw wikilink target → resolved full slug for frontend rendering",
    )


class WikiPageSummary(WikiSchema):
    """Lightweight page summary for list endpoints."""

    slug: str
    title: str
    entity_type: str | None = None
    family_key: str | None = None
    tags: list[str] = Field(default_factory=list)


class WikiSearchRequest(WikiSchema):
    """Full-text search request."""

    query: str = Field(..., min_length=1)
    limit: int = Field(default=20, ge=1, le=100)


class WikiSearchHitResponse(WikiSchema):
    """A single search result."""

    slug: str
    title: str
    entity_type: str | None = None
    family_key: str | None = None
    tags: list[str] = Field(default_factory=list)
    rank: float = 0.0
    headline: str = ""


class WikiSearchResponse(WikiSchema):
    """Search results wrapper."""

    hits: list[WikiSearchHitResponse] = Field(default_factory=list)
    total: int = 0


class WikiBacklinksResponse(WikiSchema):
    """Pages that link to a given page."""

    slug: str
    backlinks: list[WikiPageSummary] = Field(default_factory=list)
