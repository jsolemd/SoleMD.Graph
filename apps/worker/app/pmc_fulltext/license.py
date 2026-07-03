from __future__ import annotations


INVALID_LICENSE_VALUES = frozenset(
    {
        "n/a",
        "na",
        "none",
        "not applicable",
        "not available",
        "null",
        "unknown",
    }
)
DOCUMENTS_LICENSE_PROVENANCE_SQL = """
(
    NULLIF(btrim(COALESCE(documents.license_url, '')), '') IS NOT NULL
    OR lower(btrim(COALESCE(documents.license, ''))) NOT IN (
        '',
        'n/a',
        'na',
        'none',
        'not applicable',
        'not available',
        'null',
        'unknown'
    )
)
"""


def has_license_provenance(
    *,
    license_text: str | None,
    license_url: str | None,
) -> bool:
    return bool(normalize_license_text(license_text) or normalize_url(license_url))


def normalize_license_text(value: str | None) -> str | None:
    normalized = normalize_text(value or "")
    if not normalized:
        return None
    if normalized.lower() in INVALID_LICENSE_VALUES:
        return None
    return normalized


def normalize_url(value: str | None) -> str | None:
    normalized = normalize_text(value or "")
    return normalized or None


def normalize_text(value: str) -> str:
    return " ".join(value.split())
