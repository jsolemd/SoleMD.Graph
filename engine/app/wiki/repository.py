"""Repository for wiki page data access."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app import db
from app.wiki import queries
from app.wiki.models import WikiPage, WikiSearchHit


@dataclass(frozen=True, slots=True)
class WikiPageSummaryRow:
    """Lightweight summary — no content_md or full metadata."""

    slug: str
    title: str
    entity_type: str | None = None
    family_key: str | None = None
    tags: list[str] | None = None


class WikiRepository(Protocol):
    """Read-only repository contract for wiki pages."""

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


class PostgresWikiRepository:
    """PostgreSQL implementation of the wiki repository."""

    def get_page(self, *, slug: str) -> WikiPage | None:
        with db.connect() as conn:
            row = conn.execute(queries.GET_PAGE_BY_SLUG, {"slug": slug}).fetchone()
        if row is None:
            return None
        return _row_to_page(row)

    def list_page_summaries(self) -> list[WikiPageSummaryRow]:
        with db.connect() as conn:
            rows = conn.execute(queries.LIST_PAGE_SUMMARIES).fetchall()
        return [_row_to_summary(r) for r in rows]

    def search(self, *, query: str, limit: int = 20) -> list[WikiSearchHit]:
        with db.connect() as conn:
            rows = conn.execute(
                queries.SEARCH_PAGES, {"query": query, "limit": limit}
            ).fetchall()
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
        with db.connect() as conn:
            rows = conn.execute(
                queries.GET_BACKLINK_SUMMARIES,
                {"slug": slug},
            ).fetchall()
        return [_row_to_summary(r) for r in rows]

    def resolve_graph_run_id(self, *, graph_release_id: str) -> str | None:
        with db.connect() as conn:
            row = conn.execute(
                queries.RESOLVE_GRAPH_RUN_ID,
                {"release_id": graph_release_id},
            ).fetchone()
        if row is None:
            return None
        return row["graph_run_id"]

    def resolve_paper_graph_refs(
        self,
        *,
        pmids: list[int],
        graph_run_id: str,
    ) -> dict[int, str]:
        if not pmids:
            return {}
        with db.connect() as conn:
            rows = conn.execute(
                queries.RESOLVE_PAPER_GRAPH_REFS,
                {"pmids": pmids, "graph_run_id": graph_run_id},
            ).fetchall()
        return {r["pmid"]: r["graph_paper_ref"] for r in rows}


def _row_to_page(row: dict) -> WikiPage:
    return WikiPage(
        slug=row["slug"],
        title=row["title"],
        content_md=row["content_md"],
        frontmatter=row.get("frontmatter") or {},
        entity_type=row.get("entity_type"),
        concept_id=row.get("concept_id"),
        family_key=row.get("family_key"),
        tags=row.get("tags") or [],
        outgoing_links=row.get("outgoing_links") or [],
        paper_pmids=row.get("paper_pmids") or [],
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
