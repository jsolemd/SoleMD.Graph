"""Langfuse v4 tracing helpers for the RAG ingest pipeline.

Provides traced wrappers for ``parse_biocxml_document()`` and
``parse_s2orc_row()`` that emit per-paper quality spans and scores.
All tracing is zero-overhead when Langfuse keys are absent.
"""

from __future__ import annotations

import logging
from collections import Counter

from app.rag.parse_contract import SectionRole
from app.rag_ingest.source_parsers import (
    ParsedPaperSource,
    parse_biocxml_document,
    parse_s2orc_row,
)

logger = logging.getLogger(__name__)


def _get_langfuse_client():
    try:
        from langfuse import get_client

        return get_client()
    except Exception:
        return None


def _emit_parse_quality(
    client,
    *,
    corpus_id: int,
    parsed: ParsedPaperSource,
    source_system: str,
) -> None:
    """Create a Langfuse span with parse quality metrics and scores."""
    section_roles = [s.section_role for s in parsed.sections]
    role_counts = dict(Counter(section_roles))

    trace_id = client.get_current_trace_id()
    if trace_id is None:
        return

    with client.start_as_current_observation(
        name=f"paper:{corpus_id}",
        as_type="span",
        input={"corpus_id": corpus_id, "source_system": source_system},
        output={
            "title": parsed.document.title,
            "source_availability": parsed.document.source_availability,
            "section_count": len(parsed.sections),
            "block_count": len(parsed.blocks),
            "sentence_count": len(parsed.sentences),
            "entity_count": len(parsed.entities),
            "reference_count": len(parsed.references),
            "section_roles": role_counts,
        },
    ):
        paper_trace_id = client.get_current_trace_id()
        if paper_trace_id is None:
            return

        scores = {
            "section_count": float(len(parsed.sections)),
            "block_count": float(len(parsed.blocks)),
            "sentence_count": float(len(parsed.sentences)),
            "entity_count": float(len(parsed.entities)),
            "has_abstract_section": (
                1.0 if any(r == SectionRole.ABSTRACT for r in section_roles) else 0.0
            ),
            "has_title_section": (
                1.0
                if any(r == SectionRole.FRONT_MATTER for r in section_roles)
                else 0.0
            ),
        }
        for name, value in scores.items():
            client.create_score(trace_id=paper_trace_id, name=name, value=value)

        tags = {
            "source_availability": parsed.document.source_availability or "unknown",
            "source_system": source_system,
        }
        for name, value in tags.items():
            client.create_score(
                trace_id=paper_trace_id,
                name=name,
                value=value,
                data_type="CATEGORICAL",
            )


def traced_parse_biocxml(
    xml_text: str,
    *,
    source_revision: str,
    parser_version: str,
    corpus_id: int | None = None,
    **kwargs,
) -> ParsedPaperSource:
    """Parse BioCXML and emit a Langfuse quality span if tracing is active."""
    parsed = parse_biocxml_document(
        xml_text,
        source_revision=source_revision,
        parser_version=parser_version,
        corpus_id=corpus_id,
        **kwargs,
    )
    try:
        client = _get_langfuse_client()
        if client is not None:
            _emit_parse_quality(
                client,
                corpus_id=parsed.document.corpus_id,
                parsed=parsed,
                source_system="biocxml",
            )
    except Exception:
        logger.debug("Langfuse parse tracing failed", exc_info=True)
    return parsed


def traced_parse_s2orc(
    row,
    *,
    source_revision: str,
    parser_version: str,
) -> ParsedPaperSource:
    """Parse S2ORC row and emit a Langfuse quality span if tracing is active."""
    parsed = parse_s2orc_row(
        row,
        source_revision=source_revision,
        parser_version=parser_version,
    )
    try:
        client = _get_langfuse_client()
        if client is not None:
            _emit_parse_quality(
                client,
                corpus_id=parsed.document.corpus_id,
                parsed=parsed,
                source_system="s2orc_v2",
            )
    except Exception:
        logger.debug("Langfuse parse tracing failed", exc_info=True)
    return parsed
