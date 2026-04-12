from __future__ import annotations

from app.wiki.semantic_groups import (
    fallback_semantic_group_for_entity_type,
    primary_semantic_group,
    resolve_wiki_semantic_group,
)


def test_primary_semantic_group_picks_first_nonempty_value():
    assert primary_semantic_group(["", "chem", "gene"]) == "CHEM"


def test_fallback_semantic_group_for_entity_type_is_canonicalized():
    assert fallback_semantic_group_for_entity_type("Chemical") == "CHEM"
    assert fallback_semantic_group_for_entity_type("Biological Process") == "PHYS"
    assert fallback_semantic_group_for_entity_type("unknown") is None


def test_resolve_wiki_semantic_group_prefers_explicit_group_before_fallback():
    assert (
        resolve_wiki_semantic_group(
            semantic_groups=["diso"],
            entity_type="Chemical",
        )
        == "DISO"
    )
