from __future__ import annotations

from dataclasses import replace

from app.rag.models import PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_enrichment import normalize_query_text
from app.rag.query_metadata import QueryMetadataHints
from app.rag.retrieval_policy import (
    biomedical_rerank_decision,
    chunk_search_queries,
    citation_context_candidate_ids,
    dense_query_decision,
    direct_passage_support_corpus_ids,
    entity_relation_candidate_ids,
    has_direct_retrieval_support,
    has_precise_title_resolution,
    has_selected_direct_anchor,
    has_stable_direct_passage_frontier,
    has_stable_direct_passage_leader,
    has_strong_lexical_title_anchor,
    has_weak_passage_anchor,
    passage_direct_support_tier,
    should_expand_citation_frontier,
    should_enable_general_title_similarity_support,
    should_correct_failed_title_frontier_to_general,
    should_correct_failed_title_frontier_to_general_after_concept_recovery,
    should_fetch_missing_citation_contexts,
    should_fetch_semantic_neighbors,
    should_prefetch_citation_contexts,
    should_run_biomedical_reranker,
    should_run_concept_chunk_rescue,
    should_run_dense_query,
    should_run_paper_lexical_fallback,
    should_run_seeded_channel_search,
    should_run_title_chunk_rescue,
    should_skip_runtime_entity_enrichment,
)
from app.rag.search_plan import build_search_plan
from app.rag.types import ClinicalQueryIntent, QueryRetrievalProfile, RetrievalScope


def _paper_hit(
    corpus_id: int,
    *,
    title: str = "Example title",
    lexical_score: float = 0.0,
    chunk_lexical_score: float = 0.0,
    passage_alignment_score: float = 0.0,
    selected_context_score: float = 0.0,
    cited_context_score: float = 0.0,
    entity_score: float = 0.0,
    relation_score: float = 0.0,
) -> PaperEvidenceHit:
    return PaperEvidenceHit(
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
        is_open_access=True,
        lexical_score=lexical_score,
        chunk_lexical_score=chunk_lexical_score,
        passage_alignment_score=passage_alignment_score,
        selected_context_score=selected_context_score,
        cited_context_score=cited_context_score,
        entity_score=entity_score,
        relation_score=relation_score,
    )


def _query(
    text: str,
    *,
    retrieval_profile: QueryRetrievalProfile,
    selected_node_id: str | None = None,
    clinical_intent: ClinicalQueryIntent = ClinicalQueryIntent.GENERAL,
    metadata_hints: QueryMetadataHints | None = None,
) -> PaperRetrievalQuery:
    return PaperRetrievalQuery(
        graph_release_id="current",
        query=text,
        normalized_query=normalize_query_text(text),
        selected_node_id=selected_node_id,
        retrieval_profile=retrieval_profile,
        clinical_intent=clinical_intent,
        scope_mode=RetrievalScope.GLOBAL,
        metadata_hints=metadata_hints or QueryMetadataHints(),
    )


def test_has_strong_lexical_title_anchor_normalizes_terminal_punctuation():
    lexical_hits = [
        _paper_hit(
            11,
            title="Selected paper title",
            lexical_score=1.0,
        )
    ]

    assert has_strong_lexical_title_anchor(
        query_text="Selected paper title.",
        lexical_hits=lexical_hits,
    )


def test_has_strong_lexical_title_anchor_accepts_long_title_prefix():
    lexical_hits = [
        _paper_hit(
            11857184,
            title=(
                "Designing clinical trials for assessing the effects of cognitive "
                "training and physical activity interventions on cognitive outcomes: "
                "The Seniors Health and Activity Research Program Pilot "
                "(SHARP-P) Study, a randomized controlled trial"
            ),
            lexical_score=1.7,
        )
    ]

    assert has_strong_lexical_title_anchor(
        query_text=(
            "Designing clinical trials for assessing the effects of cognitive "
            "training and physical activity interventions on cognitive outcomes: "
            "The Seniors Health and Activity Research Program Pilot "
            "(SHARP-P) Study, a randomized"
        ),
        lexical_hits=lexical_hits,
    )


def test_should_run_dense_query_runs_for_title_lookup_without_selected_anchor():
    """Dense lane stays available until a precise title anchor actually lands."""
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert should_run_dense_query(query=query)


def test_should_skip_runtime_entity_enrichment_for_metadata_queries():
    query = _query(
        "Neurology 2018 score that predicts 1-year functional status",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        metadata_hints=QueryMetadataHints(
            topic_query="score that predicts 1-year functional status",
            year_hint=2018,
            author_hint="Neurology",
            journal_hint="Neurology",
            matched_cues=("author", "journal", "year"),
        ),
    )

    assert should_skip_runtime_entity_enrichment(query=query)


def test_should_run_seeded_channel_search_skips_metadata_queries_once_lexical_hits_land():
    query = _query(
        "Neurology 2018 score that predicts 1-year functional status",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        metadata_hints=QueryMetadataHints(
            topic_query="score that predicts 1-year functional status",
            year_hint=2018,
            author_hint="Neurology",
            journal_hint="Neurology",
            matched_cues=("author", "journal", "year"),
        ),
    )

    assert not should_run_seeded_channel_search(
        query=query,
        lexical_hits=[_paper_hit(58630431, lexical_score=0.55)],
    )


def test_dense_query_decision_skips_metadata_queries_after_lexical_candidate_lands():
    query = _query(
        "Revista de Sa de 2020 covid-19 pandemic fear reflections mental health",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        metadata_hints=QueryMetadataHints(
            topic_query="covid-19 pandemic fear reflections mental health",
            year_hint=2020,
            journal_hint="Revista de Sa de",
            matched_cues=("journal", "year"),
        ),
    )

    assert dense_query_decision(
        query=query,
        lexical_hits=[_paper_hit(218674987, lexical_score=0.45)],
    ) == (False, "metadata_lexical_leader")


def test_dense_query_decision_skips_title_lookup_after_stable_chunk_rescue():
    query = _query(
        (
            "Transgenic mice overexpressing the 695-amino acid isoform of human "
            "Alzheimer beta-amyloid precursor protein"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert dense_query_decision(
        query=query,
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(32419070, chunk_lexical_score=0.48)],
    ) == (False, "stable_direct_passage_leader")


def test_should_run_dense_query_runs_for_strong_title_prefix_without_selected_anchor():
    query = _query(
        (
            "Designing clinical trials for assessing the effects of cognitive "
            "training and physical activity interventions on cognitive outcomes: "
            "The Seniors Health and Activity Research Program Pilot "
            "(SHARP-P) Study, a randomized"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert should_run_dense_query(query=query)


def test_has_precise_title_resolution_accepts_strong_lexical_anchor():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert has_precise_title_resolution(
        query_text=query.query,
        retrieval_profile=query.retrieval_profile,
        lexical_hits=[_paper_hit(11, title="Selected paper title")],
    )


def test_has_precise_title_resolution_rejects_duplicate_strong_title_anchors():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not has_precise_title_resolution(
        query_text=query.query,
        retrieval_profile=query.retrieval_profile,
        lexical_hits=[
            _paper_hit(11, title="Selected paper title"),
            _paper_hit(22, title="Selected paper title"),
        ],
    )


def test_should_run_seeded_channel_search_skips_precise_title_resolution():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_run_seeded_channel_search(
        query=query,
        lexical_hits=[_paper_hit(11, title="Selected paper title")],
    )


def test_should_run_seeded_channel_search_skips_stable_title_chunk_rescue_frontier():
    query = _query(
        (
            "Transgenic mice overexpressing the 695-amino acid isoform of human "
            "Alzheimer beta-amyloid precursor protein"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_run_seeded_channel_search(
        query=query,
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(32419070, chunk_lexical_score=0.48)],
    )


def test_should_fetch_missing_citation_contexts_skips_precise_title_hits_with_preview_text():
    hit = _paper_hit(11, title="Selected paper title")
    hit.abstract = "Abstract preview"

    assert not should_fetch_missing_citation_contexts(
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        precise_title_resolution=True,
        top_hits=[hit],
    )


def test_should_fetch_missing_citation_contexts_skips_single_direct_chunk_hit_even_for_title_lookup(
):
    hit = _paper_hit(32419070, chunk_lexical_score=0.48)
    hit.chunk_snippet = "Recovered chunk snippet"

    assert not should_fetch_missing_citation_contexts(
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        precise_title_resolution=False,
        top_hits=[hit],
    )


def test_should_fetch_missing_citation_contexts_keeps_precise_title_hits_without_preview_text():
    hit = _paper_hit(11, title="Selected paper title")
    hit.abstract = None
    hit.tldr = None
    hit.chunk_snippet = None

    assert should_fetch_missing_citation_contexts(
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        precise_title_resolution=True,
        top_hits=[hit],
    )


def test_should_fetch_missing_citation_contexts_keeps_ambiguous_title_hits():
    assert should_fetch_missing_citation_contexts(
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        precise_title_resolution=False,
        top_hits=[_paper_hit(11, title="Selected paper title")],
    )


def test_should_prefetch_citation_contexts_skips_single_strong_chunk_anchor():
    query = _query(
        "Representative claim sentence about sleep quality outcomes.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert not should_prefetch_citation_contexts(
        query=query,
        lexical_hits=[],
        chunk_lexical_hits=[
            _paper_hit(
                11,
                title="Representative title",
                chunk_lexical_score=0.02,
            )
        ],
    )


def test_should_prefetch_citation_contexts_skips_title_lookup_after_chunk_rescue():
    query = _query(
        (
            "Transgenic mice overexpressing the 695-amino acid isoform of human "
            "Alzheimer beta-amyloid precursor protein"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_prefetch_citation_contexts(
        query=query,
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(32419070, chunk_lexical_score=0.48)],
    )


def test_should_prefetch_citation_contexts_keeps_multi_candidate_passage_queries():
    query = _query(
        "Representative claim sentence about sleep quality outcomes.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert should_prefetch_citation_contexts(
        query=query,
        lexical_hits=[],
        chunk_lexical_hits=[
            _paper_hit(11, title="Title 11", chunk_lexical_score=0.02),
            _paper_hit(22, title="Title 22", chunk_lexical_score=0.018),
        ],
    )


def test_should_fetch_missing_citation_contexts_skips_single_strong_passage_anchor():
    assert not should_fetch_missing_citation_contexts(
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        precise_title_resolution=False,
        top_hits=[_paper_hit(11, chunk_lexical_score=0.02)],
    )


def test_should_run_seeded_channel_search_skips_duplicate_title_anchor_set():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_run_seeded_channel_search(
        query=query,
        lexical_hits=[
            _paper_hit(11, title="Selected paper title"),
            _paper_hit(22, title="Selected paper title"),
        ],
    )


def test_should_run_dense_query_skips_strong_title_anchor_even_without_selected_context():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_run_dense_query(
        query=query,
        lexical_hits=[_paper_hit(11, title="Selected paper title")],
    )


def test_should_run_dense_query_skips_selected_direct_anchor_when_precision_is_preferred():
    query = _query(
        "Selected paper title",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        selected_node_id="paper:11",
    )

    assert not should_run_dense_query(
        query=query,
        selected_direct_anchor=True,
    )


def test_direct_passage_support_corpus_ids_deduplicate_same_paper_support():
    assert direct_passage_support_corpus_ids(
        [
            _paper_hit(11, lexical_score=0.02),
            _paper_hit(11, chunk_lexical_score=0.03),
            _paper_hit(22, passage_alignment_score=0.8),
        ]
    ) == [11]


def test_dense_query_decision_skips_stable_direct_passage_frontier():
    query = _query(
        "Actigraphy monitoring was recorded at one-minute intervals.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    should_run, reason = dense_query_decision(
        query=query,
        lexical_hits=[_paper_hit(11, lexical_score=0.02)],
        chunk_lexical_hits=[_paper_hit(11, chunk_lexical_score=0.03)],
    )

    assert has_stable_direct_passage_frontier(
        [
            _paper_hit(11, lexical_score=0.02),
            _paper_hit(11, chunk_lexical_score=0.03),
        ]
    )
    assert not should_run
    assert reason == "stable_direct_passage_leader"


def test_should_run_title_chunk_rescue_only_after_failed_long_title_lookup():
    query = _query(
        (
            "Transgenic mice overexpressing the 695-amino acid isoform of human "
            "Alzheimer beta-amyloid precursor protein containing a Lys670 Asn variant"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )
    query.use_title_similarity = False
    query.use_title_candidate_lookup = True

    assert should_run_title_chunk_rescue(
        query=query,
        exact_title_hits=[],
        lexical_hits=[],
    )


def test_should_run_title_chunk_rescue_skips_once_title_lane_found_a_paper():
    query = _query(
        (
            "Effects of prenatal ethanol exposure on physical growths, sensory "
            "reflex maturation and brain development in the rat"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )
    query.use_title_similarity = False
    query.use_title_candidate_lookup = True

    assert not should_run_title_chunk_rescue(
        query=query,
        exact_title_hits=[],
        lexical_hits=[_paper_hit(11, title="Effects of prenatal ethanol exposure")],
    )


def test_should_run_title_chunk_rescue_after_failed_short_title_lookup():
    query = _query(
        "TNF-alpha neuroinflammation in MDD",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert should_run_title_chunk_rescue(
        query=query,
        exact_title_hits=[],
        lexical_hits=[],
    )


def test_should_correct_failed_title_frontier_to_general_after_chunk_recovery():
    query = _query(
        "blowing up in weight on olanzapine",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert should_correct_failed_title_frontier_to_general(
        query=query,
        exact_title_hits=[],
        lexical_hits=[],
        chunk_lexical_hits=[
            _paper_hit(
                22,
                title="Head-to-head comparisons of metabolic side effects of second generation antipsychotics",
                chunk_lexical_score=0.82,
            )
        ],
    )


def test_should_not_correct_failed_title_frontier_when_chunk_hit_is_still_a_title_anchor():
    query = _query(
        "The diagnosis of dementia due to Alzheimer's disease",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_correct_failed_title_frontier_to_general(
        query=query,
        exact_title_hits=[],
        lexical_hits=[],
        chunk_lexical_hits=[
            _paper_hit(
                3470330,
                title="The diagnosis of dementia due to Alzheimer's disease",
                chunk_lexical_score=0.41,
            )
        ],
    )


def test_dense_query_decision_keeps_ambiguous_direct_passage_frontier():
    query = _query(
        "Representative claim sentence about sleep quality outcomes.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    should_run, reason = dense_query_decision(
        query=query,
        chunk_lexical_hits=[
            _paper_hit(11, chunk_lexical_score=0.03),
            _paper_hit(22, chunk_lexical_score=0.025),
        ],
    )

    assert not has_stable_direct_passage_frontier(
        [
            _paper_hit(11, chunk_lexical_score=0.03),
            _paper_hit(22, chunk_lexical_score=0.025),
        ]
    )
    assert should_run
    assert reason == "candidate_recovery"


def test_chunk_search_queries_preserve_raw_statistical_passage_before_normalized_fallbacks():
    raw_query = (
        "Overall CP and TC rates for RAD and PAD were 56.2% and 58.5% "
        "(RD, −2.3%; 95% CI, −13.9 to 9.4)"
    )
    query = _query(
        raw_query,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    queries = chunk_search_queries(query)

    assert queries[0] == raw_query
    assert queries[1] == normalize_query_text(raw_query)


def test_should_skip_runtime_entity_enrichment_skips_generic_passage_without_entity_signal():
    query = _query(
        (
            "This study aims to compare the prevalence of mental health symptoms "
            "between left-behind and non-left-behind children."
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert should_skip_runtime_entity_enrichment(query=query)


def test_should_skip_runtime_entity_enrichment_keeps_entity_like_queries_enabled():
    query = _query(
        "Neuropeptide Y (NPY) signaling in the cerebellum of Myotis lucifugus",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert not should_skip_runtime_entity_enrichment(query=query)


def test_should_skip_runtime_entity_enrichment_keeps_short_expert_general_queries_enabled():
    query = _query(
        "prednisone neuropsychiatric symptoms",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
    )

    assert not should_skip_runtime_entity_enrichment(query=query)


def test_should_skip_runtime_entity_enrichment_keeps_short_title_like_clinical_queries_enabled():
    query = _query(
        "lorazepam challenge for catatonia",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_skip_runtime_entity_enrichment(query=query)


def test_should_fetch_semantic_neighbors_skips_selected_title_when_exact_anchor_exists():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        selected_node_id="paper:11",
    )
    search_plan = build_search_plan(query)
    lexical_hits = [_paper_hit(11, title="Selected paper title", lexical_score=1.0)]

    assert not should_fetch_semantic_neighbors(
        query=query,
        search_plan=search_plan,
        selected_corpus_id=11,
        lexical_hits=lexical_hits,
    )


def test_should_fetch_semantic_neighbors_skips_title_lookup_after_chunk_rescue():
    query = _query(
        (
            "Transgenic mice overexpressing the 695-amino acid isoform of human "
            "Alzheimer beta-amyloid precursor protein"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )
    search_plan = build_search_plan(query)

    assert not should_fetch_semantic_neighbors(
        query=query,
        search_plan=search_plan,
        selected_corpus_id=32419070,
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(32419070, chunk_lexical_score=0.48)],
    )


def test_should_fetch_semantic_neighbors_skips_selected_direct_anchor():
    query = _query(
        "Selected paper title",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        selected_node_id="paper:11",
    )
    search_plan = build_search_plan(query)

    assert not should_fetch_semantic_neighbors(
        query=query,
        search_plan=search_plan,
        selected_corpus_id=11,
        lexical_hits=[],
        selected_direct_anchor=True,
    )


def test_has_weak_passage_anchor_detects_low_score_sparse_chunk_hits():
    assert has_weak_passage_anchor(
        lexical_hits=[],
        chunk_lexical_hits=[
            _paper_hit(11, chunk_lexical_score=0.0008),
            _paper_hit(22, chunk_lexical_score=0.0013),
        ],
    )


def test_has_weak_passage_anchor_skips_lexical_or_stronger_chunk_support():
    assert not has_weak_passage_anchor(
        lexical_hits=[_paper_hit(11, lexical_score=0.2)],
        chunk_lexical_hits=[_paper_hit(22, chunk_lexical_score=0.0008)],
    )
    assert not has_weak_passage_anchor(
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(11, chunk_lexical_score=0.002)],
    )


def test_should_run_concept_chunk_rescue_opens_for_weak_passage_anchor():
    query = _query(
        "sodium crashed after starting an SSRI",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert should_run_concept_chunk_rescue(
        query=query,
        exact_title_hits=[],
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(11, chunk_lexical_score=0.0008)],
        has_concept_rescue_queries=True,
    )


def test_should_run_concept_chunk_rescue_skips_strong_passage_or_title_lanes():
    assert not should_run_concept_chunk_rescue(
        query=_query(
            "direct passage hit",
            retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        ),
        exact_title_hits=[],
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(11, chunk_lexical_score=0.02)],
        has_concept_rescue_queries=True,
    )
    assert should_run_concept_chunk_rescue(
        query=_query(
            "anti-NMDAR encephalitis psychosis first episode",
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        ),
        lexical_hits=[],
        chunk_lexical_hits=[],
        exact_title_hits=[],
        has_concept_rescue_queries=True,
    )
    assert not should_run_concept_chunk_rescue(
        query=_query(
            "Exact title surface",
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        ),
        lexical_hits=[],
        chunk_lexical_hits=[],
        exact_title_hits=[_paper_hit(11, lexical_score=1.0)],
        has_concept_rescue_queries=True,
    )


def test_should_correct_failed_title_frontier_to_general_after_concept_recovery():
    query = _query(
        "anti-NMDAR encephalitis psychosis first episode",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )
    concept_rescue_hits = [
        _paper_hit(
            77,
            title="First-episode psychosis in autoimmune encephalitis",
            lexical_score=0.18,
        )
    ]

    assert should_correct_failed_title_frontier_to_general_after_concept_recovery(
        query=query,
        exact_title_hits=[],
        lexical_hits=[],
        chunk_lexical_hits=[],
        concept_chunk_rescue_hits=[],
        entity_seed_hits=[_paper_hit(77, entity_score=0.8)],
        relation_seed_hits=[],
    )
    assert not should_correct_failed_title_frontier_to_general_after_concept_recovery(
        query=query,
        exact_title_hits=[],
        lexical_hits=concept_rescue_hits,
        chunk_lexical_hits=[],
        concept_chunk_rescue_hits=[],
        entity_seed_hits=[],
        relation_seed_hits=[],
    )
    assert should_correct_failed_title_frontier_to_general_after_concept_recovery(
        query=query,
        exact_title_hits=[],
        lexical_hits=concept_rescue_hits,
        chunk_lexical_hits=[],
        concept_chunk_rescue_hits=[],
        entity_seed_hits=[_paper_hit(77, entity_score=0.8)],
        relation_seed_hits=[],
    )
    assert should_correct_failed_title_frontier_to_general_after_concept_recovery(
        query=query,
        exact_title_hits=[],
        lexical_hits=[],
        chunk_lexical_hits=[
            _paper_hit(
                77,
                title="Relevant child evidence",
                chunk_lexical_score=0.004,
            )
        ],
        concept_chunk_rescue_hits=[
            _paper_hit(
                77,
                title="Relevant child evidence",
                chunk_lexical_score=0.004,
            )
        ],
        entity_seed_hits=[],
        relation_seed_hits=[],
    )
    assert not should_correct_failed_title_frontier_to_general_after_concept_recovery(
        query=query,
        exact_title_hits=[_paper_hit(11, lexical_score=1.0)],
        lexical_hits=[],
        chunk_lexical_hits=[],
        concept_chunk_rescue_hits=[],
        entity_seed_hits=[_paper_hit(77, entity_score=0.8)],
        relation_seed_hits=[],
    )
    assert not should_correct_failed_title_frontier_to_general_after_concept_recovery(
        query=query,
        exact_title_hits=[],
        lexical_hits=[
            _paper_hit(
                11,
                title="anti-NMDAR encephalitis psychosis first episode",
                lexical_score=1.0,
            )
        ],
        chunk_lexical_hits=[],
        concept_chunk_rescue_hits=[],
        entity_seed_hits=[],
        relation_seed_hits=[],
    )


def test_should_enable_general_title_similarity_support_for_compact_entity_queries():
    query = replace(
        _query(
            "COMT Val158Met and psychosis risk",
            retrieval_profile=QueryRetrievalProfile.GENERAL,
        ),
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )
    search_plan = build_search_plan(query)

    assert should_enable_general_title_similarity_support(
        query=query,
        search_plan=search_plan,
        sparse_passage_paper_fallback=False,
    )


def test_should_enable_general_title_similarity_support_skips_prose_and_metadata_queries():
    prose_query = replace(
        _query(
            "This study aims to compare the prevalence of mental health symptoms",
            retrieval_profile=QueryRetrievalProfile.GENERAL,
        ),
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )
    metadata_query = replace(
        _query(
            "Neurology 2018 score that predicts 1-year functional status",
            retrieval_profile=QueryRetrievalProfile.GENERAL,
            metadata_hints=QueryMetadataHints(
                topic_query="score that predicts 1-year functional status",
                year_hint=2018,
                author_hint="Neurology",
                journal_hint="Neurology",
                matched_cues=("author", "journal", "year"),
            ),
        ),
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )

    assert not should_enable_general_title_similarity_support(
        query=prose_query,
        search_plan=build_search_plan(prose_query),
        sparse_passage_paper_fallback=False,
    )
    assert not should_enable_general_title_similarity_support(
        query=metadata_query,
        search_plan=build_search_plan(metadata_query),
        sparse_passage_paper_fallback=False,
    )


def test_should_run_paper_lexical_fallback_opens_for_weak_clinical_passage_anchor():
    query = _query(
        (
            "Which baseline factors predict functional impairment over 2 years "
            "in first-episode psychosis?"
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        clinical_intent=ClinicalQueryIntent.PROGNOSIS,
    )
    search_plan = build_search_plan(query)

    assert should_run_paper_lexical_fallback(
        query=query,
        search_plan=search_plan,
        lexical_hits=[],
        chunk_lexical_hits=[
            _paper_hit(11, chunk_lexical_score=0.0012),
            _paper_hit(22, chunk_lexical_score=0.0013),
        ],
    )


def test_should_run_paper_lexical_fallback_opens_for_weak_statistical_passage_anchor():
    query = _query(
        (
            "Overall CP and TC rates for RAD and PAD were 56.2% and 58.5% "
            "(RD, -2.3%; 95% CI, -13.9 to 9.4)"
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )
    search_plan = build_search_plan(query)

    assert should_run_paper_lexical_fallback(
        query=query,
        search_plan=search_plan,
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(11, chunk_lexical_score=0.0008)],
    )


def test_should_run_paper_lexical_fallback_stays_chunk_only_for_nonclinical_weak_anchor():
    query = _query(
        (
            "Can p62/SQSTM1 help distinguish sporadic inclusion-body myositis "
            "from polymyositis and dermatomyositis?"
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )
    search_plan = build_search_plan(query)

    assert not should_run_paper_lexical_fallback(
        query=query,
        search_plan=search_plan,
        lexical_hits=[],
        chunk_lexical_hits=[_paper_hit(11, chunk_lexical_score=0.0006)],
    )


def test_should_run_biomedical_reranker_runs_for_global_queries_with_candidates():
    """The reranker now runs on any global query with enough candidates.

    The profile + clinical-intent gates were removed so GENERAL queries
    pick up cross-encoder influence through their sort-key tiebreaker.
    """
    query = _query(
        "Melatonin reduced postoperative delirium incidence in surgical patients.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        clinical_intent=ClinicalQueryIntent.TREATMENT,
    )

    assert should_run_biomedical_reranker(
        query=query,
        selected_corpus_id=None,
        ranked_papers=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.8),
            _paper_hit(33, chunk_lexical_score=0.7),
        ],
        enabled=True,
    )


def test_should_run_biomedical_reranker_runs_for_general_profile_queries():
    """GENERAL profile queries now benefit from cross-encoder reranking."""
    query = _query(
        "psychiatric medication liver risk",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        clinical_intent=ClinicalQueryIntent.GENERAL,
    )

    assert should_run_biomedical_reranker(
        query=query,
        selected_corpus_id=None,
        ranked_papers=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.8),
            _paper_hit(33, chunk_lexical_score=0.7),
        ],
        enabled=True,
    )


def test_has_stable_direct_passage_leader_requires_competing_direct_support():
    assert has_stable_direct_passage_leader(
        [
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, passage_alignment_score=0.7),
            _paper_hit(33),
        ]
    )
    assert not has_stable_direct_passage_leader(
        [
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.7),
            _paper_hit(33),
        ]
    )


def test_should_run_biomedical_reranker_skips_stable_direct_passage_leader():
    query = _query(
        "Actigraphy monitoring was recorded at one-minute intervals.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    should_run, reason = biomedical_rerank_decision(
        query=query,
        selected_corpus_id=None,
        ranked_papers=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, passage_alignment_score=0.7),
            _paper_hit(33),
        ],
        enabled=True,
    )

    assert not should_run
    assert reason == "stable_direct_passage_leader"


def test_should_run_biomedical_reranker_keeps_ambiguous_direct_passage_candidates():
    query = _query(
        "Representative claim sentence about sleep quality outcomes.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    should_run, reason = biomedical_rerank_decision(
        query=query,
        selected_corpus_id=None,
        ranked_papers=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.7),
            _paper_hit(33),
        ],
        enabled=True,
    )

    assert should_run
    assert reason == "candidate_ambiguity"


def test_should_run_biomedical_reranker_skips_title_lookup_queries():
    query = _query(
        "Delirium in the intensive care unit",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        clinical_intent=ClinicalQueryIntent.PROGNOSIS,
    )

    assert not should_run_biomedical_reranker(
        query=query,
        selected_corpus_id=None,
        ranked_papers=[
            _paper_hit(
                11,
                title="Delirium in the intensive care unit",
                lexical_score=0.8,
            ),
            _paper_hit(22, lexical_score=0.6, title="Delirium management in critical care"),
            _paper_hit(33, lexical_score=0.4, title="ICU delirium overview"),
        ],
        enabled=True,
    )


def test_should_run_biomedical_reranker_skips_title_lookup_without_anchor_candidates():
    query = _query(
        "semantic expert shorthand query",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        clinical_intent=ClinicalQueryIntent.TREATMENT,
    )

    should_run, reason = biomedical_rerank_decision(
        query=query,
        selected_corpus_id=None,
        ranked_papers=[
            _paper_hit(11, lexical_score=0.8, title="Autoimmune encephalitis review"),
            _paper_hit(22, lexical_score=0.7, title="Movement disorder therapeutics"),
            _paper_hit(33, lexical_score=0.6, title="Cytokine psychiatry update"),
        ],
        enabled=True,
    )

    assert not should_run
    assert reason == "title_lookup"


def test_should_run_biomedical_reranker_skips_selected_or_non_global_queries():
    # Selected-paper queries stay out of the reranker — they're already
    # anchored and the reranker would waste latency reordering a pinned result.
    assert not should_run_biomedical_reranker(
        query=_query(
            "Melatonin reduced postoperative delirium incidence in surgical patients.",
            retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
            selected_node_id="paper:11",
        ),
        selected_corpus_id=11,
        ranked_papers=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.8),
            _paper_hit(33, chunk_lexical_score=0.7),
        ],
        enabled=True,
    )
    # Below-threshold candidate pools still skip the reranker to avoid noise.
    assert not should_run_biomedical_reranker(
        query=_query(
            "Melatonin reduced postoperative delirium incidence in surgical patients.",
            retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
            clinical_intent=ClinicalQueryIntent.TREATMENT,
        ),
        selected_corpus_id=None,
        ranked_papers=[_paper_hit(11, chunk_lexical_score=0.9)],
        enabled=True,
    )


def test_citation_context_candidate_ids_only_include_direct_passage_support():
    direct = _paper_hit(11, chunk_lexical_score=0.95)
    indirect = _paper_hit(22)

    assert citation_context_candidate_ids(
        paper_hits=[direct, indirect],
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    ) == [11]


def test_citation_context_candidate_ids_bounds_unanchored_title_lookup_frontier():
    paper_hits = [_paper_hit(corpus_id) for corpus_id in range(1, 9)]

    assert citation_context_candidate_ids(
        paper_hits=paper_hits,
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        rerank_topn=3,
        query_text="Long biomedical query without a lexical title anchor",
        lexical_hits=[],
        selected_direct_anchor=False,
    ) == [1, 2, 3, 4, 5]


def test_entity_relation_candidate_ids_bounds_passage_enrichment_to_direct_candidates():
    ranked = [
        _paper_hit(11, chunk_lexical_score=0.95),
        _paper_hit(22, chunk_lexical_score=0.7),
        _paper_hit(33),
        _paper_hit(44),
    ]

    assert entity_relation_candidate_ids(
        ranked_papers=ranked,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        k=1,
        rerank_topn=4,
        selected_corpus_id=22,
    ) == [22, 11, 33, 44]


def test_entity_relation_candidate_ids_keeps_full_rank_order_for_non_passage_queries():
    ranked = [
        _paper_hit(11, lexical_score=0.95),
        _paper_hit(22, lexical_score=0.7),
        _paper_hit(33),
    ]

    assert entity_relation_candidate_ids(
        ranked_papers=ranked,
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        k=1,
        rerank_topn=3,
    ) == [11, 22, 33]


def test_entity_relation_candidate_ids_bounds_unanchored_title_lookup_to_shortlist():
    ranked = [_paper_hit(corpus_id) for corpus_id in range(1, 9)]

    assert entity_relation_candidate_ids(
        ranked_papers=ranked,
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        k=3,
        rerank_topn=3,
        query_text="Long biomedical query without a lexical title anchor",
        lexical_hits=[],
    ) == [1, 2, 3, 4, 5]


def test_entity_relation_candidate_ids_limits_precise_title_resolution_to_top_candidate():
    ranked = [
        _paper_hit(11, title="Selected paper title", lexical_score=0.95),
        _paper_hit(22, title="Selected paper title supplementary analysis", lexical_score=0.7),
        _paper_hit(33),
    ]

    assert entity_relation_candidate_ids(
        ranked_papers=ranked,
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        k=3,
        rerank_topn=6,
        query_text="Selected paper title",
        lexical_hits=[ranked[0]],
    ) == [11]


def test_entity_relation_candidate_ids_limits_duplicate_title_anchors_to_anchor_set():
    ranked = [
        _paper_hit(11, title="Selected paper title", lexical_score=0.95),
        _paper_hit(22, title="Selected paper title", lexical_score=0.95),
        _paper_hit(33, lexical_score=0.4),
    ]

    assert entity_relation_candidate_ids(
        ranked_papers=ranked,
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        k=3,
        rerank_topn=6,
        query_text="Selected paper title",
        lexical_hits=[ranked[0], ranked[1]],
    ) == [11, 22]


def test_has_direct_retrieval_support_uses_selected_context_for_title_queries():
    assert has_direct_retrieval_support(
        paper=_paper_hit(11, selected_context_score=1.0),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )


def test_has_direct_retrieval_support_does_not_treat_cited_context_as_title_proof():
    assert not has_direct_retrieval_support(
        paper=_paper_hit(11, cited_context_score=1.0),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )


def test_has_direct_retrieval_support_uses_entity_support_for_title_queries():
    assert has_direct_retrieval_support(
        paper=_paper_hit(11, entity_score=0.8),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )


def test_has_direct_retrieval_support_uses_relation_support_for_title_queries():
    assert has_direct_retrieval_support(
        paper=_paper_hit(11, relation_score=0.7),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )


def test_has_direct_retrieval_support_uses_passage_alignment_for_passage_queries():
    assert has_direct_retrieval_support(
        paper=_paper_hit(11, passage_alignment_score=0.7),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )


def test_passage_direct_support_tier_prefers_chunk_or_lexical_hits():
    assert passage_direct_support_tier(
        _paper_hit(11, chunk_lexical_score=0.42, passage_alignment_score=1.0)
    ) == 2
    assert passage_direct_support_tier(
        _paper_hit(22, lexical_score=0.2, passage_alignment_score=0.8)
    ) == 2


def test_passage_direct_support_tier_uses_alignment_only_as_weaker_direct_support():
    assert passage_direct_support_tier(
        _paper_hit(11, passage_alignment_score=0.7)
    ) == 1
    assert passage_direct_support_tier(
        _paper_hit(22, passage_alignment_score=0.3)
    ) == 0


def test_passage_direct_support_tier_ignores_trace_level_chunk_noise():
    assert passage_direct_support_tier(
        _paper_hit(11, chunk_lexical_score=0.002)
    ) == 0


def test_has_selected_direct_anchor_matches_selected_hit_with_direct_support():
    assert has_selected_direct_anchor(
        selected_corpus_id=11,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        paper_hits=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.8),
        ],
    )


def test_should_expand_citation_frontier_skips_title_lookup_even_without_anchor():
    query = _query(
        (
            "Transgenic mice overexpressing the 695-amino acid isoform of human "
            "Alzheimer beta-amyloid precursor protein"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_expand_citation_frontier(
        query_text=query.query,
        lexical_hits=[],
        search_plan=build_search_plan(query),
    )


def test_chunk_search_queries_adds_bounded_phrase_fallbacks_for_passages():
    query = _query(
        "This representative discussion sentence should use chunk lexical retrieval.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    candidates = chunk_search_queries(query)

    assert (
        candidates[0]
        == "this representative discussion sentence should use chunk lexical retrieval"
    )
    assert len(candidates) > 1
    assert all(len(candidate.split()) >= 3 for candidate in candidates[1:])


def test_chunk_search_queries_prioritizes_specific_phrase_before_full_query_for_long_passages():
    query = _query(
        (
            "The maturity of secretory and target cells determines, in part, the "
            "ability of a factor to influence glial proliferation, activation, or "
            "differentiation."
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    candidates = chunk_search_queries(query)

    assert candidates[0] == "influence glial proliferation activation"
    assert candidates[1] == (
        "the maturity of secretory and target cells determines in part the "
        "ability of a factor to influence glial proliferation activation or "
        "differentiation"
    )
    assert "glial proliferation activation" in candidates[2:]


def test_chunk_search_queries_demotes_discourse_heavy_lead_in_phrases():
    query = _query(
        (
            "These results suggest that the plateau amplitude in TEA reflects the "
            "activation of the entire population of synaptic NMDARs and hence the "
            "maximal gain of NMDAR-mediated synaptic transmission."
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    candidates = chunk_search_queries(query)

    assert candidates[0] == "amplitude in tea reflects"
    assert candidates[1] == (
        "these results suggest that the plateau amplitude in tea reflects the "
        "activation of the entire population of synaptic nmdars and hence the "
        "maximal gain of nmdar-mediated synaptic transmission"
    )
    assert "these results suggest that" not in candidates[:3]


def test_chunk_search_queries_skip_fragmented_acronym_fallback_shards():
    query = _query(
        (
            "The authors describe the development of the M.I.N.I. and its family "
            "of interviews: the M.I.N.I.-Screen, the M.I.N.I.-Plus, and the "
            "M.I.N.I.-Kid."
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    candidates = chunk_search_queries(query)

    assert candidates[0] == (
        "the authors describe the development of the m i n i and its family of "
        "interviews: the m i n i -screen the m i n i -plus and the m i n i -kid"
    )
    assert "m i n i" not in candidates[1:]


def test_chunk_search_queries_prioritizes_specific_clinical_comparator_phrases():
    query = _query(
        (
            "In adults with active rheumatoid arthritis, is sarilumab monotherapy "
            "more effective and safe than adalimumab monotherapy?"
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    candidates = chunk_search_queries(query)

    assert candidates[0] == "sarilumab monotherapy more effective"
    assert candidates[1] == (
        "in adults with active rheumatoid arthritis is sarilumab monotherapy more "
        "effective and safe than adalimumab monotherapy"
    )
    assert any(
        "rheumatoid arthritis" in candidate or "adalimumab monotherapy" in candidate
        for candidate in candidates[2:5]
    )
    assert "in adults with active" not in candidates[2:]
