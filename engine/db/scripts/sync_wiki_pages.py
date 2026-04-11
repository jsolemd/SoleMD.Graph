"""Synchronize wiki/ markdown files into solemd.wiki_pages.

Delete-aware reconciliation: files added/changed are UPSERTed, files
removed from the filesystem are DELETEd from the database.

Usage:
    cd engine && python db/scripts/sync_wiki_pages.py --wiki-dir ../wiki
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import frontmatter  # noqa: E402

from app import db  # noqa: E402
from app.wiki import queries  # noqa: E402
from app.wiki.content_contract import normalize_wiki_frontmatter  # noqa: E402
from app.wiki.links import (  # noqa: E402
    compute_file_slug,
    extract_pmids,
    extract_raw_wikilinks,
    resolve_outgoing_links,
)


@dataclass(slots=True)
class SyncResult:
    """Summary of a wiki sync run."""

    added: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _file_checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _parse_wiki_file(md_path: Path, wiki_root: Path) -> dict:
    """Parse a wiki markdown file into a row dict for UPSERT."""
    slug = compute_file_slug(str(md_path), str(wiki_root))
    raw_bytes = md_path.read_bytes()
    checksum = hashlib.sha256(raw_bytes).hexdigest()
    post = frontmatter.loads(raw_bytes.decode("utf-8"))

    fm = normalize_wiki_frontmatter(dict(post.metadata))
    title = fm.pop("title", slug.rsplit("/", 1)[-1].replace("-", " ").title())
    content_md = post.content

    raw_links = extract_raw_wikilinks(content_md)
    paper_pmids = extract_pmids(content_md)

    return {
        "slug": slug,
        "title": title,
        "content_md": content_md,
        "frontmatter": json.dumps(fm),
        "entity_type": fm.get("entity_type"),
        "concept_id": fm.get("concept_id"),
        "family_key": fm.get("family_key"),
        "tags": fm.get("tags") or [],
        "raw_links": raw_links,  # resolved to full slugs in sync()
        "outgoing_links": [],    # placeholder — filled after all pages collected
        "paper_pmids": paper_pmids,
        "checksum": checksum,
    }


def sync(wiki_dir: Path) -> SyncResult:
    """Perform delete-aware sync of wiki markdown files to the database."""
    result = SyncResult()

    # Collect all filesystem pages (outgoing_links not yet resolved)
    filesystem_pages: dict[str, dict] = {}
    for md_path in sorted(wiki_dir.rglob("*.md")):
        try:
            row = _parse_wiki_file(md_path, wiki_dir)
            filesystem_pages[row["slug"]] = row
        except Exception as exc:
            result.errors.append(f"{md_path}: {exc}")

    # Resolve bare wikilinks to canonical full slugs using the page inventory.
    # e.g. [[serotonin]] → entities/serotonin (if entities/serotonin.md exists)
    known_slugs = set(filesystem_pages.keys())
    for row in filesystem_pages.values():
        row["outgoing_links"] = resolve_outgoing_links(row.pop("raw_links"), known_slugs)

    # Fetch existing checksums from DB
    with db.connect() as conn:
        existing = conn.execute(queries.GET_EXISTING_CHECKSUMS).fetchall()
    existing_checksums = {r["slug"]: r["checksum"] for r in existing}

    # UPSERT changed/new pages, and re-resolve links for unchanged pages
    # whose outgoing_links may have changed due to new/removed pages in
    # the inventory (link resolution depends on the full page set).
    with db.connect() as conn:
        for slug, row in filesystem_pages.items():
            if slug not in existing_checksums:
                conn.execute(queries.UPSERT_PAGE, row)
                result.added.append(slug)
            elif existing_checksums[slug] != row["checksum"]:
                conn.execute(queries.UPSERT_PAGE, row)
                result.updated.append(slug)
            else:
                # Content unchanged, but re-resolve outgoing_links in case
                # the page inventory changed (new targets now resolvable).
                conn.execute(queries.UPDATE_OUTGOING_LINKS, {
                    "slug": slug,
                    "outgoing_links": row["outgoing_links"],
                })
                result.unchanged.append(slug)
        conn.commit()

    # DELETE pages removed from filesystem
    filesystem_slugs = list(filesystem_pages.keys())
    with db.connect() as conn:
        if filesystem_slugs:
            conn.execute(queries.DELETE_REMOVED_PAGES, {"slugs": filesystem_slugs})
        else:
            # If no wiki files exist, delete all rows
            conn.execute("DELETE FROM solemd.wiki_pages")
        conn.commit()

    deleted_slugs = set(existing_checksums.keys()) - set(filesystem_pages.keys())
    result.deleted = sorted(deleted_slugs)

    return result


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync wiki/ markdown files into solemd.wiki_pages.",
    )
    parser.add_argument(
        "--wiki-dir",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "wiki",
        help="Path to wiki/ directory (default: project-root/wiki)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing to the database.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    wiki_dir = args.wiki_dir.resolve()

    if not wiki_dir.is_dir():
        print(f"ERROR: wiki directory not found: {wiki_dir}", file=sys.stderr)
        return 1

    try:
        result = sync(wiki_dir)
        print(f"added:     {len(result.added)}")
        print(f"updated:   {len(result.updated)}")
        print(f"deleted:   {len(result.deleted)}")
        print(f"unchanged: {len(result.unchanged)}")
        if result.errors:
            print(f"errors:    {len(result.errors)}")
            for err in result.errors:
                print(f"  - {err}", file=sys.stderr)
        if result.added:
            for slug in result.added:
                print(f"  + {slug}")
        if result.updated:
            for slug in result.updated:
                print(f"  ~ {slug}")
        if result.deleted:
            for slug in result.deleted:
                print(f"  - {slug}")
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
