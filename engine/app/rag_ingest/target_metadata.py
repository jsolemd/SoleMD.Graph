"""Shared target-corpus metadata helpers for targeted ingest workflows."""

from __future__ import annotations

from app.rag.corpus_resolution import normalize_bioc_document_id
from app.rag_ingest.source_parsers import ParsedPaperSource
from app.rag_ingest.target_corpus import RagTargetCorpusRow


def target_row_by_corpus_id(
    target_rows: list[RagTargetCorpusRow],
) -> dict[int, RagTargetCorpusRow]:
    return {
        int(target_row.corpus_id): target_row
        for target_row in target_rows
    }


def apply_target_metadata_to_parsed_source(
    *,
    parsed: ParsedPaperSource,
    target_row: RagTargetCorpusRow | None,
) -> ParsedPaperSource:
    if target_row is None:
        return parsed
    metadata_title = (target_row.paper_title or "").strip()
    if not metadata_title:
        return parsed
    current_title = (parsed.document.title or "").strip()
    if current_title == metadata_title:
        return parsed
    if current_title:
        parsed.document.raw_attrs_json.setdefault("source_selected_title", current_title)
    parsed.document.raw_attrs_json["corpus_metadata_title"] = metadata_title
    parsed.document.title = metadata_title
    return parsed


def target_document_keys(target_row: RagTargetCorpusRow) -> set[str]:
    keys: set[str] = set()

    if target_row.pmid is not None:
        keys.add(str(int(target_row.pmid)))

    pmc_id = (target_row.pmc_id or "").strip()
    if pmc_id:
        upper_pmc = pmc_id.upper()
        keys.add(upper_pmc)
        if upper_pmc.startswith("PMC") and upper_pmc[3:].isdigit():
            keys.add(upper_pmc[3:])

    doi = (target_row.doi or "").strip()
    if doi:
        _, normalized_doi = normalize_bioc_document_id(doi)
        if normalized_doi:
            keys.add(normalized_doi)

    return keys
