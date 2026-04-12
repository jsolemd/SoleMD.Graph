"""Centralized runtime search planning for query-shape aware retrieval."""

from __future__ import annotations

from dataclasses import dataclass

from app.rag.models import PaperRetrievalQuery
from app.rag.types import QueryRetrievalProfile


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
    cited_context_bonus: float


def build_search_plan(query: PaperRetrievalQuery) -> RetrievalSearchPlan:
    """Build a centralized runtime retrieval plan from the normalized query."""

    has_selected_context = bool(
        query.selected_graph_paper_ref or query.selected_node_id
    )
    has_cited_context = bool(query.cited_corpus_ids)
    has_metadata_filters = query.metadata_hints.has_searchable_metadata_filters
    use_chunk_lexical = query.use_lexical and query.retrieval_profile in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    )

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
            cited_context_bonus=0.0,
        )

    if query.retrieval_profile == QueryRetrievalProfile.QUESTION_LOOKUP:
        return RetrievalSearchPlan(
            retrieval_profile=QueryRetrievalProfile.QUESTION_LOOKUP,
            allow_exact_title_matches=query.use_lexical,
            use_paper_lexical=True,
            use_chunk_lexical=True,
            fallback_to_paper_lexical_on_empty_chunk=True,
            expand_citation_frontier=not has_selected_context,
            preserve_selected_candidate=has_selected_context,
            prefer_precise_grounding=True,
            selected_context_bonus=0.55 if has_selected_context else 0.0,
            cited_context_bonus=0.28 if has_cited_context else 0.0,
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
            cited_context_bonus=0.28 if has_cited_context else 0.0,
        )

    return RetrievalSearchPlan(
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        allow_exact_title_matches=True,
        use_paper_lexical=True,
        use_chunk_lexical=False,
        fallback_to_paper_lexical_on_empty_chunk=False,
        expand_citation_frontier=not has_metadata_filters,
        preserve_selected_candidate=False,
        prefer_precise_grounding=has_metadata_filters,
        selected_context_bonus=0.0,
        cited_context_bonus=0.2 if has_cited_context else 0.0,
    )
