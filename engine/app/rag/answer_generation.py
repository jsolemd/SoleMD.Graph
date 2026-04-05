"""LLM-generated cited answer module for the evidence baseline.

Produces answers with [N] citation markers aligned to evidence bundles.
The generated text feeds into the existing warehouse_grounder identically
to extractive answers.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass


from app.langfuse_config import get_langfuse as _get_langfuse, get_prompt as _get_langfuse_prompt, SPAN_RAG_ANSWER, observe
from app.rag.models import EvidenceBundle

logger = logging.getLogger(__name__)

CITATION_MARKER_PATTERN = re.compile(r"\[(\d+)\]")


@dataclass(frozen=True, slots=True)
class InlineCitationMarker:
    """Parsed [N] marker from a generated answer."""

    marker: str
    source_index: int
    corpus_id: int | None


@dataclass(frozen=True, slots=True)
class GeneratedAnswer:
    text: str
    model: str
    citation_markers: tuple[InlineCitationMarker, ...] = ()
    segment_texts: tuple[str, ...] = ()
    segment_corpus_ids: tuple[int | None, ...] = ()
    grounding_corpus_ids: tuple[int, ...] = ()


_EVIDENCE_PROMPT_FALLBACK = (
    "You are a biomedical evidence assistant. Answer the question using "
    "ONLY the provided sources. Cite sources using [N] markers.\n\n"
    "QUESTION: {query}\n\n"
    "SOURCES:\n{sources_text}\n\n"
    "ANSWER:"
)


def _build_evidence_prompt(
    bundles: list[EvidenceBundle],
    query: str,
) -> str:
    """Build a numbered-source evidence prompt for the LLM."""

    source_blocks: list[str] = []
    for index, bundle in enumerate(bundles, start=1):
        title = bundle.paper.title or "Untitled"
        year = bundle.paper.year or ""
        snippet = bundle.snippet or bundle.paper.abstract or ""
        snippet_excerpt = snippet[:600].strip()
        source_blocks.append(
            f"[{index}] {title} ({year})\n{snippet_excerpt}"
        )

    sources_text = "\n\n".join(source_blocks)
    template = _get_langfuse_prompt("rag-evidence-answer", fallback=_EVIDENCE_PROMPT_FALLBACK)
    return template.format(
        query=query,
        sources_text=sources_text,
    )


def parse_citation_markers(
    text: str,
    bundles: list[EvidenceBundle],
) -> list[InlineCitationMarker]:
    """Extract [N] markers from generated text and resolve to corpus_ids."""

    markers: list[InlineCitationMarker] = []
    seen: set[int] = set()
    for match in CITATION_MARKER_PATTERN.finditer(text):
        index = int(match.group(1))
        if index in seen:
            continue
        seen.add(index)
        corpus_id = (
            bundles[index - 1].paper.corpus_id
            if 1 <= index <= len(bundles)
            else None
        )
        markers.append(InlineCitationMarker(
            marker=match.group(0),
            source_index=index,
            corpus_id=corpus_id,
        ))
    return markers


def _split_answer_segments(
    text: str,
    bundles: list[EvidenceBundle],
) -> tuple[tuple[str, ...], tuple[int | None, ...]]:
    """Split generated answer into segments with per-segment corpus_id attribution."""

    segments: list[str] = []
    corpus_ids: list[int | None] = []

    parts = CITATION_MARKER_PATTERN.split(text)
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        if i % 2 == 0:
            segments.append(part)
            corpus_ids.append(None)
        else:
            index = int(part)
            if 1 <= index <= len(bundles):
                cid = bundles[index - 1].paper.corpus_id
                if segments:
                    corpus_ids[-1] = cid
    return tuple(segments), tuple(corpus_ids)


@observe(name=SPAN_RAG_ANSWER)
def generate_cited_answer(
    bundles: list[EvidenceBundle],
    query: str,
    *,
    model_fn,
    model_name: str = "generative-cited-v1",
) -> GeneratedAnswer | None:
    """Generate a cited answer from evidence bundles using the provided LLM function.

    Args:
        bundles: Evidence bundles to use as sources.
        query: User query.
        model_fn: Callable(prompt: str) -> str that runs the LLM.
        model_name: Model identifier for provenance tracking.

    Returns:
        GeneratedAnswer or None if generation fails.
    """

    if not bundles:
        return None

    prompt = _build_evidence_prompt(bundles, query)

    try:
        raw_text = model_fn(prompt)
    except Exception:
        logger.exception("LLM answer generation failed")
        return None

    if not raw_text or not raw_text.strip():
        return None

    text = raw_text.strip()
    markers = parse_citation_markers(text, bundles)
    segments, segment_corpus_ids = _split_answer_segments(text, bundles)
    grounding_corpus_ids = tuple(
        m.corpus_id for m in markers if m.corpus_id is not None
    )

    try:
        client = _get_langfuse()
        client.update_current_span(
            input={
                "query": query,
                "source_count": len(bundles),
                "prompt_length": len(prompt),
            },
            output={
                "answer_length": len(text),
                "citation_marker_count": len(markers),
                "grounding_corpus_ids": list(grounding_corpus_ids),
            },
            metadata={
                "model_name": model_name,
                "prompt_template": "rag-evidence-answer",
            },
        )
    except Exception:
        pass

    return GeneratedAnswer(
        text=text,
        model=model_name,
        citation_markers=tuple(markers),
        segment_texts=segments,
        segment_corpus_ids=segment_corpus_ids,
        grounding_corpus_ids=grounding_corpus_ids,
    )
