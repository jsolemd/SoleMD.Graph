"""Unit tests for backend-owned query enrichment."""

from __future__ import annotations

from app.rag.query_enrichment import (
    build_entity_query_phrases,
    build_query_entity_resolution_phrases,
    build_query_phrases,
    derive_relation_terms,
    determine_query_retrieval_profile,
    has_query_entity_surface_signal,
    is_title_like_query,
    should_seed_resolved_entity_term,
    should_use_chunk_lexical_query,
    should_use_exact_title_precheck,
    should_use_title_similarity,
)
from app.rag.types import QueryRetrievalProfile


def test_build_query_phrases_builds_bounded_contiguous_spans():
    phrases = build_query_phrases("What evidence links melatonin to postoperative delirium?")

    assert "melatonin" in phrases
    assert "postoperative delirium" in phrases
    assert "what evidence links melatonin to" not in phrases
    assert len(phrases) <= 48


def test_build_entity_query_phrases_preserves_biomedical_symbol_tokens():
    phrases = build_entity_query_phrases(
        "This suggests decreased pERK1/2 levels during inhibitory avoidance retrieval."
    )

    assert "decreased perk1/2 levels during" in phrases
    assert "perk1/2 levels during inhibitory" in phrases
    assert "perk1 2 levels during inhibitory" not in phrases


def test_build_query_entity_resolution_phrases_keeps_anchor_windows_for_acronyms():
    phrases = build_query_entity_resolution_phrases(
        "Neuropeptide Y (NPY) signaling after IL-6 stimulation in the cerebellum"
    )

    assert phrases
    assert any("npy" in phrase.split() for phrase in phrases)
    assert any("il-6" in phrase.split() for phrase in phrases)
    assert len(phrases) <= 12


def test_build_query_entity_resolution_phrases_skips_non_entity_prose_noise():
    text = (
        "Mean injection pressure was greater in subepineurium compared with muscle, "
        "geometric ratio 2.29 (1.30 to 4.10), p<0.001; and greater on epineurium "
        "compared with muscle, geometric ratio 1.73 (1.03"
    )

    assert build_query_entity_resolution_phrases(text) == []


def test_should_use_exact_title_precheck_accepts_long_terminal_title_candidates():
    title = (
        "A theory-informed qualitative exploration of social and environmental "
        "determinants of physical activity and dietary choices in adolescents with "
        "intellectual disabilities in their final year of school."
    )

    assert should_use_exact_title_precheck(title)


def test_should_use_exact_title_precheck_accepts_short_terminal_title_candidates():
    assert should_use_exact_title_precheck("Group comparisons: imaging the aging brain.")


def test_should_use_exact_title_precheck_rejects_ordinary_sentence_queries():
    assert not should_use_exact_title_precheck(
        "This is a representative discussion sentence with a concluding period."
    )


def test_should_use_title_similarity_disables_broad_lane_for_long_exact_titles():
    title = (
        "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
        "maturation and brain development in the rat"
    )

    assert is_title_like_query(title)
    assert (
        should_use_title_similarity(
            title,
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        )
        is False
    )


def test_should_use_title_similarity_keeps_shorter_title_lookup_queries():
    title = "Motor Performance Is not Enhanced by Daytime Naps in Older Adults"

    assert is_title_like_query(title)
    assert (
        should_use_title_similarity(
            title,
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        )
        is True
    )


def test_should_seed_resolved_entity_term_requires_specificity_for_auto_recall():
    assert should_seed_resolved_entity_term("MESH:D008550")
    assert should_seed_resolved_entity_term("pERK1/2")
    assert should_seed_resolved_entity_term("IL-6")
    assert should_seed_resolved_entity_term("pERK1/2 complex")
    assert not should_seed_resolved_entity_term("A 4")
    assert not should_seed_resolved_entity_term("melatonin")
    assert not should_seed_resolved_entity_term("delirium")


def test_has_query_entity_surface_signal_detects_high_precision_entity_shapes():
    assert has_query_entity_surface_signal("Neuropeptide Y (NPY) signaling in the cerebellum")
    assert has_query_entity_surface_signal("IL-6 expression after surgery")
    assert has_query_entity_surface_signal(
        "The utility of the Rorschach test in distinguishing patients with head injury"
    )
    assert not has_query_entity_surface_signal(
        "This study aims to compare the prevalence of mental health symptoms"
    )


def test_derive_relation_terms_normalizes_spaces_and_hyphens():
    relation_terms = derive_relation_terms(
        "Does melatonin positive correlate with delirium and drug interact with SSRIs?"
    )

    assert relation_terms == ["positive_correlate", "drug_interact"]


def test_derive_relation_terms_skips_incidental_relation_verbs_in_long_passages():
    relation_terms = derive_relation_terms(
        "This study aims to compare the prevalence of mental health symptoms between "
        "LBC and non-left-behind children and to explore the predictive effect of "
        "bullying victimization on adolescent mental health."
    )

    assert relation_terms == []


def test_is_title_like_query_accepts_paper_title_but_not_sentence():
    assert is_title_like_query("Motor Performance Is not Enhanced by Daytime Naps in Older Adults")
    assert not is_title_like_query(
        "This is a representative discussion sentence with a concluding period."
    )


def test_determine_query_retrieval_profile_allows_terminal_punctuation_for_selected_titles():
    assert (
        determine_query_retrieval_profile(
            "Trauma deepens trauma: the consequences of recurrent combat stress reaction.",
            allow_terminal_title_punctuation=True,
        )
        == QueryRetrievalProfile.TITLE_LOOKUP
    )
    assert (
        determine_query_retrieval_profile(
            "This is a representative discussion sentence with a concluding period."
        )
        == QueryRetrievalProfile.PASSAGE_LOOKUP
    )


def test_title_classifier_accepts_question_subtitle_paper_titles():
    title = (
        "What physical performance measures predict incident cognitive decline among "
        "intact older adults? A 4.4year follow up study."
    )

    assert is_title_like_query(title)
    assert determine_query_retrieval_profile(title) == QueryRetrievalProfile.TITLE_LOOKUP
    assert not should_use_chunk_lexical_query(title)


def test_title_classifier_accepts_long_structured_scientific_titles():
    title = (
        "Designing clinical trials for assessing the effects of cognitive training "
        "and physical activity interventions on cognitive outcomes: The Seniors "
        "Health and Activity Research Program Pilot (SHARP-P) Study, a randomized"
    )

    assert is_title_like_query(title)
    assert determine_query_retrieval_profile(title) == QueryRetrievalProfile.TITLE_LOOKUP
    assert not should_use_chunk_lexical_query(title)


def test_title_classifier_keeps_long_prose_in_passage_lane():
    text = (
        "Designing clinical trials for older adults requires balancing outcome "
        "selection with adherence support while investigators coordinate multiple "
        "interventions across sites and measure cognition over time without the "
        "subtitle structure typical of a paper title"
    )

    assert not is_title_like_query(text)
    assert determine_query_retrieval_profile(text) == QueryRetrievalProfile.PASSAGE_LOOKUP
    assert should_use_chunk_lexical_query(text)


def test_title_classifier_rejects_citation_style_sentence_fragments():
    text = (
        "Turning his attention to the fly's motor patterns, Wilson (1966) proposed "
        "that the neurons that innervated each of the muscles Wyman had studied "
        "were organized by reciprocal inhibitory"
    )

    assert not is_title_like_query(text)
    assert determine_query_retrieval_profile(text) == QueryRetrievalProfile.PASSAGE_LOOKUP
    assert should_use_chunk_lexical_query(text)


def test_title_classifier_rejects_abstract_header_prose_clauses():
    text = (
        "MAIN OUTCOMES AND RESULTS: Three conditions of psychiatric illness "
        "emerged: Prolonged Grief Disorder only (n = 9; 20%), depression only "
        "(n = 7; 15.5%) and Prolonged Grief Disorder"
    )

    assert not is_title_like_query(text)
    assert determine_query_retrieval_profile(text) == QueryRetrievalProfile.PASSAGE_LOOKUP
    assert should_use_chunk_lexical_query(text)


def test_should_use_chunk_lexical_query_routes_longer_free_text():
    assert should_use_chunk_lexical_query(
        "Does melatonin reduce postoperative delirium in older adults?"
    )
    assert not should_use_chunk_lexical_query(
        "Motor Performance Is not Enhanced by Daytime Naps in Older Adults"
    )
