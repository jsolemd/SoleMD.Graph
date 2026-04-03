"""Centralized runtime search planning for query-shape aware retrieval."""

from __future__ import annotations

from dataclasses import dataclass

from app.rag.models import PaperRetrievalQuery
from app.rag.types import QueryAnswerability, QueryRetrievalProfile, QueryRiskTier


@dataclass(frozen=True, slots=True)
class RetrievalSearchPlan:
    """Execution plan derived from the normalized runtime query."""

    retrieval_profile: QueryRetrievalProfile
    allow_exact_title_matches: bool
    use_paper_lexical: bool
    use_chunk_lexical: bool
    fallback_to_paper_lexical_on_empty_chunk: bool
    expand_citation_frontier: bool
    preserve_selected_candidate: bool
    prefer_precise_grounding: bool
    selected_context_bonus: float
    # New safety/deflection fields
    is_deflected: bool = False


def build_search_plan(query: PaperRetrievalQuery) -> RetrievalSearchPlan:
    """Build a centralized runtime retrieval plan from the normalized query."""

    has_selected_context = bool(
        query.selected_graph_paper_ref or query.selected_paper_id or query.selected_node_id
    )
    use_chunk_lexical = (
        query.use_lexical
        and query.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
    )

    # 1. Deflection Check
    if query.analysis and query.analysis.answerability == QueryAnswerability.HELPFUL_DEFERRAL:
        return RetrievalSearchPlan(
            retrieval_profile=query.retrieval_profile,
            allow_exact_title_matches=False,
            use_paper_lexical=False,
            use_chunk_lexical=False,
            fallback_to_paper_lexical_on_empty_chunk=False,
            expand_citation_frontier=False,
            preserve_selected_candidate=False,
            prefer_precise_grounding=False,
            selected_context_bonus=0.0,
            is_deflected=True,
        )

    # 2. Base routing
    if query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return RetrievalSearchPlan(
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
            allow_exact_title_matches=True,
            use_paper_lexical=True,
            use_chunk_lexical=False,
            fallback_to_paper_lexical_on_empty_chunk=False,
            expand_citation_frontier=not has_selected_context,
            preserve_selected_candidate=has_selected_context,
            prefer_precise_grounding=has_selected_context,
            selected_context_bonus=1.0 if has_selected_context else 0.0,
        )

    if query.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP or use_chunk_lexical:
        return RetrievalSearchPlan(
            retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
            allow_exact_title_matches=query.use_lexical,
            use_paper_lexical=False,
            use_chunk_lexical=True,
            fallback_to_paper_lexical_on_empty_chunk=True,
            expand_citation_frontier=False,
            preserve_selected_candidate=has_selected_context,
            prefer_precise_grounding=True,
            selected_context_bonus=0.55 if has_selected_context else 0.0,
        )

    return RetrievalSearchPlan(
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        allow_exact_title_matches=True,
        use_paper_lexical=True,
        use_chunk_lexical=False,
        fallback_to_paper_lexical_on_empty_chunk=False,
        expand_citation_frontier=True,
        preserve_selected_candidate=False,
        prefer_precise_grounding=False,
        selected_context_bonus=0.0,
    )
