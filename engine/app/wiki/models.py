"""Internal domain models for wiki pages."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class WikiPage:
    """A wiki page as stored in the database."""

    slug: str
    title: str
    content_md: str
    frontmatter: dict = field(default_factory=dict)
    entity_type: str | None = None
    concept_id: str | None = None
    family_key: str | None = None
    tags: list[str] = field(default_factory=list)
    outgoing_links: list[str] = field(default_factory=list)
    paper_pmids: list[int] = field(default_factory=list)
    checksum: str = ""
    synced_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class WikiSearchHit:
    """A search result from full-text search over wiki pages."""

    slug: str
    title: str
    entity_type: str | None = None
    family_key: str | None = None
    tags: list[str] = field(default_factory=list)
    rank: float = 0.0
    headline: str = ""
