"""Canonical serving-surface access for live entity matching and detail lookup."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypedDict

from app import db

ENTITY_RUNTIME_ALIAS_MATCH_SQL = """
SELECT
    era.alias_key,
    era.alias_text,
    era.is_canonical,
    era.alias_source,
    era.entity_type,
    era.concept_id AS source_identifier,
    era.canonical_name,
    era.paper_count,
    era.highlight_mode
FROM solemd.entity_runtime_aliases era
WHERE era.alias_key = ANY(%s::text[])
"""

ENTITY_DETAIL_SQL = """
SELECT
    e.entity_type AS entity_type,
    e.concept_id AS source_identifier,
    COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS canonical_name,
    COALESCE(e.paper_count, 0)::INTEGER AS paper_count
FROM solemd.entities e
WHERE e.entity_type = %s
  AND e.concept_id = %s
LIMIT 1
"""

ENTITY_RUNTIME_DETAIL_ALIASES_SQL = """
SELECT
    alias_text,
    is_canonical,
    alias_source
FROM solemd.entity_runtime_aliases
WHERE entity_type = %s
  AND concept_id = %s
ORDER BY is_canonical DESC, length(alias_text) DESC, alias_text
LIMIT %s
"""

_ENTITY_GRAPH_REQUESTED_REFS_CTE = """
WITH requested_entities AS (
    SELECT DISTINCT entity_type, concept_id
    FROM unnest(%s::text[], %s::text[]) AS refs(entity_type, concept_id)
)
"""

ENTITY_GRAPH_PAPER_REFS_SQL = (
    _ENTITY_GRAPH_REQUESTED_REFS_CTE
    + """
, matched_graph_papers AS (
    SELECT
        ecp.corpus_id,
        ecp.pmid,
        COALESCE(gps.graph_paper_ref, 'corpus:' || ecp.corpus_id::TEXT) AS graph_paper_ref,
        COALESCE(gps.citation_count, 0) AS citation_count
    FROM requested_entities
    JOIN solemd.entity_corpus_presence ecp
      ON ecp.entity_type = requested_entities.entity_type
     AND ecp.concept_id = requested_entities.concept_id
    JOIN solemd.graph_paper_summary gps
      ON gps.corpus_id = ecp.corpus_id
    WHERE EXISTS (
        SELECT 1 FROM solemd.graph_points gp
         WHERE gp.graph_run_id = %s
           AND gp.corpus_id = ecp.corpus_id
    )
)
SELECT graph_paper_ref
FROM matched_graph_papers
GROUP BY graph_paper_ref
ORDER BY MAX(citation_count) DESC, MAX(pmid) DESC, graph_paper_ref
LIMIT %s
"""
)

ENTITY_PAGE_CONTEXT_TOP_PAPERS_SQL = """
SELECT
    (SELECT COUNT(*)::int
       FROM solemd.entity_corpus_presence
      WHERE entity_type = %s AND concept_id = %s
    ) AS total_corpus_paper_count,
    gps.pmid,
    gps.graph_paper_ref,
    gps.title AS paper_title,
    gps.year,
    NULLIF(gps.journal_name, '') AS venue,
    gps.citation_count
FROM solemd.entity_corpus_presence ecp
JOIN solemd.graph_paper_summary gps ON gps.corpus_id = ecp.corpus_id
WHERE ecp.entity_type = %s
  AND ecp.concept_id = %s
  AND EXISTS (
      SELECT 1 FROM solemd.graph_points gp
       WHERE gp.graph_run_id = %s
         AND gp.corpus_id = ecp.corpus_id
  )
ORDER BY gps.citation_count DESC NULLS LAST, gps.pmid DESC
LIMIT %s
"""

ENTITY_GRAPH_PAPER_COUNT_SQL = """
SELECT COUNT(*)::int AS total_graph_paper_count
FROM solemd.entity_corpus_presence ecp
WHERE ecp.entity_type = %s
  AND ecp.concept_id = %s
  AND EXISTS (
      SELECT 1 FROM solemd.graph_points gp
       WHERE gp.graph_run_id = %s
         AND gp.corpus_id = ecp.corpus_id
  )
"""


class EntityAliasCatalogRow(TypedDict):
    alias_key: str
    alias_text: str
    is_canonical: bool
    alias_source: str
    entity_type: str
    source_identifier: str
    canonical_name: str
    paper_count: int
    highlight_mode: str


class EntityCatalogDetailRow(TypedDict):
    entity_type: str
    source_identifier: str
    canonical_name: str
    paper_count: int


class EntityAliasDetailRow(TypedDict):
    alias_text: str
    is_canonical: bool
    alias_source: str | None


class EntityGraphPaperRefRow(TypedDict):
    graph_paper_ref: str


class EntityPageContextPaperRow(TypedDict):
    pmid: int
    graph_paper_ref: str | None
    paper_title: str | None
    year: int | None
    venue: str | None
    citation_count: int | None


class EntityPageContextRow(TypedDict):
    total_corpus_paper_count: int
    total_graph_paper_count: int
    pmid: int | None
    graph_paper_ref: str | None
    paper_title: str | None
    year: int | None
    venue: str | None
    citation_count: int | None


class EntityPageContextResult(TypedDict):
    total_corpus_paper_count: int
    total_graph_paper_count: int
    top_graph_papers: list[EntityPageContextPaperRow]


class EntityCatalogRepository:
    """Repository for frontend-facing entity serving paths."""

    def fetch_alias_matches(
        self,
        *,
        alias_keys: Sequence[str],
        entity_types: Sequence[str],
    ) -> list[EntityAliasCatalogRow]:
        normalized_alias_keys = list(dict.fromkeys(alias_keys))
        if not normalized_alias_keys:
            return []

        query = ENTITY_RUNTIME_ALIAS_MATCH_SQL
        params: list[object] = [normalized_alias_keys]
        if entity_types:
            query += " AND era.entity_type = ANY(%s::text[])"
            params.append(list(dict.fromkeys(entity_types)))
        query += """
 ORDER BY length(era.alias_key) DESC, era.is_canonical DESC, era.paper_count DESC, era.concept_id
"""

        with db.pooled() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
        return [dict(row) for row in rows]

    def fetch_entity_detail(
        self,
        *,
        entity_type: str,
        source_identifier: str,
        alias_limit: int = 8,
    ) -> tuple[EntityCatalogDetailRow | None, list[EntityAliasDetailRow]]:
        with db.pooled() as conn:
            with conn.cursor() as cur:
                cur.execute(ENTITY_DETAIL_SQL, (entity_type, source_identifier))
                detail_row = cur.fetchone()
                if detail_row is None:
                    return None, []

                cur.execute(
                    ENTITY_RUNTIME_DETAIL_ALIASES_SQL,
                    (entity_type, source_identifier, alias_limit),
                )
                alias_rows = cur.fetchall()
        aliases: list[EntityAliasDetailRow] = []
        seen = set()
        for row in alias_rows:
            alias_text = str(row["alias_text"]).strip()
            alias_key = alias_text.lower()
            if not alias_text or alias_key in seen:
                continue
            seen.add(alias_key)
            aliases.append(
                {
                    "alias_text": alias_text,
                    "is_canonical": bool(row["is_canonical"]),
                    "alias_source": (
                        str(row["alias_source"]).strip()
                        if row["alias_source"] is not None
                        else None
                    ),
                }
            )

        return dict(detail_row), aliases


class EntityGraphProjectionRepository:
    """Repository for graph-scale entity overlay and wiki context reads."""

    def fetch_graph_paper_refs(
        self,
        *,
        graph_run_id: str,
        entity_refs: Sequence[tuple[str, str]],
        limit: int,
    ) -> list[str]:
        normalized_refs = _normalize_entity_refs(entity_refs)
        if not normalized_refs:
            return []

        entity_types, source_identifiers = _split_entity_refs(normalized_refs)
        with db.pooled() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    ENTITY_GRAPH_PAPER_REFS_SQL,
                    (entity_types, source_identifiers, graph_run_id, limit),
                )
                rows = cur.fetchall()
        return [str(row["graph_paper_ref"]) for row in rows if row.get("graph_paper_ref")]

    def fetch_page_context(
        self,
        *,
        entity_type: str,
        source_identifier: str,
        graph_run_id: str,
        limit: int = 8,
        include_graph_count: bool = True,
    ) -> EntityPageContextResult:
        with db.pooled() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    ENTITY_PAGE_CONTEXT_TOP_PAPERS_SQL,
                    (
                        entity_type, source_identifier,              # corpus count
                        entity_type, source_identifier, graph_run_id,  # main query
                        limit,
                    ),
                )
                rows = cur.fetchall()

                graph_count: int | None = None
                if include_graph_count:
                    cur.execute(
                        ENTITY_GRAPH_PAPER_COUNT_SQL,
                        (entity_type, source_identifier, graph_run_id),
                    )
                    count_row = cur.fetchone()
                    graph_count = int(
                        (count_row or {}).get("total_graph_paper_count") or 0
                    )

        context_rows = [dict(row) for row in rows]
        if not context_rows:
            return {
                "total_corpus_paper_count": 0,
                "total_graph_paper_count": graph_count if graph_count is not None else 0,
                "top_graph_papers": [],
            }

        first_row = context_rows[0]
        top_graph_papers: list[EntityPageContextPaperRow] = []
        for row in context_rows:
            if row.get("pmid") is None:
                continue
            top_graph_papers.append(
                {
                    "pmid": int(row["pmid"]),
                    "graph_paper_ref": (
                        str(row["graph_paper_ref"])
                        if row.get("graph_paper_ref") is not None
                        else None
                    ),
                    "paper_title": (
                        str(row["paper_title"])
                        if row.get("paper_title") is not None
                        else None
                    ),
                    "year": int(row["year"]) if row.get("year") is not None else None,
                    "venue": (
                        str(row["venue"])
                        if row.get("venue") is not None
                        else None
                    ),
                    "citation_count": (
                        int(row["citation_count"])
                        if row.get("citation_count") is not None
                        else None
                    ),
                }
            )

        return {
            "total_corpus_paper_count": int(
                first_row.get("total_corpus_paper_count") or 0
            ),
            "total_graph_paper_count": graph_count if graph_count is not None else 0,
            "top_graph_papers": top_graph_papers,
        }


def _normalize_entity_refs(entity_refs: Sequence[tuple[str, str]]) -> list[tuple[str, str]]:
    normalized_refs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for entity_type, source_identifier in entity_refs:
        normalized_entity_type = entity_type.strip().lower()
        normalized_source_identifier = source_identifier.strip()
        if not normalized_entity_type or not normalized_source_identifier:
            continue
        key = (normalized_entity_type, normalized_source_identifier)
        if key in seen:
            continue
        seen.add(key)
        normalized_refs.append(key)
    return normalized_refs


def _split_entity_refs(entity_refs: Sequence[tuple[str, str]]) -> tuple[list[str], list[str]]:
    entity_types: list[str] = []
    source_identifiers: list[str] = []
    for entity_type, source_identifier in entity_refs:
        entity_types.append(entity_type)
        source_identifiers.append(source_identifier)
    return entity_types, source_identifiers
