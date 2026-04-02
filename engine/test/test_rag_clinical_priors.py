from __future__ import annotations

from app.rag.clinical_priors import infer_clinical_query_intent
from app.rag.types import ClinicalQueryIntent


def test_infer_clinical_query_intent_detects_treatment_queries():
    intent = infer_clinical_query_intent(
        "Does melatonin reduce postoperative delirium in older surgical patients?"
    )

    assert intent == ClinicalQueryIntent.TREATMENT


def test_infer_clinical_query_intent_detects_diagnosis_queries():
    intent = infer_clinical_query_intent(
        "Can optical coherence tomography diagnose relapsing remitting multiple sclerosis?"
    )

    assert intent == ClinicalQueryIntent.DIAGNOSIS


def test_infer_clinical_query_intent_detects_prognosis_queries():
    intent = infer_clinical_query_intent(
        "Does serum sodium predict mortality in acute liver failure?"
    )

    assert intent == ClinicalQueryIntent.PROGNOSIS


def test_infer_clinical_query_intent_detects_mechanism_queries():
    intent = infer_clinical_query_intent(
        "What is the mechanism linking EWSR1 ablation to motor dysfunction?"
    )

    assert intent == ClinicalQueryIntent.MECHANISM


def test_infer_clinical_query_intent_keeps_generic_sentence_queries_general():
    intent = infer_clinical_query_intent(
        "These findings were compared between the two groups and their "
        "relationship with the duration and severity of MS."
    )

    assert intent == ClinicalQueryIntent.GENERAL
