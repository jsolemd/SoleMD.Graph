from __future__ import annotations

from app.rag.biomedical_reranking import apply_biomedical_rerank
from app.rag.models import PaperEvidenceHit


class FakeBiomedicalReranker:
    def __init__(self, scores: list[float]) -> None:
        self._scores = scores
        self.pairs: list[list[str]] = []

    def initialize(self) -> bool:
        return True

    def score_pairs(
        self,
        pairs: list[list[str]],
        *,
        batch_size: int | None = None,
    ) -> list[float]:
        self.pairs = list(pairs)
        return list(self._scores)

    def runtime_status(self) -> dict[str, object]:
        return {
            "enabled": True,
            "ready": True,
            "backend": "fake-biomedical-reranker",
        }


def _paper(corpus_id: int, *, title: str, abstract: str, fused_score: float) -> PaperEvidenceHit:
    return PaperEvidenceHit(
        corpus_id=corpus_id,
        paper_id=f"paper-{corpus_id}",
        semantic_scholar_paper_id=f"paper-{corpus_id}",
        title=title,
        journal_name="JAMA",
        year=2024,
        doi=None,
        pmid=corpus_id,
        pmcid=None,
        abstract=abstract,
        tldr=None,
        text_availability="abstract",
        is_open_access=True,
        fused_score=fused_score,
        chunk_lexical_score=fused_score,
    )


def test_apply_biomedical_rerank_assigns_normalized_scores_and_promotions():
    hits = [
        _paper(
            11,
            title="Postoperative delirium prevention",
            abstract="Melatonin reduced delirium incidence after surgery.",
            fused_score=0.94,
        ),
        _paper(
            22,
            title="Melatonin for postoperative delirium",
            abstract="Randomized trial found a reduction in delirium.",
            fused_score=0.91,
        ),
        _paper(
            33,
            title="Sleep disruption after surgery",
            abstract="Observational delirium risk factors were reviewed.",
            fused_score=0.88,
        ),
    ]

    outcome = apply_biomedical_rerank(
        hits,
        query_text="Which intervention reduced postoperative delirium after surgery?",
        reranker=FakeBiomedicalReranker([0.2, 1.4, -0.3]),
        topn=3,
    )

    assert outcome.applied
    assert outcome.candidate_count == 3
    assert outcome.promoted_count == 1
    assert outcome.reranked_window_corpus_ids == [22, 11, 33]
    assert hits[1].biomedical_rerank_score == 1.0
    assert hits[0].biomedical_rerank_score == 0.5
    assert hits[2].biomedical_rerank_score == 0.0
