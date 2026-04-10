"""Tests for the wiki link normalization contract."""

from __future__ import annotations

from app.wiki.links import (
    build_link_resolution_map,
    compute_file_slug,
    extract_pmids,
    extract_raw_wikilinks,
    normalize_slug,
    resolve_outgoing_links,
)


class TestExtractRawWikilinks:
    def test_basic_wikilink(self):
        assert extract_raw_wikilinks("see [[serotonin]] for more") == ["serotonin"]

    def test_multiple_wikilinks(self):
        result = extract_raw_wikilinks("[[serotonin]] and [[melatonin]]")
        assert result == ["serotonin", "melatonin"]

    def test_wikilink_with_alias(self):
        result = extract_raw_wikilinks("see [[serotonin|5-HT]]")
        assert result == ["serotonin"]

    def test_excludes_pmid_citations(self):
        result = extract_raw_wikilinks("study [[pmid:12345678]] and [[serotonin]]")
        assert result == ["serotonin"]

    def test_excludes_pmid_case_insensitive(self):
        result = extract_raw_wikilinks("[[PMID:12345678]] and [[serotonin]]")
        assert result == ["serotonin"]

    def test_empty_content(self):
        assert extract_raw_wikilinks("") == []

    def test_no_wikilinks(self):
        assert extract_raw_wikilinks("plain text without links") == []

    def test_nested_path_wikilink(self):
        result = extract_raw_wikilinks("see [[entities/melatonin]]")
        assert result == ["entities/melatonin"]

    def test_wikilink_normalization(self):
        result = extract_raw_wikilinks("[[Circadian Rhythm]]")
        assert result == ["circadian-rhythm"]


class TestResolveOutgoingLinks:
    """Verify sync-time resolution of bare wikilinks to full slugs."""

    def test_bare_name_resolves_to_full_slug(self):
        known = {"entities/serotonin", "entities/melatonin"}
        result = resolve_outgoing_links(["serotonin"], known)
        assert result == ["entities/serotonin"]

    def test_full_slug_kept_as_is(self):
        known = {"entities/serotonin"}
        result = resolve_outgoing_links(["entities/serotonin"], known)
        assert result == ["entities/serotonin"]

    def test_unknown_target_kept_raw(self):
        known = {"entities/melatonin"}
        result = resolve_outgoing_links(["nonexistent"], known)
        assert result == ["nonexistent"]

    def test_ambiguous_bare_name_kept_raw(self):
        """Two pages share the same leaf name — keep raw to avoid misattribution."""
        known = {"entities/serotonin", "families/serotonin"}
        result = resolve_outgoing_links(["serotonin"], known)
        assert result == ["serotonin"]

    def test_deduplication_by_raw(self):
        known = {"entities/serotonin"}
        result = resolve_outgoing_links(["serotonin", "serotonin"], known)
        assert result == ["entities/serotonin"]

    def test_deduplication_by_canonical(self):
        """[[serotonin]] and [[entities/serotonin]] both resolve to the same slug."""
        known = {"entities/serotonin"}
        result = resolve_outgoing_links(["serotonin", "entities/serotonin"], known)
        assert result == ["entities/serotonin"]

    def test_mixed_resolution(self):
        known = {"entities/serotonin", "entities/melatonin", "families/sleep"}
        raw = ["serotonin", "entities/melatonin", "unknown-page", "sleep"]
        result = resolve_outgoing_links(raw, known)
        assert result == [
            "entities/serotonin",   # bare → resolved
            "entities/melatonin",   # already full slug
            "unknown-page",         # not found → kept
            "families/sleep",       # bare → resolved
        ]

    def test_empty_inputs(self):
        assert resolve_outgoing_links([], set()) == []
        assert resolve_outgoing_links([], {"entities/a"}) == []


class TestExtractPmids:
    def test_basic_pmid(self):
        assert extract_pmids("[[pmid:28847293]]") == [28847293]

    def test_multiple_pmids(self):
        result = extract_pmids("[[pmid:28847293]] and [[pmid:16336078]]")
        assert result == [28847293, 16336078]

    def test_case_insensitive(self):
        assert extract_pmids("[[PMID:28847293]]") == [28847293]

    def test_mixed_content(self):
        result = extract_pmids("see [[serotonin]] and [[pmid:28847293]]")
        assert result == [28847293]

    def test_no_pmids(self):
        assert extract_pmids("no citations here") == []


class TestNormalizeSlug:
    def test_lowercase(self):
        assert normalize_slug("Melatonin") == "melatonin"

    def test_strip_md_extension(self):
        assert normalize_slug("entities/melatonin.md") == "entities/melatonin"

    def test_spaces_to_hyphens(self):
        assert normalize_slug("Circadian Rhythm") == "circadian-rhythm"

    def test_collapse_hyphens(self):
        assert normalize_slug("foo--bar---baz") == "foo-bar-baz"

    def test_strip_slashes(self):
        assert normalize_slug("/entities/melatonin/") == "entities/melatonin"

    def test_already_normalized(self):
        assert normalize_slug("entities/melatonin") == "entities/melatonin"


class TestBuildLinkResolutionMap:
    """Verify the serve-time map from raw wikilink → resolved slug."""

    def test_bare_name_maps_to_full_slug(self):
        content = "see [[serotonin]] and [[AANAT]]"
        outgoing = ["entities/serotonin", "aanat"]
        result = build_link_resolution_map(content, outgoing)
        assert result == {"serotonin": "entities/serotonin", "aanat": "aanat"}

    def test_empty_inputs(self):
        assert build_link_resolution_map("no links", []) == {}
        assert build_link_resolution_map("", ["entities/x"]) == {}

    def test_full_slug_in_content_maps_directly(self):
        content = "see [[entities/melatonin]]"
        outgoing = ["entities/melatonin"]
        result = build_link_resolution_map(content, outgoing)
        assert result == {"entities/melatonin": "entities/melatonin"}


class TestComputeFileSlug:
    def test_relative_path(self):
        result = compute_file_slug("/wiki/entities/melatonin.md", "/wiki")
        assert result == "entities/melatonin"

    def test_nested_path(self):
        result = compute_file_slug("/wiki/families/sleep/overview.md", "/wiki")
        assert result == "families/sleep/overview"
