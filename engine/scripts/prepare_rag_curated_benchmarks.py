"""Prepare curated frozen benchmarks for title, adversarial, and neuropsych suites.

Queries papers from the live graph to resolve corpus_ids and populate benchmark
fixtures. Each suite is paper-disjoint from the others and from the existing
sentence_hard_v1, clinical_actionable_v1, and evidence_intent_v1 benchmarks.

Benchmarks are pushed directly to Langfuse as datasets (source of truth).
JSON snapshots are only written with ``--snapshot`` for git-tracked freezes.

Usage:
    cd engine && uv run python -m scripts.prepare_rag_curated_benchmarks \
        --graph-release-id current

    # Also write JSON snapshots to data/runtime_eval_benchmarks/
    cd engine && uv run python -m scripts.prepare_rag_curated_benchmarks \
        --graph-release-id current --snapshot
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from collections import Counter
from pathlib import Path

# Load .env.local for Langfuse credentials
_engine_root = Path(__file__).resolve().parents[1]
_env_local = _engine_root.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), value)

sys.path.insert(0, str(_engine_root))

from app import db
from app.rag.repository import PostgresRagRepository
from app.rag.types import EvidenceIntent
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_benchmarks import load_runtime_eval_benchmark_cases
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalBenchmarkReport,
    RuntimeEvalBenchmarkCase,
    RuntimeEvalQueryFamily,
)

logger = logging.getLogger(__name__)

BENCHMARK_DIR = Path(__file__).resolve().parents[1] / "data" / "runtime_eval_benchmarks"

# ---------------------------------------------------------------------------
# Curated query seed definitions
# ---------------------------------------------------------------------------
# Each entry: (query, query_family, evidence_intent, labels, title_pattern)
# title_pattern is a trigram/FTS search pattern used to find the target paper.

TITLE_GLOBAL_SEEDS: list[dict[str, object]] = [
    {
        "title_search": "colon subtitle pattern",
        "query_family": "title_global",
        "labels": ["title_global", "colon_subtitle"],
        "description": "Title with colon-subtitle structure",
    },
    {
        "title_search": "question mark title",
        "query_family": "title_global",
        "labels": ["title_global", "question_title"],
        "description": "Title ending with question mark",
    },
    {
        "title_search": "abbreviation heavy",
        "query_family": "title_global",
        "labels": ["title_global", "abbreviation_heavy"],
        "description": "Title dense with abbreviations",
    },
    {
        "title_search": "greek letter",
        "query_family": "title_global",
        "labels": ["title_global", "greek_letter"],
        "description": "Title containing Greek letter symbols",
    },
]

TITLE_SELECTED_SEEDS: list[dict[str, object]] = [
    {
        "title_search": "selected context",
        "query_family": "title_selected",
        "labels": ["title_selected"],
        "description": "Title lookup with pre-selected paper context",
    },
]

ADVERSARIAL_ROUTER_SEEDS: list[dict[str, object]] = [
    {
        "query": "NMS vs SS differential",
        "search_terms": "neuroleptic malignant syndrome serotonin",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "abbreviation_heavy"],
        "description": "Abbreviation-heavy: neuroleptic malignant syndrome vs serotonin syndrome",
    },
    {
        "query": "treatments that failed to show benefit in TRD",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "negated_query"],
        "description": "Negated formulation targeting treatment-resistant depression",
    },
    {
        "query": "lithium CKD bipolar",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse"],
        "description": "Multi-entity terse query",
    },
    {
        "query": "delirium psychosis",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "ambiguous_differential"],
        "description": "Ambiguous differential without explicit question structure",
    },
    {
        "query": "p<0.001 mortality reduction",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "statistical_fragment"],
        "description": "Statistical fragment that may confuse query router",
    },
    {
        "query": "APOE e4 Alzheimer's risk",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "gene_symbol"],
        "description": "Gene symbol query that may be misrouted as title",
    },
    {
        "query": "SSRI SIADH elderly",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "abbreviation_heavy", "clinical_safety"],
        "description": "Abbreviation cluster in clinical safety context",
    },
    {
        "query": "catatonia NOT caused by psychosis",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "negated_query"],
        "description": "Explicit NOT negation in differential diagnosis",
    },
    {
        "query": "EEG findings autoimmune encephalitis vs viral",
        "search_terms": "autoimmune encephalitis EEG",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse"],
        "description": "Multi-entity differential with diagnostic modality",
    },
    {
        "query": "Positive predictive value amyloid PET",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "statistical_fragment"],
        "description": "Statistical concept + diagnostic test",
    },
    {
        "query": "clozapine agranulocytosis monitoring",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse", "clinical_safety"],
        "description": "Drug-adverse-effect-procedure triple",
    },
    {
        "query": "antipsychotics QTc prolongation torsades",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse", "clinical_safety"],
        "description": "Drug class + ECG finding + arrhythmia cascade",
    },
]

NEUROPSYCH_SAFETY_SEEDS: list[dict[str, object]] = [
    {
        "query": "How is delirium differentiated from primary psychosis in hospitalized patients?",
        "search_terms": "delirium psychosis differential",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "differential_diagnosis", "delirium"],
        "description": "Delirium vs primary psychosis differential",
    },
    {
        "query": "What is the recommended workup for suspected catatonia in a psychiatric inpatient?",
        "search_terms": "catatonia workup psychiatric",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "workup", "catatonia"],
        "description": "Catatonia workup protocol",
    },
    {
        "query": "What are the risks and monitoring requirements for lithium use in patients with CKD stage 3?",
        "search_terms": "lithium kidney chronic renal",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "lithium_renal"],
        "description": "Lithium with renal comorbidity",
    },
    {
        "query": "How common is SSRI-induced hyponatremia in elderly patients and what are the risk factors?",
        "search_terms": "hyponatremia SSRI elderly",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "ssri_hyponatremia"],
        "description": "SSRI SIADH in elderly",
    },
    {
        "query": "What clinical features differentiate neuroleptic malignant syndrome from serotonin syndrome?",
        "search_terms": "serotonin syndrome neuroleptic malignant",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "differential_diagnosis", "nms_vs_ss"],
        "description": "NMS vs serotonin syndrome differential",
    },
    {
        "query": "What is the current evidence for autoimmune encephalitis presenting as first-episode psychosis?",
        "search_terms": "autoimmune encephalitis psychosis",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "differential_diagnosis", "autoimmune_encephalitis"],
        "description": "Autoimmune encephalitis mimicking psychosis",
    },
    {
        "query": "What are effective pharmacological approaches for behavioral and psychological symptoms of dementia?",
        "search_terms": "dementia behavioral symptoms pharmacological",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "treatment", "dementia_behavioral"],
        "description": "Dementia behavioral symptom management",
    },
    {
        "query": "What is the safety profile of psychotropic medications during pregnancy and lactation?",
        "search_terms": "psychotropic pregnancy lactation",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "pregnancy_psychopharm"],
        "description": "Pregnancy/lactation psychopharmacology",
    },
    {
        "query": "What are the neuropsychiatric manifestations of anti-NMDA receptor encephalitis?",
        "search_terms": "NMDA receptor encephalitis neuropsychiatric",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "clinical_presentation", "anti_nmdar"],
        "description": "Anti-NMDAR encephalitis neuropsych features",
    },
    {
        "query": "What is the evidence for ECT in treatment-resistant catatonia?",
        "search_terms": "electroconvulsive catatonia treatment",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "treatment", "ect_catatonia"],
        "description": "ECT for treatment-resistant catatonia",
    },
    {
        "query": "What medication adjustments are needed for psychotropics in patients with hepatic encephalopathy?",
        "search_terms": "hepatic encephalopathy psychotropic",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "hepatic_encephalopathy"],
        "description": "Psychotropic dosing in hepatic encephalopathy",
    },
    {
        "query": "What is the role of benzodiazepines versus lorazepam challenge in diagnosing catatonia?",
        "search_terms": "lorazepam catatonia diagnosis",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "diagnosis", "catatonia_lorazepam"],
        "description": "Lorazepam challenge for catatonia diagnosis",
    },
]

# ---------------------------------------------------------------------------
# Question-lookup seeds: interrogative clinical queries (What/How/Why + 5+ tokens)
# that route to QUESTION_LOOKUP via _is_interrogative_query()
# ---------------------------------------------------------------------------
QUESTION_LOOKUP_SEEDS: list[dict[str, object]] = [
    {
        "query": "What is the mechanism of action of ketamine in treatment-resistant depression?",
        "search_terms": "ketamine depression mechanism",
        "labels": ["question_lookup", "mechanism"],
    },
    {
        "query": "How does vagus nerve stimulation affect treatment-resistant epilepsy outcomes?",
        "search_terms": "vagus nerve stimulation epilepsy",
        "labels": ["question_lookup", "treatment"],
    },
    {
        "query": "What are the diagnostic criteria for functional neurological disorder?",
        "search_terms": "functional neurological disorder diagnosis",
        "labels": ["question_lookup", "diagnosis"],
    },
    {
        "query": "How is medication-overuse headache differentiated from chronic migraine?",
        "search_terms": "medication overuse headache migraine",
        "labels": ["question_lookup", "differential_diagnosis"],
    },
    {
        "query": "What role does neuroinflammation play in the pathogenesis of Parkinson disease?",
        "search_terms": "neuroinflammation Parkinson pathogenesis",
        "labels": ["question_lookup", "pathogenesis"],
    },
    {
        "query": "How effective is cognitive behavioral therapy for insomnia in older adults?",
        "search_terms": "cognitive behavioral therapy insomnia elderly",
        "labels": ["question_lookup", "treatment_efficacy"],
    },
    {
        "query": "What are the long-term neuropsychiatric sequelae of traumatic brain injury?",
        "search_terms": "traumatic brain injury neuropsychiatric sequelae",
        "labels": ["question_lookup", "prognosis"],
    },
    {
        "query": "How does obstructive sleep apnea contribute to cognitive decline?",
        "search_terms": "sleep apnea cognitive decline",
        "labels": ["question_lookup", "risk_factor"],
    },
    {
        "query": "What is the evidence for psilocybin-assisted therapy in major depressive disorder?",
        "search_terms": "psilocybin therapy depression",
        "labels": ["question_lookup", "emerging_treatment"],
    },
    {
        "query": "How should antiepileptic drugs be managed during pregnancy?",
        "search_terms": "antiepileptic pregnancy management",
        "labels": ["question_lookup", "drug_safety"],
    },
    {
        "query": "What biomarkers predict conversion from mild cognitive impairment to Alzheimer dementia?",
        "search_terms": "biomarkers mild cognitive impairment Alzheimer",
        "labels": ["question_lookup", "biomarker"],
    },
    {
        "query": "How does deep brain stimulation modulate basal ganglia circuitry in dystonia?",
        "search_terms": "deep brain stimulation dystonia basal ganglia",
        "labels": ["question_lookup", "neuromodulation"],
    },
]

# ---------------------------------------------------------------------------
# General-profile seeds: short keyword queries (2-4 tokens) that route to GENERAL
# ---------------------------------------------------------------------------
GENERAL_PROFILE_SEEDS: list[dict[str, object]] = [
    {
        "query": "tardive dyskinesia",
        "search_terms": "tardive dyskinesia",
        "labels": ["general_profile", "movement_disorder"],
    },
    {
        "query": "serotonin syndrome",
        "search_terms": "serotonin syndrome",
        "labels": ["general_profile", "drug_safety"],
    },
    {
        "query": "Wilson disease",
        "search_terms": "Wilson disease neuropsychiatric",
        "labels": ["general_profile", "metabolic"],
    },
    {
        "query": "status epilepticus",
        "search_terms": "status epilepticus treatment",
        "labels": ["general_profile", "emergency"],
    },
    {
        "query": "normal pressure hydrocephalus",
        "search_terms": "normal pressure hydrocephalus",
        "labels": ["general_profile", "neurosurgery"],
    },
    {
        "query": "restless legs syndrome",
        "search_terms": "restless legs syndrome",
        "labels": ["general_profile", "sleep_disorder"],
    },
    {
        "query": "myasthenia gravis",
        "search_terms": "myasthenia gravis",
        "labels": ["general_profile", "neuromuscular"],
    },
    {
        "query": "conversion disorder",
        "search_terms": "conversion disorder functional",
        "labels": ["general_profile", "functional"],
    },
    {
        "query": "Wernicke encephalopathy",
        "search_terms": "Wernicke encephalopathy thiamine",
        "labels": ["general_profile", "nutritional"],
    },
    {
        "query": "neuroleptic sensitivity dementia",
        "search_terms": "neuroleptic sensitivity Lewy body",
        "labels": ["general_profile", "drug_safety"],
    },
    {
        "query": "pseudobulbar affect",
        "search_terms": "pseudobulbar affect pathological",
        "labels": ["general_profile", "behavioral"],
    },
    {
        "query": "psychogenic seizures",
        "search_terms": "psychogenic nonepileptic seizures",
        "labels": ["general_profile", "functional"],
    },
]


# ---------------------------------------------------------------------------
# Abstract-only seeds: papers WITHOUT warehouse (paper_documents) coverage
# ---------------------------------------------------------------------------
ABSTRACT_ONLY_SEEDS: list[dict[str, object]] = [
    {
        "search_terms": "delirium ICU sedation",
        "labels": ["abstract_only", "clinical"],
        "description": "ICU delirium — abstract-only stratum",
    },
    {
        "search_terms": "antidepressant discontinuation syndrome",
        "labels": ["abstract_only", "drug_safety"],
        "description": "Antidepressant withdrawal — abstract-only stratum",
    },
    {
        "search_terms": "epilepsy comorbid depression treatment",
        "labels": ["abstract_only", "comorbidity"],
        "description": "Epilepsy-depression comorbidity — abstract-only stratum",
    },
    {
        "search_terms": "frontotemporal dementia behavioral",
        "labels": ["abstract_only", "differential"],
        "description": "FTD behavioral variant — abstract-only stratum",
    },
    {
        "search_terms": "postpartum psychosis management",
        "labels": ["abstract_only", "emergency"],
        "description": "Postpartum psychosis — abstract-only stratum",
    },
    {
        "search_terms": "Huntington disease psychiatric",
        "labels": ["abstract_only", "neuropsychiatric"],
        "description": "Huntington neuropsychiatric — abstract-only stratum",
    },
    {
        "search_terms": "ADHD adult diagnosis",
        "labels": ["abstract_only", "diagnosis"],
        "description": "Adult ADHD diagnosis — abstract-only stratum",
    },
    {
        "search_terms": "substance induced psychosis cannabis",
        "labels": ["abstract_only", "substance"],
        "description": "Cannabis-induced psychosis — abstract-only stratum",
    },
    {
        "search_terms": "tardive dyskinesia VMAT2 inhibitor",
        "labels": ["abstract_only", "treatment"],
        "description": "TD VMAT2 inhibitor treatment — abstract-only stratum",
    },
    {
        "search_terms": "prion disease psychiatric symptoms",
        "labels": ["abstract_only", "rare_disease"],
        "description": "Prion disease psychiatric presentation — abstract-only stratum",
    },
    {
        "search_terms": "multiple sclerosis depression fatigue",
        "labels": ["abstract_only", "comorbidity"],
        "description": "MS depression/fatigue — abstract-only stratum",
    },
    {
        "search_terms": "bipolar rapid cycling treatment",
        "labels": ["abstract_only", "treatment"],
        "description": "Rapid cycling bipolar treatment — abstract-only stratum",
    },
]

# ---------------------------------------------------------------------------
# Sentence-hard seeds: long verbatim sentence fragments from papers that
# stress passage-level retrieval (FTS + embedding recall)
# ---------------------------------------------------------------------------
SENTENCE_HARD_SEEDS: list[dict[str, object]] = [
    {
        "query": "delirium risk factors intensive care",
        "search_terms": "delirium risk factors intensive care unit",
        "labels": ["sentence_hard", "icu_delirium"],
    },
    {
        "query": "neuropsychological assessment mild cognitive impairment",
        "search_terms": "neuropsychological assessment cognitive impairment",
        "labels": ["sentence_hard", "cognitive_assessment"],
    },
    {
        "query": "electroconvulsive therapy treatment resistant depression efficacy",
        "search_terms": "electroconvulsive therapy depression efficacy",
        "labels": ["sentence_hard", "ect_efficacy"],
    },
    {
        "query": "tardive dyskinesia pathophysiology dopamine supersensitivity",
        "search_terms": "tardive dyskinesia dopamine pathophysiology",
        "labels": ["sentence_hard", "movement_mechanism"],
    },
    {
        "query": "anti-NMDA receptor encephalitis psychiatric presentation",
        "search_terms": "anti-NMDA receptor encephalitis psychiatric",
        "labels": ["sentence_hard", "autoimmune_encephalitis"],
    },
    {
        "query": "benzodiazepine withdrawal seizure management protocol",
        "search_terms": "benzodiazepine withdrawal seizure",
        "labels": ["sentence_hard", "withdrawal_management"],
    },
    {
        "query": "frontotemporal dementia behavioral variant diagnosis criteria",
        "search_terms": "frontotemporal dementia behavioral diagnosis",
        "labels": ["sentence_hard", "ftd_diagnosis"],
    },
    {
        "query": "serotonin norepinephrine reuptake inhibitor neuropathic pain",
        "search_terms": "SNRI neuropathic pain",
        "labels": ["sentence_hard", "pain_treatment"],
    },
    {
        "query": "hepatic encephalopathy neuropsychiatric manifestations",
        "search_terms": "hepatic encephalopathy neuropsychiatric",
        "labels": ["sentence_hard", "metabolic_encephalopathy"],
    },
    {
        "query": "clozapine resistant schizophrenia augmentation strategies",
        "search_terms": "clozapine resistant schizophrenia augmentation",
        "labels": ["sentence_hard", "treatment_resistant"],
    },
    {
        "query": "steroid induced psychiatric symptoms corticosteroid psychosis",
        "search_terms": "corticosteroid psychosis psychiatric",
        "labels": ["sentence_hard", "drug_induced"],
    },
    {
        "query": "status epilepticus nonconvulsive EEG continuous monitoring",
        "search_terms": "nonconvulsive status epilepticus EEG",
        "labels": ["sentence_hard", "eeg_monitoring"],
    },
    {
        "query": "postconcussion syndrome persistent symptoms management",
        "search_terms": "postconcussion syndrome persistent symptoms",
        "labels": ["sentence_hard", "tbi_sequelae"],
    },
    {
        "query": "central pontine myelinolysis osmotic demyelination sodium correction",
        "search_terms": "osmotic demyelination sodium",
        "labels": ["sentence_hard", "metabolic_emergency"],
    },
]

# ---------------------------------------------------------------------------
# Evidence-intent seeds: clinician queries with explicit support/refute intent
# ---------------------------------------------------------------------------
EVIDENCE_INTENT_SEEDS: list[dict[str, object]] = [
    {
        "query": "Does lithium reduce suicide risk in bipolar disorder compared to other mood stabilizers?",
        "search_terms": "lithium suicide bipolar",
        "evidence_intent": "support",
        "labels": ["evidence_intent", "support", "treatment"],
    },
    {
        "query": "Is there evidence that benzodiazepines worsen cognitive decline in elderly patients?",
        "search_terms": "benzodiazepine cognitive decline elderly",
        "evidence_intent": "refute",
        "labels": ["evidence_intent", "refute", "drug_safety"],
    },
    {
        "query": "Does melatonin improve sleep quality in patients with traumatic brain injury?",
        "search_terms": "melatonin sleep traumatic brain injury",
        "evidence_intent": "support",
        "labels": ["evidence_intent", "support", "treatment"],
    },
    {
        "query": "Is ketamine effective for acute suicidal ideation in the emergency department?",
        "search_terms": "ketamine suicidal ideation emergency",
        "evidence_intent": "support",
        "labels": ["evidence_intent", "support", "emergency_treatment"],
    },
    {
        "query": "Does electroconvulsive therapy cause permanent memory impairment?",
        "search_terms": "electroconvulsive therapy memory impairment",
        "evidence_intent": "refute",
        "labels": ["evidence_intent", "refute", "treatment_safety"],
    },
    {
        "query": "Is repetitive transcranial magnetic stimulation effective for auditory hallucinations?",
        "search_terms": "transcranial magnetic stimulation hallucinations",
        "evidence_intent": "support",
        "labels": ["evidence_intent", "support", "neuromodulation"],
    },
    {
        "query": "Does antipsychotic polypharmacy improve outcomes in treatment-resistant schizophrenia?",
        "search_terms": "antipsychotic polypharmacy schizophrenia",
        "evidence_intent": "refute",
        "labels": ["evidence_intent", "refute", "treatment"],
    },
    {
        "query": "Is there evidence that SSRI use during pregnancy increases autism risk in offspring?",
        "search_terms": "SSRI pregnancy autism offspring",
        "evidence_intent": "refute",
        "labels": ["evidence_intent", "refute", "drug_safety"],
    },
    {
        "query": "Does cognitive behavioral therapy prevent relapse in bipolar disorder?",
        "search_terms": "cognitive behavioral therapy bipolar relapse",
        "evidence_intent": "support",
        "labels": ["evidence_intent", "support", "psychotherapy"],
    },
    {
        "query": "Is valproate associated with polycystic ovary syndrome in women of reproductive age?",
        "search_terms": "valproate polycystic ovary syndrome",
        "evidence_intent": "support",
        "labels": ["evidence_intent", "support", "drug_safety"],
    },
    {
        "query": "Does early psychiatric consultation reduce ICU length of stay for delirium patients?",
        "search_terms": "psychiatric consultation ICU delirium",
        "evidence_intent": "support",
        "labels": ["evidence_intent", "support", "consultation"],
    },
    {
        "query": "Is there evidence against routine brain imaging for first-episode psychosis?",
        "search_terms": "brain imaging first episode psychosis",
        "evidence_intent": "refute",
        "labels": ["evidence_intent", "refute", "diagnostic_workup"],
    },
]

# ---------------------------------------------------------------------------
# Clinical-actionable seeds: clinical decision queries that need actionable evidence
# ---------------------------------------------------------------------------
CLINICAL_ACTIONABLE_SEEDS: list[dict[str, object]] = [
    {
        "query": "What is the recommended initial treatment for catatonia in a medically ill patient?",
        "search_terms": "catatonia treatment lorazepam medical",
        "labels": ["clinical_actionable", "treatment_protocol"],
    },
    {
        "query": "How should antipsychotics be dosed in elderly patients with dementia-related psychosis?",
        "search_terms": "antipsychotic dosing elderly dementia psychosis",
        "labels": ["clinical_actionable", "dosing_guidance"],
    },
    {
        "query": "What is the evidence-based approach to managing agitation in the emergency department?",
        "search_terms": "agitation management emergency department",
        "labels": ["clinical_actionable", "emergency_management"],
    },
    {
        "query": "When should clozapine be considered in treatment-resistant schizophrenia?",
        "search_terms": "clozapine treatment resistant schizophrenia guidelines",
        "labels": ["clinical_actionable", "treatment_algorithm"],
    },
    {
        "query": "What monitoring is required when initiating lithium in an elderly patient?",
        "search_terms": "lithium monitoring elderly initiation",
        "labels": ["clinical_actionable", "monitoring_protocol"],
    },
    {
        "query": "How should serotonin syndrome be managed in the inpatient setting?",
        "search_terms": "serotonin syndrome management treatment",
        "labels": ["clinical_actionable", "emergency_management"],
    },
    {
        "query": "What are the indications for electroconvulsive therapy in acute mania?",
        "search_terms": "electroconvulsive therapy mania indications",
        "labels": ["clinical_actionable", "treatment_indication"],
    },
    {
        "query": "How should psychotropic medications be managed perioperatively?",
        "search_terms": "psychotropic medication perioperative management",
        "labels": ["clinical_actionable", "perioperative_care"],
    },
    {
        "query": "What is the approach to capacity assessment in delirious patients?",
        "search_terms": "capacity assessment delirium",
        "labels": ["clinical_actionable", "medicolegal"],
    },
    {
        "query": "How should benzodiazepine withdrawal be managed in critically ill patients?",
        "search_terms": "benzodiazepine withdrawal critical care",
        "labels": ["clinical_actionable", "withdrawal_management"],
    },
    {
        "query": "What antidepressants are safest in patients with epilepsy?",
        "search_terms": "antidepressant epilepsy seizure threshold",
        "labels": ["clinical_actionable", "drug_selection"],
    },
    {
        "query": "How should acute dystonic reactions from antipsychotics be treated?",
        "search_terms": "acute dystonic reaction antipsychotic treatment",
        "labels": ["clinical_actionable", "adverse_effect_management"],
    },
    {
        "query": "What is the recommended approach for pain management in patients with substance use disorder?",
        "search_terms": "pain management substance use disorder opioid",
        "labels": ["clinical_actionable", "dual_diagnosis"],
    },
    {
        "query": "How should neuroleptic malignant syndrome be treated acutely?",
        "search_terms": "neuroleptic malignant syndrome acute treatment",
        "labels": ["clinical_actionable", "emergency_management"],
    },
    {
        "query": "What is the recommended workup for new-onset psychiatric symptoms in a patient with cancer?",
        "search_terms": "psychiatric symptoms cancer paraneoplastic",
        "labels": ["clinical_actionable", "oncology_psychiatry"],
    },
]


def _push_report_to_langfuse(report: RagRuntimeEvalBenchmarkReport) -> bool:
    """Push a benchmark report directly to Langfuse as a dataset.

    Creates the dataset and all items with ``primary_source_system`` in both
    ``expected_output`` and ``metadata`` so evaluators can read it from either.

    Returns True if push succeeded, False otherwise (graceful degradation).
    """
    try:
        from app.langfuse_config import get_langfuse

        client = get_langfuse()
        if client is None:
            logger.warning("Langfuse not available — skipping dataset push")
            return False

        dataset_name = f"benchmark-{report.benchmark_key}"
        client.create_dataset(
            name=dataset_name,
            description=(
                f"Frozen benchmark: {report.benchmark_key}. "
                f"Graph: {report.graph_name}. "
                f"Cases: {report.selected_count}."
            ),
            metadata={
                "benchmark_key": report.benchmark_key,
                "graph_release_id": report.graph_release_id,
                "graph_run_id": report.graph_run_id,
            },
        )

        for case in report.cases:
            input_data = {
                "query": case.query,
                "query_family": str(case.query_family),
                "evidence_intent": str(case.evidence_intent) if case.evidence_intent else None,
                "benchmark_labels": case.benchmark_labels,
            }
            expected_output = {
                "corpus_id": case.corpus_id,
                "title": case.title,
                "primary_source_system": case.primary_source_system,
            }
            # Deterministic ID: upserts on re-run instead of appending duplicates
            item_id = f"{report.benchmark_key}:{case.corpus_id}"
            client.create_dataset_item(
                dataset_name=dataset_name,
                id=item_id,
                input=input_data,
                expected_output=expected_output,
                metadata={
                    "primary_source_system": case.primary_source_system,
                    "stratum_key": case.stratum_key,
                    "benchmark_key": case.benchmark_key,
                    "has_chunks": "has_chunks" in case.benchmark_labels,
                },
            )

        client.flush()
        logger.info("Pushed %d items to Langfuse dataset '%s'", len(report.cases), dataset_name)
        return True
    except Exception:
        logger.warning("Failed to push to Langfuse", exc_info=True)
        return False


def _load_existing_corpus_ids(benchmark_dir: Path) -> set[int]:
    """Load all corpus_ids from checked-in benchmarks to ensure disjointness."""
    existing: set[int] = set()
    for path in sorted(benchmark_dir.glob("*.json")):
        try:
            _report, cases = load_runtime_eval_benchmark_cases(path)
            existing.update(case.corpus_id for case in cases)
        except Exception:
            continue
    return existing


_TITLE_EDGE_CASE_SQL = """
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND length(p.title) > 20
  AND {title_filter}
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 3
"""

_TITLE_FILTERS = {
    "colon_subtitle": "p.title LIKE '%%: %%'",
    "question_title": "p.title LIKE '%%?%%'",
    "abbreviation_heavy": (
        "length(p.title) - length(regexp_replace(p.title, '[A-Z]{2,}', '', 'g')) >= 6"
    ),
    "greek_letter": (
        "p.title ~ '[\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6\u03b7\u03b8\u03ba\u03bb\u03bc]'"
    ),
    "long_title": "length(p.title) > 120",
    "short_title": "length(p.title) < 50 AND length(p.title) > 20",
}


def _fetch_title_edge_cases(
    *,
    repository,
    graph_run_id: str,
    exclude_corpus_ids: set[int],
    cursor,
    max_per_type: int = 2,
    total_target: int = 12,
) -> list[dict[str, object]]:
    """Fetch diverse title edge cases from the graph."""
    results: list[dict[str, object]] = []
    seen_corpus_ids: set[int] = set(exclude_corpus_ids)

    for filter_name, filter_sql in _TITLE_FILTERS.items():
        sql = _TITLE_EDGE_CASE_SQL.format(title_filter=filter_sql)
        cursor.execute(sql, (graph_run_id, list(seen_corpus_ids)))
        rows = cursor.fetchall()
        for row in rows[:max_per_type]:
            corpus_id = int(row["corpus_id"])
            if corpus_id in seen_corpus_ids:
                continue
            seen_corpus_ids.add(corpus_id)
            results.append(
                {
                    "corpus_id": corpus_id,
                    "title": row["title"],
                    "primary_source_system": str(row["source_system"]),
                    "filter_type": filter_name,
                }
            )
            if len(results) >= total_target:
                return results

    return results


_PAPER_FOR_QUERY_WAREHOUSE_SQL = """
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND (
    setweight(to_tsvector('english', COALESCE(p.title, '')), 'A')
    || setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B')
  ) @@ websearch_to_tsquery('english', %s)
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 1
"""

_PAPER_FOR_QUERY_WAREHOUSE_WITH_CHUNKS_SQL = """
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND (
    setweight(to_tsvector('english', COALESCE(p.title, '')), 'A')
    || setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B')
  ) @@ websearch_to_tsquery('english', %s)
  AND EXISTS (
    SELECT 1 FROM solemd.paper_chunks pc
    WHERE pc.corpus_id = p.corpus_id
  )
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 1
"""

_PAPER_FOR_QUERY_ANY_SQL = """
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
LEFT JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND (
    setweight(to_tsvector('english', COALESCE(p.title, '')), 'A')
    || setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B')
  ) @@ websearch_to_tsquery('english', %s)
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 1
"""


def _check_has_chunks(cursor, corpus_id: int) -> bool:
    """Check whether a paper has actual paper_chunks rows."""
    cursor.execute(
        "SELECT EXISTS(SELECT 1 FROM solemd.paper_chunks WHERE corpus_id = %s) AS ok",
        (corpus_id,),
    )
    return bool(cursor.fetchone()["ok"])


def _resolve_paper_for_query(
    *,
    cursor,
    graph_run_id: str,
    query: str,
    exclude_corpus_ids: set[int],
    require_warehouse: bool = False,
    require_chunks: bool = False,
    exclude_warehouse: bool = False,
) -> dict[str, object] | None:
    """Find the best-matching paper for a curated query.

    Abstract-first: resolves against the full 2.4M corpus by default.
    Returns ``has_chunks`` on every result so evaluators can stratify.

    Modes:
    - Default (no flags): full corpus, best FTS match by citation count.
    - ``require_warehouse=True``: must have ``paper_documents`` entry.
    - ``require_chunks=True``: must have ``paper_chunks`` rows (passage_retrieval only).
    - ``exclude_warehouse=True``: must NOT have ``paper_documents`` (abstract_stratum only).
    """
    if require_chunks:
        cursor.execute(
            _PAPER_FOR_QUERY_WAREHOUSE_WITH_CHUNKS_SQL,
            (graph_run_id, list(exclude_corpus_ids), query),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        corpus_id = int(row["corpus_id"])
        return {
            "corpus_id": corpus_id,
            "title": row["title"],
            "primary_source_system": str(row["source_system"]),
            "has_warehouse": True,
            "has_chunks": True,
        }

    if require_warehouse:
        cursor.execute(
            _PAPER_FOR_QUERY_WAREHOUSE_SQL,
            (graph_run_id, list(exclude_corpus_ids), query),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        corpus_id = int(row["corpus_id"])
        return {
            "corpus_id": corpus_id,
            "title": row["title"],
            "primary_source_system": str(row["source_system"]),
            "has_warehouse": True,
            "has_chunks": _check_has_chunks(cursor, corpus_id),
        }

    # Default: full corpus resolution (abstract-first)
    cursor.execute(
        _PAPER_FOR_QUERY_ANY_SQL,
        (graph_run_id, list(exclude_corpus_ids), query),
    )
    row = cursor.fetchone()
    if row is None:
        return None

    corpus_id = int(row["corpus_id"])
    has_warehouse = row["source_system"] is not None and row["source_system"] != "s2orc_v2"

    # For exclude_warehouse mode, skip papers that have warehouse coverage
    if exclude_warehouse and has_warehouse:
        return None

    return {
        "corpus_id": corpus_id,
        "title": row["title"],
        "primary_source_system": str(row["source_system"]),
        "has_warehouse": has_warehouse,
        "has_chunks": _check_has_chunks(cursor, corpus_id),
    }


def _build_curated_benchmark(
    *,
    benchmark_key: str,
    benchmark_source: str,
    release,
    chunk_version_key: str,
    cases: list[RuntimeEvalBenchmarkCase],
) -> RagRuntimeEvalBenchmarkReport:
    label_counts: Counter[str] = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)
    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=benchmark_source,
        max_cases=len(cases),
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def build_title_global_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a title_global benchmark from diverse title edge cases."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = exclude_corpus_ids or set()

    with connect_fn() as conn, conn.cursor() as cur:
        papers = _fetch_title_edge_cases(
            repository=repository,
            graph_run_id=release.graph_run_id,
            exclude_corpus_ids=excluded,
            cursor=cur,
            total_target=12,
        )

    cases = []
    for paper in papers:
        corpus_id = int(paper["corpus_id"])
        title = str(paper["title"])
        filter_type = str(paper.get("filter_type", "general"))
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=corpus_id,
                title=title,
                primary_source_system=str(paper["primary_source_system"]),
                query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
                query=title,
                stratum_key=(
                    f"benchmark:title_global_v1|filter:{filter_type}|"
                    f"source:{paper['primary_source_system']}"
                ),
                benchmark_key="title_global_v1",
                benchmark_labels=["title_global", filter_type],
                failure_count=0,
                min_target_rank=0,
                max_target_rank=0,
                mean_target_rank=0.0,
                source_lane_keys=[],
            )
        )
        excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="title_global_v1",
        benchmark_source="curated title edge-case benchmark from the current graph-backed runtime cohort",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_title_selected_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a title_selected benchmark from graph papers with selection context."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = exclude_corpus_ids or set()

    sql = """
    SELECT p.corpus_id, p.title,
           COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system
    FROM solemd.graph_points grp
    JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
    JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
    WHERE grp.graph_run_id = %s
      AND p.corpus_id != ALL(%s::BIGINT[])
      AND p.title IS NOT NULL
      AND length(p.title) > 30
    ORDER BY p.citation_count DESC NULLS LAST
    LIMIT 10
    """
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(sql, (release.graph_run_id, list(excluded)))
        rows = cur.fetchall()

    cases = []
    for row in rows:
        corpus_id = int(row["corpus_id"])
        title = str(row["title"])
        source_system = str(row["source_system"])
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=corpus_id,
                title=title,
                primary_source_system=source_system,
                query_family=RuntimeEvalQueryFamily.TITLE_SELECTED,
                query=title,
                stratum_key=f"benchmark:title_selected_v1|source:{source_system}",
                benchmark_key="title_selected_v1",
                benchmark_labels=["title_selected"],
                failure_count=0,
                min_target_rank=0,
                max_target_rank=0,
                mean_target_rank=0.0,
                source_lane_keys=[],
            )
        )
        excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="title_selected_v1",
        benchmark_source="curated title-selected benchmark from the current graph-backed runtime cohort",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_adversarial_router_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build an adversarial router benchmark from curated edge-case queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in ADVERSARIAL_ROUTER_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
                require_chunks=True,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            labels.append("adversarial_router")
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:adversarial_router_v1|type:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="adversarial_router_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="adversarial_router_v1",
        benchmark_source="curated adversarial router edge-case benchmark for query classification stress testing",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_neuropsych_safety_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a neuropsychiatry/CL safety benchmark from clinician-shaped queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in NEUROPSYCH_SAFETY_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
                require_chunks=True,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            labels.append("neuropsych_safety")
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:neuropsych_safety_v1|theme:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="neuropsych_safety_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="neuropsych_safety_v1",
        benchmark_source="curated neuropsychiatry/CL safety benchmark for clinician-shaped query coverage",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_question_lookup_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a question_lookup benchmark from interrogative clinical queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in QUESTION_LOOKUP_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
                require_warehouse=True,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:question_lookup_v1|theme:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="question_lookup_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="question_lookup_v1",
        benchmark_source="curated question-lookup benchmark for interrogative clinical query coverage",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_general_profile_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a general-profile benchmark from short keyword queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in GENERAL_PROFILE_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
                require_warehouse=True,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:general_profile_v1|theme:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="general_profile_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="general_profile_v1",
        benchmark_source="curated general-profile benchmark for short keyword query coverage",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


_ABSTRACT_ONLY_CANDIDATES_SQL = """
WITH warehouse_ids AS (
    SELECT DISTINCT pd.corpus_id
    FROM solemd.paper_documents pd
)
SELECT p.corpus_id, p.title, 'abstract_only' AS source_system,
       p.abstract, p.citation_count
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND p.abstract IS NOT NULL
  AND p.corpus_id NOT IN (SELECT corpus_id FROM warehouse_ids)
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 5000
"""


def build_abstract_only_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build an abstract_only benchmark selecting papers WITHOUT warehouse coverage.

    Uses a two-phase approach: first fetches a pool of abstract-only candidates
    (fast, no FTS), then matches seeds against titles/abstracts in Python.
    This avoids expensive FTS scans over millions of non-warehouse rows.
    """
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(
            _ABSTRACT_ONLY_CANDIDATES_SQL,
            (release.graph_run_id, list(excluded)),
        )
        candidates = cur.fetchall()

    cases = []
    used_corpus_ids: set[int] = set()
    for seed in ABSTRACT_ONLY_SEEDS:
        search_terms = str(seed.get("search_terms", "")).lower().split()
        best = None
        for candidate in candidates:
            corpus_id = int(candidate["corpus_id"])
            if corpus_id in excluded or corpus_id in used_corpus_ids:
                continue
            text = (
                (candidate["title"] or "") + " " + (candidate["abstract"] or "")
            ).lower()
            if all(term in text for term in search_terms):
                best = candidate
                break
        if best is None:
            print(f"  SKIP (no abstract-only match): {' '.join(search_terms)}")
            continue
        corpus_id = int(best["corpus_id"])
        title = str(best["title"])
        labels = list(seed.get("labels", []))
        used_corpus_ids.add(corpus_id)
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=corpus_id,
                title=title,
                primary_source_system="abstract_only",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                query=" ".join(search_terms),
                stratum_key=(
                    f"benchmark:abstract_only_v1|theme:{labels[1] if len(labels) > 1 else 'general'}|"
                    f"source:abstract_only"
                ),
                benchmark_key="abstract_only_v1",
                benchmark_labels=sorted(set(labels)),
                failure_count=0,
                min_target_rank=0,
                max_target_rank=0,
                mean_target_rank=0.0,
                source_lane_keys=[],
            )
        )
        excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="abstract_only_v1",
        benchmark_source="curated abstract-only benchmark for papers without warehouse/fulltext coverage",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_sentence_hard_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a sentence-hard benchmark from passage-level retrieval stress queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in SENTENCE_HARD_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
                require_chunks=True,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:sentence_hard_v1|type:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="sentence_hard_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="sentence_hard_v1",
        benchmark_source="curated sentence-hard benchmark for passage-level retrieval stress testing",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_evidence_intent_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build an evidence-intent benchmark from support/refute clinician queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in EVIDENCE_INTENT_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            evidence_intent = seed.get("evidence_intent")
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
                require_chunks=True,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    evidence_intent=EvidenceIntent(evidence_intent) if evidence_intent else None,
                    stratum_key=(
                        f"benchmark:evidence_intent_v1|intent:{evidence_intent or 'none'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="evidence_intent_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="evidence_intent_v1",
        benchmark_source="curated evidence-intent benchmark for support/refute signal retrieval",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_clinical_actionable_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a clinical-actionable benchmark from treatment/management decision queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in CLINICAL_ACTIONABLE_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
                require_chunks=True,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:clinical_actionable_v1|type:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="clinical_actionable_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="clinical_actionable_v1",
        benchmark_source="curated clinical-actionable benchmark for treatment/management decision queries",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


# =========================================================================
# V2 consolidated build functions (abstract-first, signal-complete)
# =========================================================================


def _resolve_seed_item(
    *,
    cursor,
    graph_run_id: str,
    seed: dict,
    excluded: set[int],
    benchmark_key: str,
    query_family: RuntimeEvalQueryFamily,
    require_chunks: bool = False,
    exclude_warehouse: bool = False,
) -> RuntimeEvalBenchmarkCase | None:
    """Resolve a single seed dict into a benchmark case, or None if unresolvable."""
    query = str(seed["query"]) if "query" in seed else ""
    search_terms = str(seed.get("search_terms", query))

    paper = _resolve_paper_for_query(
        cursor=cursor,
        graph_run_id=graph_run_id,
        query=search_terms,
        exclude_corpus_ids=excluded,
        require_chunks=require_chunks,
        exclude_warehouse=exclude_warehouse,
    )
    if paper is None:
        return None

    corpus_id = int(paper["corpus_id"])
    labels = list(seed.get("labels", []))
    if paper.get("has_chunks"):
        labels.append("has_chunks")

    evidence_intent_raw = seed.get("evidence_intent")
    evidence_intent = EvidenceIntent(evidence_intent_raw) if evidence_intent_raw else None

    return RuntimeEvalBenchmarkCase(
        corpus_id=corpus_id,
        title=str(paper["title"]),
        primary_source_system=str(paper["primary_source_system"]),
        query_family=query_family,
        query=query or str(paper["title"]),
        evidence_intent=evidence_intent,
        stratum_key=(
            f"benchmark:{benchmark_key}|label:{labels[0] if labels else 'general'}|"
            f"source:{paper['primary_source_system']}"
        ),
        benchmark_key=benchmark_key,
        benchmark_labels=sorted(set(labels)),
        failure_count=0,
        min_target_rank=0,
        max_target_rank=0,
        mean_target_rank=0.0,
        source_lane_keys=[],
    )


def build_title_retrieval_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Merged title_global + title_selected. No warehouse gate."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    # Global title edge cases (no warehouse gate)
    with connect_fn() as conn, conn.cursor() as cur:
        papers = _fetch_title_edge_cases(
            repository=repository,
            graph_run_id=release.graph_run_id,
            exclude_corpus_ids=excluded,
            cursor=cur,
            total_target=6,
            max_per_type=1,
        )

    cases = []
    for paper in papers:
        corpus_id = int(paper["corpus_id"])
        title = str(paper["title"])
        filter_type = str(paper.get("filter_type", "general"))
        labels = ["title_retrieval", "global", filter_type]
        with connect_fn() as conn, conn.cursor() as cur:
            if _check_has_chunks(cur, corpus_id):
                labels.append("has_chunks")
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=corpus_id,
                title=title,
                primary_source_system=str(paper["primary_source_system"]),
                query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
                query=title,
                stratum_key=f"benchmark:title_retrieval_v2|filter:{filter_type}|source:{paper['primary_source_system']}",
                benchmark_key="title_retrieval_v2",
                benchmark_labels=sorted(set(labels)),
                failure_count=0, min_target_rank=0, max_target_rank=0,
                mean_target_rank=0.0, source_lane_keys=[],
            )
        )
        excluded.add(corpus_id)

    # Selected title items (no warehouse gate — queries inline SQL)
    sql = """
    SELECT p.corpus_id, p.title,
           COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system
    FROM solemd.graph_points grp
    JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
    LEFT JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
    WHERE grp.graph_run_id = %s
      AND p.corpus_id != ALL(%s::BIGINT[])
      AND p.title IS NOT NULL
      AND length(p.title) > 30
    ORDER BY p.citation_count DESC NULLS LAST
    LIMIT 6
    """
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(sql, (release.graph_run_id, list(excluded)))
        rows = cur.fetchall()

    for row in rows:
        corpus_id = int(row["corpus_id"])
        title = str(row["title"])
        labels = ["title_retrieval", "selected"]
        with connect_fn() as conn, conn.cursor() as cur:
            if _check_has_chunks(cur, corpus_id):
                labels.append("has_chunks")
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=corpus_id,
                title=title,
                primary_source_system=str(row["source_system"]),
                query_family=RuntimeEvalQueryFamily.TITLE_SELECTED,
                query=title,
                stratum_key=f"benchmark:title_retrieval_v2|type:selected|source:{row['source_system']}",
                benchmark_key="title_retrieval_v2",
                benchmark_labels=sorted(set(labels)),
                failure_count=0, min_target_rank=0, max_target_rank=0,
                mean_target_rank=0.0, source_lane_keys=[],
            )
        )
        excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="title_retrieval_v2",
        benchmark_source="Merged title_global + title_selected, abstract-first",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_clinical_evidence_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Merged neuropsych_safety + clinical_actionable + question_lookup + evidence_intent.

    Abstract-first: resolves against full 2.4M corpus.
    Each item gets has_chunks label for stratified grounding analysis.
    """
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    # Merge seeds from 4 source arrays
    all_seeds = (
        list(NEUROPSYCH_SAFETY_SEEDS)
        + list(CLINICAL_ACTIONABLE_SEEDS)
        + list(QUESTION_LOOKUP_SEEDS)
        + list(EVIDENCE_INTENT_SEEDS)
    )

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in all_seeds:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="clinical_evidence_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            )
            if case is None:
                query = seed.get("query", seed.get("search_terms", "?"))
                print(f"  SKIP (no match): {str(query)[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="clinical_evidence_v2",
        benchmark_source="Merged neuropsych_safety + clinical_actionable + question_lookup + evidence_intent, abstract-first",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_passage_retrieval_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Passage-level retrieval stress tests. require_chunks=True (only chunk-gated suite)."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in SENTENCE_HARD_SEEDS:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="passage_retrieval_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                require_chunks=True,
            )
            if case is None:
                print(f"  SKIP (no match): {seed.get('query', '?')[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="passage_retrieval_v2",
        benchmark_source="Passage-level retrieval stress tests, chunk-gated",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_adversarial_routing_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Router stress tests. No warehouse gate — full corpus."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in ADVERSARIAL_ROUTER_SEEDS:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="adversarial_routing_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            )
            if case is None:
                print(f"  SKIP (no match): {seed.get('query', '?')[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="adversarial_routing_v2",
        benchmark_source="Router stress tests — abbreviations, negation, stats, gene symbols",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_keyword_search_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Short keyword queries against full 2.4M corpus. No warehouse gate."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in GENERAL_PROFILE_SEEDS:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="keyword_search_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            )
            if case is None:
                print(f"  SKIP (no match): {seed.get('query', seed.get('search_terms', '?'))[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="keyword_search_v2",
        benchmark_source="Short keyword queries against full corpus, no warehouse gate",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_abstract_stratum_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Abstract-only retrieval path. Targets papers WITHOUT warehouse coverage."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    _ABSTRACT_STRATUM_SQL = """
    SELECT p.corpus_id, p.title, 'abstract_only' AS source_system,
           p.abstract
    FROM solemd.graph_points grp
    JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
    LEFT JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
    WHERE grp.graph_run_id = %s
      AND p.corpus_id != ALL(%s::BIGINT[])
      AND p.title IS NOT NULL
      AND p.abstract IS NOT NULL
      AND length(p.abstract) > 100
      AND pd.corpus_id IS NULL
      AND (
        setweight(to_tsvector('english', COALESCE(p.title, '')), 'A')
        || setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B')
      ) @@ websearch_to_tsquery('english', %s)
    ORDER BY p.citation_count DESC NULLS LAST
    LIMIT 1
    """

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in ABSTRACT_ONLY_SEEDS:
            search_terms = str(seed.get("search_terms", ""))
            labels = list(seed.get("labels", []))

            cur.execute(
                _ABSTRACT_STRATUM_SQL,
                (release.graph_run_id, list(excluded), search_terms),
            )
            row = cur.fetchone()
            if row is None:
                print(f"  SKIP (no abstract-only match): {search_terms[:60]}")
                continue

            corpus_id = int(row["corpus_id"])
            # Generate a query from the seed search_terms (these are keyword queries)
            query = search_terms
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(row["title"]),
                    primary_source_system="abstract_only",
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:abstract_stratum_v2|theme:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:abstract_only"
                    ),
                    benchmark_key="abstract_stratum_v2",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0, min_target_rank=0, max_target_rank=0,
                    mean_target_rank=0.0, source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="abstract_stratum_v2",
        benchmark_source="Abstract-only retrieval — targets papers without warehouse coverage",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare curated frozen benchmarks for title, adversarial, and neuropsych suites."
    )
    parser.add_argument("--graph-release-id", default="current")
    parser.add_argument("--chunk-version-key", default=DEFAULT_CHUNK_VERSION_KEY)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BENCHMARK_DIR,
    )
    parser.add_argument(
        "--snapshot",
        action="store_true",
        help="Write JSON snapshots to output-dir (for git-tracked freezes).",
    )
    parser.add_argument(
        "--suites",
        nargs="*",
        default=[
            "title_retrieval_v2", "clinical_evidence_v2", "passage_retrieval_v2",
            "adversarial_routing_v2", "keyword_search_v2", "abstract_stratum_v2",
        ],
        choices=[
            # V2 suites (default)
            "title_retrieval_v2", "clinical_evidence_v2", "passage_retrieval_v2",
            "adversarial_routing_v2", "keyword_search_v2", "abstract_stratum_v2",
            # V1 suites (legacy, kept for backward compat)
            "title_global", "title_selected", "adversarial_router", "neuropsych_safety",
            "question_lookup", "general_profile", "abstract_only",
            "sentence_hard", "evidence_intent", "clinical_actionable",
        ],
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    import app.langfuse_config  # noqa: F401 — centralized Langfuse logging config
    from app.langfuse_config import ensure_score_configs

    args = _parse_args(argv)
    output_dir: Path = args.output_dir

    # Register all score configs in Langfuse (idempotent)
    ensure_score_configs()

    existing_corpus_ids = _load_existing_corpus_ids(output_dir)
    print(f"Existing corpus_ids across benchmarks: {len(existing_corpus_ids)}")

    excluded = set(existing_corpus_ids)
    connect = db.pooled

    builders = {
        # V2 consolidated suites (abstract-first, signal-complete)
        "title_retrieval_v2": (build_title_retrieval_v2, "title_retrieval_v2.json"),
        "clinical_evidence_v2": (build_clinical_evidence_v2, "clinical_evidence_v2.json"),
        "passage_retrieval_v2": (build_passage_retrieval_v2, "passage_retrieval_v2.json"),
        "adversarial_routing_v2": (build_adversarial_routing_v2, "adversarial_routing_v2.json"),
        "keyword_search_v2": (build_keyword_search_v2, "keyword_search_v2.json"),
        "abstract_stratum_v2": (build_abstract_stratum_v2, "abstract_stratum_v2.json"),
        # V1 legacy suites (kept for backward compat)
        "title_global": (build_title_global_benchmark, "title_global_v1.json"),
        "title_selected": (build_title_selected_benchmark, "title_selected_v1.json"),
        "adversarial_router": (build_adversarial_router_benchmark, "adversarial_router_v1.json"),
        "neuropsych_safety": (build_neuropsych_safety_benchmark, "neuropsych_safety_v1.json"),
        "question_lookup": (build_question_lookup_benchmark, "question_lookup_v1.json"),
        "general_profile": (build_general_profile_benchmark, "general_profile_v1.json"),
        "abstract_only": (build_abstract_only_benchmark, "abstract_only_v1.json"),
        "sentence_hard": (build_sentence_hard_benchmark, "sentence_hard_v1.json"),
        "evidence_intent": (build_evidence_intent_benchmark, "evidence_intent_v1.json"),
        "clinical_actionable": (build_clinical_actionable_benchmark, "clinical_actionable_v1.json"),
    }

    try:
        for suite_name in args.suites:
            builder_fn, filename = builders[suite_name]
            print(f"\nBuilding {suite_name}...")
            report = builder_fn(
                graph_release_id=args.graph_release_id,
                chunk_version_key=args.chunk_version_key,
                exclude_corpus_ids=excluded,
                connect=connect,
            )
            for case in report.cases:
                excluded.add(case.corpus_id)

            # Push directly to Langfuse (source of truth)
            pushed = _push_report_to_langfuse(report)
            status = "pushed" if pushed else "Langfuse unavailable"
            print(f"  Langfuse: {status} ({report.selected_count} cases)")

            # Optionally write JSON snapshot for git-tracked freezes
            if args.snapshot:
                output_dir.mkdir(parents=True, exist_ok=True)
                report_json = report.model_dump_json(indent=2)
                out_path = output_dir / filename
                out_path.write_text(report_json)
                print(f"  Snapshot: {out_path}")
    finally:
        db.close_pool()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
