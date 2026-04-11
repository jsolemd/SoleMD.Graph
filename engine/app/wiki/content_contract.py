"""Canonical wiki page contract for authored and generated markdown pages.

Static wiki pages stay as markdown + frontmatter, but the runtime exposes a
small normalized contract so generators, sync, and adapter surfaces can rely on
one shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Mapping, cast

from app.wiki.links import normalize_slug

WikiPageKind = Literal["index", "section", "entity", "topic"]
WikiGraphFocus = Literal["cited_papers", "entity_exact", "none"]

_VALID_PAGE_KINDS = frozenset({"index", "section", "entity", "topic"})
_VALID_GRAPH_FOCUS = frozenset({"cited_papers", "entity_exact", "none"})


@dataclass(frozen=True, slots=True)
class WikiPageContract:
    """Normalized wiki runtime contract derived from slug + authored metadata."""

    page_kind: WikiPageKind
    section_slug: str | None
    graph_focus: WikiGraphFocus
    summary: str | None
    featured_pmids: list[int]


def normalize_wiki_frontmatter(frontmatter: Mapping[str, object]) -> dict[str, object]:
    """Return a normalized copy of authored frontmatter.

    This keeps authored metadata stable while trimming obvious shape drift:
    - `tags` always becomes a deduplicated string list
    - `section` is stored as a canonical `sections/<slug>` path when present
    - `page_kind` / `graph_focus` are accepted only when valid
    - `summary` is whitespace-normalized when present
    - `featured_pmids` is stored as a deduplicated integer list when present
    """

    normalized = dict(frontmatter)

    tags = _normalize_tags(frontmatter.get("tags"))
    if tags:
        normalized["tags"] = tags
    else:
        normalized.pop("tags", None)

    section_slug = normalize_section_slug(frontmatter.get("section"))
    if section_slug:
        normalized["section"] = section_slug
    else:
        normalized.pop("section", None)

    page_kind = _normalize_enum(frontmatter.get("page_kind"), _VALID_PAGE_KINDS)
    if page_kind:
        normalized["page_kind"] = page_kind
    else:
        normalized.pop("page_kind", None)

    graph_focus = _normalize_enum(frontmatter.get("graph_focus"), _VALID_GRAPH_FOCUS)
    if graph_focus:
        normalized["graph_focus"] = graph_focus
    else:
        normalized.pop("graph_focus", None)

    summary = _normalize_summary(frontmatter.get("summary"))
    if summary:
        normalized["summary"] = summary
    else:
        normalized.pop("summary", None)

    featured_pmids = _normalize_pmids(frontmatter.get("featured_pmids"))
    if featured_pmids:
        normalized["featured_pmids"] = featured_pmids
    else:
        normalized.pop("featured_pmids", None)

    return normalized


def resolve_wiki_page_contract(
    *,
    slug: str,
    frontmatter: Mapping[str, object],
    entity_type: str | None,
    concept_id: str | None,
    family_key: str | None,
    paper_pmids: list[int],
) -> WikiPageContract:
    """Resolve the normalized runtime contract for one wiki page."""

    page_kind = resolve_page_kind(
        slug=slug,
        frontmatter=frontmatter,
        entity_type=entity_type,
        concept_id=concept_id,
        family_key=family_key,
    )
    section_slug = resolve_section_slug(
        slug=slug,
        frontmatter=frontmatter,
        page_kind=page_kind,
    )
    featured_pmids = resolve_featured_pmids(
        frontmatter=frontmatter,
        paper_pmids=paper_pmids,
    )
    graph_focus = resolve_graph_focus(
        frontmatter=frontmatter,
        page_kind=page_kind,
        entity_type=entity_type,
        concept_id=concept_id,
        featured_pmids=featured_pmids,
    )
    return WikiPageContract(
        page_kind=page_kind,
        section_slug=section_slug,
        graph_focus=graph_focus,
        summary=_normalize_summary(frontmatter.get("summary")),
        featured_pmids=featured_pmids,
    )


def resolve_page_kind(
    *,
    slug: str,
    frontmatter: Mapping[str, object],
    entity_type: str | None,
    concept_id: str | None,
    family_key: str | None,
) -> WikiPageKind:
    explicit = _normalize_enum(frontmatter.get("page_kind"), _VALID_PAGE_KINDS)
    if explicit is not None:
        return cast(WikiPageKind, explicit)
    if slug == "index":
        return "index"
    if slug.startswith("sections/") or family_key == "wiki-sections":
        return "section"
    if slug.startswith("entities/") or entity_type is not None or concept_id is not None:
        return "entity"
    return "topic"


def resolve_section_slug(
    *,
    slug: str,
    frontmatter: Mapping[str, object],
    page_kind: WikiPageKind,
) -> str | None:
    explicit = normalize_section_slug(frontmatter.get("section"))
    if explicit is not None:
        return explicit
    if page_kind == "section":
        return slug
    return None


def resolve_featured_pmids(
    *,
    frontmatter: Mapping[str, object],
    paper_pmids: list[int],
) -> list[int]:
    explicit = _normalize_pmids(frontmatter.get("featured_pmids"))
    if explicit:
        return explicit
    return _normalize_pmids(paper_pmids)


def resolve_graph_focus(
    *,
    frontmatter: Mapping[str, object],
    page_kind: WikiPageKind,
    entity_type: str | None,
    concept_id: str | None,
    featured_pmids: list[int],
) -> WikiGraphFocus:
    explicit = _normalize_enum(frontmatter.get("graph_focus"), _VALID_GRAPH_FOCUS)
    if explicit is not None:
        return cast(WikiGraphFocus, explicit)
    if featured_pmids:
        return "cited_papers"
    if page_kind == "entity" and entity_type is not None and concept_id is not None:
        return "entity_exact"
    return "none"


def normalize_section_slug(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = normalize_slug(value)
    if not normalized:
        return None
    if normalized == "index" or normalized.startswith("sections/"):
        return normalized
    return f"sections/{normalized}"


def _normalize_enum(
    value: object,
    valid_values: frozenset[str],
) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in valid_values:
        return normalized
    return None


def _normalize_tags(value: object) -> list[str]:
    if isinstance(value, str):
        values = [value]
    elif isinstance(value, (list, tuple)):
        values = list(value)
    else:
        return []

    result: list[str] = []
    seen: set[str] = set()
    for item in values:
        if not isinstance(item, str):
            continue
        normalized = item.strip()
        if not normalized:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _normalize_summary(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.strip().split())
    return normalized or None


def _normalize_pmids(value: object) -> list[int]:
    if isinstance(value, int):
        values = [value]
    elif isinstance(value, str) and value.strip().isdigit():
        values = [int(value.strip())]
    elif isinstance(value, (list, tuple)):
        values = list(value)
    else:
        return []

    result: list[int] = []
    seen: set[int] = set()
    for item in values:
        if isinstance(item, bool):
            continue
        if isinstance(item, int):
            normalized = item
        elif isinstance(item, str) and item.strip().isdigit():
            normalized = int(item.strip())
        else:
            continue
        if normalized <= 0 or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result
