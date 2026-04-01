"""Centralized runtime search planning for query-shape aware retrieval."""

from __future__ import annotations

from dataclasses import dataclass

from app.rag.models import PaperRetrievalQuery
from app.rag.types import QueryRetrievalProfile


@dataclass(frozen=True, slots=True)
class RetrievalSearchPlan:
    """Execution plan derived from the normalized runtime query."""

    retrieval_profile: QueryRetrievalProfile
    use_paper_lexical: bool
    use_chunk_lexical: bool
    fallback_to_paper_lexical_on_empty_chunk: bool
    expand_citation_frontier: bool
    preserve_selected_candidate: bool
    prefer_precise_grounding: bool
    selected_context_bonus: float


def build_search_plan(query: PaperRetrievalQuery) -> RetrievalSearchPlan:
    """Build a centralized runtime retrieval plan from the normalized query."""

    has_selected_context = bool(
        query.selected_graph_paper_ref or query.selected_paper_id or query.selected_node_id
    )
    use_chunk_lexical = (
        query.use_lexical
        and query.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
    )

    if query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return RetrievalSearchPlan(
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
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
        use_paper_lexical=True,
        use_chunk_lexical=False,
        fallback_to_paper_lexical_on_empty_chunk=False,
        expand_citation_frontier=True,
        preserve_selected_candidate=False,
        prefer_precise_grounding=False,
        selected_context_bonus=0.0,
    )
