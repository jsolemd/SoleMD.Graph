"""Builders that convert parsed/grounded source plans into warehouse write batches."""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Sequence
import json

from app.rag_ingest.chunking import assemble_structural_chunks
from app.rag.rag_schema_contract import (
    PaperBlockRow,
    PaperDocumentRow,
    PaperDocumentSourceRow,
    PaperReferenceEntryRow,
    PaperSectionRow,
    PaperSentenceRow,
)
from app.rag.source_grounding import build_aligned_mention_rows_from_plan
from app.rag.source_selection import GroundingSourcePlan
from app.rag.serving_contract import PaperChunkVersionRecord
from app.rag.warehouse_contract import PaperCitationMentionRow
from app.rag_ingest.write_contract import RagWarehouseWriteBatch


_ESTIMATED_ROW_OVERHEAD_BYTES = 96


def _utf8_len(value: str | None) -> int:
    return len(value.encode("utf-8")) if value else 0


def _json_len(value: object) -> int:
    if value in ({}, [], None, ""):
        return 0
    return len(json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8"))


def estimate_write_batch_rows_from_grounding_plan(
    plan: GroundingSourcePlan,
    *,
    source_citation_keys: Sequence[str] | None = None,
) -> int:
    primary = plan.primary_source
    allowed_keys = (
        set(item for item in source_citation_keys if item)
        if source_citation_keys is not None
        else None
    )
    citation_count = (
        sum(
            1
            for citation in primary.citations
            if allowed_keys is None or citation.source_citation_key in allowed_keys
        )
        if primary.citations
        else 0
    )
    entity_count = len(primary.entities) + sum(
        len(source.entities)
        for source in plan.annotation_sources
        if source.document.corpus_id == primary.document.corpus_id
    )
    document_source_keys = {
        (
            source.document.source_system,
            source.document.source_revision,
            source.document.source_document_key,
            source.document.source_plane,
        )
        for source in [primary, *plan.annotation_sources]
    }
    return (
        1  # documents
        + len(document_source_keys)
        + len(primary.sections)
        + len(primary.blocks)
        + len(primary.sentences)
        + len(primary.references)
        + citation_count
        + entity_count
    )


def estimate_write_batch_bytes_from_grounding_plan(
    plan: GroundingSourcePlan,
    *,
    source_citation_keys: Sequence[str] | None = None,
) -> int:
    primary = plan.primary_source
    citations, entities = build_aligned_mention_rows_from_plan(
        plan,
        source_citation_keys=source_citation_keys,
    )

    total = 0

    total += _ESTIMATED_ROW_OVERHEAD_BYTES
    total += _utf8_len(primary.document.title)
    total += _utf8_len(primary.document.language)
    total += _utf8_len(primary.document.source_availability)
    total += _utf8_len(primary.document.source_system)

    source_rows = _build_document_source_rows(plan)
    for row in source_rows:
        total += _ESTIMATED_ROW_OVERHEAD_BYTES
        total += _utf8_len(row.source_system)
        total += _utf8_len(row.source_revision)
        total += _utf8_len(row.source_document_key)
        total += _utf8_len(row.source_plane)
        total += _utf8_len(row.parser_version)
        total += _json_len(row.raw_attrs_json)

    for section in primary.sections:
        total += _ESTIMATED_ROW_OVERHEAD_BYTES
        total += _utf8_len(section.text)
        total += _utf8_len(section.display_label)
        total += _utf8_len(section.numbering_token)

    for block in primary.blocks:
        total += _ESTIMATED_ROW_OVERHEAD_BYTES
        total += _utf8_len(block.text)
        total += _utf8_len(block.block_kind)
        total += _utf8_len(block.section_role)
        total += _utf8_len(block.linked_asset_ref)

    for sentence in primary.sentences:
        total += _ESTIMATED_ROW_OVERHEAD_BYTES
        total += _utf8_len(sentence.text)
        total += _utf8_len(sentence.segmentation_source)

    for reference in primary.references:
        total += _ESTIMATED_ROW_OVERHEAD_BYTES
        total += _utf8_len(reference.text)
        total += _utf8_len(reference.source_reference_key)
        total += _utf8_len(reference.matched_paper_id)

    for citation in citations:
        total += _ESTIMATED_ROW_OVERHEAD_BYTES
        total += _utf8_len(citation.text)
        total += _utf8_len(citation.source_citation_key)
        total += _utf8_len(citation.source_reference_key)
        total += _utf8_len(citation.matched_paper_id)

    for entity in entities:
        total += _ESTIMATED_ROW_OVERHEAD_BYTES
        total += _utf8_len(entity.text)
        total += _utf8_len(entity.entity_type)
        total += _utf8_len(entity.source_identifier)
        total += _utf8_len(entity.concept_namespace)
        total += _utf8_len(entity.concept_id)

    return total


def build_write_batch_from_grounding_plan(
    plan: GroundingSourcePlan,
    *,
    source_citation_keys: Sequence[str] | None = None,
    chunk_version: PaperChunkVersionRecord | None = None,
) -> RagWarehouseWriteBatch:
    primary = plan.primary_source
    corpus_id = primary.document.corpus_id
    citations, entities = build_aligned_mention_rows_from_plan(
        plan,
        source_citation_keys=source_citation_keys,
    )
    references = [
        PaperReferenceEntryRow(
            corpus_id=reference.corpus_id,
            reference_ordinal=reference.reference_ordinal,
            source_reference_key=reference.source_reference_key,
            text=reference.text,
            matched_paper_id=reference.matched_paper_id,
            matched_corpus_id=reference.matched_corpus_id,
        )
        for reference in primary.references
    ]
    citations = _sanitize_citation_reference_links(
        citations,
        references=references,
    )

    source_rows = _build_document_source_rows(plan)

    batch = RagWarehouseWriteBatch(
        documents=[
            PaperDocumentRow(
                corpus_id=corpus_id,
                title=primary.document.title,
                language=primary.document.language,
                source_availability=primary.document.source_availability,
                primary_source_system=primary.document.source_system,
            )
        ],
        document_sources=source_rows,
        sections=[
            PaperSectionRow(
                corpus_id=section.corpus_id,
                section_ordinal=section.section_ordinal,
                parent_section_ordinal=section.parent_section_ordinal,
                section_role=section.section_role,
                display_label=section.display_label,
                numbering_token=section.numbering_token,
                text=section.text,
            )
            for section in primary.sections
        ],
        blocks=[
            PaperBlockRow(
                corpus_id=block.corpus_id,
                block_ordinal=block.block_ordinal,
                section_ordinal=block.section_ordinal,
                section_role=block.section_role,
                block_kind=block.block_kind,
                text=block.text,
                is_retrieval_default=block.is_retrieval_default,
                linked_asset_ref=block.linked_asset_ref,
            )
            for block in primary.blocks
        ],
        sentences=[
            PaperSentenceRow(
                corpus_id=sentence.corpus_id,
                block_ordinal=sentence.block_ordinal,
                sentence_ordinal=sentence.sentence_ordinal,
                section_ordinal=sentence.section_ordinal,
                segmentation_source=sentence.segmentation_source,
                text=sentence.text,
            )
            for sentence in primary.sentences
        ],
        references=references,
        citations=citations,
        entities=entities,
    )
    if chunk_version is None:
        return batch
    return extend_write_batch_with_structural_chunks(
        batch,
        chunk_version=chunk_version,
    )


def build_chunk_write_batch_from_rows(
    *,
    chunk_version: PaperChunkVersionRecord,
    blocks: Sequence[PaperBlockRow],
    sentences: Sequence[PaperSentenceRow],
    include_chunk_version_row: bool = True,
) -> RagWarehouseWriteBatch:
    assembly = assemble_structural_chunks(
        version=chunk_version,
        blocks=list(blocks),
        sentences=list(sentences),
    )
    return RagWarehouseWriteBatch(
        chunk_versions=[chunk_version] if include_chunk_version_row else [],
        chunks=list(assembly.chunks),
        chunk_members=list(assembly.members),
    )


def extend_write_batch_with_structural_chunks(
    batch: RagWarehouseWriteBatch,
    *,
    chunk_version: PaperChunkVersionRecord,
) -> RagWarehouseWriteBatch:
    chunk_batch = build_chunk_write_batch_from_rows(
        chunk_version=chunk_version,
        blocks=batch.blocks,
        sentences=batch.sentences,
    )
    return RagWarehouseWriteBatch(
        documents=list(batch.documents),
        document_sources=list(batch.document_sources),
        sections=list(batch.sections),
        blocks=list(batch.blocks),
        sentences=list(batch.sentences),
        references=list(batch.references),
        citations=list(batch.citations),
        entities=list(batch.entities),
        chunk_versions=_merge_rows(
            batch.chunk_versions,
            chunk_batch.chunk_versions,
            key=lambda row: row.chunk_version_key,
        ),
        chunks=_merge_rows(
            batch.chunks,
            chunk_batch.chunks,
            key=lambda row: (row.chunk_version_key, row.corpus_id, row.chunk_ordinal),
        ),
        chunk_members=_merge_rows(
            batch.chunk_members,
            chunk_batch.chunk_members,
            key=lambda row: (
                row.chunk_version_key,
                row.corpus_id,
                row.chunk_ordinal,
                row.member_ordinal,
            ),
        ),
    )


def _sanitize_citation_reference_links(
    citations: Sequence[PaperCitationMentionRow],
    *,
    references: Sequence[PaperReferenceEntryRow],
) -> list[PaperCitationMentionRow]:
    valid_reference_keys = {row.source_reference_key for row in references}
    if not valid_reference_keys:
        return [
            row.model_copy(update={"source_reference_key": None})
            if row.source_reference_key
            else row
            for row in citations
        ]
    sanitized = []
    for row in citations:
        if row.source_reference_key and row.source_reference_key not in valid_reference_keys:
            sanitized.append(row.model_copy(update={"source_reference_key": None}))
            continue
        sanitized.append(row)
    return sanitized


def merge_write_batches(
    batches: Sequence[RagWarehouseWriteBatch],
) -> RagWarehouseWriteBatch:
    merged = RagWarehouseWriteBatch()
    for batch in batches:
        merged.documents = _merge_rows(
            merged.documents,
            batch.documents,
            key=lambda row: row.corpus_id,
        )
        merged.document_sources = _merge_rows(
            merged.document_sources,
            batch.document_sources,
            key=lambda row: (row.corpus_id, row.document_source_ordinal),
        )
        merged.sections = _merge_rows(
            merged.sections,
            batch.sections,
            key=lambda row: (row.corpus_id, row.section_ordinal),
        )
        merged.blocks = _merge_rows(
            merged.blocks,
            batch.blocks,
            key=lambda row: (row.corpus_id, row.block_ordinal),
        )
        merged.sentences = _merge_rows(
            merged.sentences,
            batch.sentences,
            key=lambda row: (row.corpus_id, row.block_ordinal, row.sentence_ordinal),
        )
        merged.references = _merge_rows(
            merged.references,
            batch.references,
            key=lambda row: (row.corpus_id, row.source_reference_key),
        )
        merged.citations = _merge_rows(
            merged.citations,
            batch.citations,
            key=lambda row: (row.corpus_id, row.source_system, row.source_start_offset, row.text),
        )
        merged.entities = _merge_rows(
            merged.entities,
            batch.entities,
            key=lambda row: (
                row.corpus_id,
                row.source_system,
                row.source_start_offset,
                row.text,
                row.concept_namespace,
                row.concept_id,
            ),
        )
        merged.chunk_versions = _merge_rows(
            merged.chunk_versions,
            batch.chunk_versions,
            key=lambda row: row.chunk_version_key,
        )
        merged.chunks = _merge_rows(
            merged.chunks,
            batch.chunks,
            key=lambda row: (row.chunk_version_key, row.corpus_id, row.chunk_ordinal),
        )
        merged.chunk_members = _merge_rows(
            merged.chunk_members,
            batch.chunk_members,
            key=lambda row: (
                row.chunk_version_key,
                row.corpus_id,
                row.chunk_ordinal,
                row.member_ordinal,
            ),
        )
    return merged


def _build_document_source_rows(
    plan: GroundingSourcePlan,
) -> list[PaperDocumentSourceRow]:
    ordered_sources = OrderedDict()
    all_sources = [plan.primary_source, *plan.annotation_sources]
    for source in all_sources:
        key = (
            source.document.source_system,
            source.document.source_revision,
            source.document.source_document_key,
            source.document.source_plane,
        )
        ordered_sources.setdefault(key, source)

    rows: list[PaperDocumentSourceRow] = []
    for ordinal, source in enumerate(ordered_sources.values()):
        rows.append(
            PaperDocumentSourceRow(
                corpus_id=source.document.corpus_id,
                document_source_ordinal=ordinal,
                source_system=source.document.source_system,
                source_revision=source.document.source_revision,
                source_document_key=source.document.source_document_key,
                source_plane=source.document.source_plane,
                parser_version=source.document.parser_version,
                is_primary_text_source=source is plan.primary_source,
                raw_attrs_json=source.document.raw_attrs_json,
            )
        )
    return rows


def _merge_rows(existing, additions, *, key):
    merged = OrderedDict()
    for row in [*existing, *additions]:
        merged[key(row)] = row
    return list(merged.values())
