"""Canonical default chunk-version policy for derived serving rows."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag.parse_contract import (
    PaperBlockKind,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
)
from app.rag.source_parsers import ParsedPaperSource
from app.rag.source_selection import GroundingSourcePlan, build_grounding_source_plan

DEFAULT_CHUNK_VERSION_KEY = "default-structural-v1"
DEFAULT_TEXT_NORMALIZATION_VERSION = "canonical-text-v1"
DEFAULT_TOKENIZER_NAME = "simple"
DEFAULT_TOKENIZER_VERSION = "v1"
DEFAULT_TARGET_TOKEN_BUDGET = 256
DEFAULT_HARD_MAX_TOKENS = 384

DEFAULT_INCLUDED_SECTION_ROLES: tuple[SectionRole, ...] = (
    SectionRole.ABSTRACT,
    SectionRole.INTRODUCTION,
    SectionRole.METHODS,
    SectionRole.RESULTS,
    SectionRole.DISCUSSION,
    SectionRole.CONCLUSION,
    SectionRole.SUPPLEMENT,
    SectionRole.OTHER,
)

DEFAULT_INCLUDED_BLOCK_KINDS: tuple[PaperBlockKind, ...] = (
    PaperBlockKind.NARRATIVE_PARAGRAPH,
    PaperBlockKind.FIGURE_CAPTION,
    PaperBlockKind.TABLE_CAPTION,
    PaperBlockKind.TABLE_BODY_TEXT,
)


def build_default_chunk_version(
    *,
    source_revision_keys: Sequence[str],
    parser_version: str,
    embedding_model: str | None = None,
) -> PaperChunkVersionRecord:
    """Return the sanctioned first chunk-version policy.

    This is intentionally conservative:
    - canonical narrative blocks plus figure/table retrieval surfaces
    - standalone captions by default
    - no overlap until runtime evaluation justifies it
    """

    return PaperChunkVersionRecord(
        chunk_version_key=DEFAULT_CHUNK_VERSION_KEY,
        source_revision_keys=_sorted_unique_strings(source_revision_keys),
        parser_version=parser_version,
        text_normalization_version=DEFAULT_TEXT_NORMALIZATION_VERSION,
        sentence_source_policy=[
            SentenceSegmentationSource.S2ORC_ANNOTATION,
            SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ],
        included_section_roles=list(DEFAULT_INCLUDED_SECTION_ROLES),
        included_block_kinds=list(DEFAULT_INCLUDED_BLOCK_KINDS),
        caption_merge_policy=CaptionMergePolicy.STANDALONE,
        tokenizer_name=DEFAULT_TOKENIZER_NAME,
        tokenizer_version=DEFAULT_TOKENIZER_VERSION,
        target_token_budget=DEFAULT_TARGET_TOKEN_BUDGET,
        hard_max_tokens=DEFAULT_HARD_MAX_TOKENS,
        sentence_overlap_policy=SentenceOverlapPolicy.NONE,
        embedding_model=embedding_model,
        lexical_normalization_flags=[],
        retrieval_default_only=True,
    )


def build_default_chunk_version_for_plan(
    plan: GroundingSourcePlan,
    *,
    embedding_model: str | None = None,
) -> PaperChunkVersionRecord:
    all_sources = [plan.primary_source, *plan.annotation_sources]
    return build_default_chunk_version(
        source_revision_keys=_source_revision_keys(all_sources),
        parser_version=plan.primary_source.document.parser_version,
        embedding_model=embedding_model,
    )


def build_default_chunk_version_for_sources(
    sources: Sequence[ParsedPaperSource],
    *,
    embedding_model: str | None = None,
) -> PaperChunkVersionRecord:
    plan = build_grounding_source_plan(sources)
    return build_default_chunk_version(
        source_revision_keys=_source_revision_keys(sources),
        parser_version=plan.primary_source.document.parser_version,
        embedding_model=embedding_model,
    )


def _source_revision_keys(sources: Sequence[ParsedPaperSource]) -> list[str]:
    keys = [
        f"{source.document.source_system}:{source.document.source_revision}"
        for source in sources
    ]
    return _sorted_unique_strings(keys)


def _sorted_unique_strings(values: Sequence[str]) -> list[str]:
    return sorted({value for value in values if value})
