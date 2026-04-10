from __future__ import annotations

from app.rag.models import PaperEvidenceHit
from app.rag.search_plan import RetrievalSearchPlan
from app.rag.search_retrieval import apply_cited_context_hits
from app.rag.types import QueryRetrievalProfile


class _FakeRepository:
    def fetch_known_scoped_papers_by_corpus_ids(
        self,
        corpus_ids: list[int],
    ) -> list[PaperEvidenceHit]:
        return [
            PaperEvidenceHit(
                corpus_id=corpus_id,
                paper_id=f"paper-{corpus_id}",
                semantic_scholar_paper_id=f"paper-{corpus_id}",
                title=f"Paper {corpus_id}",
                journal_name=None,
                year=2024,
                doi=None,
                pmid=corpus_id,
                pmcid=None,
                abstract="Explicitly cited paper",
                tldr=None,
                text_availability="fulltext",
                is_open_access=True,
                citation_count=5,
                reference_count=10,
            )
            for corpus_id in corpus_ids
        ]


def test_apply_cited_context_hits_preserves_existing_and_missing_cited_papers():
    plan = RetrievalSearchPlan(
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        allow_exact_title_matches=True,
        use_paper_lexical=True,
        use_chunk_lexical=False,
        fallback_to_paper_lexical_on_empty_chunk=False,
        expand_citation_frontier=True,
        preserve_selected_candidate=False,
        prefer_precise_grounding=False,
        selected_context_bonus=0.0,
        cited_context_bonus=0.2,
    )
    paper_hits = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Already retrieved cited paper",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract="Existing hit.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=3,
            reference_count=7,
        )
    ]

    updated = apply_cited_context_hits(
        repository=_FakeRepository(),
        paper_hits=paper_hits,
        cited_corpus_ids=[11, 22],
        search_plan=plan,
    )

    by_corpus_id = {hit.corpus_id: hit for hit in updated}
    assert set(by_corpus_id) == {11, 22}
    assert by_corpus_id[11].cited_context_score == 0.2
    assert by_corpus_id[22].cited_context_score == 0.2
