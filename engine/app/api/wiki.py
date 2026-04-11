"""FastAPI routes for wiki pages."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.http import run_api

from app.wiki.schemas import (
    WikiBacklinksResponse,
    WikiGraphResponse,
    WikiPageContextResponse,
    WikiPageResponse,
    WikiPageSummary,
    WikiSearchRequest,
    WikiSearchResponse,
)
from app.wiki.service import WikiService, get_wiki_service

router = APIRouter(prefix="/api/v1/wiki", tags=["wiki"])


@router.get("/pages", response_model=list[WikiPageSummary])
def list_wiki_pages(
    service: WikiService = Depends(get_wiki_service),
) -> list[WikiPageSummary]:
    """List all wiki pages (summaries only)."""
    return service.list_pages()


@router.post("/search", response_model=WikiSearchResponse)
def search_wiki(
    request: WikiSearchRequest,
    service: WikiService = Depends(get_wiki_service),
) -> WikiSearchResponse:
    """Full-text search over wiki pages."""
    return service.search(request)


@router.get("/backlinks/{slug:path}", response_model=WikiBacklinksResponse)
def get_wiki_backlinks(
    slug: str,
    service: WikiService = Depends(get_wiki_service),
) -> WikiBacklinksResponse:
    """Get pages that link to the given page."""
    return service.get_backlinks(slug)


@router.get("/graph", response_model=WikiGraphResponse)
def get_wiki_graph(
    graph_release_id: str = Query(...),
    service: WikiService = Depends(get_wiki_service),
) -> WikiGraphResponse:
    """Build and return the wiki content graph for a given graph release."""
    return service.get_graph(graph_release_id)


@router.get("/page-context/{slug:path}", response_model=WikiPageContextResponse | None)
def get_wiki_page_context(
    slug: str,
    graph_release_id: str | None = Query(default=None),
    graph_run_id: str | None = Query(default=None),
    service: WikiService = Depends(get_wiki_service),
) -> WikiPageContextResponse | None:
    """Fetch dynamic backend-enriched context for a wiki page."""
    return run_api(
        lambda: service.get_page_context(
            slug,
            graph_release_id=graph_release_id,
            graph_run_id=graph_run_id,
        ),
        not_found_detail=f"Wiki page not found: {slug}",
    )


@router.get("/pages/{slug:path}", response_model=WikiPageResponse)
def get_wiki_page(
    slug: str,
    graph_release_id: str | None = Query(default=None),
    graph_run_id: str | None = Query(default=None),
    service: WikiService = Depends(get_wiki_service),
) -> WikiPageResponse:
    """Fetch a single wiki page by slug with optional PMID → graph ref resolution."""
    return run_api(
        lambda: service.get_page(
            slug,
            graph_release_id=graph_release_id,
            graph_run_id=graph_run_id,
        ),
        not_found_detail=f"Wiki page not found: {slug}",
    )
