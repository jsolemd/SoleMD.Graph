from __future__ import annotations

from typing import Any

from bioc import biocxml

from app.pmc_fulltext.models import (
    NormalizedPmcFullTextDocument,
    PmcFullTextParseFailed,
)
from app.pmc_fulltext.normalize import (
    SectionBuilder,
    build_passage,
    heading_depth,
    is_excluded_section,
    map_section_role,
    normalize_text,
    passage_role,
    should_materialize_nonretrievable_section,
    UNKNOWN_SECTION_ROLE,
)


PARSER_NAME = "bioc"
PARSER_VERSION = "bioc-2.1:solemd-pmc-bioc-v8"


def parse_pmc_bioc_fulltext(
    payload: bytes,
    *,
    corpus_id: int,
    pmcid: str,
) -> NormalizedPmcFullTextDocument:
    try:
        collection = biocxml.loads(payload.decode("utf-8"))
    except Exception as exc:
        raise PmcFullTextParseFailed("BioC XML was not parseable") from exc

    documents = tuple(getattr(collection, "documents", ()) or ())
    if not documents:
        raise PmcFullTextParseFailed("BioC XML did not contain a document")

    builder = SectionBuilder()
    passages = []
    excluded_depth: int | None = None

    for document in documents:
        for raw_passage in tuple(getattr(document, "passages", ()) or ()):
            infons = _passage_infons(raw_passage)
            source_type = normalize_text(str(infons.get("type") or "")).lower()
            section_type = normalize_text(str(infons.get("section_type") or ""))
            text = normalize_text(str(getattr(raw_passage, "text", "") or ""))
            if not text:
                continue

            current_section = builder.current_section()
            depth = heading_depth(
                source_type,
                current_depth=current_section.depth if current_section is not None else None,
                current_source_type=(
                    current_section.source_type if current_section is not None else None
                ),
            )
            if depth is not None:
                if is_excluded_section(section_type=section_type, label=text):
                    excluded_depth = depth
                    continue
                if excluded_depth is not None and depth <= excluded_depth:
                    excluded_depth = None
                builder.create_section(
                    title=text,
                    depth=depth,
                    role_mapping=map_section_role(section_type=section_type, label=text),
                    section_type=section_type or None,
                    source_type=source_type,
                )
                continue

            if excluded_depth is not None:
                continue
            if source_type == "front":
                continue
            if is_excluded_section(section_type=section_type, label=None):
                continue

            section = builder.current_section()
            if source_type == "abstract":
                section = builder.ensure_default_section(
                    title="Abstract",
                    role_mapping=map_section_role(section_type="ABSTRACT", label="Abstract"),
                    section_type=section_type or "ABSTRACT",
                    source_type=source_type,
                )
            elif section is None:
                section = builder.ensure_default_section(
                    title="Body",
                    role_mapping=UNKNOWN_SECTION_ROLE,
                    section_type=section_type or None,
                    source_type=source_type,
                )

            role = passage_role(
                passage_type=source_type,
                section_role=section.section_role,
            )
            passage = build_passage(
                pmcid=pmcid,
                parser_version=PARSER_VERSION,
                section=section,
                passage_ordinal=len(passages),
                role=role,
                source_type=source_type,
                text=text,
            )
            if (
                passage.is_retrievable
                or passage.passage_role == "table_body"
                or should_materialize_nonretrievable_section(section.section_role)
            ):
                passages.append(passage)

    if not builder.sections:
        raise PmcFullTextParseFailed("BioC XML produced no normalized sections")
    if not passages:
        raise PmcFullTextParseFailed("BioC XML produced no normalized passages")

    return NormalizedPmcFullTextDocument(
        corpus_id=corpus_id,
        pmcid=pmcid,
        parser_name=PARSER_NAME,
        parser_version=PARSER_VERSION,
        sections=tuple(builder.sections),
        passages=tuple(passages),
    )


def _passage_infons(passage: Any) -> dict[str, str]:
    infons = getattr(passage, "infons", {}) or {}
    if isinstance(infons, dict):
        return {str(key): str(value) for key, value in infons.items()}
    return {}
