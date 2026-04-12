"""Pydantic request and response schemas for the wiki API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WikiSchema(BaseModel):
    """Shared Pydantic configuration for wiki schemas.

    Response models use extra="ignore" to skip the per-field
    unknown-key check on outbound serialization.  Inbound request
    schemas should override to extra="forbid".
    """

    model_config = ConfigDict(extra="ignore")


class WikiPagePaperResponse(WikiSchema):
    """Paper metadata attached to a wiki page context."""

    pmid: int
    graph_paper_ref: str | None = None
    title: str = ""
    year: int | None = None
    venue: str | None = None
    citation_count: int | None = None


class WikiPageContextResponse(WikiSchema):
    """Dynamic backend-enriched evidence context for one wiki page."""

    total_corpus_paper_count: int | None = None
    total_graph_paper_count: int | None = None
    top_graph_papers: list[WikiPagePaperResponse] = Field(default_factory=list)


class WikiPageResponse(WikiSchema):
    """Full wiki page returned by the page endpoint."""

    slug: str
    title: str
    content_md: str
    frontmatter: dict = Field(default_factory=dict)
    entity_type: str | None = None
    concept_id: str | None = None
    family_key: str | None = None
    semantic_group: str | None = None
    page_kind: Literal["index", "section", "entity", "topic", "module"] = "topic"
    section_slug: str | None = None
    graph_focus: Literal["cited_papers", "entity_exact", "none"] = "none"
    summary: str | None = None
    tags: list[str] = Field(default_factory=list)
    outgoing_links: list[str] = Field(default_factory=list)
    paper_pmids: list[int] = Field(default_factory=list)
    featured_pmids: list[int] = Field(default_factory=list)
    paper_graph_refs: dict[int, str] = Field(
        default_factory=dict,
        description=(
            "Maps cited PMID → bundle-compatible paperId "
            "(COALESCE(paper_id, 'corpus:' || corpus_id))"
        ),
    )
    featured_graph_refs: dict[int, str] = Field(
        default_factory=dict,
        description=(
            "Maps curated featured PMID → bundle-compatible paperId "
            "for page-level graph actions."
        ),
    )
    resolved_links: dict[str, str] = Field(
        default_factory=dict,
        description="Maps raw wikilink target → resolved full slug for frontend rendering",
    )
    linked_entities: dict[str, WikiLinkedEntity] = Field(
        default_factory=dict,
        description="Maps outgoing-link slug → entity metadata for hover cards (entity pages only)",
    )
    body_entity_matches: list[WikiBodyEntityMatch] = Field(
        default_factory=list,
        description="Precomputed entity mentions in body text for inline highlighting",
    )


class WikiLinkedEntity(WikiSchema):
    """Entity metadata for a linked wiki page (hover card data source)."""

    entity_type: str
    concept_id: str | None = None


class WikiBodyEntityMatch(WikiSchema):
    """Precomputed entity mention found in wiki page body text."""

    entity_type: str
    concept_namespace: str | None = None
    concept_id: str
    source_identifier: str
    canonical_name: str
    matched_text: str
    paper_count: int = 0


class WikiPageSummary(WikiSchema):
    """Lightweight page summary for list endpoints."""

    slug: str
    title: str
    entity_type: str | None = None
    family_key: str | None = None
    tags: list[str] = Field(default_factory=list)


class WikiSearchRequest(WikiSchema):
    """Full-text search request."""

    model_config = ConfigDict(extra="forbid")

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


class WikiPageBundleResponse(WikiSchema):
    """Combined page + backlinks + context in a single response."""

    page: WikiPageResponse
    backlinks: list[WikiPageSummary] = Field(default_factory=list)
    context: WikiPageContextResponse | None = None


class WikiGraphNode(WikiSchema):
    """A node in the wiki content graph."""

    id: str
    kind: Literal["page", "paper"]
    label: str
    slug: str | None = None
    paper_id: str | None = None
    concept_id: str | None = None
    entity_type: str | None = None
    semantic_group: str | None = None
    tags: list[str] = Field(default_factory=list)
    year: int | None = None
    venue: str | None = None


class WikiGraphEdge(WikiSchema):
    """An edge in the wiki content graph."""

    source: str
    target: str
    kind: Literal["wikilink", "paper_reference"]


class WikiGraphResponse(WikiSchema):
    """Full wiki graph payload: nodes + edges + layout signature."""

    nodes: list[WikiGraphNode] = Field(default_factory=list)
    edges: list[WikiGraphEdge] = Field(default_factory=list)
    signature: str = ""
