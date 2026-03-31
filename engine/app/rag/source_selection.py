"""Source orchestration for parser adapters and non-DB grounding."""

from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Sequence

from app.rag.parse_contract import ParseSourceSystem
from app.rag_ingest.source_parsers import ParsedPaperSource


@dataclass(frozen=True, slots=True)
class ParsedSourceStructuralProfile:
    source_system: ParseSourceSystem
    corpus_id: int
    block_count: int
    retrieval_block_count: int
    sentence_count: int
    citation_count: int
    reference_count: int
    entity_count: int

    @property
    def has_blocks(self) -> bool:
        return self.block_count > 0

    @property
    def has_retrieval_blocks(self) -> bool:
        return self.retrieval_block_count > 0

    @property
    def has_citation_spine(self) -> bool:
        return self.citation_count > 0 or self.reference_count > 0

    @property
    def has_annotation_value(self) -> bool:
        return (
            self.block_count > 0
            or self.sentence_count > 0
            or self.reference_count > 0
            or self.entity_count > 0
        )


@dataclass(frozen=True, slots=True)
class GroundingSourcePlan:
    primary_source: ParsedPaperSource
    annotation_sources: tuple[ParsedPaperSource, ...]
    primary_reason: str


def profile_parsed_source(source: ParsedPaperSource) -> ParsedSourceStructuralProfile:
    return ParsedSourceStructuralProfile(
        source_system=source.document.source_system,
        corpus_id=source.document.corpus_id,
        block_count=len(source.blocks),
        retrieval_block_count=sum(1 for block in source.blocks if block.is_retrieval_default),
        sentence_count=len(source.sentences),
        citation_count=len(source.citations),
        reference_count=len(source.references),
        entity_count=len(source.entities),
    )


def parsed_source_has_warehouse_value(source: ParsedPaperSource) -> bool:
    return profile_parsed_source(source).has_annotation_value


def select_primary_text_source(
    sources: Sequence[ParsedPaperSource],
) -> tuple[ParsedPaperSource, str]:
    if not sources:
        raise ValueError("select_primary_text_source requires at least one parsed source")

    profiles = {id(source): profile_parsed_source(source) for source in sources}

    preferred_s2orc = next(
        (
            source
            for source in sources
            if profiles[id(source)].source_system == ParseSourceSystem.S2ORC_V2
        ),
        None,
    )
    if preferred_s2orc is not None and _is_viable_s2orc_primary(profiles[id(preferred_s2orc)]):
        return preferred_s2orc, "preferred_s2orc_viable"

    ranked_sources = sorted(
        sources,
        key=lambda source: _fallback_primary_rank(profiles[id(source)]),
        reverse=True,
    )
    primary_source = ranked_sources[0]
    return primary_source, "fallback_structural_best"


def build_grounding_source_plan(
    sources: Sequence[ParsedPaperSource],
) -> GroundingSourcePlan:
    primary_source, primary_reason = select_primary_text_source(sources)
    primary_corpus_id = primary_source.document.corpus_id
    profiles = {id(source): profile_parsed_source(source) for source in sources}
    annotation_sources = tuple(
        source
        for source in sources
        if source is not primary_source
        and source.document.corpus_id == primary_corpus_id
        and profiles[id(source)].has_annotation_value
    )
    return GroundingSourcePlan(
        primary_source=primary_source,
        annotation_sources=annotation_sources,
        primary_reason=primary_reason,
    )


def _is_viable_s2orc_primary(profile: ParsedSourceStructuralProfile) -> bool:
    if profile.source_system != ParseSourceSystem.S2ORC_V2:
        return False
    return profile.has_blocks and (
        profile.has_retrieval_blocks or profile.has_citation_spine or profile.sentence_count > 0
    )


def _fallback_primary_rank(
    profile: ParsedSourceStructuralProfile,
) -> tuple[int, int, int, int, int, int, int]:
    return (
        1 if profile.has_blocks else 0,
        1 if profile.has_retrieval_blocks else 0,
        1 if profile.has_citation_spine else 0,
        profile.block_count,
        profile.sentence_count,
        profile.reference_count + profile.citation_count,
        1 if profile.source_system == ParseSourceSystem.S2ORC_V2 else 0,
    )
