"""Service orchestration for wiki page retrieval."""

from __future__ import annotations

import hashlib
import json
import logging
from functools import lru_cache

from app.wiki.links import build_link_resolution_map
from app.wiki.models import WikiPage
from app.wiki.repository import PostgresWikiRepository, WikiRepository
from app.entities.schemas import EntityMatchRequest
from app.entities.service import EntityService, get_entity_service
from app.wiki.schemas import (
    WikiBacklinksResponse,
    WikiBodyEntityMatch,
    WikiGraphEdge,
    WikiGraphNode,
    WikiGraphResponse,
    WikiLinkedEntity,
    WikiPageBundleResponse,
    WikiPageContextResponse,
    WikiPagePaperResponse,
    WikiPageResponse,
    WikiPageSummary,
    WikiSearchHitResponse,
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
    ) -> WikiPageResponse | None:
        page = self._repository.get_page(slug=slug)
        if page is None:
            return None

        resolved_run_id = _resolve_requested_graph_run_id(
            repository=self._repository,
            graph_release_id=graph_release_id,
        )

        paper_graph_refs: dict[int, str] = {}
        featured_graph_refs: dict[int, str] = {}
        if resolved_run_id:
            resolved_pmid_graph_refs = self._repository.resolve_paper_graph_refs(
                pmids=_unique_ints([*page.paper_pmids, *page.featured_pmids]),
                graph_run_id=resolved_run_id,
            )
            paper_graph_refs = {
                pmid: graph_paper_ref
                for pmid in page.paper_pmids
                if (graph_paper_ref := resolved_pmid_graph_refs.get(pmid)) is not None
            }
            featured_graph_refs = {
                pmid: graph_paper_ref
                for pmid in page.featured_pmids
                if (graph_paper_ref := resolved_pmid_graph_refs.get(pmid)) is not None
            }

        resolved_links = build_link_resolution_map(page.content_md, page.outgoing_links)
        linked_entity_meta = self._repository.resolve_linked_entity_metadata(
            slugs=page.outgoing_links,
        )

        return _page_to_response(
            page,
            paper_graph_refs,
            resolved_links,
            linked_entity_meta=linked_entity_meta,
            featured_graph_refs=featured_graph_refs,
        )

    def get_page_bundle(
        self,
        slug: str,
        *,
        graph_release_id: str | None = None,
    ) -> WikiPageBundleResponse | None:
        """Return page + backlinks + context in one response."""
        page = self._repository.get_page(slug=slug)
        if page is None:
            return None

        resolved_run_id = _resolve_requested_graph_run_id(
            repository=self._repository,
            graph_release_id=graph_release_id,
        )

        paper_graph_refs: dict[int, str] = {}
        featured_graph_refs: dict[int, str] = {}
        if resolved_run_id:
            resolved_pmid_graph_refs = self._repository.resolve_paper_graph_refs(
                pmids=_unique_ints([*page.paper_pmids, *page.featured_pmids]),
                graph_run_id=resolved_run_id,
            )
            paper_graph_refs = {
                pmid: ref
                for pmid in page.paper_pmids
                if (ref := resolved_pmid_graph_refs.get(pmid)) is not None
            }
            featured_graph_refs = {
                pmid: ref
                for pmid in page.featured_pmids
                if (ref := resolved_pmid_graph_refs.get(pmid)) is not None
            }

        resolved_links = build_link_resolution_map(page.content_md, page.outgoing_links)
        linked_entity_meta = self._repository.resolve_linked_entity_metadata(
            slugs=page.outgoing_links,
        )

        backlink_rows = self._repository.get_backlink_summaries(slug=slug)

        page_context = _resolve_page_context(
            repository=self._repository,
            page=page,
            graph_run_id=resolved_run_id,
        )

        page_response = _page_to_response(
            page,
            paper_graph_refs,
            resolved_links,
            linked_entity_meta=linked_entity_meta,
            featured_graph_refs=featured_graph_refs,
        )

        backlinks = [
            WikiPageSummary(
                slug=s.slug,
                title=s.title,
                entity_type=s.entity_type,
                family_key=s.family_key,
                tags=s.tags or [],
            )
            for s in backlink_rows
        ]

        return WikiPageBundleResponse(
            page=page_response,
            backlinks=backlinks,
            context=page_context,
        )

    def get_page_context(
        self,
        slug: str,
        *,
        graph_release_id: str | None = None,
    ) -> WikiPageContextResponse | None:
        page = self._repository.get_page(slug=slug)
        if page is None:
            raise KeyError(slug)

        resolved_run_id = _resolve_requested_graph_run_id(
            repository=self._repository,
            graph_release_id=graph_release_id,
        )
        return _resolve_page_context(
            repository=self._repository,
            page=page,
            graph_run_id=resolved_run_id,
        )

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

    def search(self, *, query: str, limit: int) -> WikiSearchResponse:
        hits = self._repository.search(query=query, limit=limit)
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

    def get_graph(self, graph_release_id: str) -> WikiGraphResponse:
        """Build the full wiki content graph for the given release."""
        repo = self._repository
        with repo.connection():
            graph_run_id = repo.resolve_graph_run_id(
                graph_release_id=graph_release_id,
            )

            pages = repo.get_all_pages_for_graph()

            all_pmids: list[int] = []
            for p in pages:
                all_pmids.extend(p.paper_pmids)
            unique_pmids = sorted(set(all_pmids))

            paper_rows = []
            if graph_run_id and unique_pmids:
                paper_rows = repo.resolve_paper_nodes_for_graph(
                    pmids=unique_pmids,
                    graph_run_id=graph_run_id,
                )

        page_slugs = {p.slug for p in pages}
        pmid_to_ref: dict[int, str] = {}
        for pr in paper_rows:
            pmid_to_ref[pr.pmid] = pr.graph_paper_ref

        nodes: list[WikiGraphNode] = []
        for p in pages:
            nodes.append(
                WikiGraphNode(
                    id=f"page:{p.slug}",
                    kind="page",
                    label=p.title,
                    slug=p.slug,
                    concept_id=p.concept_id,
                    entity_type=p.entity_type,
                    semantic_group=p.semantic_group,
                    tags=p.tags,
                )
            )

        for pr in paper_rows:
            nodes.append(
                WikiGraphNode(
                    id=f"paper:{pr.graph_paper_ref}",
                    kind="paper",
                    label=pr.paper_title or f"PMID {pr.pmid}",
                    paper_id=pr.graph_paper_ref,
                    year=pr.year,
                    venue=pr.venue,
                )
            )

        edges: list[WikiGraphEdge] = []
        for p in pages:
            for target_slug in p.outgoing_links:
                if target_slug in page_slugs:
                    edges.append(
                        WikiGraphEdge(
                            source=f"page:{p.slug}",
                            target=f"page:{target_slug}",
                            kind="wikilink",
                        )
                    )
            for pmid in p.paper_pmids:
                ref = pmid_to_ref.get(pmid)
                if ref:
                    edges.append(
                        WikiGraphEdge(
                            source=f"page:{p.slug}",
                            target=f"paper:{ref}",
                            kind="paper_reference",
                        )
                    )

        sig_input = json.dumps(
            {
                "nodes": [n.id for n in nodes],
                "edges": [(e.source, e.target) for e in edges],
            },
            sort_keys=True,
        )
        signature = hashlib.sha256(sig_input.encode()).hexdigest()[:16]

        return WikiGraphResponse(nodes=nodes, edges=edges, signature=signature)


def _page_to_response(
    page: WikiPage,
    paper_graph_refs: dict[int, str],
    resolved_links: dict[str, str],
    linked_entity_meta: dict[str, tuple[str, str]] | None = None,
    featured_graph_refs: dict[int, str] | None = None,
) -> WikiPageResponse:
    linked_entities: dict[str, WikiLinkedEntity] = {}
    if linked_entity_meta:
        for slug, (entity_type, concept_id) in linked_entity_meta.items():
            linked_entities[slug] = WikiLinkedEntity(
                entity_type=entity_type,
                concept_id=concept_id,
            )

    body_entity_matches = _resolve_body_entity_matches(page.content_md)

    return WikiPageResponse(
        slug=page.slug,
        title=page.title,
        content_md=page.content_md,
        frontmatter=page.frontmatter,
        entity_type=page.entity_type,
        concept_id=page.concept_id,
        family_key=page.family_key,
        semantic_group=page.semantic_group,
        page_kind=page.page_kind,
        section_slug=page.section_slug,
        graph_focus=page.graph_focus,
        summary=page.summary,
        tags=page.tags,
        outgoing_links=page.outgoing_links,
        paper_pmids=page.paper_pmids,
        featured_pmids=page.featured_pmids,
        paper_graph_refs=paper_graph_refs,
        featured_graph_refs=featured_graph_refs or {},
        resolved_links=resolved_links,
        linked_entities=linked_entities,
        body_entity_matches=body_entity_matches,
    )


def _resolve_requested_graph_run_id(
    *,
    repository: WikiRepository,
    graph_release_id: str | None,
) -> str | None:
    if graph_release_id is None:
        return None
    return repository.resolve_graph_run_id(graph_release_id=graph_release_id)


def _resolve_page_context(
    *,
    repository: WikiRepository,
    page: WikiPage,
    graph_run_id: str | None,
) -> WikiPageContextResponse | None:
    if (
        graph_run_id is None
        or page.page_kind != "entity"
        or page.concept_id is None
        or page.entity_type is None
    ):
        return None

    context = repository.get_entity_page_context(
        concept_id=page.concept_id,
        entity_type=page.entity_type.lower(),
        graph_run_id=graph_run_id,
    )
    return WikiPageContextResponse(
        total_corpus_paper_count=context.total_corpus_paper_count,
        total_graph_paper_count=context.total_graph_paper_count,
        top_graph_papers=[
            WikiPagePaperResponse(
                pmid=paper.pmid,
                graph_paper_ref=paper.graph_paper_ref,
                title=paper.title,
                year=paper.year,
                venue=paper.venue,
                citation_count=paper.citation_count,
            )
            for paper in context.top_graph_papers
        ],
    )


_WIKI_BODY_ENTITY_MATCH_LIMIT = 16
_BODY_ENTITY_MATCH_CACHE_SIZE = 256


@lru_cache(maxsize=_BODY_ENTITY_MATCH_CACHE_SIZE)
def _resolve_body_entity_matches_cached(
    content_hash: str,
    text: str,
) -> tuple[WikiBodyEntityMatch, ...]:
    """Cache-backed entity matching keyed by content hash.

    Returns a tuple (hashable for LRU) of deduplicated entity matches.
    The entity catalog changes only when the entity pipeline runs (rare),
    so matches for the same text are stable within a server lifecycle.
    """
    try:
        entity_service = get_entity_service()
        response = entity_service.match_entities(
            EntityMatchRequest(text=text, limit=_WIKI_BODY_ENTITY_MATCH_LIMIT),
        )
    except Exception:
        logger.warning("Failed to resolve body entity matches", exc_info=True)
        return ()

    # Deduplicate by matched_text (case-insensitive) — keep highest-paper-count
    seen_texts: dict[str, WikiBodyEntityMatch] = {}
    for match in response.matches:
        key = match.matched_text.strip().lower()
        existing = seen_texts.get(key)
        if existing is None or match.paper_count > existing.paper_count:
            seen_texts[key] = WikiBodyEntityMatch(
                entity_type=match.entity_type,
                concept_namespace=match.concept_namespace,
                concept_id=match.concept_id,
                source_identifier=match.source_identifier,
                canonical_name=match.canonical_name,
                matched_text=match.matched_text,
                paper_count=match.paper_count,
            )

    return tuple(seen_texts.values())


def _resolve_body_entity_matches(content_md: str) -> list[WikiBodyEntityMatch]:
    """Run entity matching against wiki page body text.

    Returns precomputed matches for frontend inline highlighting.
    Results are cached by content hash — repeated loads of the same
    page skip the entity matching entirely.
    """
    text = content_md.strip()
    if not text:
        return []

    content_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
    return list(_resolve_body_entity_matches_cached(content_hash, text))


def _unique_ints(values: list[int]) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


@lru_cache(maxsize=1)
def get_wiki_service() -> WikiService:
    """Dependency factory for the wiki service."""
    return WikiService()
