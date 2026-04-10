"""Canonical catalog access for live entity matching and detail lookup."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypedDict

from app import db

ENTITY_ALIAS_MATCH_SQL = """
SELECT
    ea.alias_key,
    ea.alias_text,
    ea.is_canonical,
    ea.alias_source,
    ea.entity_type,
    ea.concept_id AS source_identifier,
    ea.canonical_name,
    ea.paper_count
FROM solemd.entity_aliases ea
WHERE ea.alias_key = ANY(%s::text[])
  AND ea.is_canonical = true
"""

ENTITY_DETAIL_SQL = """
SELECT
    lower(e.entity_type) AS entity_type,
    e.concept_id AS source_identifier,
    COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS canonical_name,
    COALESCE(e.paper_count, 0)::INTEGER AS paper_count
FROM solemd.entities e
WHERE lower(e.entity_type) = %s
  AND e.concept_id = %s
LIMIT 1
"""

ENTITY_ALIASES_SQL = """
SELECT
    alias_text,
    is_canonical,
    alias_source
FROM solemd.entity_aliases
WHERE lower(entity_type) = %s
  AND concept_id = %s
ORDER BY is_canonical DESC, length(alias_text) DESC, alias_text
LIMIT %s
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


class EntityCatalogDetailRow(TypedDict):
    entity_type: str
    source_identifier: str
    canonical_name: str
    paper_count: int


class EntityAliasDetailRow(TypedDict):
    alias_text: str
    is_canonical: bool
    alias_source: str | None


class EntityCatalogRepository:
    """Repository for the canonical runtime entity catalog."""

    def fetch_alias_matches(
        self,
        *,
        alias_keys: Sequence[str],
        entity_types: Sequence[str],
    ) -> list[EntityAliasCatalogRow]:
        normalized_alias_keys = list(dict.fromkeys(alias_keys))
        if not normalized_alias_keys:
            return []

        query = ENTITY_ALIAS_MATCH_SQL
        params: list[object] = [normalized_alias_keys]
        if entity_types:
            query += " AND ea.entity_type = ANY(%s::text[])"
            params.append(list(dict.fromkeys(entity_types)))
        query += """
 ORDER BY length(ea.alias_key) DESC, ea.is_canonical DESC, ea.paper_count DESC, ea.concept_id
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
                    ENTITY_ALIASES_SQL,
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
