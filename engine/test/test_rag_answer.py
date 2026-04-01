from __future__ import annotations

from app.rag.answer import (
    build_baseline_answer_payload,
    select_answer_grounding_bundles,
)
from app.rag.models import EvidenceBundle, PaperEvidenceHit
from app.rag.types import QueryRetrievalProfile, RetrievalChannel


def _bundle(
    *,
    corpus_id: int,
    title: str,
    score: float,
    rank: int,
    snippet: str,
    lexical_score: float = 0.0,
    title_similarity: float = 0.0,
    chunk_lexical_score: float = 0.0,
    snippet_channel: RetrievalChannel | None = None,
) -> EvidenceBundle:
    return EvidenceBundle(
        paper=PaperEvidenceHit(
            corpus_id=corpus_id,
            paper_id=f"paper-{corpus_id}",
            semantic_scholar_paper_id=f"paper-{corpus_id}",
            title=title,
            journal_name="Example Journal",
            year=2024,
            doi=None,
            pmid=None,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=False,
            lexical_score=lexical_score,
            chunk_lexical_score=chunk_lexical_score,
            title_similarity=title_similarity,
            fused_score=score,
            rank=rank,
        ),
        score=score,
        rank=rank,
        snippet=snippet,
        snippet_channel=snippet_channel,
    )


def test_select_answer_grounding_bundles_keeps_top_ranked_order_by_default():
    bundles = [
        _bundle(
            corpus_id=101,
            title="Top ranked evidence paper",
            score=0.92,
            rank=1,
            snippet="Top snippet.",
        ),
        _bundle(
            corpus_id=202,
            title="Second ranked evidence paper",
            score=0.88,
            rank=2,
            snippet="Second snippet.",
        ),
        _bundle(
            corpus_id=303,
            title="Third ranked evidence paper",
            score=0.81,
            rank=3,
            snippet="Third snippet.",
        ),
    ]

    selected = select_answer_grounding_bundles(bundles, max_items=2)

    assert [bundle.paper.corpus_id for bundle in selected] == [101, 202]


def test_build_baseline_answer_payload_keeps_exact_title_anchor_bundle_in_answer():
    query_title = "Motor Performance Is not Enhanced by Daytime Naps in Older Adults"
    bundles = [
        _bundle(
            corpus_id=253024255,
            title="Benefits and risks of napping in older adults: A systematic review",
            score=0.72,
            rank=1,
            snippet="Review article about napping in older adults.",
            lexical_score=0.22,
            title_similarity=0.36,
        ),
        _bundle(
            corpus_id=249283719,
            title=(
                "Association Between Nap Duration and Cognitive Functions "
                "Among Saudi Older Adults"
            ),
            score=0.72,
            rank=2,
            snippet="Observational nap-duration cohort.",
            lexical_score=0.2,
            title_similarity=0.31,
        ),
        _bundle(
            corpus_id=5496257,
            title=query_title,
            score=0.651,
            rank=3,
            snippet="Older-adult motor performance was not enhanced after naps.",
            lexical_score=0.95,
            title_similarity=1.0,
        ),
    ]

    payload = build_baseline_answer_payload(
        bundles,
        max_items=2,
        query_text=query_title,
    )

    assert payload.text is not None
    assert payload.segment_corpus_ids == (None, 253024255, 5496257)
    assert payload.grounding_corpus_ids == (253024255, 5496257)
    assert query_title in payload.text


def test_select_answer_grounding_bundles_prefers_chunk_supported_bundle_for_passage_queries():
    bundles = [
        _bundle(
            corpus_id=101,
            title="Topical review paper",
            score=0.91,
            rank=1,
            snippet="Topical review snippet.",
        ),
        _bundle(
            corpus_id=202,
            title="Exact sentence match paper",
            score=0.82,
            rank=2,
            snippet="Directly matched passage.",
            chunk_lexical_score=0.97,
            snippet_channel=RetrievalChannel.CHUNK_LEXICAL,
        ),
        _bundle(
            corpus_id=303,
            title="Third paper",
            score=0.76,
            rank=3,
            snippet="Third snippet.",
        ),
    ]

    selected = select_answer_grounding_bundles(
        bundles,
        max_items=2,
        query_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert [bundle.paper.corpus_id for bundle in selected] == [202, 101]


def test_select_answer_grounding_bundles_keeps_selected_paper_in_title_lookup_answers():
    bundles = [
        _bundle(
            corpus_id=101,
            title="High-ranked related review",
            score=0.91,
            rank=1,
            snippet="Related review snippet.",
        ),
        _bundle(
            corpus_id=202,
            title="Selected paper title",
            score=0.72,
            rank=3,
            snippet="Selected paper snippet.",
        ),
        _bundle(
            corpus_id=303,
            title="Third paper",
            score=0.7,
            rank=2,
            snippet="Third snippet.",
        ),
    ]

    selected = select_answer_grounding_bundles(
        bundles,
        max_items=2,
        query_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        selected_corpus_id=202,
    )

    assert [bundle.paper.corpus_id for bundle in selected] == [202, 101]
