"""Repository for wiki page data access."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Protocol

import psycopg

from app import db
from app.entities.repository import EntityGraphProjectionRepository
from app.graph.repository import PostgresGraphRepository
from app.wiki import queries
from app.wiki.content_contract import resolve_wiki_page_contract
from app.wiki.models import (
    WikiPage,
    WikiPageContextData,
    WikiPagePaperData,
    WikiSearchHit,
)


@dataclass(frozen=True, slots=True)
class WikiPageSummaryRow:
    """Lightweight summary — no content_md or full metadata."""

    slug: str
    title: str
    entity_type: str | None = None
    family_key: str | None = None
    tags: list[str] | None = None


@dataclass(frozen=True, slots=True)
class WikiGraphPageRow:
    """Page data needed for graph construction."""

    slug: str
    title: str
    entity_type: str | None = None
    concept_id: str | None = None
    family_key: str | None = None
    semantic_group: str | None = None
    tags: list[str] = field(default_factory=list)
    outgoing_links: list[str] = field(default_factory=list)
    paper_pmids: list[int] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class WikiGraphPaperRow:
    """Paper data resolved against a graph release."""

    pmid: int
    graph_paper_ref: str
    paper_title: str | None = None
    year: int | None = None
    venue: str | None = None


class WikiRepository(Protocol):
    """Read-only repository contract for wiki pages."""

    def connection(self) -> Any: ...

    def get_page(self, *, slug: str) -> WikiPage | None: ...

    def list_page_summaries(self) -> list[WikiPageSummaryRow]: ...

    def search(self, *, query: str, limit: int = 20) -> list[WikiSearchHit]: ...

    def get_backlink_summaries(self, *, slug: str) -> list[WikiPageSummaryRow]: ...

    def resolve_graph_run_id(self, *, graph_release_id: str) -> str | None: ...

    def resolve_paper_graph_refs(
        self,
        *,
        pmids: list[int],
        graph_run_id: str,
    ) -> dict[int, str]: ...

    def resolve_linked_entity_metadata(
        self,
        *,
        slugs: list[str],
    ) -> dict[str, tuple[str, str | None]]: ...

    def get_entity_page_context(
        self,
        *,
        concept_id: str,
        entity_type: str,
        graph_run_id: str,
        limit: int = 8,
    ) -> WikiPageContextData: ...

    def get_all_pages_for_graph(self) -> list[WikiGraphPageRow]: ...

    def resolve_paper_nodes_for_graph(
        self,
        *,
        pmids: list[int],
        graph_run_id: str,
    ) -> list[WikiGraphPaperRow]: ...


class PostgresWikiRepository:
    """PostgreSQL implementation of the wiki repository."""

    def __init__(
        self,
        *,
        entity_graph_repository: EntityGraphProjectionRepository | None = None,
        graph_repository: PostgresGraphRepository | None = None,
    ) -> None:
        self._entity_graph_repository = entity_graph_repository or EntityGraphProjectionRepository()
        self._graph_repository = graph_repository or PostgresGraphRepository()
        self._conn: psycopg.Connection | None = None

    @contextmanager
    def connection(self):
        """Pin a single pooled connection for the duration of a block.

        All ``_fetchone`` / ``_fetchall`` calls inside the block reuse
        the same connection, eliminating per-query pool checkout overhead.
        """
        with db.pooled() as conn:
            prev = self._conn
            self._conn = conn
            try:
                yield conn
            finally:
                self._conn = prev

    def _fetchone(self, query: str, params: dict | None = None):
        if self._conn is not None:
            return self._conn.execute(query, params).fetchone()
        with db.pooled() as conn:
            return conn.execute(query, params).fetchone()

    def _fetchall(self, query: str, params: dict | None = None):
        if self._conn is not None:
            return self._conn.execute(query, params).fetchall()
        with db.pooled() as conn:
            return conn.execute(query, params).fetchall()

    def get_page(self, *, slug: str) -> WikiPage | None:
        row = self._fetchone(queries.GET_PAGE_BY_SLUG, {"slug": slug})
        if row is None:
            return None
        return _row_to_page(row)

    def list_page_summaries(self) -> list[WikiPageSummaryRow]:
        rows = self._fetchall(queries.LIST_PAGE_SUMMARIES)
        return [_row_to_summary(r) for r in rows]

    def search(self, *, query: str, limit: int = 20) -> list[WikiSearchHit]:
        rows = self._fetchall(
            queries.SEARCH_PAGES,
            {"query": query, "limit": limit},
        )
        return [
            WikiSearchHit(
                slug=r["slug"],
                title=r["title"],
                entity_type=r.get("entity_type"),
                family_key=r.get("family_key"),
                tags=r.get("tags") or [],
                rank=float(r.get("rank", 0)),
                headline=r.get("headline", ""),
            )
            for r in rows
        ]

    def get_backlink_summaries(self, *, slug: str) -> list[WikiPageSummaryRow]:
        rows = self._fetchall(
            queries.GET_BACKLINK_SUMMARIES,
            {"slug": slug},
        )
        return [_row_to_summary(r) for r in rows]

    def resolve_graph_run_id(self, *, graph_release_id: str) -> str | None:
        try:
            release = self._graph_repository.resolve_graph_release(graph_release_id)
        except LookupError:
            return None
        return release.graph_run_id

    def resolve_paper_graph_refs(
        self,
        *,
        pmids: list[int],
        graph_run_id: str,
    ) -> dict[int, str]:
        return self._graph_repository.resolve_paper_graph_refs(
            pmids=pmids,
            graph_run_id=graph_run_id,
        )

    def resolve_linked_entity_metadata(
        self,
        *,
        slugs: list[str],
    ) -> dict[str, tuple[str, str | None]]:
        if not slugs:
            return {}
        rows = self._fetchall(
            queries.RESOLVE_LINKED_ENTITY_METADATA,
            {"slugs": slugs},
        )
        return {r["slug"]: (r["entity_type"], r["concept_id"]) for r in rows}

    def get_entity_page_context(
        self,
        *,
        concept_id: str,
        entity_type: str,
        graph_run_id: str,
        limit: int = 8,
    ) -> WikiPageContextData:
        context = self._entity_graph_repository.fetch_page_context(
            entity_type=entity_type,
            source_identifier=concept_id,
            graph_run_id=graph_run_id,
            limit=limit,
        )

        top_graph_papers = [
            WikiPagePaperData(
                pmid=r["pmid"],
                graph_paper_ref=r.get("graph_paper_ref"),
                title=r.get("paper_title") or "",
                year=r.get("year"),
                venue=r.get("venue"),
                citation_count=r.get("citation_count"),
            )
            for r in context["top_graph_papers"]
        ]

        return WikiPageContextData(
            total_corpus_paper_count=context.get("total_corpus_paper_count"),
            total_graph_paper_count=context.get("total_graph_paper_count"),
            top_graph_papers=top_graph_papers,
        )

    def get_all_pages_for_graph(self) -> list[WikiGraphPageRow]:
        rows = self._fetchall(queries.GET_ALL_PAGES_FOR_GRAPH)
        return [
            WikiGraphPageRow(
                slug=r["slug"],
                title=r["title"],
                entity_type=r.get("entity_type"),
                concept_id=r.get("concept_id"),
                family_key=r.get("family_key"),
                semantic_group=r.get("semantic_group"),
                tags=r.get("tags") or [],
                outgoing_links=r.get("outgoing_links") or [],
                paper_pmids=r.get("paper_pmids") or [],
            )
            for r in rows
        ]

    def resolve_paper_nodes_for_graph(
        self,
        *,
        pmids: list[int],
        graph_run_id: str,
    ) -> list[WikiGraphPaperRow]:
        rows = self._graph_repository.resolve_paper_nodes_for_graph(
            pmids=pmids,
            graph_run_id=graph_run_id,
        )
        return [
            WikiGraphPaperRow(
                pmid=r["pmid"],
                graph_paper_ref=r["graph_paper_ref"],
                paper_title=r.get("paper_title"),
                year=r.get("year"),
                venue=r.get("venue"),
            )
            for r in rows
        ]


def _row_to_page(row: dict) -> WikiPage:
    frontmatter = row.get("frontmatter") or {}
    paper_pmids = row.get("paper_pmids") or []
    contract = resolve_wiki_page_contract(
        slug=row["slug"],
        frontmatter=frontmatter,
        entity_type=row.get("entity_type"),
        concept_id=row.get("concept_id"),
        family_key=row.get("family_key"),
        paper_pmids=paper_pmids,
    )
    return WikiPage(
        slug=row["slug"],
        title=row["title"],
        content_md=row["content_md"],
        frontmatter=frontmatter,
        entity_type=row.get("entity_type"),
        concept_id=row.get("concept_id"),
        family_key=row.get("family_key"),
        semantic_group=row.get("semantic_group"),
        tags=row.get("tags") or [],
        outgoing_links=row.get("outgoing_links") or [],
        paper_pmids=paper_pmids,
        page_kind=contract.page_kind,
        section_slug=contract.section_slug,
        graph_focus=contract.graph_focus,
        summary=contract.summary,
        featured_pmids=contract.featured_pmids,
        checksum=row.get("checksum", ""),
        synced_at=row.get("synced_at"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _row_to_summary(row: dict) -> WikiPageSummaryRow:
    return WikiPageSummaryRow(
        slug=row["slug"],
        title=row["title"],
        entity_type=row.get("entity_type"),
        family_key=row.get("family_key"),
        tags=row.get("tags") or [],
    )
