"""Bounded clinician-facing query intent and shortlist prior helpers."""

from __future__ import annotations

import re

from app.rag.models import PaperEvidenceHit, PaperSpeciesProfile
from app.rag.types import ClinicalQueryIntent

_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")

TREATMENT_CUES = (
    "treat",
    "treatment",
    "therapy",
    "therapeutic",
    "intervention",
    "manage",
    "management",
    "prevent",
    "reduce",
    "improve",
    "effective",
    "efficacy",
    "benefit",
    "medication",
    "drug",
    "surgery",
)
DIAGNOSIS_CUES = (
    "diagnos",
    "diagnostic",
    "screen",
    "screening",
    "detect",
    "detection",
    "predictive biomarker",
    "biomarker",
    "sensitivity",
    "specificity",
    "identify",
)
PROGNOSIS_CUES = (
    "prognos",
    "survival",
    "mortality",
    "outcome",
    "recurrence",
    "risk",
    "predict",
)
MECHANISM_CUES = (
    "mechanism",
    "pathway",
    "pathogenesis",
    "why",
    "how does",
    "signaling",
    "molecular",
)

HIGH_CLINICAL_PUBLICATION_TYPES = frozenset(
    {
        "clinicaltrial",
        "randomizedcontrolledtrial",
        "metaanalysis",
        "systematicreview",
        "practiceguideline",
        "guideline",
    }
)
MODERATE_CLINICAL_PUBLICATION_TYPES = frozenset(
    {
        "review",
        "comparativestudy",
        "multicenterstudy",
        "observationalstudy",
        "validationstudy",
        "evaluationstudy",
        "cohortstudy",
    }
)
HUMAN_SPECIES_ID = "9606"
COMMON_MODEL_SPECIES_IDS = (
    "10090",  # mouse
    "10116",  # rat
    "9615",  # dog
    "9031",  # chicken
    "7955",  # zebrafish
    "7227",  # drosophila
    "6239",  # c. elegans
)
ACTIONABLE_CLINICAL_INTENTS = frozenset(
    {
        ClinicalQueryIntent.TREATMENT,
        ClinicalQueryIntent.DIAGNOSIS,
        ClinicalQueryIntent.PROGNOSIS,
    }
)


def _normalize_text(text: str | None) -> str:
    return " ".join(_NORMALIZE_RE.sub(" ", (text or "").lower()).split())


def _cue_count(normalized_query: str, cues: tuple[str, ...]) -> int:
    return sum(1 for cue in cues if cue in normalized_query)


def _normalize_publication_types(values: list[str]) -> set[str]:
    return {re.sub(r"[^a-z0-9]+", "", value.lower()) for value in values if value}


def infer_clinical_query_intent(query_text: str) -> ClinicalQueryIntent:
    """Infer a coarse clinical intent for bounded ranking priors.

    Keep this intentionally conservative. The runtime should only switch on
    clinician-facing priors when the query is overtly treatment/diagnosis/
    prognosis-oriented.
    """

    normalized_query = _normalize_text(query_text)
    if not normalized_query:
        return ClinicalQueryIntent.GENERAL

    scores = {
        ClinicalQueryIntent.TREATMENT: _cue_count(normalized_query, TREATMENT_CUES),
        ClinicalQueryIntent.DIAGNOSIS: _cue_count(normalized_query, DIAGNOSIS_CUES),
        ClinicalQueryIntent.PROGNOSIS: _cue_count(normalized_query, PROGNOSIS_CUES),
        ClinicalQueryIntent.MECHANISM: _cue_count(normalized_query, MECHANISM_CUES),
    }
    best_intent = max(scores, key=scores.get)
    if scores[best_intent] <= 0:
        return ClinicalQueryIntent.GENERAL
    return best_intent


def should_apply_clinical_priors(intent: ClinicalQueryIntent) -> bool:
    return intent in ACTIONABLE_CLINICAL_INTENTS


def score_clinical_prior(
    *,
    query_intent: ClinicalQueryIntent,
    paper: PaperEvidenceHit,
    species_profile: PaperSpeciesProfile | None,
) -> tuple[float, list[str]]:
    """Return a bounded clinician-facing prior for shortlist re-ranking."""

    if not should_apply_clinical_priors(query_intent):
        return 0.0, []

    score = 0.0
    reasons: list[str] = []
    publication_types = _normalize_publication_types(paper.publication_types)
    if publication_types & HIGH_CLINICAL_PUBLICATION_TYPES:
        score += 0.32
        reasons.append("high_clinical_publication_type")
    elif publication_types & MODERATE_CLINICAL_PUBLICATION_TYPES:
        score += 0.16
        reasons.append("clinical_publication_type")

    if species_profile is None:
        return max(-0.35, min(score, 0.6)), reasons

    if species_profile.human_mentions > 0 and species_profile.nonhuman_mentions == 0:
        score += 0.22
        reasons.append("human_population_signal")
    elif species_profile.human_mentions > 0:
        score += 0.1
        reasons.append("includes_human_population_signal")
    elif species_profile.common_model_mentions > 0:
        score -= 0.22
        reasons.append("model_organism_only_signal")
    elif species_profile.nonhuman_mentions > 0:
        score -= 0.14
        reasons.append("nonhuman_population_signal")

    if query_intent == ClinicalQueryIntent.PROGNOSIS and "cohortstudy" in publication_types:
        score += 0.08
        reasons.append("prognostic_cohort_signal")
    if query_intent == ClinicalQueryIntent.DIAGNOSIS and (
        publication_types & {"validationstudy", "evaluationstudy"}
    ):
        score += 0.08
        reasons.append("diagnostic_validation_signal")

    return max(-0.35, min(score, 0.6)), reasons
