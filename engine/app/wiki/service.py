"""Service orchestration for wiki page retrieval."""

from __future__ import annotations

import logging
from functools import lru_cache

from app.wiki.links import build_link_resolution_map
from app.wiki.models import WikiPage
from app.wiki.repository import PostgresWikiRepository, WikiRepository
from app.wiki.schemas import (
    WikiBacklinksResponse,
    WikiPageResponse,
    WikiPageSummary,
    WikiSearchHitResponse,
    WikiSearchRequest,
    WikiSearchResponse,
)

logger = logging.getLogger(__name__)


class WikiService:
    """Wiki page retrieval and search."""

    def __init__(self, repository: WikiRepository | None = None):
        self._repository = repository or PostgresWikiRepository()

    def get_page(
        self,
        slug: str,
        *,
        graph_release_id: str | None = None,
        graph_run_id: str | None = None,
    ) -> WikiPageResponse | None:
        page = self._repository.get_page(slug=slug)
        if page is None:
            return None

        paper_graph_refs: dict[int, str] = {}
        if page.paper_pmids:
            # Derive graph_run_id from graph_release_id when not provided directly
            resolved_run_id = graph_run_id
            if not resolved_run_id and graph_release_id:
                resolved_run_id = self._repository.resolve_graph_run_id(
                    graph_release_id=graph_release_id,
                )
            if resolved_run_id:
                paper_graph_refs = self._repository.resolve_paper_graph_refs(
                    pmids=page.paper_pmids,
                    graph_run_id=resolved_run_id,
                )

        resolved_links = build_link_resolution_map(page.content_md, page.outgoing_links)
        return _page_to_response(page, paper_graph_refs, resolved_links)

    def list_pages(self) -> list[WikiPageSummary]:
        summaries = self._repository.list_page_summaries()
        return [
            WikiPageSummary(
                slug=s.slug,
                title=s.title,
                entity_type=s.entity_type,
                family_key=s.family_key,
                tags=s.tags or [],
            )
            for s in summaries
        ]

    def search(self, request: WikiSearchRequest) -> WikiSearchResponse:
        hits = self._repository.search(query=request.query, limit=request.limit)
        return WikiSearchResponse(
            hits=[
                WikiSearchHitResponse(
                    slug=h.slug,
                    title=h.title,
                    entity_type=h.entity_type,
                    family_key=h.family_key,
                    tags=h.tags,
                    rank=h.rank,
                    headline=h.headline,
                )
                for h in hits
            ],
            total=len(hits),
        )

    def get_backlinks(self, slug: str) -> WikiBacklinksResponse:
        summaries = self._repository.get_backlink_summaries(slug=slug)
        return WikiBacklinksResponse(
            slug=slug,
            backlinks=[
                WikiPageSummary(
                    slug=s.slug,
                    title=s.title,
                    entity_type=s.entity_type,
                    family_key=s.family_key,
                    tags=s.tags or [],
                )
                for s in summaries
            ],
        )


def _page_to_response(
    page: WikiPage,
    paper_graph_refs: dict[int, str],
    resolved_links: dict[str, str],
) -> WikiPageResponse:
    return WikiPageResponse(
        slug=page.slug,
        title=page.title,
        content_md=page.content_md,
        frontmatter=page.frontmatter,
        entity_type=page.entity_type,
        concept_id=page.concept_id,
        family_key=page.family_key,
        tags=page.tags,
        outgoing_links=page.outgoing_links,
        paper_pmids=page.paper_pmids,
        paper_graph_refs=paper_graph_refs,
        resolved_links=resolved_links,
    )


@lru_cache(maxsize=1)
def get_wiki_service() -> WikiService:
    """Dependency factory for the wiki service."""
    return WikiService()
