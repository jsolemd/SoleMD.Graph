"""Canonical corpus-id resolution helpers for external source document keys."""

from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum
from typing import Protocol

from app import db


class BioCDocumentIdKind(StrEnum):
    PMID = "pmid"
    PMCID = "pmcid"
    MID = "mid"
    DOI = "doi"
    OTHER = "other"


class CorpusIdResolver(Protocol):
    def __call__(self, source_document_key: str) -> int | None: ...


def normalize_bioc_document_id(document_id: str) -> tuple[BioCDocumentIdKind, str]:
    normalized = document_id.strip()
    if not normalized:
        return BioCDocumentIdKind.OTHER, ""
    if normalized.isdigit():
        return BioCDocumentIdKind.PMID, str(int(normalized))
    upper = normalized.upper()
    if upper.startswith("PMC"):
        suffix = upper[3:]
        core = suffix.split(".", 1)[0]
        if core.isdigit():
            return BioCDocumentIdKind.PMCID, f"PMC{core}"
    if upper.startswith("NIHMS") and upper[5:].isdigit():
        return BioCDocumentIdKind.MID, upper

    doi_candidate = normalized
    lowered = normalized.lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi.org/", "doi:"):
        if lowered.startswith(prefix):
            doi_candidate = normalized[len(prefix) :].strip()
            break
    if doi_candidate.lower().startswith("10.") and "/" in doi_candidate:
        return BioCDocumentIdKind.DOI, doi_candidate.lower()
    return BioCDocumentIdKind.OTHER, normalized


class PostgresBioCCorpusResolver:
    """Resolve BioC document ids onto canonical solemd.corpus ids."""

    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def resolve_document_ids(self, document_ids: Sequence[str]) -> dict[str, int]:
        normalized_map: dict[str, tuple[BioCDocumentIdKind, str]] = {
            document_id: normalize_bioc_document_id(document_id)
            for document_id in document_ids
        }
        pmid_values = sorted(
            {
                int(value)
                for kind, value in normalized_map.values()
                if kind == BioCDocumentIdKind.PMID and value
            }
        )
        pmcid_values = sorted(
            {
                value
                for kind, value in normalized_map.values()
                if kind == BioCDocumentIdKind.PMCID and value
            }
        )
        doi_values = sorted(
            {
                value
                for kind, value in normalized_map.values()
                if kind == BioCDocumentIdKind.DOI and value
            }
        )
        if not pmid_values and not pmcid_values and not doi_values:
            return {}

        resolved_normalized: dict[tuple[BioCDocumentIdKind, str], int] = {}
        with self._connect() as conn, conn.cursor() as cur:
            if pmid_values:
                cur.execute(
                    """
                    SELECT corpus_id, pmid
                    FROM solemd.corpus
                    WHERE pmid = ANY(%s)
                    """,
                    (pmid_values,),
                )
                for row in cur.fetchall():
                    resolved_normalized[(BioCDocumentIdKind.PMID, str(int(row["pmid"])))] = int(
                        row["corpus_id"]
                    )
            if pmcid_values:
                cur.execute(
                    """
                    SELECT corpus_id, pmc_id
                    FROM solemd.corpus
                    WHERE pmc_id = ANY(%s)
                    """,
                    (pmcid_values,),
                )
                for row in cur.fetchall():
                    resolved_normalized[(BioCDocumentIdKind.PMCID, str(row["pmc_id"]).upper())] = int(
                        row["corpus_id"]
                    )
            if doi_values:
                cur.execute(
                    """
                    SELECT corpus_id, lower(doi) AS doi
                    FROM solemd.corpus
                    WHERE lower(doi) = ANY(%s)
                    """,
                    (doi_values,),
                )
                for row in cur.fetchall():
                    resolved_normalized[(BioCDocumentIdKind.DOI, str(row["doi"]).lower())] = int(
                        row["corpus_id"]
                    )

        resolved: dict[str, int] = {}
        for original_id, normalized_key in normalized_map.items():
            corpus_id = resolved_normalized.get(normalized_key)
            if corpus_id is not None:
                resolved[original_id] = corpus_id
        return resolved

    def build_callable(self, document_ids: Sequence[str]) -> CorpusIdResolver:
        resolved = self.resolve_document_ids(document_ids)
        return resolved.get
