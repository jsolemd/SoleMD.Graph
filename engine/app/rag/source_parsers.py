"""Thin source-specific adapters that emit normalized parser-contract records."""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any

from app.rag.corpus_resolution import CorpusIdResolver
from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    PaperCitationMentionRecord,
    PaperDocumentRecord,
    PaperEntityMentionRecord,
    PaperReferenceEntryRecord,
    PaperSectionRecord,
    PaperSentenceRecord,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)


@dataclass(slots=True)
class ParsedPaperSource:
    """Normalized parser output for one source document."""

    document: PaperDocumentRecord
    sections: list[PaperSectionRecord] = field(default_factory=list)
    blocks: list[PaperBlockRecord] = field(default_factory=list)
    sentences: list[PaperSentenceRecord] = field(default_factory=list)
    references: list[PaperReferenceEntryRecord] = field(default_factory=list)
    citations: list[PaperCitationMentionRecord] = field(default_factory=list)
    entities: list[PaperEntityMentionRecord] = field(default_factory=list)


def _parse_biocxml_document_elem(xml_text: str) -> tuple[ET.Element, str]:
    root = ET.fromstring(xml_text)
    document_elem = root.find(".//document") if root.tag != "document" else root
    if document_elem is None:
        raise ValueError("No <document> element found in BioCXML payload")
    document_id = (document_elem.findtext("id") or "").strip()
    if not document_id:
        raise ValueError("BioCXML document must contain a non-empty <id>")
    return document_elem, document_id


def extract_biocxml_document_id(xml_text: str) -> str:
    """Return the source document identifier from a BioCXML payload."""

    _, document_id = _parse_biocxml_document_elem(xml_text)
    return document_id


def _decode_annotation_group(raw_value: Any) -> list[dict[str, Any]]:
    if raw_value in (None, "", "null"):
        return []
    if isinstance(raw_value, str):
        decoded = json.loads(raw_value)
        values = decoded if isinstance(decoded, list) else []
    else:
        values = raw_value if isinstance(raw_value, list) else []

    normalized: list[dict[str, Any]] = []
    for item in values:
        if not isinstance(item, dict):
            continue
        coerced = dict(item)
        if "start" in coerced and coerced["start"] is not None:
            coerced["start"] = int(coerced["start"])
        if "end" in coerced and coerced["end"] is not None:
            coerced["end"] = int(coerced["end"])
        normalized.append(coerced)
    return normalized


def _span_text(text: str, start: int, end: int) -> str:
    return text[start:end]


def _coerce_optional_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _normalize_header_label(value: str | None) -> list[str]:
    if not value:
        return ""
    lowered = value.lower()
    return "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in lowered).split()


def _normalize_section_role(
    *, header_text: str | None = None, section_type: str | None = None
) -> SectionRole:
    type_key = (section_type or "").strip().upper()
    if type_key == "ABSTRACT":
        return SectionRole.ABSTRACT
    if type_key == "INTRO":
        return SectionRole.INTRODUCTION
    if type_key == "METHODS":
        return SectionRole.METHODS
    if type_key == "RESULTS":
        return SectionRole.RESULTS
    if type_key == "DISCUSS":
        return SectionRole.DISCUSSION
    if type_key == "CONCL":
        return SectionRole.CONCLUSION
    if type_key == "SUPPL":
        return SectionRole.SUPPLEMENT
    if type_key == "REF":
        return SectionRole.REFERENCE
    if type_key in {"TITLE", "AUTH_CONT", "ACK_FUND", "COMP_INT"}:
        return SectionRole.FRONT_MATTER

    tokens = _normalize_header_label(header_text)
    token_text = " ".join(tokens)
    if "abstract" in tokens:
        return SectionRole.ABSTRACT
    if "introduction" in tokens or token_text == "intro":
        return SectionRole.INTRODUCTION
    if "method" in token_text or "materials and methods" in token_text:
        return SectionRole.METHODS
    if "result" in token_text:
        return SectionRole.RESULTS
    if "discussion" in token_text or "discuss" in token_text:
        return SectionRole.DISCUSSION
    if "conclusion" in token_text or "conclusions" in token_text:
        return SectionRole.CONCLUSION
    if "supplement" in token_text:
        return SectionRole.SUPPLEMENT
    if "reference" in token_text or "references" in token_text:
        return SectionRole.REFERENCE
    if "ethics" in token_text or "conflict" in token_text:
        return SectionRole.FRONT_MATTER
    return SectionRole.OTHER


def _normalize_block_kind_from_bioc(passage_type: str | None) -> PaperBlockKind | None:
    type_key = (passage_type or "").strip().lower()
    if type_key in {"paragraph", "abstract"}:
        return PaperBlockKind.NARRATIVE_PARAGRAPH
    if type_key == "fig_caption":
        return PaperBlockKind.FIGURE_CAPTION
    if type_key == "table_caption":
        return PaperBlockKind.TABLE_CAPTION
    if type_key == "table_footnote":
        return PaperBlockKind.TABLE_FOOTNOTE
    if type_key == "table":
        return PaperBlockKind.TABLE_BODY_TEXT
    return None


def _extract_bioc_annotation_identifier(
    annotation: ET.Element, annotation_infons: dict[str, str]
) -> str | None:
    for key in ("identifier", "Identifier", "id"):
        value = (annotation_infons.get(key) or "").strip()
        if value:
            return value
    value = (annotation.findtext("id") or "").strip()
    return value or None


def _normalize_concept_identifier(
    entity_type: str | None, source_identifier: str | None
) -> tuple[str | None, str | None]:
    raw_identifier = (source_identifier or "").strip()
    if not raw_identifier:
        return None, None

    upper_identifier = raw_identifier.upper()
    lowered_type = (entity_type or "").strip().lower()

    if upper_identifier.startswith("MESH:"):
        return "mesh", raw_identifier.split(":", 1)[1]
    if raw_identifier.startswith("CVCL_"):
        return "cellosaurus", raw_identifier
    if raw_identifier.lower().startswith("rs"):
        return "dbsnp", raw_identifier
    if lowered_type == "gene" and raw_identifier.isdigit():
        return "ncbi_gene", raw_identifier
    if lowered_type == "species" and raw_identifier.isdigit():
        return "ncbi_taxonomy", raw_identifier
    if lowered_type == "mutation" and (
        "|" in raw_identifier
        or raw_identifier.startswith(("c.", "p.", "g.", "n.", "m.", "r."))
    ):
        return "hgvs_like", raw_identifier

    return None, raw_identifier


def _derive_parent_section_ordinal(
    numbering_token: str | None,
    seen_tokens: dict[str, int],
) -> int | None:
    if not numbering_token:
        return None
    parts = [part for part in numbering_token.strip(".").split(".") if part]
    for width in range(len(parts) - 1, 0, -1):
        candidate = ".".join(parts[:width]) + "."
        if candidate in seen_tokens:
            return seen_tokens[candidate]
    return None


def _trimmed_relative_span(text: str, start: int, end: int) -> tuple[int, int] | None:
    slice_text = text[start:end]
    left = 0
    right = len(slice_text)
    while left < right and slice_text[left].isspace():
        left += 1
    while right > left and slice_text[right - 1].isspace():
        right -= 1
    if left == right:
        return None
    return start + left, start + right


def _fallback_sentence_spans(text: str, absolute_start: int) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = 0
    for idx, ch in enumerate(text):
        if ch not in ".?!":
            continue
        next_is_boundary = idx + 1 == len(text) or text[idx + 1].isspace()
        if not next_is_boundary:
            continue
        trimmed = _trimmed_relative_span(text, start, idx + 1)
        if trimmed is not None:
            spans.append((absolute_start + trimmed[0], absolute_start + trimmed[1]))
        start = idx + 1
    trimmed = _trimmed_relative_span(text, start, len(text))
    if trimmed is not None:
        spans.append((absolute_start + trimmed[0], absolute_start + trimmed[1]))
    return spans


def _find_containing_ordinals(
    *,
    start: int,
    end: int,
    blocks: list[PaperBlockRecord],
    sentences: list[PaperSentenceRecord],
) -> tuple[int | None, int | None, int | None]:
    block = next(
        (
            item
            for item in blocks
            if item.source_start_offset <= start and end <= item.source_end_offset
        ),
        None,
    )
    if block is None:
        return None, None, None
    sentence = next(
        (
            item
            for item in sentences
            if item.block_ordinal == block.block_ordinal
            and item.source_start_offset <= start
            and end <= item.source_end_offset
        ),
        None,
    )
    return (
        block.section_ordinal,
        block.block_ordinal,
        sentence.sentence_ordinal if sentence is not None else None,
    )


def parse_s2orc_row(
    row: dict[str, Any],
    *,
    source_revision: str,
    parser_version: str,
) -> ParsedPaperSource:
    """Parse one S2ORC v2 row into normalized parse-contract records."""

    corpus_id = int(row["corpusid"])
    body = row.get("body") or {}
    bibliography = row.get("bibliography") or {}
    body_text = body.get("text") or ""
    bibliography_text = bibliography.get("text") or ""
    body_annotations = body.get("annotations") or {}
    bibliography_annotations = bibliography.get("annotations") or {}

    document = PaperDocumentRecord(
        corpus_id=corpus_id,
        source_system=ParseSourceSystem.S2ORC_V2,
        source_revision=source_revision,
        source_document_key=str(corpus_id),
        source_plane=SourcePlane.BODY,
        parser_version=parser_version,
        raw_attrs_json={"openaccessinfo": row.get("openaccessinfo")},
        title=row.get("title"),
        source_availability="full_text",
    )

    sections: list[PaperSectionRecord] = []
    numbering_map: dict[str, int] = {}
    section_headers = sorted(
        _decode_annotation_group(body_annotations.get("section_header")),
        key=lambda item: (item["start"], item["end"]),
    )
    for ordinal, item in enumerate(section_headers, start=1):
        attrs = item.get("attributes") or {}
        header_text = _span_text(body_text, item["start"], item["end"]).strip()
        numbering_token = attrs.get("n")
        section = PaperSectionRecord(
            corpus_id=corpus_id,
            source_system=ParseSourceSystem.S2ORC_V2,
            source_revision=source_revision,
            source_document_key=str(corpus_id),
            source_plane=SourcePlane.BODY,
            parser_version=parser_version,
            raw_attrs_json=attrs,
            source_start_offset=item["start"],
            source_end_offset=item["end"],
            text=header_text,
            section_ordinal=ordinal,
            parent_section_ordinal=_derive_parent_section_ordinal(
                numbering_token, numbering_map
            ),
            section_role=_normalize_section_role(header_text=header_text),
            display_label=header_text,
            numbering_token=numbering_token,
        )
        sections.append(section)
        if numbering_token:
            numbering_map[numbering_token] = ordinal

    def resolve_section_for_span(start: int) -> tuple[int, SectionRole]:
        current = next(
            (
                section
                for section in reversed(sections)
                if section.source_start_offset <= start
            ),
            None,
        )
        if current is None:
            return 0, SectionRole.OTHER
        return current.section_ordinal, current.section_role

    blocks: list[PaperBlockRecord] = []
    paragraphs = sorted(
        _decode_annotation_group(body_annotations.get("paragraph")),
        key=lambda item: (item["start"], item["end"]),
    )
    for ordinal, item in enumerate(paragraphs):
        text = _span_text(body_text, item["start"], item["end"])
        section_ordinal, section_role = resolve_section_for_span(item["start"])
        blocks.append(
            PaperBlockRecord(
                corpus_id=corpus_id,
                source_system=ParseSourceSystem.S2ORC_V2,
                source_revision=source_revision,
                source_document_key=str(corpus_id),
                source_plane=SourcePlane.BODY,
                parser_version=parser_version,
                raw_attrs_json=item.get("attributes") or {},
                source_start_offset=item["start"],
                source_end_offset=item["end"],
                text=text,
                block_ordinal=ordinal,
                section_ordinal=section_ordinal,
                block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
                section_role=section_role,
                is_retrieval_default=section_role != SectionRole.REFERENCE,
            )
        )

    sentences: list[PaperSentenceRecord] = []
    source_sentences = sorted(
        _decode_annotation_group(body_annotations.get("sentence")),
        key=lambda item: (item["start"], item["end"]),
    )
    covered_blocks: set[int] = set()
    if source_sentences:
        for item in source_sentences:
            section_ordinal, block_ordinal, _ = _find_containing_ordinals(
                start=item["start"],
                end=item["end"],
                blocks=blocks,
                sentences=[],
            )
            if block_ordinal is None or section_ordinal is None:
                continue
            covered_blocks.add(block_ordinal)
            block_sentence_count = sum(
                1 for sentence in sentences if sentence.block_ordinal == block_ordinal
            )
            sentences.append(
                PaperSentenceRecord(
                    corpus_id=corpus_id,
                    source_system=ParseSourceSystem.S2ORC_V2,
                    source_revision=source_revision,
                    source_document_key=str(corpus_id),
                    source_plane=SourcePlane.BODY,
                    parser_version=parser_version,
                    raw_attrs_json=item.get("attributes") or {},
                    source_start_offset=item["start"],
                    source_end_offset=item["end"],
                    text=_span_text(body_text, item["start"], item["end"]),
                    sentence_ordinal=block_sentence_count,
                    block_ordinal=block_ordinal,
                    section_ordinal=section_ordinal,
                    segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
                )
            )
    for block in blocks:
        if source_sentences and block.block_ordinal in covered_blocks:
            continue
        for sentence_ordinal, (start, end) in enumerate(
            _fallback_sentence_spans(block.text, block.source_start_offset)
        ):
            sentences.append(
                PaperSentenceRecord(
                    corpus_id=corpus_id,
                    source_system=ParseSourceSystem.S2ORC_V2,
                    source_revision=source_revision,
                    source_document_key=str(corpus_id),
                    source_plane=SourcePlane.BODY,
                    parser_version=parser_version,
                    raw_attrs_json={},
                    source_start_offset=start,
                    source_end_offset=end,
                    text=_span_text(body_text, start, end),
                    sentence_ordinal=sentence_ordinal,
                    block_ordinal=block.block_ordinal,
                    section_ordinal=block.section_ordinal,
                    segmentation_source=SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
                )
            )

    references: list[PaperReferenceEntryRecord] = []
    bib_entries = sorted(
        _decode_annotation_group(bibliography_annotations.get("bib_entry")),
        key=lambda item: (item["start"], item["end"]),
    )
    for ordinal, item in enumerate(bib_entries):
        attrs = item.get("attributes") or {}
        references.append(
            PaperReferenceEntryRecord(
                corpus_id=corpus_id,
                source_system=ParseSourceSystem.S2ORC_V2,
                source_revision=source_revision,
                source_document_key=str(corpus_id),
                source_plane=SourcePlane.BIBLIOGRAPHY,
                parser_version=parser_version,
                raw_attrs_json=attrs,
                source_start_offset=item["start"],
                source_end_offset=item["end"],
                text=_span_text(bibliography_text, item["start"], item["end"]),
                source_reference_key=_coerce_optional_string(attrs.get("id"))
                or f"bib:{ordinal}",
                reference_ordinal=ordinal,
                matched_paper_id=_coerce_optional_string(attrs.get("matched_paper_id")),
            )
        )

    citations: list[PaperCitationMentionRecord] = []
    bib_refs = sorted(
        _decode_annotation_group(body_annotations.get("bib_ref")),
        key=lambda item: (item["start"], item["end"]),
    )
    for item in bib_refs:
        attrs = item.get("attributes") or {}
        section_ordinal, block_ordinal, sentence_ordinal = _find_containing_ordinals(
            start=item["start"],
            end=item["end"],
            blocks=blocks,
            sentences=sentences,
        )
        if block_ordinal is None or section_ordinal is None:
            continue
        citations.append(
            PaperCitationMentionRecord(
                corpus_id=corpus_id,
                source_system=ParseSourceSystem.S2ORC_V2,
                source_revision=source_revision,
                source_document_key=str(corpus_id),
                source_plane=SourcePlane.BODY,
                parser_version=parser_version,
                raw_attrs_json=attrs,
                source_start_offset=item["start"],
                source_end_offset=item["end"],
                text=_span_text(body_text, item["start"], item["end"]),
                source_citation_key=_coerce_optional_string(attrs.get("ref_id"))
                or f"cite:{item['start']}:{item['end']}",
                block_ordinal=block_ordinal,
                section_ordinal=section_ordinal,
                sentence_ordinal=sentence_ordinal,
                matched_paper_id=_coerce_optional_string(attrs.get("matched_paper_id")),
            )
        )

    return ParsedPaperSource(
        document=document,
        sections=sections,
        blocks=blocks,
        sentences=sentences,
        references=references,
        citations=citations,
    )


def parse_biocxml_document(
    xml_text: str,
    *,
    source_revision: str,
    parser_version: str,
    corpus_id: int | None = None,
    corpus_id_resolver: CorpusIdResolver | None = None,
) -> ParsedPaperSource:
    """Parse one BioCXML document into normalized parse-contract records."""

    document_elem, document_id = _parse_biocxml_document_elem(xml_text)
    if corpus_id is None and corpus_id_resolver is not None:
        corpus_id = corpus_id_resolver(document_id)
    if corpus_id is None:
        if not document_id.isdigit():
            raise ValueError("BioCXML document id must resolve to a canonical corpus_id")
        corpus_id = int(document_id)

    title_passage = document_elem.find("./passage")
    title_text = title_passage.findtext("text") if title_passage is not None else None

    document = PaperDocumentRecord(
        corpus_id=corpus_id,
        source_system=ParseSourceSystem.BIOCXML,
        source_revision=source_revision,
        source_document_key=document_id,
        source_plane=SourcePlane.FRONT_MATTER,
        parser_version=parser_version,
        raw_attrs_json={},
        title=title_text,
        source_availability="full_text",
    )

    sections: list[PaperSectionRecord] = []
    section_counter = 0
    current_section_ordinal = 0
    current_section_role = SectionRole.OTHER

    blocks: list[PaperBlockRecord] = []
    sentences: list[PaperSentenceRecord] = []
    references: list[PaperReferenceEntryRecord] = []
    entities: list[PaperEntityMentionRecord] = []

    for passage in document_elem.findall("passage"):
        infons = {
            child.attrib.get("key"): (child.text or "") for child in passage.findall("infon")
        }
        passage_type = infons.get("type")
        section_type = infons.get("section_type")
        passage_text = passage.findtext("text") or ""
        normalized_passage_text = passage_text.strip()
        offset = int((passage.findtext("offset") or "0").strip() or "0")
        end_offset = offset + len(passage_text)

        section_role = _normalize_section_role(
            header_text=passage_text if passage_type and passage_type.startswith("title") else None,
            section_type=section_type,
        )

        if passage_type and passage_type.startswith("title"):
            if not normalized_passage_text:
                continue
            section_counter += 1
            current_section_ordinal = section_counter
            current_section_role = section_role
            sections.append(
                PaperSectionRecord(
                    corpus_id=corpus_id,
                    source_system=ParseSourceSystem.BIOCXML,
                    source_revision=source_revision,
                    source_document_key=document_id,
                    source_plane=SourcePlane.PASSAGE,
                    parser_version=parser_version,
                    raw_attrs_json=infons,
                    source_start_offset=offset,
                    source_end_offset=end_offset,
                    text=passage_text,
                    section_ordinal=current_section_ordinal,
                    section_role=section_role,
                    display_label=passage_text,
                )
            )
            continue

        block_kind = _normalize_block_kind_from_bioc(passage_type)
        if section_role not in {SectionRole.OTHER, SectionRole.REFERENCE}:
            current_section_role = section_role
        role_for_block = (
            current_section_role
            if block_kind in {
                PaperBlockKind.FIGURE_CAPTION,
                PaperBlockKind.TABLE_CAPTION,
                PaperBlockKind.TABLE_FOOTNOTE,
                PaperBlockKind.TABLE_BODY_TEXT,
            }
            else section_role
        )

        if passage_type == "ref" or section_role == SectionRole.REFERENCE:
            if not normalized_passage_text:
                continue
            references.append(
                PaperReferenceEntryRecord(
                    corpus_id=corpus_id,
                    source_system=ParseSourceSystem.BIOCXML,
                    source_revision=source_revision,
                    source_document_key=document_id,
                    source_plane=SourcePlane.PASSAGE,
                    parser_version=parser_version,
                    raw_attrs_json=infons,
                    source_start_offset=offset,
                    source_end_offset=end_offset,
                    text=passage_text,
                    source_reference_key=infons.get("id") or f"ref:{offset}",
                    reference_ordinal=len(references),
                    matched_paper_id=None,
                )
            )
            continue

        if block_kind is None:
            continue
        if not normalized_passage_text:
            continue

        linked_asset_ref = infons.get("id") or infons.get("file")
        block = PaperBlockRecord(
            corpus_id=corpus_id,
            source_system=ParseSourceSystem.BIOCXML,
            source_revision=source_revision,
            source_document_key=document_id,
            source_plane=(
                SourcePlane.TABLE_XML
                if block_kind == PaperBlockKind.TABLE_BODY_TEXT
                else SourcePlane.PASSAGE
            ),
            parser_version=parser_version,
            raw_attrs_json=infons,
            source_start_offset=offset,
            source_end_offset=end_offset,
            text=passage_text,
            block_ordinal=len(blocks),
            section_ordinal=current_section_ordinal,
            block_kind=block_kind,
            section_role=role_for_block,
            is_retrieval_default=section_role != SectionRole.REFERENCE,
            linked_asset_ref=linked_asset_ref,
        )
        blocks.append(block)

        block_sentence_spans = _fallback_sentence_spans(passage_text, offset)
        for sentence_ordinal, (start, end) in enumerate(block_sentence_spans):
            sentences.append(
                PaperSentenceRecord(
                    corpus_id=corpus_id,
                    source_system=ParseSourceSystem.BIOCXML,
                    source_revision=source_revision,
                    source_document_key=document_id,
                    source_plane=block.source_plane,
                    parser_version=parser_version,
                    raw_attrs_json={},
                    source_start_offset=start,
                    source_end_offset=end,
                    text=passage_text[start - offset : end - offset],
                    sentence_ordinal=sentence_ordinal,
                    block_ordinal=block.block_ordinal,
                    section_ordinal=block.section_ordinal,
                    segmentation_source=SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
                )
            )

        for annotation in passage.findall("annotation"):
            annotation_infons = {
                child.attrib.get("key"): (child.text or "")
                for child in annotation.findall("infon")
            }
            source_identifier = _extract_bioc_annotation_identifier(
                annotation, annotation_infons
            )
            concept_namespace, concept_id = _normalize_concept_identifier(
                annotation_infons.get("type"), source_identifier
            )
            location = annotation.find("location")
            if location is None:
                continue
            start = int(location.attrib.get("offset", "0"))
            length = int(location.attrib.get("length", "0"))
            end = start + length
            _, _, sentence_ordinal = _find_containing_ordinals(
                start=start,
                end=end,
                blocks=[block],
                sentences=[s for s in sentences if s.block_ordinal == block.block_ordinal],
            )
            entities.append(
                PaperEntityMentionRecord(
                    corpus_id=corpus_id,
                    source_system=ParseSourceSystem.BIOCXML,
                    source_revision=source_revision,
                    source_document_key=document_id,
                    source_plane=block.source_plane,
                    parser_version=parser_version,
                    raw_attrs_json=annotation_infons,
                    source_start_offset=start,
                    source_end_offset=end,
                    text=annotation.findtext("text") or passage_text[start - offset : end - offset],
                    entity_type=annotation_infons.get("type", ""),
                    source_identifier=source_identifier,
                    concept_id=concept_id,
                    concept_namespace=concept_namespace,
                    block_ordinal=block.block_ordinal,
                    section_ordinal=block.section_ordinal,
                    sentence_ordinal=sentence_ordinal,
                )
            )

    return ParsedPaperSource(
        document=document,
        sections=sections,
        blocks=blocks,
        sentences=sentences,
        references=references,
        citations=[],
        entities=entities,
    )
