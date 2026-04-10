"""Unit tests for backend-owned query enrichment."""

from __future__ import annotations

from app.rag.query_enrichment import (
    build_entity_query_phrases,
    build_query_entity_resolution_phrases,
    build_query_phrases,
    build_runtime_entity_resolution_phrases,
    derive_relation_terms,
    determine_query_retrieval_profile,
    extract_query_metadata_hints,
    has_query_entity_surface_signal,
    is_title_like_query,
    should_enrich_resolved_entity_term,
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


def test_build_runtime_entity_resolution_phrases_skips_noise_only_terms():
    phrases = build_runtime_entity_resolution_phrases(
        "Diagnosis and management of dementia with Lewy bodies",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert "and" not in phrases
    assert "with" not in phrases
    assert "management" not in phrases
    assert "diagnosis" not in phrases
    assert "dementia" in phrases
    assert "lewy bodies" in phrases


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


def test_should_use_exact_title_precheck_accepts_false_negative_biomedical_titles():
    assert should_use_exact_title_precheck(
        "Health-Related Quality of Life is Impacted by Proximity to an Airport in "
        "Noise-Sensitive People"
    )
    assert should_use_exact_title_precheck(
        "Lifetime and 12-month prevalence of DSM-III-R psychiatric disorders in "
        "the United States. Results from the National Comorbidity Survey."
    )
    assert should_use_exact_title_precheck(
        "Erythrocyte P2X1 receptor expression is correlated with change in "
        "haematocrit in patients admitted to the ICU with blood pathogen-positive "
        "sepsis"
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
    title = "Melatonin for Postoperative Delirium in Older Adults"

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


def test_should_enrich_resolved_entity_term_keeps_meaningful_plain_entities_but_drops_scaffolding():
    assert should_enrich_resolved_entity_term("melatonin")
    assert should_enrich_resolved_entity_term("delirium")
    assert should_enrich_resolved_entity_term("Lewy bodies")
    assert not should_enrich_resolved_entity_term("and")
    assert not should_enrich_resolved_entity_term("with")
    assert not should_enrich_resolved_entity_term("diagnosis")


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
    # Title-cased paper titles pass; discussion-sentence prose is rejected.
    # Prose-clause tokens (``is``, ``are``, ``was``, ``were``, ``from``,
    # ``against``, etc.) now fire at any length — titles using an explicit
    # auxiliary verb such as "Motor Performance Is Not Enhanced..." route
    # through PASSAGE_LOOKUP instead of TITLE_LOOKUP. This is an
    # intentional accuracy trade-off documented in the router tests below.
    assert is_title_like_query(
        "Melatonin for Postoperative Delirium in Older Adults"
    )
    assert not is_title_like_query(
        "This is a representative discussion sentence with a concluding period."
    )


def test_is_title_like_query_rejects_titles_containing_prose_clause_tokens():
    # Broadened prose-clause rule: any query containing an auxiliary verb
    # or narrow paraphrase marker routes out of the title lane.
    assert not is_title_like_query(
        "Motor Performance Is Not Enhanced by Daytime Naps in Older Adults"
    )
    assert not is_title_like_query(
        "ApoE4 Genotype Is Associated with Accelerated Cognitive Decline"
    )
    assert not is_title_like_query(
        "Liver Problems from Psychiatric Medications"
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


def test_extract_query_metadata_hints_parses_author_year_topic_query():
    hints = extract_query_metadata_hints(
        "Breschi 2013 different permeability potassium salts across blood-brain"
    )

    assert hints.author_hint == "Breschi"
    assert hints.year_hint == 2013
    assert hints.topic_query == "different permeability potassium salts across blood-brain"
    assert hints.journal_hint is None
    assert hints.has_precise_citation_filters is True
    assert hints.has_evidence_type_filters is False
    assert hints.matched_cues == ("author", "year")


def test_extract_query_metadata_hints_parses_publication_type_prefixes():
    hints = extract_query_metadata_hints(
        "meta-analysis evidence risk factors incident delirium among older"
    )

    assert hints.requested_publication_types == ("MetaAnalysis", "SystematicReview")
    assert hints.topic_query == "risk factors incident delirium among older"
    assert hints.has_precise_citation_filters is False
    assert hints.has_evidence_type_filters is True
    assert "meta-analysis_evidence" in hints.matched_cues


def test_extract_query_metadata_hints_parses_generic_study_evidence_prefix():
    hints = extract_query_metadata_hints(
        "study evidence association dopamine transporter gene parkinson's disease"
    )

    assert hints.topic_query == "association dopamine transporter gene parkinson's disease"
    assert hints.requested_publication_types == ()
    assert hints.has_structured_signal is True
    assert hints.has_searchable_metadata_filters is False
    assert hints.has_precise_citation_filters is False
    assert hints.has_evidence_type_filters is False
    assert "study_evidence" in hints.matched_cues


def test_metadata_queries_route_to_general_and_skip_exact_title_precheck():
    query = "BMC Medicine 2014 dsm-5 criteria level arousal delirium diagnosis"
    hints = extract_query_metadata_hints(query)

    assert hints.author_hint is None
    assert hints.journal_hint == "BMC Medicine"
    assert hints.year_hint == 2014
    assert hints.has_structured_signal is True
    assert (
        determine_query_retrieval_profile(query, metadata_hints=hints)
        == QueryRetrievalProfile.GENERAL
    )
    assert should_use_exact_title_precheck(query, metadata_hints=hints) is False


def test_single_token_year_prefixes_default_to_author_hint_only():
    query = "Neurology 2018 score that predicts 1-year functional status"
    hints = extract_query_metadata_hints(query)

    assert hints.author_hint == "Neurology"
    assert hints.journal_hint is None
    assert hints.year_hint == 2018
    assert hints.has_searchable_metadata_filters is True
    assert (
        determine_query_retrieval_profile(query, metadata_hints=hints)
        == QueryRetrievalProfile.GENERAL
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


def test_title_classifier_rejects_truncated_sentence_fragments_with_mutation_tails():
    text = (
        "Transgenic mice overexpressing the 695-amino acid isoform of human "
        "Alzheimer beta-amyloid (Abeta) precursor protein containing a "
        "Lys670 --> Asn, Met671 -->"
    )

    assert not is_title_like_query(text)
    assert determine_query_retrieval_profile(text) == QueryRetrievalProfile.PASSAGE_LOOKUP
    assert not should_use_exact_title_precheck(text)


def test_title_classifier_rejects_unbalanced_parenthetical_sentence_fragments():
    text = (
        "Veterans in the second time CSR group (N = 24) were diagnosed with "
        "suffering combat stress reaction (CSR) during both wars; the first "
        "time CSR group (N ="
    )

    assert not is_title_like_query(text)
    assert determine_query_retrieval_profile(text) == QueryRetrievalProfile.PASSAGE_LOOKUP
    assert not should_use_exact_title_precheck(text)


def test_should_use_chunk_lexical_query_routes_longer_free_text():
    assert should_use_chunk_lexical_query(
        "Does melatonin reduce postoperative delirium in older adults?"
    )
    assert not should_use_chunk_lexical_query(
        "Melatonin for Postoperative Delirium in Older Adults"
    )


# ---------------------------------------------------------------------------
# Router refinement — Rule A: short lowercase keyword demotion
# ---------------------------------------------------------------------------
#
# Short biomedical noun-phrase queries like "tardive dyskinesia" were
# landing in TITLE_LOOKUP and being ranked through TITLE_RANKING_PROFILE,
# which down-weights the channels keyword searches depend on. The demote
# rule fires only on 2-3 token, lowercase-dominant queries without any
# title-shape punctuation. A single capitalized eponym is permitted so
# "Wilson disease" / "Wernicke encephalopathy" also demote cleanly.


def test_determine_retrieval_profile_demotes_short_lowercase_keywords_to_general():
    for keyword in (
        "tardive dyskinesia",
        "serotonin syndrome",
        "status epilepticus",
        "myasthenia gravis",
        "normal pressure hydrocephalus",
        "restless legs syndrome",
        "conversion disorder",
        "pseudobulbar affect",
        "neuroleptic sensitivity dementia",
        "psychogenic seizures",
    ):
        assert (
            determine_query_retrieval_profile(keyword)
            == QueryRetrievalProfile.GENERAL
        ), keyword


def test_determine_retrieval_profile_demotes_single_eponym_keywords_to_general():
    assert (
        determine_query_retrieval_profile("Wilson disease")
        == QueryRetrievalProfile.GENERAL
    )
    assert (
        determine_query_retrieval_profile("Wernicke encephalopathy")
        == QueryRetrievalProfile.GENERAL
    )


def test_determine_retrieval_profile_preserves_short_titles_with_terminal_punct():
    # Short titles with terminal punctuation still classify as title when
    # the runtime opts into terminal-punct acceptance (selected-paper flow).
    assert (
        determine_query_retrieval_profile(
            "The Satisfaction With Life Scale.",
            allow_terminal_title_punctuation=True,
        )
        == QueryRetrievalProfile.TITLE_LOOKUP
    )
    assert (
        determine_query_retrieval_profile(
            "Whither structured representation?",
            allow_terminal_title_punctuation=True,
        )
        == QueryRetrievalProfile.TITLE_LOOKUP
    )


def test_determine_retrieval_profile_preserves_multi_capitalized_titles():
    # The demote rule permits only a single capitalized eponym. Titles with
    # multiple capitalized tokens stay in the title lane regardless of
    # length.
    assert (
        determine_query_retrieval_profile("The Selfish Gene")
        == QueryRetrievalProfile.TITLE_LOOKUP
    )
    assert (
        determine_query_retrieval_profile(
            "The Hospital Anxiety and Depression Scale"
        )
        == QueryRetrievalProfile.TITLE_LOOKUP
    )


def test_determine_retrieval_profile_preserves_acronym_heavy_adversarial_cases():
    # These were already handled by the existing acronym-demotion branch —
    # pin them here so Rule A doesn't silently change their behavior.
    assert (
        determine_query_retrieval_profile("lithium CKD bipolar")
        == QueryRetrievalProfile.GENERAL
    )
    assert (
        determine_query_retrieval_profile("delirium psychosis")
        == QueryRetrievalProfile.GENERAL
    )


# ---------------------------------------------------------------------------
# Router refinement — Rule B: "from"/"against" paraphrase demotion
# ---------------------------------------------------------------------------
#
# Phase 0.4 added ``from``/``against`` to PROSE_CLAUSE_TOKENS so paraphrased
# lay-speak queries exit the title lane. The passage lane is chunk-anchored
# and ranks them poorly. The paraphrase rule routes them to GENERAL when
# they have no passage verb, no title punctuation, and are not
# interrogative.


def test_determine_retrieval_profile_demotes_from_paraphrases_to_general():
    for paraphrase in (
        "involuntary tongue and jaw movements from long-term antipsychotic use",
        "liver problems from psychiatric medications",
        "shaking hands from too much lithium",
        "brain zaps from stopping antidepressants",
    ):
        assert (
            determine_query_retrieval_profile(paraphrase)
            == QueryRetrievalProfile.GENERAL
        ), paraphrase


def test_determine_retrieval_profile_preserves_passage_claims_with_passage_verbs():
    # Passage suite seeds contain verbs like ``undergoes``/``affects``/
    # ``requires`` — the paraphrase rule must NOT demote these.
    assert (
        determine_query_retrieval_profile(
            "Hippocampal dendritic structure undergoes dynamic remodeling during development"
        )
        == QueryRetrievalProfile.PASSAGE_LOOKUP
    )


def test_determine_retrieval_profile_preserves_long_sentence_global_runtime_queries():
    # Runtime SENTENCE_GLOBAL benchmarks feed ~30-token representative
    # sentences into the router. They contain ``from`` but use rare verbs
    # ("interfere", "promote") that are not in our curated passage-verb
    # set. The token-count cap on the paraphrase rule protects these from
    # being demoted to GENERAL and regressing runtime_perf benchmarks.
    long_sentence = (
        "PF 6 -inhibition of ouabain-sensitive Na,K ATPase located on "
        "endothelial cells interfere with the efflux of K + from the brain "
        "to the lumen and may promote its"
    )
    assert (
        determine_query_retrieval_profile(long_sentence)
        == QueryRetrievalProfile.PASSAGE_LOOKUP
    )


def test_determine_retrieval_profile_preserves_titles_with_colon_and_from():
    # Real paper titles shaped "topic: lessons from Y" must NOT be demoted
    # by the paraphrase rule. The colon gate is what protects them.
    title = (
        "Soluble protein oligomers in neurodegeneration: "
        "lessons from the Alzheimer's amyloid beta-peptide"
    )
    assert (
        determine_query_retrieval_profile(title)
        != QueryRetrievalProfile.GENERAL
    )


def test_determine_retrieval_profile_preserves_question_lookups_with_paraphrase_markers():
    # Interrogative branch runs before the paraphrase rule; questions
    # that happen to contain ``is``/``are``/``from`` must still route to
    # QUESTION_LOOKUP.
    assert (
        determine_query_retrieval_profile(
            "What is the role of NMDA receptor antibodies in new-onset psychosis?"
        )
        == QueryRetrievalProfile.QUESTION_LOOKUP
    )
    assert (
        determine_query_retrieval_profile(
            "Why are benzodiazepines considered first-line treatment for catatonia?"
        )
        == QueryRetrievalProfile.QUESTION_LOOKUP
    )


def test_determine_retrieval_profile_short_keyword_skipped_in_title_friendly_context():
    # UI selected-paper flow opts into terminal-punctuation acceptance; the
    # short-keyword demotion must NOT fire in that context so a brief
    # noun-phrase query typed while browsing a paper still uses title
    # candidate lookup. "melatonin delirium" is the canonical fixture.
    assert (
        determine_query_retrieval_profile(
            "melatonin delirium",
            allow_terminal_title_punctuation=True,
        )
        == QueryRetrievalProfile.TITLE_LOOKUP
    )
    # Benchmark/global context (no selected paper) keeps the demotion.
    assert (
        determine_query_retrieval_profile("melatonin delirium")
        == QueryRetrievalProfile.GENERAL
    )


def test_determine_retrieval_profile_preserves_keyword_search_seed_distribution():
    # Concrete pin for the keyword_search_v2 suite: every seed must land
    # in GENERAL so the suite stops being ranked through TITLE_RANKING_PROFILE.
    seeds = (
        "tardive dyskinesia",
        "serotonin syndrome",
        "Wilson disease",
        "status epilepticus",
        "myasthenia gravis",
        "normal pressure hydrocephalus",
        "restless legs syndrome",
        "conversion disorder",
        "pseudobulbar affect",
        "neuroleptic sensitivity dementia",
        "Wernicke encephalopathy",
        "psychogenic seizures",
    )
    for seed in seeds:
        assert (
            determine_query_retrieval_profile(seed)
            == QueryRetrievalProfile.GENERAL
        ), seed


def test_determine_retrieval_profile_demotes_biomedical_relation_lookup_queries():
    for query in (
        "APOE4 allele and risk of Alzheimer disease",
        "BDNF Val66Met polymorphism and ketamine antidepressant response",
        "dopamine D2 receptor occupancy and antipsychotic efficacy threshold",
        "CYP2D6 poor metabolizer status and haloperidol dosing",
        "clozapine-induced myocarditis and cardiomyopathy",
        "central nervous system tumors WHO grading criteria",
    ):
        assert (
            determine_query_retrieval_profile(query)
            == QueryRetrievalProfile.GENERAL
        ), query


def test_determine_retrieval_profile_preserves_title_cased_biomedical_relation_titles():
    for title in (
        "APOE4 Allele and Alzheimer Disease Risk",
        "Dopamine D2 Receptor Occupancy and Antipsychotic Efficacy Thresholds",
    ):
        assert (
            determine_query_retrieval_profile(title)
            == QueryRetrievalProfile.TITLE_LOOKUP
        ), title


def test_determine_retrieval_profile_semantic_relation_demote_ignores_title_friendly_context():
    assert (
        determine_query_retrieval_profile(
            "APOE4 allele and risk of Alzheimer disease",
            allow_terminal_title_punctuation=True,
        )
        == QueryRetrievalProfile.GENERAL
    )


def test_determine_retrieval_profile_demotes_lowercase_semantic_anchors_without_entity_symbols():
    for query in (
        "electroconvulsive therapy treatment resistant depression efficacy",
        "frontotemporal dementia behavioral variant diagnosis criteria",
        "serotonin transporter slc6a4 and depression susceptibility",
        "gabaergic interneuron dysfunction in schizophrenia pathophysiology",
        "can't sit still as a side effect of antipsychotics",
    ):
        assert (
            determine_query_retrieval_profile(query)
            == QueryRetrievalProfile.GENERAL
        ), query


def test_determine_retrieval_profile_demotes_lowercase_passage_claim_titles_to_passage_lookup():
    for query in (
        "therapeutic hypothermia improves neurological outcomes in perinatal "
        "hypoxic ischemic encephalopathy",
        "vascular cognitive impairment following stroke involves strategic infarct location",
        "plasma phospho-tau assays show different diagnostic accuracy in "
        "prodromal Alzheimer disease",
    ):
        assert (
            determine_query_retrieval_profile(query)
            == QueryRetrievalProfile.PASSAGE_LOOKUP
        ), query


def test_determine_retrieval_profile_routes_bare_interrogative_openings_to_question_lookup():
    assert (
        determine_query_retrieval_profile(
            "why patients refuse to take their psychiatric medications"
        )
        == QueryRetrievalProfile.QUESTION_LOOKUP
    )
