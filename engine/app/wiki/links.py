"""Shared link normalization contract for wiki content.

Single source of truth for wikilink extraction, PMID extraction, and slug
normalization.  Used by the sync script (filesystem → DB) and by the API
layer (content → resolved refs).  The frontend receives pre-resolved data
and does NO link parsing of its own.

**Key contract**: ``outgoing_links`` stored in the DB always contain full
canonical slugs (e.g. ``entities/serotonin``), never bare leaf names.
The sync script resolves bare wikilinks like ``[[serotonin]]`` against the
known page inventory at sync time via ``resolve_outgoing_links()``.
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Wikilink extraction: [[entity-name]] and [[pmid:12345678]]
# ---------------------------------------------------------------------------

_WIKILINK_RE = re.compile(r"\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]")
_PMID_RE = re.compile(r"\[\[pmid:(\d+)\]\]", re.IGNORECASE)


def extract_raw_wikilinks(content: str) -> list[str]:
    """Return raw normalized targets for all ``[[target]]`` wikilinks.

    Returns whatever the user wrote (bare name or path), normalized but
    NOT resolved to full slugs.  Use ``resolve_outgoing_links()`` to map
    these to canonical page slugs.

    Excludes ``[[pmid:…]]`` citations — those are extracted separately.
    Display aliases (``[[target|label]]``) are stripped; only the target is kept.
    """
    slugs: list[str] = []
    for match in _WIKILINK_RE.finditer(content):
        raw = match.group(1).strip()
        if raw.lower().startswith("pmid:"):
            continue
        slugs.append(normalize_slug(raw))
    return slugs


def resolve_outgoing_links(
    raw_links: list[str],
    known_slugs: set[str],
) -> list[str]:
    """Resolve raw wikilink targets to canonical full slugs.

    For each raw link:
    1. If it already matches a known slug exactly, keep it.
    2. Otherwise, find all known slugs whose leaf name matches the raw link.
       - If exactly one match, use it (unambiguous resolution).
       - If multiple matches, keep the raw link (ambiguous — logged at sync).
       - If no matches, keep the raw link (target page doesn't exist yet).

    Returns de-duplicated list preserving insertion order.
    """
    # Build leaf-name → [full slugs] index
    leaf_index: dict[str, list[str]] = {}
    for slug in known_slugs:
        leaf = slug.rsplit("/", 1)[-1]
        leaf_index.setdefault(leaf, []).append(slug)

    seen: set[str] = set()
    resolved: list[str] = []
    for raw in raw_links:
        if raw in known_slugs:
            canonical = raw
        elif raw in leaf_index:
            candidates = leaf_index[raw]
            canonical = candidates[0] if len(candidates) == 1 else raw
        else:
            canonical = raw

        # De-duplicate by resolved canonical, not raw input.
        # [[serotonin]] and [[entities/serotonin]] both resolve to the same slug.
        if canonical in seen:
            continue
        seen.add(canonical)
        resolved.append(canonical)

    return resolved


def extract_pmids(content: str) -> list[int]:
    """Return integer PMIDs from all ``[[pmid:NNN]]`` citations in *content*."""
    return [int(m.group(1)) for m in _PMID_RE.finditer(content)]


def build_link_resolution_map(
    content_md: str,
    outgoing_links: list[str],
) -> dict[str, str]:
    """Build a raw-wikilink-target → resolved-slug map for frontend rendering.

    The frontend remark plugin needs this to convert ``[[serotonin]]`` in the
    markdown to a link pointing at ``entities/serotonin``.  The engine already
    resolved bare names to full slugs at sync time (stored in *outgoing_links*),
    so we re-extract the raw targets and match them against the resolved list.
    """
    raw_links = extract_raw_wikilinks(content_md)
    if not raw_links or not outgoing_links:
        return {}

    # Build leaf-name → full-slug index from the page's resolved outgoing links
    resolved_set = set(outgoing_links)
    leaf_index: dict[str, str] = {}
    for slug in outgoing_links:
        leaf = slug.rsplit("/", 1)[-1]
        # Only set if unambiguous within this page's links
        if leaf not in leaf_index:
            leaf_index[leaf] = slug

    result: dict[str, str] = {}
    for raw in raw_links:
        if raw in result:
            continue
        if raw in resolved_set:
            result[raw] = raw
        elif raw in leaf_index:
            result[raw] = leaf_index[raw]
        # else: unresolved — frontend renders as plain text
    return result


# ---------------------------------------------------------------------------
# Slug normalization
# ---------------------------------------------------------------------------


def normalize_slug(raw: str) -> str:
    """Normalize a raw reference or file path to a URL-safe wiki slug.

    - Strips ``.md`` suffix
    - Converts to lowercase
    - Replaces spaces with hyphens
    - Collapses consecutive hyphens
    - Strips leading/trailing slashes
    """
    slug = raw.strip()
    if slug.lower().endswith(".md"):
        slug = slug[:-3]
    slug = slug.lower().replace(" ", "-")
    # Collapse runs of hyphens
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("/")


def compute_file_slug(file_path: str, wiki_root: str) -> str:
    """Compute the canonical slug for a wiki markdown file.

    *file_path* and *wiki_root* should be absolute or both relative.
    The returned slug is the relative path under *wiki_root* without the
    ``.md`` extension, lowercased and hyphenated.
    """
    from pathlib import PurePosixPath

    rel = PurePosixPath(file_path).relative_to(wiki_root)
    return normalize_slug(str(rel))
