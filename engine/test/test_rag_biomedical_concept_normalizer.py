"""Tests for the biomedical concept normalizer adapter."""

from __future__ import annotations

from app.rag.biomedical_concept_normalizer import (
    AMBIGUOUS_SINGLE_TOKEN_ALIAS_KEYS,
    SUPPRESSED_PROMOTION_CATEGORIES,
    ConceptConfidencePolicy,
    VocabConceptMatch,
    _VocabConceptRow,
    build_vocab_concept_matches,
    vocab_concept_enrichment_terms,
    vocab_concept_seed_matches,
    vocab_concept_seed_terms,
)


# ---------------------------------------------------------------------------
# ConceptConfidencePolicy.classify_confidence
# ---------------------------------------------------------------------------


def test_classify_confidence_high_for_preferred_high_quality():
    assert (
        ConceptConfidencePolicy.classify_confidence(
            quality_score=100,
            is_preferred=True,
            has_entity_rule=False,
            mesh_id="D008094",
            umls_cui="C0024141",
            category="intervention.pharmacologic",
            alias_key="lithium",
        )
        == "high"
    )


def test_classify_confidence_medium_for_quality_above_threshold():
    assert (
        ConceptConfidencePolicy.classify_confidence(
            quality_score=80,
            is_preferred=False,
            has_entity_rule=False,
            mesh_id="D008094",
            umls_cui="C0024141",
            category="intervention.pharmacologic",
            alias_key="lithium carbonate",
        )
        == "medium"
    )


def test_classify_confidence_low_for_poor_quality():
    assert (
        ConceptConfidencePolicy.classify_confidence(
            quality_score=50,
            is_preferred=False,
            has_entity_rule=False,
            mesh_id="D008094",
            umls_cui="C0024141",
            category="intervention.pharmacologic",
            alias_key="li",
        )
        == "low"
    )


def test_classify_confidence_high_when_entity_rule_exists():
    assert (
        ConceptConfidencePolicy.classify_confidence(
            quality_score=50,
            is_preferred=False,
            has_entity_rule=True,
            mesh_id="D008094",
            umls_cui=None,
            category="intervention.pharmacologic",
            alias_key="lithium",
        )
        == "high"
    )


def test_classify_confidence_low_when_no_mesh_id():
    """Non-MeSH aliases are gated to low in the first rollout."""
    assert (
        ConceptConfidencePolicy.classify_confidence(
            quality_score=100,
            is_preferred=True,
            has_entity_rule=False,
            mesh_id=None,
            umls_cui=None,
            category="biology.gene",
            alias_key="disc1",
        )
        == "low"
    )


def test_classify_confidence_medium_for_high_quality_non_mesh_umls_backed_alias():
    assert (
        ConceptConfidencePolicy.classify_confidence(
            quality_score=100,
            is_preferred=True,
            has_entity_rule=False,
            mesh_id=None,
            umls_cui="C4552594",
            category="intervention.pharmacologic.class",
            alias_key="ssri",
        )
        == "medium"
    )


def test_classify_confidence_low_for_ambiguous_single_token():
    """Aliases in the ambiguity suppression set are capped even if preferred/high-quality."""
    for alias_key in AMBIGUOUS_SINGLE_TOKEN_ALIAS_KEYS:
        confidence = ConceptConfidencePolicy.classify_confidence(
            quality_score=100,
            is_preferred=True,
            has_entity_rule=False,
            mesh_id="D001288",
            umls_cui="C0012634",
            category="clinical.symptom",
            alias_key=alias_key,
        )
        assert confidence != "high", f"{alias_key} should not be high-confidence"


def test_classify_confidence_low_for_suppressed_category():
    """Aliases from suppressed categories are not promoted to high."""
    for category in SUPPRESSED_PROMOTION_CATEGORIES:
        confidence = ConceptConfidencePolicy.classify_confidence(
            quality_score=100,
            is_preferred=True,
            has_entity_rule=False,
            mesh_id="D000001",
            umls_cui="C0000001",
            category=category,
            alias_key="some term",
        )
        assert confidence != "high", f"category {category} should suppress high"


# ---------------------------------------------------------------------------
# should_seed_retrieval / should_enrich_shortlist
# ---------------------------------------------------------------------------


def test_should_seed_retrieval_only_high():
    assert ConceptConfidencePolicy.should_seed_retrieval("high") is True
    assert ConceptConfidencePolicy.should_seed_retrieval("medium") is False
    assert ConceptConfidencePolicy.should_seed_retrieval("low") is False


def test_should_enrich_shortlist_includes_medium():
    assert ConceptConfidencePolicy.should_enrich_shortlist("high") is True
    assert ConceptConfidencePolicy.should_enrich_shortlist("medium") is True
    assert ConceptConfidencePolicy.should_enrich_shortlist("low") is False


# ---------------------------------------------------------------------------
# build_vocab_concept_matches
# ---------------------------------------------------------------------------


def _make_vocab_row(**overrides) -> _VocabConceptRow:
    defaults = dict(
        alias_key="akathisia",
        preferred_term="Akathisia",
        matched_alias="akathisia",
        alias_type="SY",
        quality_score=100,
        is_preferred=True,
        umls_cui="C0392156",
        term_id="term-001",
        category="clinical.symptom",
        mesh_id="D011595",
        entity_type="disease",
        source_surface="vocab_alias",
    )
    defaults.update(overrides)
    return _VocabConceptRow(**defaults)


def test_build_vocab_concept_matches_maps_phrase_to_raw_query():
    """Vocab concepts carry the original raw phrase when available."""
    rows = [
        _make_vocab_row(alias_key="akathisia"),
    ]
    matches = build_vocab_concept_matches(
        raw_phrases=["Akathisia"],
        vocab_concepts=rows,
        entity_rule_concept_ids=frozenset(),
    )
    assert len(matches) == 1
    assert matches[0].raw_query_phrase == "Akathisia"
    assert matches[0].matched_alias == "akathisia"


def test_build_vocab_concept_matches_sets_combined_provenance():
    rows = [_make_vocab_row()]
    matches = build_vocab_concept_matches(
        raw_phrases=["akathisia"],
        vocab_concepts=rows,
        entity_rule_concept_ids=frozenset({"MESH:D011595"}),
    )
    assert len(matches) == 1
    assert matches[0].provenance == "combined"
    assert matches[0].confidence == "high"


def test_build_vocab_concept_matches_sets_vocab_aliases_provenance():
    rows = [_make_vocab_row()]
    matches = build_vocab_concept_matches(
        raw_phrases=["akathisia"],
        vocab_concepts=rows,
        entity_rule_concept_ids=frozenset(),
    )
    assert len(matches) == 1
    assert matches[0].provenance == "vocab_aliases"


# ---------------------------------------------------------------------------
# vocab_concept_seed_terms / vocab_concept_enrichment_terms
# ---------------------------------------------------------------------------


def test_vocab_concept_seed_terms_returns_only_high_confidence():
    matches = [
        VocabConceptMatch(
            raw_query_phrase="akathisia",
            preferred_term="Akathisia",
            matched_alias="akathisia",
            alias_type="SY",
            quality_score=100,
            is_preferred=True,
            umls_cui="C0392156",
            term_id="t1",
            category="clinical.symptom",
            mesh_id="D011595",
            entity_type="disease",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="high",
        ),
        VocabConceptMatch(
            raw_query_phrase="fatigue",
            preferred_term="Fatigue",
            matched_alias="fatigue",
            alias_type="SY",
            quality_score=80,
            is_preferred=False,
            umls_cui="C0015672",
            term_id="t2",
            category="clinical.symptom",
            mesh_id="D005221",
            entity_type="disease",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="medium",
        ),
    ]
    seeds = vocab_concept_seed_terms(matches)
    assert seeds == ["Akathisia"]


def test_vocab_concept_enrichment_terms_includes_medium():
    matches = [
        VocabConceptMatch(
            raw_query_phrase="akathisia",
            preferred_term="Akathisia",
            matched_alias="akathisia",
            alias_type="SY",
            quality_score=100,
            is_preferred=True,
            umls_cui="C0392156",
            term_id="t1",
            category="clinical.symptom",
            mesh_id="D011595",
            entity_type="disease",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="high",
        ),
        VocabConceptMatch(
            raw_query_phrase="fatigue",
            preferred_term="Fatigue",
            matched_alias="fatigue",
            alias_type="SY",
            quality_score=80,
            is_preferred=False,
            umls_cui="C0015672",
            term_id="t2",
            category="clinical.symptom",
            mesh_id="D005221",
            entity_type="disease",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="medium",
        ),
    ]
    terms = vocab_concept_enrichment_terms(matches)
    assert "Akathisia" in terms
    assert "Fatigue" in terms


def test_vocab_concept_enrichment_terms_excludes_low():
    matches = [
        VocabConceptMatch(
            raw_query_phrase="disc1",
            preferred_term="DISC1",
            matched_alias="disc1",
            alias_type=None,
            quality_score=90,
            is_preferred=True,
            umls_cui=None,
            term_id="t3",
            category="biology.gene",
            mesh_id=None,
            entity_type="gene",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="low",
        ),
    ]
    assert vocab_concept_enrichment_terms(matches) == []


def test_vocab_concept_seed_terms_dedupes():
    """Same preferred term from two aliases should appear once."""
    matches = [
        VocabConceptMatch(
            raw_query_phrase="akathisia",
            preferred_term="Akathisia",
            matched_alias="akathisia",
            alias_type="SY",
            quality_score=100,
            is_preferred=True,
            umls_cui="C0392156",
            term_id="t1",
            category="clinical.symptom",
            mesh_id="D011595",
            entity_type="disease",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="high",
        ),
        VocabConceptMatch(
            raw_query_phrase="drug-induced akathisia",
            preferred_term="Akathisia",
            matched_alias="drug-induced akathisia",
            alias_type="SY",
            quality_score=90,
            is_preferred=False,
            umls_cui="C0392156",
            term_id="t1",
            category="clinical.symptom",
            mesh_id="D011595",
            entity_type="disease",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="high",
        ),
    ]
    seeds = vocab_concept_seed_terms(matches)
    assert seeds == ["Akathisia"]


def test_vocab_concept_seed_matches_requires_high_confidence_mesh_backing():
    matches = [
        VocabConceptMatch(
            raw_query_phrase="akathisia",
            preferred_term="Akathisia",
            matched_alias="akathisia",
            alias_type="SY",
            quality_score=100,
            is_preferred=True,
            umls_cui="C0392156",
            term_id="t1",
            category="clinical.symptom",
            mesh_id="D011595",
            entity_type="disease",
            source_surface="vocab_alias",
            provenance="combined",
            confidence="high",
        ),
        VocabConceptMatch(
            raw_query_phrase="ssri",
            preferred_term="Selective Serotonin Reuptake Inhibitor (SSRI)",
            matched_alias="SSRI",
            alias_type="derived_acronym",
            quality_score=100,
            is_preferred=True,
            umls_cui="C4552594",
            term_id="t2",
            category="intervention.pharmacologic.class",
            mesh_id=None,
            entity_type="chemical",
            source_surface="vocab_alias",
            provenance="vocab_aliases",
            confidence="medium",
        ),
    ]

    assert vocab_concept_seed_matches(matches) == [matches[0]]
