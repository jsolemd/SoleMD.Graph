"""Optional bounded biomedical reranking for runtime paper candidates."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from app.config import settings
from app.rag.biomedical_models import get_medcpt_reranker
from app.rag.biomedical_text import article_text
from app.rag.models import PaperEvidenceHit


class RagBiomedicalReranker(Protocol):
    """Minimal runtime surface for a bounded paper reranker."""

    def initialize(self) -> bool: ...

    def runtime_status(self) -> dict[str, object]: ...

    def score_pairs(
        self,
        pairs: list[list[str]],
        *,
        batch_size: int | None = None,
    ) -> list[float]: ...


class NoopBiomedicalReranker:
    """Fallback reranker used when live biomedical reranking is disabled."""

    def initialize(self) -> bool:
        return True

    def score_pairs(
        self,
        pairs: list[list[str]],
        *,
        batch_size: int | None = None,
    ) -> list[float]:
        return [0.0 for _ in pairs]

    def runtime_status(self) -> dict[str, object]:
        return {
            "enabled": False,
            "ready": True,
            "backend": "noop",
            "device": None,
            "error": None,
        }


@dataclass(frozen=True, slots=True)
class BiomedicalRerankOutcome:
    applied: bool
    candidate_count: int
    promoted_count: int
    reranked_window_corpus_ids: list[int]


def _normalized_rank_score(rank_index: int, window_size: int) -> float:
    if window_size <= 1:
        return 1.0
    return round(1.0 - (rank_index / (window_size - 1)), 6)


def apply_biomedical_rerank(
    paper_hits: list[PaperEvidenceHit],
    *,
    query_text: str,
    reranker: RagBiomedicalReranker,
    topn: int,
) -> BiomedicalRerankOutcome:
    """Assign reranker-derived article relevance over a bounded top-N window."""

    for hit in paper_hits:
        hit.biomedical_rerank_score = 0.0

    if topn <= 1:
        return BiomedicalRerankOutcome(
            applied=False,
            candidate_count=min(len(paper_hits), max(topn, 0)),
            promoted_count=0,
            reranked_window_corpus_ids=[],
        )

    def _candidate_text(hit: PaperEvidenceHit) -> str:
        return article_text(
            title=hit.title,
            abstract=hit.chunk_snippet or hit.abstract or hit.tldr,
        )

    candidate_hits = [
        hit
        for hit in paper_hits[:topn]
        if _candidate_text(hit)
    ]
    if len(candidate_hits) <= 1 or not query_text.strip():
        return BiomedicalRerankOutcome(
            applied=False,
            candidate_count=len(candidate_hits),
            promoted_count=0,
            reranked_window_corpus_ids=[hit.corpus_id for hit in candidate_hits],
        )

    initialize = getattr(reranker, "initialize", None)
    if callable(initialize) and not initialize():
        return BiomedicalRerankOutcome(
            applied=False,
            candidate_count=len(candidate_hits),
            promoted_count=0,
            reranked_window_corpus_ids=[hit.corpus_id for hit in candidate_hits],
        )

    scores = reranker.score_pairs(
        [
            [query_text, _candidate_text(hit)]
            for hit in candidate_hits
        ]
    )
    if len(scores) != len(candidate_hits):
        return BiomedicalRerankOutcome(
            applied=False,
            candidate_count=len(candidate_hits),
            promoted_count=0,
            reranked_window_corpus_ids=[hit.corpus_id for hit in candidate_hits],
        )

    original_positions = {
        hit.corpus_id: index for index, hit in enumerate(candidate_hits)
    }
    reranked = sorted(
        zip(candidate_hits, scores, strict=True),
        key=lambda item: (item[1], item[0].fused_score, item[0].corpus_id),
        reverse=True,
    )
    promoted_count = 0
    reranked_ids: list[int] = []
    for new_index, (hit, _score) in enumerate(reranked):
        hit.biomedical_rerank_score = _normalized_rank_score(new_index, len(reranked))
        reranked_ids.append(hit.corpus_id)
        if new_index < original_positions[hit.corpus_id]:
            promoted_count += 1

    return BiomedicalRerankOutcome(
        applied=True,
        candidate_count=len(candidate_hits),
        promoted_count=promoted_count,
        reranked_window_corpus_ids=reranked_ids,
    )


@lru_cache(maxsize=1)
def get_runtime_biomedical_reranker() -> RagBiomedicalReranker:
    """Return the configured live biomedical reranker."""

    if not settings.rag_live_biomedical_reranker_enabled:
        return NoopBiomedicalReranker()
    return get_medcpt_reranker()
