"""Tests for the wiki sync script parsing and reconciliation."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest

# Import the internal parse function for unit testing
from db.scripts.sync_wiki_pages import _parse_wiki_file

from app.wiki.links import resolve_outgoing_links


@pytest.fixture
def wiki_dir(tmp_path: Path) -> Path:
    """Create a temporary wiki directory with sample pages."""
    entities = tmp_path / "entities"
    entities.mkdir()

    melatonin = entities / "melatonin.md"
    melatonin.write_text(
        dedent("""\
        ---
        title: Melatonin
        entity_type: Chemical
        concept_id: MESH:D008550
        tags:
          - sleep
          - circadian
        ---

        # Melatonin

        A neurohormone from [[serotonin]] via [[AANAT]].

        Studies show benefits [[pmid:28847293]] and [[pmid:16336078]].
        """)
    )

    serotonin = entities / "serotonin.md"
    serotonin.write_text(
        dedent("""\
        ---
        title: Serotonin
        entity_type: Chemical
        ---

        # Serotonin

        Precursor to [[melatonin]].
        """)
    )
    return tmp_path


def test_parse_wiki_file_extracts_metadata(wiki_dir: Path):
    page = wiki_dir / "entities" / "melatonin.md"
    row = _parse_wiki_file(page, wiki_dir)

    assert row["slug"] == "entities/melatonin"
    assert row["title"] == "Melatonin"
    assert row["entity_type"] == "Chemical"
    assert row["concept_id"] == "MESH:D008550"
    assert "sleep" in row["tags"]
    assert "circadian" in row["tags"]


def test_parse_wiki_file_extracts_raw_links(wiki_dir: Path):
    """_parse_wiki_file returns bare raw_links, not yet resolved to full slugs."""
    page = wiki_dir / "entities" / "melatonin.md"
    row = _parse_wiki_file(page, wiki_dir)

    # raw_links are bare names as written in the markdown
    assert "serotonin" in row["raw_links"]
    assert "aanat" in row["raw_links"]
    # outgoing_links is a placeholder — resolved later by sync()
    assert row["outgoing_links"] == []


def test_resolve_links_maps_bare_to_full_slugs(wiki_dir: Path):
    """After collecting all pages, bare links resolve to full slugs."""
    melatonin_row = _parse_wiki_file(wiki_dir / "entities" / "melatonin.md", wiki_dir)
    serotonin_row = _parse_wiki_file(wiki_dir / "entities" / "serotonin.md", wiki_dir)

    known_slugs = {melatonin_row["slug"], serotonin_row["slug"]}

    # Resolve melatonin's links — [[serotonin]] → entities/serotonin
    resolved = resolve_outgoing_links(melatonin_row["raw_links"], known_slugs)
    assert "entities/serotonin" in resolved

    # [[AANAT]] doesn't match any known page — kept as raw
    assert "aanat" in resolved

    # Resolve serotonin's links — [[melatonin]] → entities/melatonin
    resolved_s = resolve_outgoing_links(serotonin_row["raw_links"], known_slugs)
    assert "entities/melatonin" in resolved_s


def test_parse_wiki_file_extracts_pmids(wiki_dir: Path):
    page = wiki_dir / "entities" / "melatonin.md"
    row = _parse_wiki_file(page, wiki_dir)

    assert 28847293 in row["paper_pmids"]
    assert 16336078 in row["paper_pmids"]


def test_parse_wiki_file_computes_checksum(wiki_dir: Path):
    page = wiki_dir / "entities" / "melatonin.md"
    row = _parse_wiki_file(page, wiki_dir)

    assert isinstance(row["checksum"], str)
    assert len(row["checksum"]) == 64  # SHA-256 hex digest


def test_parse_wiki_file_title_fallback(tmp_path: Path):
    """Pages without a title frontmatter get a title derived from slug."""
    page = tmp_path / "no-title.md"
    page.write_text("---\n---\n\nSome content.\n")
    row = _parse_wiki_file(page, tmp_path)
    assert row["title"] == "No Title"
