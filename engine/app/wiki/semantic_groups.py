"""Canonical semantic-group resolution for wiki runtime surfaces."""

from __future__ import annotations

from collections.abc import Sequence

_ENTITY_TYPE_TO_SEMANTIC_GROUP: dict[str, str] = {
    "disease": "DISO",
    "chemical": "CHEM",
    "gene": "GENE",
    "receptor": "GENE",
    "anatomy": "ANAT",
    "network": "PHYS",
    "biological process": "PHYS",
    "species": "LIVB",
    "mutation": "GENE",
    "dnamutation": "GENE",
    "proteinmutation": "GENE",
    "snp": "GENE",
    "cellline": "ANAT",
}


def normalize_semantic_group(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


def primary_semantic_group(values: Sequence[str] | None) -> str | None:
    if not values:
        return None
    for value in values:
        if not isinstance(value, str):
            continue
        normalized = normalize_semantic_group(value)
        if normalized is not None:
            return normalized
    return None


def fallback_semantic_group_for_entity_type(entity_type: str | None) -> str | None:
    if entity_type is None:
        return None
    return _ENTITY_TYPE_TO_SEMANTIC_GROUP.get(entity_type.strip().lower())


def resolve_wiki_semantic_group(
    *,
    semantic_group: str | None = None,
    semantic_groups: Sequence[str] | None = None,
    entity_type: str | None = None,
) -> str | None:
    return (
        normalize_semantic_group(semantic_group)
        or primary_semantic_group(semantic_groups)
        or fallback_semantic_group_for_entity_type(entity_type)
    )
