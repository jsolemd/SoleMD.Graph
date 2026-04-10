"""Canonical runtime lookup keys for biomedical entity retrieval."""

from __future__ import annotations

_MUTATION_ENTITY_TYPES = frozenset(
    {
        "dnamutation",
        "proteinmutation",
        "snp",
        "mutation",
    }
)


def normalize_runtime_entity_type_key(entity_type: str | None) -> str:
    """Return the canonical runtime entity-type key."""

    normalized = (entity_type or "").strip().lower()
    if normalized in _MUTATION_ENTITY_TYPES:
        return "mutation"
    if normalized == "cellline":
        return "cellline"
    return normalized


def normalize_runtime_concept_namespace_key(
    concept_namespace: str | None,
) -> str | None:
    """Return the canonical runtime concept namespace key."""

    normalized = (concept_namespace or "").strip().lower()
    return normalized or None


def normalize_runtime_concept_id_key(concept_id: str | None) -> str:
    """Return the canonical runtime concept identifier key."""

    normalized = (concept_id or "").strip()
    if normalized.upper().startswith("MESH:"):
        return normalized.split(":", 1)[1]
    return normalized


def infer_catalog_concept_namespace(
    entity_type: str | None,
    source_identifier: str | None,
) -> str | None:
    """Return the canonical namespace for an entity catalog identifier."""

    normalized_identifier = (source_identifier or "").strip()
    normalized_type = normalize_runtime_entity_type_key(entity_type)

    if normalized_identifier.upper().startswith("MESH:"):
        return "mesh"
    if normalized_type == "gene":
        return "ncbi_gene"
    if normalized_type == "species":
        return "ncbi_taxonomy"
    return None


def normalize_catalog_concept_id(
    entity_type: str | None,
    source_identifier: str | None,
) -> str:
    """Return the canonical concept identifier for an entity catalog row."""

    normalized_identifier = (source_identifier or "").strip()
    normalized_type = normalize_runtime_entity_type_key(entity_type)

    if normalized_identifier.upper().startswith("MESH:"):
        return normalized_identifier.split(":", 1)[1]
    if normalized_type == "cellline":
        return normalized_identifier.replace("_", ":")
    return normalized_identifier


def runtime_entity_type_key_sql(expr: str) -> str:
    return f"""
CASE
    WHEN lower(COALESCE({expr}, '')) IN ('dnamutation', 'proteinmutation', 'snp', 'mutation')
        THEN 'mutation'
    WHEN lower(COALESCE({expr}, '')) = 'cellline'
        THEN 'cellline'
    ELSE lower(COALESCE({expr}, ''))
END
""".strip()


def runtime_concept_namespace_key_sql(expr: str) -> str:
    return f"NULLIF(lower(COALESCE({expr}, '')), '')"


def runtime_concept_id_key_sql(expr: str) -> str:
    return f"""
CASE
    WHEN upper(COALESCE({expr}, '')) LIKE 'MESH:%%'
        THEN split_part(COALESCE({expr}, ''), ':', 2)
    ELSE COALESCE({expr}, '')
END
""".strip()
