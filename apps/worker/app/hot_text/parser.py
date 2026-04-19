from __future__ import annotations

import hashlib
import re
from typing import Any

from lxml import etree

from app.document_schema import (
    BLOCK_KIND_FIGURE_CAPTION,
    BLOCK_KIND_OTHER,
    BLOCK_KIND_PARAGRAPH,
    BLOCK_KIND_TABLE_BODY_TEXT,
    BLOCK_KIND_TABLE_CAPTION,
    DOCUMENT_SOURCE_KIND_PMC_BIOC,
    SECTION_ROLE_ABSTRACT,
    SECTION_ROLE_CONCLUSION,
    SECTION_ROLE_DISCUSSION,
    SECTION_ROLE_INTRODUCTION,
    SECTION_ROLE_METHODS,
    SECTION_ROLE_OTHER,
    SECTION_ROLE_RESULTS,
    SECTION_ROLE_SUPPLEMENT,
    SEGMENTATION_SOURCE_DETERMINISTIC_FALLBACK,
    SOURCE_PRIORITY_PMC_BIOC,
)
from app.document_spine import fallback_sentence_spans
from app.hot_text.errors import InvalidPmcBiocPayload


def parse_pmc_bioc_document(
    payload: bytes,
    *,
    corpus_id: int,
) -> dict[str, Any]:
    try:
        root = etree.fromstring(payload)
    except etree.XMLSyntaxError as exc:
        raise InvalidPmcBiocPayload("PMC BioC XML was not parseable") from exc

    if root.tag == "document":
        document = root
    else:
        document = root.find("document")
    if document is None:
        raise InvalidPmcBiocPayload("PMC BioC XML missing document node")

    sections: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    sentences: list[dict[str, Any]] = []
    current_section_ordinal = _create_section(
        sections,
        display_label="Front matter",
        section_role=SECTION_ROLE_OTHER,
    )

    for passage in document.findall("passage"):
        infons = {
            (infon.get("key") or ""): (infon.text or "")
            for infon in passage.findall("infon")
        }
        passage_type = (infons.get("type") or "").strip().lower()
        section_type = (infons.get("section_type") or "").strip()
        raw_text = passage.findtext("text") or ""
        if not raw_text.strip():
            continue

        offset_text = passage.findtext("offset") or "0"
        try:
            passage_offset = int(offset_text)
        except ValueError as exc:
            raise InvalidPmcBiocPayload(
                f"PMC BioC passage offset {offset_text!r} is not an integer"
            ) from exc

        trimmed = _trimmed_passage(raw_text, passage_offset)
        if trimmed is None:
            continue
        start_offset, end_offset, text = trimmed

        if _is_heading_passage(passage_type):
            if _should_skip_heading(text):
                continue
            current_section = sections[current_section_ordinal]
            if _normalize_label(current_section["display_label"]) == _normalize_label(text):
                continue
            current_section_ordinal = _create_section(
                sections,
                display_label=_normalize_label(text),
                section_role=_section_role(section_type, text),
            )
            continue

        if passage_type == "front":
            continue

        section_role = _section_role(section_type, None)
        if passage_type == "abstract" and sections[current_section_ordinal]["section_role"] != SECTION_ROLE_ABSTRACT:
            current_section_ordinal = _create_section(
                sections,
                display_label="Abstract",
                section_role=SECTION_ROLE_ABSTRACT,
            )
        elif section_role != SECTION_ROLE_OTHER and sections[current_section_ordinal]["section_role"] != section_role:
            current_section_ordinal = _create_section(
                sections,
                display_label=_default_section_label(section_type),
                section_role=section_role,
            )

        block_kind, is_retrieval_default = _block_shape(passage_type)
        if is_retrieval_default and _is_non_retrieval_section(
            passage_type=passage_type,
            section_type=section_type,
            label=sections[current_section_ordinal]["display_label"],
        ):
            is_retrieval_default = False
        block_ordinal = len(blocks)
        blocks.append(
            {
                "block_ordinal": block_ordinal,
                "section_ordinal": current_section_ordinal,
                "start_offset": start_offset,
                "end_offset": end_offset,
                "block_kind": block_kind,
                "section_role": sections[current_section_ordinal]["section_role"],
                "is_retrieval_default": is_retrieval_default,
                "linked_asset_ref": infons.get("id") or infons.get("file"),
                "text": text,
            }
        )

        for sentence_ordinal, span in enumerate(fallback_sentence_spans(text, start_offset)):
            relative_start = span["start"] - start_offset
            relative_end = span["end"] - start_offset
            sentence_text = text[relative_start:relative_end].strip()
            if not sentence_text:
                continue
            sentences.append(
                {
                    "block_ordinal": block_ordinal,
                    "sentence_ordinal": sentence_ordinal,
                    "section_ordinal": current_section_ordinal,
                    "start_offset": span["start"],
                    "end_offset": span["end"],
                    "segmentation_source": SEGMENTATION_SOURCE_DETERMINISTIC_FALLBACK,
                    "text": sentence_text,
                }
            )

    if not blocks:
        raise InvalidPmcBiocPayload("PMC BioC XML produced no block rows")

    document_text = "\n".join(block["text"] for block in blocks)
    return {
        "corpus_id": corpus_id,
        "document_source_kind": DOCUMENT_SOURCE_KIND_PMC_BIOC,
        "source_priority": SOURCE_PRIORITY_PMC_BIOC,
        "text_hash": hashlib.sha1(document_text.encode("utf-8")).digest()[:16],
        "sections": sections,
        "blocks": blocks,
        "sentences": sentences,
    }


def _create_section(
    sections: list[dict[str, Any]],
    *,
    display_label: str,
    section_role: int,
) -> int:
    section_ordinal = len(sections)
    sections.append(
        {
            "section_ordinal": section_ordinal,
            "parent_section_ordinal": None,
            "section_role": section_role,
            "numbering_token": None,
            "display_label": display_label[:255],
        }
    )
    return section_ordinal


def _trimmed_passage(raw_text: str, offset: int) -> tuple[int, int, str] | None:
    leading = len(raw_text) - len(raw_text.lstrip())
    trailing = len(raw_text) - len(raw_text.rstrip())
    text = raw_text.strip()
    if not text:
        return None
    start_offset = offset + leading
    end_offset = offset + len(raw_text) - trailing
    return start_offset, end_offset, text


def _normalize_label(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _is_heading_passage(passage_type: str) -> bool:
    return (
        passage_type.startswith("title_")
        or passage_type.startswith("abstract_title")
        or passage_type.endswith("_title")
    )


def _should_skip_heading(text: str) -> bool:
    label = _normalize_label(text)
    if not label:
        return True
    lowered = label.lower()
    if lowered.endswith(("-", "(")):
        return True
    tokens = lowered.split()
    if len(tokens) >= 2 and tokens[-1] in {
        "and",
        "for",
        "from",
        "in",
        "of",
        "or",
        "the",
        "to",
        "with",
    }:
        return True
    return False


def _default_section_label(section_type: str) -> str:
    return _normalize_label(section_type.replace("_", " ").title()) or "Section"


def _section_role(section_type: str, label: str | None) -> int:
    normalized = f"{section_type} {label or ''}".lower()
    if "abstract" in normalized:
        return SECTION_ROLE_ABSTRACT
    if "intro" in normalized:
        return SECTION_ROLE_INTRODUCTION
    if "method" in normalized or "materials" in normalized:
        return SECTION_ROLE_METHODS
    if "result" in normalized:
        return SECTION_ROLE_RESULTS
    if "discuss" in normalized:
        return SECTION_ROLE_DISCUSSION
    if "conclu" in normalized or "summary" in normalized:
        return SECTION_ROLE_CONCLUSION
    if "supp" in normalized or "append" in normalized:
        return SECTION_ROLE_SUPPLEMENT
    return SECTION_ROLE_OTHER


def _is_non_retrieval_section(
    *,
    passage_type: str,
    section_type: str,
    label: str,
) -> bool:
    if section_type.strip().upper() == "REF":
        return True
    normalized = f"{passage_type} {section_type} {label}".lower().replace("_", " ")
    return any(
        token in normalized
        for token in (
            "reference",
            "references",
            "acknowledg",
            "author contribution",
            "author contributions",
            "conflict",
            "competing interest",
            "funding",
            "financial support",
            "disclosure",
            "keyword",
            "abbreviation",
        )
    )


def _block_shape(passage_type: str) -> tuple[int, bool]:
    if passage_type in {"paragraph", "abstract"}:
        return BLOCK_KIND_PARAGRAPH, True
    if passage_type == "fig_caption":
        return BLOCK_KIND_FIGURE_CAPTION, True
    if passage_type == "table_caption":
        return BLOCK_KIND_TABLE_CAPTION, True
    if passage_type in {"table", "table_footnote"}:
        return BLOCK_KIND_TABLE_BODY_TEXT, False
    return BLOCK_KIND_OTHER, False
