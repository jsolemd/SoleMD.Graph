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
import hashlib
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
from app.rag_ingest.benchmark_catalog import (
    benchmark_suite_gate_maps,
    get_benchmark_suite_spec,
)
from app.rag_ingest.benchmark_case_metadata import load_live_benchmark_case_coverage
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_benchmarks import (
    build_biomedical_holdout_benchmark,
    build_biomedical_evidence_type_benchmark,
    build_biomedical_metadata_retrieval_benchmark,
    build_biomedical_optimization_benchmark,
    build_citation_context_benchmark,
    load_runtime_eval_benchmark_cases,
)
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
# Passage retrieval seeds: passage-style claims targeting chunked papers
# Designed for require_chunks=True — queries phrased as natural language claims
# that should trigger passage_lookup routing and chunk grounding.
# ---------------------------------------------------------------------------
PASSAGE_RETRIEVAL_SEEDS: list[dict[str, object]] = [
    {
        "query": "Autoimmune encephalitis can develop as a complication following herpes simplex encephalitis",
        "search_terms": "autoimmune encephalitis herpes simplex",
        "labels": ["passage_retrieval", "autoimmune_encephalitis"],
    },
    {
        "query": "Plasma phospho-tau assays show different diagnostic accuracy in prodromal Alzheimer disease",
        "search_terms": "phospho-tau assay prodromal Alzheimer",
        "labels": ["passage_retrieval", "alzheimer_biomarker"],
    },
    {
        "query": "ApoE4 genotype is associated with increased risk of Alzheimer disease through multiple mechanisms",
        "search_terms": "ApoE4 Alzheimer therapeutic target",
        "labels": ["passage_retrieval", "genetic_risk"],
    },
    {
        "query": "Catatonia is underdiagnosed and has multiple etiologies requiring systematic workup",
        "search_terms": "catatonia diagnosis treatment pathophysiology",
        "labels": ["passage_retrieval", "catatonia_workup"],
    },
    {
        "query": "Vascular cognitive impairment following stroke involves strategic infarct location",
        "search_terms": "stroke cognitive impairment vascular dementia",
        "labels": ["passage_retrieval", "vascular_dementia"],
    },
    {
        "query": "Therapeutic hypothermia improves neurological outcomes in perinatal hypoxic ischemic encephalopathy",
        "search_terms": "hypothermia perinatal hypoxic ischaemic encephalopathy",
        "labels": ["passage_retrieval", "neonatal_neuroprotection"],
    },
    {
        "query": "The gut microbiome changes observed in early Parkinson disease may contribute to disease progression",
        "search_terms": "gut metagenome Parkinson L-DOPA",
        "labels": ["passage_retrieval", "gut_brain_axis"],
    },
    {
        "query": "Amyloid beta peptide disrupts glucose transport in hippocampal neurons",
        "search_terms": "amyloid beta glucose transport hippocampal",
        "labels": ["passage_retrieval", "amyloid_metabolism"],
    },
    {
        "query": "The diagnostic criteria for dementia due to Alzheimer disease include both clinical and biomarker evidence",
        "search_terms": "diagnosis dementia Alzheimer diagnostic guidelines",
        "labels": ["passage_retrieval", "alzheimer_criteria"],
    },
    {
        "query": "Matrix metalloproteinases participate in remyelination by processing inhibitory proteoglycans",
        "search_terms": "matrix metalloproteinase remyelination NG2",
        "labels": ["passage_retrieval", "remyelination"],
    },
    {
        "query": "Hippocampal dendritic structure undergoes dynamic remodeling during development",
        "search_terms": "dendritic structure hippocampal development",
        "labels": ["passage_retrieval", "neuronal_development"],
    },
    {
        "query": "Machine learning models can predict intraoperative hypoxemia using preoperative patient features",
        "search_terms": "machine learning hypoxaemia surgery prediction",
        "labels": ["passage_retrieval", "clinical_prediction"],
    },
    {
        "query": "Central nervous system tumors are classified according to WHO grading criteria based on histological features",
        "search_terms": "WHO classification tumours central nervous system",
        "labels": ["passage_retrieval", "neuro_oncology"],
    },
    {
        "query": "Diabetes management standards require individualized glycemic targets",
        "search_terms": "standards medical care diabetes",
        "labels": ["passage_retrieval", "diabetes_management"],
    },
    {
        "query": "COPD is characterized by progressive decline in lung function over time",
        "search_terms": "lung function decline COPD",
        "labels": ["passage_retrieval", "copd_progression"],
    },
]

# ---------------------------------------------------------------------------
# Question evidence seeds: interrogative clinical questions for question_lookup
# These are NEW seeds distinct from QUESTION_LOOKUP_SEEDS (already in clinical_evidence_v2)
# ---------------------------------------------------------------------------
QUESTION_EVIDENCE_SEEDS: list[dict[str, object]] = [
    {
        "query": "What is the mechanism of action of lithium in bipolar disorder?",
        "search_terms": "lithium mechanism bipolar",
        "labels": ["question_evidence", "mechanism"],
    },
    {
        "query": "How does delirium differ from dementia on electroencephalography?",
        "search_terms": "delirium dementia EEG differentiation",
        "labels": ["question_evidence", "differential_diagnosis"],
    },
    {
        "query": "Why are benzodiazepines considered first-line treatment for catatonia?",
        "search_terms": "benzodiazepine catatonia first-line",
        "labels": ["question_evidence", "treatment_rationale"],
    },
    {
        "query": "What percentage of autoimmune encephalitis cases present with psychiatric symptoms first?",
        "search_terms": "autoimmune encephalitis psychiatric presentation prevalence",
        "labels": ["question_evidence", "epidemiology"],
    },
    {
        "query": "Which antipsychotics have the lowest risk of metabolic side effects?",
        "search_terms": "antipsychotic metabolic side effect comparison",
        "labels": ["question_evidence", "drug_safety"],
    },
    {
        "query": "How is neuroleptic malignant syndrome diagnosed and distinguished from serotonin syndrome?",
        "search_terms": "neuroleptic malignant syndrome diagnosis serotonin syndrome",
        "labels": ["question_evidence", "diagnostic_workup"],
    },
    {
        "query": "What are the neuropsychiatric manifestations of systemic lupus erythematosus?",
        "search_terms": "neuropsychiatric lupus erythematosus manifestations",
        "labels": ["question_evidence", "autoimmune_neuro"],
    },
    {
        "query": "Does electroconvulsive therapy work for treatment-resistant catatonia?",
        "search_terms": "electroconvulsive therapy catatonia treatment-resistant",
        "labels": ["question_evidence", "treatment_efficacy"],
    },
    {
        "query": "What is the role of NMDA receptor antibodies in new-onset psychosis?",
        "search_terms": "NMDA receptor antibody psychosis",
        "labels": ["question_evidence", "biomarker"],
    },
    {
        "query": "What cognitive domains are affected in HIV-associated neurocognitive disorder?",
        "search_terms": "HIV neurocognitive disorder cognitive domains",
        "labels": ["question_evidence", "infectious_neuro"],
    },
    {
        "query": "How should clozapine be initiated and monitored for treatment-resistant schizophrenia?",
        "search_terms": "clozapine initiation monitoring schizophrenia",
        "labels": ["question_evidence", "prescribing"],
    },
    {
        "query": "What is the evidence for transcranial magnetic stimulation in major depressive disorder?",
        "search_terms": "transcranial magnetic stimulation depression",
        "labels": ["question_evidence", "neuromodulation"],
    },
]

# ---------------------------------------------------------------------------
# Semantic recall seeds: paraphrased/colloquial queries where FTS fails
# but dense vector similarity should succeed (different terminology)
# ---------------------------------------------------------------------------
SEMANTIC_RECALL_SEEDS: list[dict[str, object]] = [
    {
        "query": "brain inflammation after COVID infection",
        "search_terms": "neuroinflammation SARS-CoV-2",
        "labels": ["semantic_recall", "paraphrased"],
    },
    {
        "query": "liver problems from psychiatric medications",
        "search_terms": "hepatotoxicity psychotropic",
        "labels": ["semantic_recall", "paraphrased"],
    },
    {
        "query": "memory loss after surgery in elderly patients",
        "search_terms": "postoperative cognitive dysfunction",
        "labels": ["semantic_recall", "paraphrased"],
    },
    {
        "query": "why patients refuse to take their psychiatric medications",
        "search_terms": "treatment nonadherence anosognosia",
        "labels": ["semantic_recall", "paraphrased"],
    },
    {
        "query": "brain zaps from stopping antidepressants",
        "search_terms": "SSRI discontinuation syndrome",
        "labels": ["semantic_recall", "colloquial"],
    },
    {
        "query": "acting out dreams during sleep and hitting bed partner",
        "search_terms": "REM sleep behavior disorder",
        "labels": ["semantic_recall", "colloquial"],
    },
    {
        "query": "shaking hands from too much lithium",
        "search_terms": "lithium toxicity tremor",
        "labels": ["semantic_recall", "colloquial"],
    },
    {
        "query": "can't sit still as a side effect of antipsychotics",
        "search_terms": "akathisia antipsychotic",
        "labels": ["semantic_recall", "colloquial"],
    },
    {
        "query": "confused elderly patient who just had surgery",
        "search_terms": "postoperative delirium elderly",
        "labels": ["semantic_recall", "paraphrased"],
    },
    {
        "query": "personality change after head injury",
        "search_terms": "traumatic brain injury behavioral disturbance",
        "labels": ["semantic_recall", "paraphrased"],
    },
    {
        "query": "seeing things that aren't there in Parkinson's disease",
        "search_terms": "Parkinson disease psychosis visual hallucinations",
        "labels": ["semantic_recall", "colloquial"],
    },
    {
        "query": "involuntary tongue and jaw movements from long-term antipsychotic use",
        "search_terms": "tardive dyskinesia",
        "labels": ["semantic_recall", "colloquial"],
    },
]

# ---------------------------------------------------------------------------
# Entity/relation seeds: queries rich in specific biomedical entities
# Tests entity_match and relation_match retrieval channels
# ---------------------------------------------------------------------------
ENTITY_RELATION_SEEDS: list[dict[str, object]] = [
    {
        "query": "COMT Val158Met polymorphism and psychosis risk",
        "search_terms": "COMT Val158Met psychosis",
        "labels": ["entity_relation", "gene_variant"],
    },
    {
        "query": "CYP2D6 poor metabolizer status and haloperidol dosing",
        "search_terms": "CYP2D6 haloperidol metabolism",
        "labels": ["entity_relation", "pharmacogenomics"],
    },
    {
        "query": "anti-NMDAR encephalitis treatment with rituximab",
        "search_terms": "anti-NMDA receptor encephalitis rituximab",
        "labels": ["entity_relation", "immunotherapy"],
    },
    {
        "query": "lithium nephrotoxicity and chronic kidney disease progression",
        "search_terms": "lithium nephrotoxicity kidney",
        "labels": ["entity_relation", "drug_toxicity"],
    },
    {
        "query": "clozapine-induced myocarditis and cardiomyopathy",
        "search_terms": "clozapine myocarditis cardiomyopathy",
        "labels": ["entity_relation", "drug_adverse_effect"],
    },
    {
        "query": "APOE4 allele and risk of Alzheimer disease",
        "search_terms": "APOE4 Alzheimer risk",
        "labels": ["entity_relation", "genetic_risk"],
    },
    {
        "query": "serotonin transporter SLC6A4 and depression susceptibility",
        "search_terms": "SLC6A4 serotonin transporter depression",
        "labels": ["entity_relation", "gene_association"],
    },
    {
        "query": "dopamine D2 receptor occupancy and antipsychotic efficacy threshold",
        "search_terms": "dopamine D2 receptor occupancy antipsychotic",
        "labels": ["entity_relation", "receptor_pharmacology"],
    },
    {
        "query": "GABAergic interneuron dysfunction in schizophrenia pathophysiology",
        "search_terms": "GABA interneuron schizophrenia",
        "labels": ["entity_relation", "neurotransmitter"],
    },
    {
        "query": "BDNF Val66Met polymorphism and ketamine antidepressant response",
        "search_terms": "BDNF Val66Met ketamine",
        "labels": ["entity_relation", "pharmacogenomics"],
    },
    {
        "query": "TNF-alpha mediated neuroinflammation in major depressive disorder",
        "search_terms": "TNF-alpha neuroinflammation depression",
        "labels": ["entity_relation", "inflammatory_pathway"],
    },
    {
        "query": "HLA-B*15:02 allele and carbamazepine-induced Stevens-Johnson syndrome",
        "search_terms": "HLA-B*15:02 carbamazepine Stevens-Johnson",
        "labels": ["entity_relation", "pharmacogenomics"],
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

BIOMEDICAL_NARRATIVE_SEEDS: list[dict[str, object]] = [
    {
        "query": "Tell me about prednisone neuropsychiatric symptoms and the evidence base for management.",
        "search_terms": "corticosteroid psychosis psychiatric",
        "labels": ["biomedical_narrative", "steroid_neuropsychiatric"],
    },
    *[
        {
            **seed,
            "labels": ["biomedical_narrative", *list(seed.get("labels", []))],
        }
        for seed in QUESTION_EVIDENCE_SEEDS
    ],
    *[
        {
            **seed,
            "labels": ["biomedical_narrative", *list(seed.get("labels", []))],
        }
        for seed in CLINICAL_ACTIONABLE_SEEDS[:11]
    ],
    *[
        {
            **seed,
            "labels": ["biomedical_narrative", *list(seed.get("labels", []))],
        }
        for seed in NEUROPSYCH_SAFETY_SEEDS[:12]
    ],
]

EXPERT_CANONICALIZATION_BUCKET_SEEDS: dict[str, list[dict[str, object]]] = {
    "hurried_adverse_effect": [
        {
            "query": "can't sit still from antipsychotics",
            "search_terms": "akathisia antipsychotic",
        },
        {
            "query": "tongue and jaw movements after years on antipsychotics",
            "search_terms": "tardive dyskinesia",
        },
        {
            "query": "psych meds wrecking the liver",
            "search_terms": "hepatotoxicity psychotropic",
        },
        {
            "query": "shaky hands and confusion from too much lithium",
            "search_terms": "lithium toxicity tremor",
        },
        {
            "query": "sodium crashed after starting an SSRI",
            "search_terms": "hyponatremia SSRI elderly",
        },
        {
            "query": "chest pain after starting clozapine",
            "search_terms": "clozapine myocarditis cardiomyopathy",
        },
        {
            "query": "blowing up in weight on olanzapine",
            "search_terms": "antipsychotic metabolic side effect comparison",
        },
        {
            "query": "valproate messing up cycles and ovaries",
            "search_terms": "valproate polycystic ovary syndrome",
        },
    ],
    "steroid_psychiatric": [
        {
            "query": "prednisone neuropsychiatric symptoms",
            "corpus_id": 22223484,
        },
        {
            "query": "steroid psychosis",
            "corpus_id": 4796980,
        },
        {
            "query": "mania after high-dose dex",
            "search_terms": "dexamethasone psychiatric adverse effects",
        },
        {
            "query": "glucocorticoids causing agitation and insomnia",
            "search_terms": "glucocorticoid insomnia agitation",
        },
        {
            "query": "delirious after starting steroids",
            "corpus_id": 42693220,
        },
        {
            "query": "cognitive slowing after long steroid exposure",
            "corpus_id": 31227842,
        },
        {
            "query": "acute psychosis on low-dose prednisone",
            "corpus_id": 245632027,
        },
        {
            "query": "depressed after chronic steroids",
            "search_terms": "corticosteroid induced depression",
        },
    ],
    "post_infectious_neuroinflammation": [
        {
            "query": "brain inflammation after COVID infection",
            "search_terms": "neuroinflammation SARS-CoV-2",
        },
        {
            "query": "new psych symptoms after HSV encephalitis",
            "search_terms": "autoimmune encephalitis herpes simplex",
        },
        {
            "query": "lupus hitting the brain",
            "search_terms": "neuropsychiatric lupus erythematosus manifestations",
        },
        {
            "query": "HIV brain fog and executive dysfunction",
            "search_terms": "HIV neurocognitive disorder cognitive domains",
        },
        {
            "query": "cytokine-driven depression",
            "corpus_id": 15661883,
        },
        {
            "query": "inflammation biology in Parkinson disease",
            "search_terms": "neuroinflammation Parkinson pathogenesis",
        },
        {
            "query": "psychosis from autoimmune brain inflammation",
            "search_terms": "autoimmune encephalitis psychosis",
        },
        {
            "query": "NMDA antibodies in new psychosis",
            "search_terms": "NMDA receptor antibody psychosis",
        },
    ],
    "autoimmune_encephalitis_fep": [
        {
            "query": "anti-NMDAR encephalitis psychosis first episode",
            "search_terms": "anti-NMDA receptor encephalitis psychiatric",
        },
        {
            "query": "anti-NMDAR encephalitis treatment with rituximab",
            "search_terms": "anti-NMDA receptor encephalitis rituximab",
        },
        {
            "query": "first-break psychosis but maybe autoimmune",
            "search_terms": "autoimmune encephalitis psychosis",
        },
        {
            "query": "seizure psychosis dyskinesia teratoma pattern",
            "search_terms": "anti-NMDA receptor encephalitis neuropsychiatric",
        },
        {
            "query": "when to send neuronal antibody testing in FEP",
            "search_terms": "NMDA receptor antibody psychosis",
        },
        {
            "query": "EEG in autoimmune encephalitis vs viral",
            "search_terms": "autoimmune encephalitis EEG",
        },
        {
            "query": "paraneoplastic psychosis workup",
            "search_terms": "psychiatric symptoms cancer paraneoplastic",
        },
        {
            "query": "how often autoimmune encephalitis starts as psych",
            "search_terms": "autoimmune encephalitis psychiatric presentation prevalence",
        },
    ],
    "delirium_agitation_catatonia": [
        {
            "query": "delirium or primary psychosis on the ward",
            "search_terms": "delirium psychosis differential",
        },
        {
            "query": "workup for possible catatonia on psych",
            "search_terms": "catatonia workup psychiatric",
        },
        {
            "query": "lorazepam challenge for catatonia",
            "search_terms": "lorazepam catatonia diagnosis",
        },
        {
            "query": "why benzos are first-line for catatonia",
            "search_terms": "benzodiazepine catatonia first-line",
        },
        {
            "query": "confused older adult right after surgery",
            "search_terms": "postoperative delirium elderly",
        },
        {
            "query": "delirium vs dementia on EEG",
            "search_terms": "delirium dementia EEG differentiation",
        },
        {
            "query": "does psych consult actually help ICU delirium",
            "corpus_id": 46873301,
        },
        {
            "query": "capacity assessment in a delirious patient",
            "search_terms": "capacity assessment delirium",
        },
    ],
    "withdrawal_discontinuation": [
        {
            "query": "brain zaps after stopping antidepressants",
            "search_terms": "SSRI discontinuation syndrome",
        },
        {
            "query": "coming off venlafaxine feels electric",
            "search_terms": "antidepressant discontinuation syndrome",
        },
        {
            "query": "benzo withdrawal seizures",
            "search_terms": "benzodiazepine withdrawal seizure",
        },
        {
            "query": "managing benzo withdrawal in the ICU",
            "corpus_id": 216375828,
        },
        {
            "query": "rebound panic after stopping SSRIs",
            "search_terms": "SSRI discontinuation syndrome",
        },
        {
            "query": "dizzy flu-like symptoms after stopping an antidepressant",
            "search_terms": "antidepressant discontinuation syndrome",
        },
        {
            "query": "bad withdrawal in the ICU despite benzos",
            "corpus_id": 6134739,
        },
        {
            "query": "autonomic surge after sedative withdrawal",
            "search_terms": "benzodiazepine withdrawal syndrome",
        },
    ],
    "movement_disorder_eps": [
        {
            "query": "EPS or akathisia from antipsychotics",
            "search_terms": "akathisia antipsychotic",
        },
        {
            "query": "acute dystonic reaction after haldol",
            "search_terms": "acute dystonic reaction antipsychotic treatment",
        },
        {
            "query": "D2 occupancy threshold for antipsychotic response",
            "search_terms": "dopamine D2 receptor occupancy antipsychotic",
        },
        {
            "query": "VMAT2 inhibitor for tardive dyskinesia",
            "search_terms": "tardive dyskinesia VMAT2 inhibitor",
        },
        {
            "query": "DBS circuit effects in dystonia",
            "search_terms": "deep brain stimulation dystonia basal ganglia",
        },
        {
            "query": "neuroleptic sensitivity in Lewy body disease",
            "search_terms": "neuroleptic sensitivity Lewy body",
        },
        {
            "query": "restless legs getting worse on psych meds",
            "corpus_id": 247412628,
        },
        {
            "query": "visual hallucinations in PD psychosis",
            "search_terms": "Parkinson disease psychosis visual hallucinations",
        },
    ],
    "abbreviation_heavy_specialist": [
        {
            "query": "COMT Val158Met and psychosis risk",
            "search_terms": "COMT Val158Met psychosis",
        },
        {
            "query": "CYP2D6 PM status on haldol",
            "search_terms": "CYP2D6 haloperidol metabolism",
        },
        {
            "query": "HLA-B*15:02 and carbamazepine SJS",
            "search_terms": "HLA-B*15:02 carbamazepine Stevens-Johnson",
        },
        {
            "query": "APOE4 risk biology in AD",
            "search_terms": "APOE4 Alzheimer risk",
        },
        {
            "query": "SLC6A4 and depression susceptibility",
            "search_terms": "SLC6A4 serotonin transporter depression",
        },
        {
            "query": "BDNF Val66Met and ketamine response",
            "search_terms": "BDNF Val66Met ketamine",
        },
        {
            "query": "GABA interneuron dysfunction in schizophrenia",
            "search_terms": "GABA interneuron schizophrenia",
        },
        {
            "query": "TNF-alpha neuroinflammation in MDD",
            "corpus_id": 12723295,
        },
    ],
}

BIOMEDICAL_EXPERT_CANONICALIZATION_SEEDS: list[dict[str, object]] = [
    {
        **seed,
        "labels": [
            "expert_canonicalization",
            bucket,
            *list(seed.get("labels", [])),
        ],
    }
    for bucket, bucket_seeds in EXPERT_CANONICALIZATION_BUCKET_SEEDS.items()
    for seed in bucket_seeds
]


def _dataset_item_id(
    report: RagRuntimeEvalBenchmarkReport,
    case: RuntimeEvalBenchmarkCase,
    *,
    duplicate_logical_keys: set[tuple[int, str]],
) -> str:
    family_key = str(case.query_family)
    base_id = f"{report.benchmark_key}:{case.corpus_id}:{family_key}"
    if (case.corpus_id, family_key) not in duplicate_logical_keys:
        return base_id
    query_hash = hashlib.sha1(case.query.encode("utf-8")).hexdigest()[:10]
    return f"{base_id}:{query_hash}"


def _iter_langfuse_dataset_items(
    client,
    *,
    dataset_name: str,
    page_size: int = 100,
) -> list[object]:
    dataset_items_api = getattr(getattr(client, "api", None), "dataset_items", None)
    if dataset_items_api is None:
        return []

    items: list[object] = []
    page = 1
    while True:
        response = dataset_items_api.list(
            dataset_name=dataset_name,
            page=page,
            limit=page_size,
        )
        batch = getattr(response, "data", response) or []
        if not batch:
            break
        items.extend(batch)
        if len(batch) < page_size:
            break
        page += 1
    return items


def _prune_stale_langfuse_dataset_items(
    client,
    *,
    dataset_name: str,
    keep_item_ids: set[str],
) -> int:
    dataset_items_api = getattr(getattr(client, "api", None), "dataset_items", None)
    if dataset_items_api is None:
        return 0

    stale_ids = [
        str(getattr(item, "id", ""))
        for item in _iter_langfuse_dataset_items(client, dataset_name=dataset_name)
        if str(getattr(item, "id", "")) not in keep_item_ids
    ]
    for item_id in stale_ids:
        dataset_items_api.delete(id=item_id)
    return len(stale_ids)


def _push_report_to_langfuse(report: RagRuntimeEvalBenchmarkReport) -> bool:
    """Push a benchmark report directly to Langfuse as a dataset.

    Creates the dataset and all items with ``primary_source_system`` in both
    ``expected_output`` and ``metadata`` so evaluators can read it from either.

    Returns True if push succeeded, False otherwise (graceful degradation).
    """
    if report.selected_count <= 0 or not report.cases:
        logger.warning(
            "Benchmark '%s' has no cases — refusing empty Langfuse dataset push",
            report.benchmark_key,
        )
        return False
    try:
        from app.langfuse_config import get_langfuse

        client = get_langfuse()
        if client is None:
            logger.warning("Langfuse not available — skipping dataset push")
            return False

        dataset_name = f"benchmark-{report.benchmark_key}"
        suite_spec = get_benchmark_suite_spec(report.benchmark_key)
        lower_gates, upper_gates = benchmark_suite_gate_maps(report.benchmark_key)
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
                "selected_count": report.selected_count,
                "selected_by_label": report.selected_by_label,
                "suite_family": suite_spec.suite_family if suite_spec else None,
                "gate_mode": suite_spec.gate_mode if suite_spec else None,
                "target_case_count": (
                    suite_spec.target_case_count if suite_spec else report.selected_count
                ),
                "acceptance_focus": (
                    suite_spec.acceptance_focus if suite_spec else None
                ),
                "quality_gate_lower_bounds": lower_gates,
                "quality_gate_upper_bounds": upper_gates,
            },
        )

        logical_key_counts = Counter(
            (case.corpus_id, str(case.query_family))
            for case in report.cases
        )
        duplicate_logical_keys = {
            key for key, count in logical_key_counts.items() if count > 1
        }
        expected_item_ids = {
            _dataset_item_id(
                report,
                case,
                duplicate_logical_keys=duplicate_logical_keys,
            )
            for case in report.cases
        }
        pruned_count = _prune_stale_langfuse_dataset_items(
            client,
            dataset_name=dataset_name,
            keep_item_ids=expected_item_ids,
        )

        def _langfuse_case_metadata(case: RuntimeEvalBenchmarkCase) -> dict[str, object]:
            return {
                "qf": str(case.query_family),
                "src": case.primary_source_system,
                "cov": case.coverage_bucket,
                "wd": case.warehouse_depth,
                "part": case.evaluation_partition,
            }

        for case in report.cases:
            input_data: dict[str, object] = {
                "query": case.query,
                "query_family": str(case.query_family),
            }
            if case.selected_layer_key:
                input_data["selected_layer_key"] = case.selected_layer_key
            if case.selected_node_id is not None:
                input_data["selected_node_id"] = case.selected_node_id
            if case.selection_graph_paper_refs:
                input_data["selection_graph_paper_refs"] = case.selection_graph_paper_refs
            if case.cited_corpus_ids:
                input_data["cited_corpus_ids"] = case.cited_corpus_ids
            if case.evidence_intent:
                input_data["evidence_intent"] = str(case.evidence_intent)
            expected_output = {
                "corpus_id": case.corpus_id,
                "title": case.title,
                "normalized_title_key": case.normalized_title_key,
                "primary_source_system": case.primary_source_system,
                "expected_retrieval_profile": case.expected_retrieval_profile,
                "coverage_bucket": case.coverage_bucket,
                "warehouse_depth": case.warehouse_depth,
                "evaluation_partition": case.evaluation_partition,
                "benchmark_key": case.benchmark_key,
                "benchmark_labels": case.benchmark_labels,
                "stratum_key": case.stratum_key,
            }
            item_id = _dataset_item_id(
                report,
                case,
                duplicate_logical_keys=duplicate_logical_keys,
            )
            client.create_dataset_item(
                dataset_name=dataset_name,
                id=item_id,
                input=input_data,
                expected_output=expected_output,
                metadata=_langfuse_case_metadata(case),
            )

        client.flush()
        logger.info(
            "Pushed %d items to Langfuse dataset '%s' (pruned %d stale items)",
            len(report.cases),
            dataset_name,
            pruned_count,
        )
        return True
    except Exception:
        logger.warning("Failed to push to Langfuse", exc_info=True)
        return False


def _load_existing_corpus_ids(
    benchmark_dir: Path,
    *,
    exclude_benchmark_keys: set[str] | None = None,
) -> set[int]:
    """Load corpus_ids from other benchmark snapshots to ensure disjointness."""
    existing: set[int] = set()
    excluded_keys = exclude_benchmark_keys or set()
    for path in sorted(benchmark_dir.glob("*.json")):
        try:
            report, cases = load_runtime_eval_benchmark_cases(path)
            if report.benchmark_key in excluded_keys:
                continue
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
WITH resolved_query AS (
    SELECT websearch_to_tsquery('english', %s) AS tsq
)
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system,
       ts_rank_cd(p.fts_vector, resolved_query.tsq) AS fts_rank
FROM resolved_query
JOIN solemd.graph_points grp ON TRUE
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND p.fts_vector @@ resolved_query.tsq
ORDER BY fts_rank DESC, p.citation_count DESC NULLS LAST
LIMIT 1
"""

_PAPER_FOR_QUERY_WAREHOUSE_WITH_CHUNKS_SQL = """
WITH resolved_query AS (
    SELECT websearch_to_tsquery('english', %s) AS tsq
)
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system,
       ts_rank_cd(p.fts_vector, resolved_query.tsq) AS fts_rank
FROM resolved_query
JOIN solemd.graph_points grp ON TRUE
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND p.fts_vector @@ resolved_query.tsq
  AND EXISTS (
    SELECT 1 FROM solemd.paper_chunks pc
    WHERE pc.corpus_id = p.corpus_id
  )
ORDER BY fts_rank DESC, p.citation_count DESC NULLS LAST
LIMIT 1
"""

_PAPER_FOR_QUERY_ANY_SQL = """
WITH resolved_query AS (
    SELECT websearch_to_tsquery('english', %s) AS tsq
)
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system,
       ts_rank_cd(p.fts_vector, resolved_query.tsq) AS fts_rank
FROM resolved_query
JOIN solemd.graph_points grp ON TRUE
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
LEFT JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND p.fts_vector @@ resolved_query.tsq
ORDER BY fts_rank DESC, p.citation_count DESC NULLS LAST
LIMIT 1
"""

_PAPER_BY_CORPUS_ID_SQL = """
SELECT p.corpus_id, p.title,
       COALESCE(pd.primary_source_system, 's2orc_v2') AS source_system
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
LEFT JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id = %s
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
            (query, graph_run_id, list(exclude_corpus_ids)),
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
            (query, graph_run_id, list(exclude_corpus_ids)),
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
        (query, graph_run_id, list(exclude_corpus_ids)),
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


def _resolve_paper_for_corpus_id(
    *,
    cursor,
    graph_run_id: str,
    corpus_id: int,
    require_warehouse: bool = False,
    require_chunks: bool = False,
    exclude_warehouse: bool = False,
) -> dict[str, object] | None:
    cursor.execute(
        _PAPER_BY_CORPUS_ID_SQL,
        (graph_run_id, corpus_id),
    )
    row = cursor.fetchone()
    if row is None:
        return None

    has_warehouse = row["source_system"] is not None and row["source_system"] != "s2orc_v2"
    has_chunks = _check_has_chunks(cursor, corpus_id)

    if require_chunks and not has_chunks:
        return None
    if require_warehouse and not has_warehouse:
        return None
    if exclude_warehouse and has_warehouse:
        return None

    return {
        "corpus_id": corpus_id,
        "title": row["title"],
        "primary_source_system": str(row["source_system"]),
        "has_warehouse": has_warehouse,
        "has_chunks": has_chunks,
    }


def _build_curated_benchmark(
    *,
    benchmark_key: str,
    benchmark_source: str,
    release,
    chunk_version_key: str,
    cases: list[RuntimeEvalBenchmarkCase],
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    connect_fn = connect or db.pooled
    coverage_by_corpus_id = load_live_benchmark_case_coverage(
        corpus_ids=[case.corpus_id for case in cases],
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    hydrated_cases: list[RuntimeEvalBenchmarkCase] = []
    label_counts: Counter[str] = Counter()
    for case in cases:
        coverage = coverage_by_corpus_id.get(case.corpus_id)
        if coverage is None:
            hydrated_case = case
        else:
            update_payload = {
                "normalized_title_key": coverage.normalized_title_key,
                "has_chunks": coverage.has_chunks,
                "has_entities": coverage.has_entities,
                "has_sentence_seed": coverage.has_sentence_seed,
                "coverage_bucket": coverage.coverage_bucket,
                "warehouse_depth": coverage.warehouse_depth,
            }
            if coverage.primary_source_system:
                update_payload["primary_source_system"] = coverage.primary_source_system
            hydrated_case = case.model_copy(update=update_payload)
        hydrated_cases.append(hydrated_case)
    for case in hydrated_cases:
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
        selected_count=len(hydrated_cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=hydrated_cases,
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
    expected_retrieval_profile: str | None = None,
) -> RuntimeEvalBenchmarkCase | None:
    """Resolve a single seed dict into a benchmark case, or None if unresolvable."""
    query = str(seed["query"]) if "query" in seed else ""
    paper: dict[str, object] | None
    seed_corpus_id = seed.get("corpus_id")
    if seed_corpus_id is not None:
        corpus_id = int(seed_corpus_id)
        if corpus_id in excluded:
            return None
        paper = _resolve_paper_for_corpus_id(
            cursor=cursor,
            graph_run_id=graph_run_id,
            corpus_id=corpus_id,
            require_warehouse=not exclude_warehouse and require_chunks,
            require_chunks=require_chunks,
            exclude_warehouse=exclude_warehouse,
        )
    else:
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
        expected_retrieval_profile=expected_retrieval_profile,
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
                expected_retrieval_profile="title_lookup",
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
                selected_layer_key="paper",
                selected_node_id=f"paper:{corpus_id}",
                benchmark_key="title_retrieval_v2",
                benchmark_labels=sorted(set(labels)),
                failure_count=0, min_target_rank=0, max_target_rank=0,
                mean_target_rank=0.0, source_lane_keys=[],
                expected_retrieval_profile="title_lookup",
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
                expected_retrieval_profile="question_lookup",
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


def build_biomedical_narrative_v1(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """General clinician-style biomedical narrative questions."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in BIOMEDICAL_NARRATIVE_SEEDS:
            query = str(seed.get("query", ""))
            expected_profile = (
                "question_lookup" if query.strip().endswith("?") else "general"
            )
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="biomedical_narrative_v1",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                expected_retrieval_profile=expected_profile,
            )
            if case is None:
                print(f"  SKIP (no match): {query[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    expected_case_count = len(BIOMEDICAL_NARRATIVE_SEEDS)
    if len(cases) != expected_case_count:
        raise ValueError(
            f"biomedical_narrative_v1 produced {len(cases)} cases; "
            f"expected {expected_case_count}"
        )

    return _build_curated_benchmark(
        benchmark_key="biomedical_narrative_v1",
        benchmark_source=(
            "General biomedical narrative QA benchmark combining clinician-style "
            "questions, management prompts, and neuropsychiatric safety prompts"
        ),
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_biomedical_expert_canonicalization_v1(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Expert shorthand, synonym, and abbreviation stress tests."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in BIOMEDICAL_EXPERT_CANONICALIZATION_SEEDS:
            query = str(seed.get("query", ""))
            expected_profile = (
                "question_lookup" if query.strip().endswith("?") else "general"
            )
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="biomedical_expert_canonicalization_v1",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                expected_retrieval_profile=expected_profile,
            )
            if case is None:
                print(f"  SKIP (no match): {query[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    expected_case_count = len(BIOMEDICAL_EXPERT_CANONICALIZATION_SEEDS)
    if len(cases) != expected_case_count:
        raise ValueError(
            "biomedical_expert_canonicalization_v1 produced "
            f"{len(cases)} cases; expected {expected_case_count}"
        )

    return _build_curated_benchmark(
        benchmark_key="biomedical_expert_canonicalization_v1",
        benchmark_source=(
            "Expert-language canonicalization benchmark covering hurried adverse "
            "effect phrasing, neuroimmune shorthand, autoimmune encephalitis / "
            "FEP prompts, withdrawal language, movement-disorder shorthand, and "
            "abbreviation-heavy specialist queries"
        ),
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
        for seed in PASSAGE_RETRIEVAL_SEEDS:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="passage_retrieval_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                require_chunks=True,
                expected_retrieval_profile="passage_lookup",
            )
            if case is None:
                print(f"  SKIP (no match): {seed.get('query', '?')[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="passage_retrieval_v2",
        benchmark_source="Passage-level retrieval, chunk-gated, natural language claims",
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
                expected_retrieval_profile="general",
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
                expected_retrieval_profile="general",
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
        p.fts_vector
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


def build_question_evidence_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Interrogative clinical questions testing question_lookup routing."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in QUESTION_EVIDENCE_SEEDS:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="question_evidence_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                expected_retrieval_profile="question_lookup",
            )
            if case is None:
                print(f"  SKIP (no match): {seed.get('query', '?')[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="question_evidence_v2",
        benchmark_source="Interrogative clinical questions — question_lookup routing",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_semantic_recall_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Paraphrased/colloquial queries testing dense vector retrieval channel."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in SEMANTIC_RECALL_SEEDS:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="semantic_recall_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                expected_retrieval_profile="general",
            )
            if case is None:
                print(f"  SKIP (no match): {seed.get('query', '?')[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="semantic_recall_v2",
        benchmark_source="Paraphrased/colloquial queries — dense vector recall isolation",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_entity_relation_v2(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """V2: Entity/gene/drug-rich queries testing entity_match and relation_match channels."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in ENTITY_RELATION_SEEDS:
            case = _resolve_seed_item(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                seed=seed,
                excluded=excluded,
                benchmark_key="entity_relation_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                expected_retrieval_profile="general",
            )
            if case is None:
                print(f"  SKIP (no match): {seed.get('query', '?')[:60]}")
                continue
            cases.append(case)
            excluded.add(case.corpus_id)

    return _build_curated_benchmark(
        benchmark_key="entity_relation_v2",
        benchmark_source="Entity/gene/drug queries — entity_match and relation_match isolation",
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
            "biomedical_optimization_v3",
            "biomedical_holdout_v1",
            "biomedical_citation_context_v1",
            "biomedical_narrative_v1",
            "biomedical_expert_canonicalization_v1",
            "biomedical_metadata_retrieval_v1",
            "biomedical_evidence_type_v1",
            "title_retrieval_v2", "clinical_evidence_v2", "passage_retrieval_v2",
            "adversarial_routing_v2", "keyword_search_v2", "abstract_stratum_v2",
            "question_evidence_v2", "semantic_recall_v2", "entity_relation_v2",
        ],
        choices=[
            # V2 suites (default)
            "biomedical_optimization_v3",
            "biomedical_holdout_v1",
            "biomedical_citation_context_v1",
            "biomedical_narrative_v1",
            "biomedical_expert_canonicalization_v1",
            "biomedical_metadata_retrieval_v1",
            "biomedical_evidence_type_v1",
            "title_retrieval_v2", "clinical_evidence_v2", "passage_retrieval_v2",
            "adversarial_routing_v2", "keyword_search_v2", "abstract_stratum_v2",
            "question_evidence_v2", "semantic_recall_v2", "entity_relation_v2",
            # V1 suites (legacy, kept for backward compat)
            "title_global", "title_selected", "adversarial_router", "neuropsych_safety",
            "question_lookup", "general_profile", "abstract_only",
            "sentence_hard", "evidence_intent", "clinical_actionable",
        ],
    )
    parser.add_argument(
        "--optimization-paper-sample-size",
        type=int,
        default=120,
        help="Maximum covered papers to sample for biomedical_optimization_v3.",
    )
    parser.add_argument(
        "--optimization-sample-seed",
        type=int,
        default=7,
        help="Deterministic sampling seed for biomedical_optimization_v3.",
    )
    parser.add_argument(
        "--holdout-paper-sample-size",
        type=int,
        default=48,
        help="Disjoint covered papers to reserve/build for biomedical_holdout_v1.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    import app.langfuse_config  # noqa: F401 — centralized Langfuse logging config
    from app.langfuse_config import ensure_score_configs

    args = _parse_args(argv)
    output_dir: Path = args.output_dir
    requested_suites = list(dict.fromkeys(args.suites))
    if {
        "biomedical_optimization_v3",
        "biomedical_holdout_v1",
    }.issubset(requested_suites):
        requested_suites = [
            suite_name
            for suite_name in requested_suites
            if suite_name != "biomedical_holdout_v1"
        ]
        requested_suites.insert(
            requested_suites.index("biomedical_optimization_v3") + 1,
            "biomedical_holdout_v1",
        )

    # Register all score configs in Langfuse (idempotent)
    ensure_score_configs()

    existing_corpus_ids = _load_existing_corpus_ids(
        output_dir,
        exclude_benchmark_keys=set(requested_suites),
    )
    print(f"Existing corpus_ids across benchmarks: {len(existing_corpus_ids)}")

    excluded = set(existing_corpus_ids)
    connect = db.pooled

    builders = {
        # V2 consolidated suites (abstract-first, signal-complete)
        "biomedical_optimization_v3": (
            lambda **kwargs: build_biomedical_optimization_benchmark(
                paper_sample_size=args.optimization_paper_sample_size,
                reserve_holdout_papers=(
                    args.holdout_paper_sample_size
                    if "biomedical_holdout_v1" in requested_suites
                    else 0
                ),
                sample_seed=args.optimization_sample_seed,
                **kwargs,
            ),
            "biomedical_optimization_v3.json",
        ),
        "biomedical_holdout_v1": (
            lambda **kwargs: build_biomedical_holdout_benchmark(
                paper_sample_size=args.holdout_paper_sample_size,
                sample_seed=args.optimization_sample_seed + 10,
                optimize_benchmark_path=(
                    BENCHMARK_DIR / "biomedical_optimization_v3.json"
                ),
                **kwargs,
            ),
            "biomedical_holdout_v1.json",
        ),
        "biomedical_citation_context_v1": (
            lambda **kwargs: build_citation_context_benchmark(
                source_benchmark_path=(BENCHMARK_DIR / "biomedical_holdout_v1.json"),
                **kwargs,
            ),
            "biomedical_citation_context_v1.json",
        ),
        "biomedical_narrative_v1": (
            build_biomedical_narrative_v1,
            "biomedical_narrative_v1.json",
        ),
        "biomedical_expert_canonicalization_v1": (
            build_biomedical_expert_canonicalization_v1,
            "biomedical_expert_canonicalization_v1.json",
        ),
        "biomedical_metadata_retrieval_v1": (
            build_biomedical_metadata_retrieval_benchmark,
            "biomedical_metadata_retrieval_v1.json",
        ),
        "biomedical_evidence_type_v1": (
            build_biomedical_evidence_type_benchmark,
            "biomedical_evidence_type_v1.json",
        ),
        "title_retrieval_v2": (build_title_retrieval_v2, "title_retrieval_v2.json"),
        "clinical_evidence_v2": (build_clinical_evidence_v2, "clinical_evidence_v2.json"),
        "passage_retrieval_v2": (build_passage_retrieval_v2, "passage_retrieval_v2.json"),
        "adversarial_routing_v2": (build_adversarial_routing_v2, "adversarial_routing_v2.json"),
        "keyword_search_v2": (build_keyword_search_v2, "keyword_search_v2.json"),
        "abstract_stratum_v2": (build_abstract_stratum_v2, "abstract_stratum_v2.json"),
        "question_evidence_v2": (build_question_evidence_v2, "question_evidence_v2.json"),
        "semantic_recall_v2": (build_semantic_recall_v2, "semantic_recall_v2.json"),
        "entity_relation_v2": (build_entity_relation_v2, "entity_relation_v2.json"),
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

    overlap_allowed_suites = {
        "biomedical_optimization_v3",
        "biomedical_holdout_v1",
        "biomedical_citation_context_v1",
        "biomedical_narrative_v1",
        "biomedical_expert_canonicalization_v1",
        "biomedical_metadata_retrieval_v1",
        "biomedical_evidence_type_v1",
    }

    try:
        for suite_name in requested_suites:
            builder_fn, filename = builders[suite_name]
            print(f"\nBuilding {suite_name}...")
            suite_excluded = set() if suite_name in overlap_allowed_suites else excluded
            report = builder_fn(
                graph_release_id=args.graph_release_id,
                chunk_version_key=args.chunk_version_key,
                exclude_corpus_ids=suite_excluded,
                connect=connect,
            )
            if report.selected_count <= 0 or not report.cases:
                raise ValueError(
                    f"{suite_name} produced 0 cases; benchmark build is invalid"
                )
            if suite_name not in overlap_allowed_suites:
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
