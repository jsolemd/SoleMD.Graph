"""Entity rule taxonomy overhaul migration.

Dissolves behavior and neuropsych_disease families, reclassifies 28 concepts,
adds ~175 new entity rules across psychiatric, neurological, autoimmune,
metabolic, and iatrogenic domains, and future-proofs suicidality concepts
with pending_annotation confidence.

Usage:
    cd engine && uv run python engine/db/scripts/entity_rule_taxonomy_overhaul.py

Idempotent: uses UPDATE...WHERE and INSERT...ON CONFLICT DO NOTHING.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app import db

# fmt: off

# ---------------------------------------------------------------------------
# Reclassifications: (concept_id, new_family_key, new_canonical_name)
# ---------------------------------------------------------------------------

RECLASSIFICATIONS: list[tuple[str, str, str]] = [
    # 1A: Dissolve behavior family (13 rules → proper families)
    ("MESH:D003693", "psychiatric_disorder", "Delirium"),
    ("MESH:D002389", "psychiatric_disorder", "Catatonia"),
    ("MESH:D009771", "psychiatric_disorder", "OCD"),
    ("MESH:D010554", "neuropsych_symptom", "Aggression"),
    ("MESH:D007174", "neuropsych_symptom", "Impulsivity"),
    ("MESH:D003193", "neuropsych_symptom", "Compulsive Behaviors"),
    ("MESH:D003072", "neuropsych_symptom", "Cognitive Impairment"),
    ("MESH:D008569", "neuropsych_symptom", "Memory Impairment"),
    ("MESH:D006212", "neuropsych_symptom", "Hallucinations"),
    ("MESH:D010259", "neuropsych_symptom", "Paranoia"),
    ("MESH:D011595", "neuropsych_symptom", "Agitation"),
    ("MESH:D000073932", "neuropsych_symptom", "Compulsions"),
    ("MESH:D020921", "neuropsych_symptom", "Arousal Disorders"),
    ("MESH:D063726", "neuropsych_symptom", "Delusions"),

    # 1B: Dissolve neuropsych_disease family (5 rules → proper families)
    ("MESH:D000341", "psychiatric_disorder", "Affective Psychosis"),
    ("MESH:D000091323", "psychiatric_disorder", "PNES"),
    ("MESH:D017109", "iatrogenic_syndrome", "Akathisia"),
    ("MESH:D057174", "neurological_disorder", "Frontotemporal Dementia"),
    ("MESH:D004833", "neurological_disorder", "Epilepsy, Temporal Lobe"),

    # 1C: DSM-5 diagnoses miscategorized as symptoms (6 rules)
    ("MESH:D016584", "psychiatric_disorder", "Panic Disorder"),
    ("MESH:D010698", "psychiatric_disorder", "Phobic Disorders"),
    ("MESH:D014256", "psychiatric_disorder", "Trichotillomania"),
    ("MESH:D009155", "psychiatric_disorder", "Selective Mutism"),
    ("MESH:D010842", "psychiatric_disorder", "Pica"),
    ("MESH:D004775", "psychiatric_disorder", "Enuresis"),

    # 1D: Other misplacements (4 rules)
    ("MESH:D007319", "psychiatric_disorder", "Insomnia"),
    ("MESH:D006998", "psychiatric_disorder", "Hypochondriasis"),
    ("MESH:D060825", "neuropsych_symptom", "Mild Cognitive Impairment"),
    ("MESH:D003410", "neuropsych_symptom", "Crying"),
]

# ---------------------------------------------------------------------------
# New concept rules
# (entity_type, concept_id, canonical_name, family_key, confidence, min_citation_count)
#
# ON CONFLICT DO NOTHING — duplicates across sections are harmlessly skipped.
# Sections with explicit confidence/min_cite listed first so they win.
# ---------------------------------------------------------------------------

NEW_RULES: list[tuple[str, str, str, str, str, int]] = [
    # ══════════════════════════════════════════════════════════════
    # 1E: Primary psychiatric concepts
    # ══════════════════════════════════════════════════════════════

    # P0 — Critical gaps (>100K papers each)
    ("disease", "MESH:D003866", "Major Depressive Disorder", "psychiatric_disorder", "high", 0),
    ("disease", "MESH:D000438", "Alcohol Drinking", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D019966", "Substance-Related Disorders", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D003704", "Dementia", "neurological_disorder", "high", 0),
    ("disease", "MESH:D000437", "Alcoholism", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D012893", "Sleep Wake Disorders", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D001008", "Anxiety Disorders", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D001321", "Autistic Disorder", "psychiatric_disorder", "high", 5),

    # P1 — Major gaps (10K-100K papers)
    ("disease", "MESH:D000067877", "Autism Spectrum Disorder", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D000855", "Anorexia", "neuropsych_symptom", "high", 20),
    ("disease", "MESH:D000856", "Anorexia Nervosa", "psychiatric_disorder", "high", 0),
    ("disease", "MESH:D003221", "Confusion", "neuropsych_symptom", "high", 10),
    ("disease", "MESH:D021081", "Circadian Rhythm Sleep Disorders", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D013001", "Somatoform Disorders", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D013375", "Substance Withdrawal Syndrome", "neuropsych_symptom", "high", 10),
    ("disease", "MESH:D019052", "Depression, Postpartum", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D002032", "Bulimia", "neuropsych_symptom", "high", 10),
    ("disease", "MESH:D019970", "Cocaine-Related Disorders", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D020187", "REM Sleep Behavior Disorder", "neurological_disorder", "high", 5),
    ("disease", "MESH:D002189", "Cannabis-Related Disorders", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D019263", "Dysthymic Disorder", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D000071896", "Somatic Symptom Disorder", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D015775", "Self-Injurious Behavior", "neuropsych_symptom", "high", 10),

    # P2 — Important gaps (<10K papers)
    ("disease", "MESH:D019967", "Schizophrenia Spectrum Disorders", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D054062", "Schizotypal Personality Disorder", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D065886", "Neurodevelopmental Disorders", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D061218", "Treatment-Resistant Depression", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D012585", "Social Phobia", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D011605", "Substance-Induced Psychosis", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D012562", "Schizophrenia, Disorganized", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D016574", "Seasonal Affective Disorder", "psychiatric_disorder", "high", 5),
    ("disease", "C562465", "Specific Phobia", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D057846", "Excoriation Disorder", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D000405", "Akinetic Mutism", "neuropsych_symptom", "high", 5),
    ("disease", "MESH:D020324", "Anterograde Amnesia", "neuropsych_symptom", "high", 5),
    ("disease", "MESH:D012560", "Schizophrenia, Catatonic", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D000648", "Retrograde Amnesia", "neuropsych_symptom", "high", 5),
    ("disease", "MESH:D020828", "Pseudobulbar Palsy", "neurological_disorder", "high", 5),
    ("disease", "MESH:D000071057", "Tardive Dyskinesia", "iatrogenic_syndrome", "high", 5),

    # ══════════════════════════════════════════════════════════════
    # 1G: Cross-specialty neuropsychiatric overlap
    # ══════════════════════════════════════════════════════════════

    # Cardiology / Critical Care
    ("disease", "MESH:D000079690", "Postoperative Cognitive Complications", "iatrogenic_syndrome", "high", 5),
    ("disease", "C000657744", "Post-Intensive Care Syndrome", "iatrogenic_syndrome", "high", 5),
    ("disease", "MESH:D000084202", "Chemotherapy-Related Cognitive Impairment", "iatrogenic_syndrome", "high", 5),

    # Pulmonology
    ("disease", "MESH:D020181", "Obstructive Sleep Apnea", "neurological_disorder", "high", 20),
    ("disease", "MESH:D000094024", "Long COVID", "neurological_disorder", "high", 10),
    ("disease", "MESH:D029424", "COPD", "systemic_bridge", "requires_second_gate", 50),

    # Gastroenterology
    ("disease", "MESH:D002446", "Celiac Disease", "systemic_autoimmune", "high", 20),
    ("disease", "MESH:D003424", "Crohn Disease", "systemic_autoimmune", "requires_second_gate", 50),

    # Rheumatology
    ("disease", "MESH:D005356", "Fibromyalgia", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D001172", "Rheumatoid Arthritis", "systemic_autoimmune", "requires_second_gate", 100),

    # Pain Medicine
    ("disease", "MESH:D059350", "Chronic Pain", "neuropsych_symptom", "high", 20),
    ("disease", "MESH:D010591", "Phantom Limb", "neurological_disorder", "high", 5),

    # OB/GYN
    ("disease", "MESH:D004461", "Eclampsia", "neurological_disorder", "high", 10),
    ("disease", "MESH:D011225", "Preeclampsia", "systemic_bridge", "requires_second_gate", 50),
    ("disease", "MESH:D006939", "Hyperemesis Gravidarum", "systemic_bridge", "high", 5),

    # Hematology
    ("disease", "MESH:D014806", "Vitamin B12 Deficiency", "endocrine_metabolic", "high", 10),
    ("disease", "MESH:D018798", "Iron Deficiency Anemia", "endocrine_metabolic", "requires_second_gate", 50),
    ("disease", "MESH:D000755", "Sickle Cell Disease", "systemic_bridge", "requires_second_gate", 50),
    ("disease", "MESH:D011697", "TTP", "systemic_bridge", "high", 10),

    # Nephrology
    ("disease", "MESH:D006934", "Hypercalcemia", "endocrine_metabolic", "high", 20),
    ("disease", "MESH:D006955", "Hypernatremia", "endocrine_metabolic", "high", 10),
    ("disease", "C537153", "Hypomagnesemia", "endocrine_metabolic", "high", 10),

    # Toxicology
    ("disease", "MESH:D002249", "Carbon Monoxide Poisoning", "endocrine_metabolic", "high", 5),
    ("disease", "MESH:D020263", "Lead Poisoning, Nervous System", "endocrine_metabolic", "high", 20),
    ("disease", "MESH:D062025", "Organophosphate Poisoning", "endocrine_metabolic", "high", 5),

    # Pediatric
    ("disease", "C537163", "PANDAS", "neurological_disorder", "high", 5),

    # Infectious Disease
    ("disease", "MESH:D014353", "African Trypanosomiasis", "neurological_disorder", "high", 10),

    # ══════════════════════════════════════════════════════════════
    # 1H: Endocrine/metabolic expansion
    # ══════════════════════════════════════════════════════════════

    ("disease", "MESH:D003924", "Diabetes Mellitus Type 2", "endocrine_metabolic", "requires_second_gate", 100),
    ("disease", "MESH:D007037", "Hypothyroidism", "endocrine_metabolic", "high", 20),
    ("disease", "MESH:D007003", "Hypoglycemia", "endocrine_metabolic", "high", 20),
    ("disease", "MESH:D006463", "Uremia", "endocrine_metabolic", "high", 20),
    ("disease", "MESH:D011085", "Polycystic Ovary Syndrome", "endocrine_metabolic", "requires_second_gate", 50),
    # MESH:D006934 Hypercalcemia — already in 1G
    ("disease", "MESH:D007006", "Hypogonadism", "endocrine_metabolic", "high", 20),
    ("disease", "MESH:D003480", "Cushing Syndrome", "endocrine_metabolic", "high", 10),
    ("disease", "MESH:D006111", "Graves Disease", "endocrine_metabolic", "high", 10),
    ("disease", "MESH:D049950", "Hyperparathyroidism", "endocrine_metabolic", "high", 10),
    ("disease", "MESH:D000224", "Addison Disease", "endocrine_metabolic", "high", 10),
    ("disease", "MESH:D007177", "SIADH", "endocrine_metabolic", "high", 10),
    # MESH:D006955 Hypernatremia — already in 1G
    ("disease", "MESH:D015175", "Prolactinoma", "endocrine_metabolic", "high", 5),
    ("disease", "MESH:D013958", "Thyroid Crisis", "endocrine_metabolic", "high", 5),
    ("disease", "MESH:D017428", "Menopause, Premature", "endocrine_metabolic", "high", 20),
    ("disease", "MESH:D013971", "Thyrotoxicosis", "endocrine_metabolic", "high", 5),

    # ══════════════════════════════════════════════════════════════
    # 1H: Genetic/neurodevelopmental neuropsychiatric conditions
    # ══════════════════════════════════════════════════════════════

    ("disease", "MESH:D005600", "Fragile X Syndrome", "neurological_disorder", "high", 10),
    ("disease", "MESH:D052556", "Niemann-Pick Disease Type C", "neurological_disorder", "high", 5),
    ("disease", "MESH:D000326", "Adrenoleukodystrophy", "neurological_disorder", "high", 5),
    ("disease", "MESH:D000795", "Fabry Disease", "neurological_disorder", "high", 10),
    ("disease", "MESH:D007966", "Metachromatic Leukodystrophy", "neurological_disorder", "high", 5),
    ("disease", "MESH:D014402", "Tuberous Sclerosis", "neurological_disorder", "high", 10),
    ("disease", "MESH:D019294", "Cerebrotendinous Xanthomatosis", "neurological_disorder", "high", 5),
    ("disease", "MESH:D019150", "NBIA / Neuroaxonal Dystrophies", "neurological_disorder", "high", 5),
    ("disease", "MESH:D020163", "OTC Deficiency", "endocrine_metabolic", "high", 5),
    ("disease", "MESH:D058165", "22q11.2 Deletion Syndrome", "neurological_disorder", "high", 5),
    ("disease", "C536275", "Fahr Disease", "neurological_disorder", "high", 5),
    ("disease", "MESH:D056806", "Urea Cycle Disorders", "endocrine_metabolic", "high", 5),
    ("disease", "MESH:D005095", "Arachnoid Cysts", "neurological_disorder", "high", 10),

    # ══════════════════════════════════════════════════════════════
    # 1I: Iatrogenic/drug-induced conditions
    # ══════════════════════════════════════════════════════════════

    ("disease", "MESH:D013262", "Stevens-Johnson Syndrome", "iatrogenic_syndrome", "high", 10),
    ("disease", "MESH:D000071257", "Emergence Delirium", "iatrogenic_syndrome", "high", 10),
    ("disease", "MESH:D055677", "Refeeding Syndrome", "iatrogenic_syndrome", "high", 5),
    # MESH:D000071057 Tardive Dyskinesia — already in 1E P2

    # ══════════════════════════════════════════════════════════════
    # 1M: UMLS hierarchy expansion
    # ══════════════════════════════════════════════════════════════

    # Substance Use (from D019966 children)
    ("disease", "MESH:D019973", "Alcohol-Related Disorders", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D019969", "Amphetamine-Related Disorders", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D000079524", "Narcotic-Related Disorders", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D058545", "Inhalant Abuse", "psychiatric_disorder", "high", 5),

    # Suicidality (actionable — has PubTator data)
    ("disease", "MESH:D012652", "Self Mutilation", "neuropsych_symptom", "high", 10),

    # Additional psychiatry (from UMLS hierarchy children)
    ("disease", "MESH:D010262", "Paraphilic Disorders", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D000090663", "Treatment-Resistant Schizophrenia", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D000088323", "Vascular Depression", "psychiatric_disorder", "high", 5),
    ("disease", "MESH:D019960", "Elimination Disorders", "psychiatric_disorder", "high", 10),
    ("disease", "MESH:D020232", "Kluver-Bucy Syndrome", "neurological_disorder", "high", 5),
    ("disease", "MESH:D000093902", "Mixed Dementias", "neurological_disorder", "high", 5),
    ("disease", "MESH:D000069544", "Infectious Encephalitis", "neurological_disorder", "high", 5),

    # ══════════════════════════════════════════════════════════════
    # 1F: C-L psychiatry conditions
    # (Sections with explicit confidence/min_cite already inserted above;
    #  duplicates are harmlessly skipped by ON CONFLICT DO NOTHING)
    # ══════════════════════════════════════════════════════════════

    # Autoimmune/Inflammatory
    ("disease", "MESH:D012859", "Sjogren's Syndrome", "systemic_autoimmune", "high", 5),
    ("disease", "MESH:D001528", "Behcet Syndrome", "systemic_autoimmune", "high", 5),
    ("disease", "MESH:D016736", "Antiphospholipid Syndrome", "systemic_autoimmune", "high", 0),
    ("disease", "C531622", "Familial Antiphospholipid Syndrome", "systemic_autoimmune", "high", 0),
    ("disease", "MESH:D020945", "Lupus Vasculitis, CNS", "systemic_autoimmune", "high", 0),
    ("disease", "C535814", "Neurosarcoidosis", "systemic_autoimmune", "high", 0),
    ("disease", "C535841", "Hashimoto Encephalopathy", "neurological_disorder", "high", 0),
    ("disease", "C531729", "Autoimmune Limbic Encephalitis", "neurological_disorder", "high", 0),

    # Paraneoplastic
    ("disease", "MESH:D010257", "Paraneoplastic Syndromes", "neurological_disorder", "high", 0),
    ("disease", "MESH:D020361", "Paraneoplastic Syndromes, Nervous System", "neurological_disorder", "high", 0),
    ("disease", "MESH:D053578", "Opsoclonus-Myoclonus Syndrome", "neurological_disorder", "high", 0),
    ("disease", "MESH:D059545", "Paraneoplastic Syndromes, Ocular", "neurological_disorder", "high", 0),

    # Infectious Neuropsychiatry
    ("disease", "MESH:D014390", "Tuberculous Meningitis", "neurological_disorder", "high", 5),
    ("disease", "MESH:D016263", "HIV/AIDS Neurocognitive Disorders", "neurological_disorder", "high", 0),
    ("disease", "MESH:D016919", "Meningitis, Cryptococcal", "neurological_disorder", "high", 0),
    ("disease", "MESH:D015526", "AIDS Dementia Complex", "neurological_disorder", "high", 0),
    ("disease", "MESH:D020852", "Lyme Neuroborreliosis", "neurological_disorder", "high", 0),
    ("disease", "MESH:D008061", "Whipple Disease", "neurological_disorder", "high", 0),
    ("disease", "MESH:D013606", "Tabes Dorsalis", "neurological_disorder", "high", 0),

    # Epilepsy Subtypes
    ("disease", "MESH:D004834", "Epilepsy, Post-Traumatic", "neurological_disorder", "high", 5),
    ("disease", "MESH:D004830", "Epilepsy, Tonic-Clonic", "neurological_disorder", "high", 5),
    ("disease", "MESH:D004832", "Epilepsy, Absence", "neurological_disorder", "high", 0),
    ("disease", "MESH:D020270", "Alcohol Withdrawal Seizures", "neurological_disorder", "high", 0),

    # TBI
    ("disease", "MESH:D001924", "Brain Concussion", "neurological_disorder", "high", 0),

    # Toxic-Metabolic
    ("disease", "MESH:D010661", "Phenylketonuria", "endocrine_metabolic", "high", 0),
    ("disease", "MESH:D001928", "Brain Diseases, Metabolic", "endocrine_metabolic", "high", 0),
    ("disease", "MESH:D014899", "Wernicke Encephalopathy", "endocrine_metabolic", "high", 0),
    # MESH:D056806 Urea Cycle Disorders — already in 1H genetic
    ("disease", "MESH:D011164", "Porphyrias", "endocrine_metabolic", "high", 0),
    ("disease", "MESH:D046350", "Porphyria, Variegate", "endocrine_metabolic", "high", 0),
    ("disease", "MESH:D017118", "Porphyria, Acute Intermittent", "endocrine_metabolic", "high", 0),
    ("disease", "MESH:D017119", "Porphyria Cutanea Tarda", "endocrine_metabolic", "high", 0),
    ("disease", "C562618", "Porphyria, Acute Hepatic", "endocrine_metabolic", "high", 0),
    ("disease", "MESH:D065166", "Sepsis-Associated Encephalopathy", "systemic_bridge", "high", 0),
    ("disease", "MESH:D000076042", "Alcoholic Korsakoff Syndrome", "neurological_disorder", "high", 0),

    # Cerebrovascular
    ("disease", "MESH:D020293", "Vasculitis, CNS", "neurological_disorder", "high", 0),
    ("disease", "MESH:D020943", "AIDS Arteritis, CNS", "neurological_disorder", "high", 0),

    # Other C-L
    # MESH:D000071257 Emergence Delirium — already in 1I
    ("disease", "C565143", "CJD, Sporadic", "neurological_disorder", "high", 0),
    ("disease", "MESH:D013132", "Spinocerebellar Degenerations", "neurological_disorder", "high", 0),
    # MESH:D000405 Akinetic Mutism — already in 1E P2

    # ══════════════════════════════════════════════════════════════
    # 2D: Pending annotation (future-proof — 0 PubTator papers)
    # ══════════════════════════════════════════════════════════════

    # Suicidality (PubTator does not annotate these as disease entities yet)
    ("disease", "MESH:D013405", "Suicide", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D013406", "Suicide, Attempted", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D059020", "Suicidal Ideation", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D016728", "Self-Injurious Behavior", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D000081013", "Completed Suicide", "neuropsych_symptom", "pending_annotation", 0),

    # Psychiatric diagnoses without PubTator coverage yet
    ("disease", "MESH:D000098647", "Generalized Anxiety Disorder", "psychiatric_disorder", "pending_annotation", 0),
    ("disease", "MESH:D063326", "Schizoaffective Disorder", "psychiatric_disorder", "pending_annotation", 0),
    ("disease", "MESH:D065505", "Narcissistic Personality Disorder", "psychiatric_disorder", "pending_annotation", 0),
    ("disease", "MESH:D000071180", "Functional Neurological Disorder", "psychiatric_disorder", "pending_annotation", 0),
    ("disease", "MESH:D003861", "Depersonalization", "psychiatric_disorder", "pending_annotation", 0),

    # Neuropsychiatric symptoms without PubTator coverage yet
    ("disease", "MESH:D000071085", "Apathy", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D003702", "Delusions", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D000080207", "Emotional Lability", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D007508", "Irritable Mood", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D053444", "Stupor", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D056344", "Executive Function", "neuropsych_symptom", "pending_annotation", 0),
    ("disease", "MESH:D000374", "Aggression", "neuropsych_symptom", "pending_annotation", 0),
]

# fmt: on


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _print_family_counts(cur, label: str) -> dict[str, int]:
    """Print and return rule counts by family."""
    cur.execute(
        """
        SELECT family_key, count(*)::integer AS cnt
        FROM solemd.entity_rule
        GROUP BY family_key
        ORDER BY cnt DESC
        """
    )
    families = {r["family_key"]: r["cnt"] for r in cur.fetchall()}
    total = sum(families.values())
    print(f"\n{'=' * 60}")
    print(f"  {label}")
    print(f"{'=' * 60}")
    for fk, cnt in sorted(families.items(), key=lambda x: -x[1]):
        print(f"  {fk:35s} {cnt:>5d}")
    print(f"  {'TOTAL':35s} {total:>5d}")
    return families


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    with db.connect() as conn, conn.cursor() as cur:
        # ── Before-state summary ──────────────────────────────────
        before = _print_family_counts(cur, "BEFORE STATE")

        # ── Widen confidence constraint for pending_annotation ────
        cur.execute(
            "ALTER TABLE solemd.entity_rule "
            "DROP CONSTRAINT IF EXISTS entity_rule_confidence_check"
        )
        cur.execute(
            "ALTER TABLE solemd.entity_rule "
            "ADD CONSTRAINT entity_rule_confidence_check "
            "CHECK (confidence IN ("
            "'high', 'moderate', 'requires_second_gate', 'pending_annotation'"
            "))"
        )
        print("\nUpdated confidence constraint to allow 'pending_annotation'")

        # ── Reclassify existing rules ─────────────────────────────
        updated = 0
        missing = []
        for concept_id, new_family, new_name in RECLASSIFICATIONS:
            cur.execute(
                """
                UPDATE solemd.entity_rule
                SET family_key = %s, canonical_name = %s
                WHERE concept_id = %s
                """,
                (new_family, new_name, concept_id),
            )
            if cur.rowcount == 0:
                missing.append((concept_id, new_name))
            else:
                updated += cur.rowcount

        print(f"\nReclassified {updated} / {len(RECLASSIFICATIONS)} rules")
        if missing:
            for cid, name in missing:
                print(f"  WARNING: no row found for {cid} ({name})")

        # ── Verify dissolved families ─────────────────────────────
        cur.execute(
            """
            SELECT family_key, count(*)::integer AS cnt
            FROM solemd.entity_rule
            WHERE family_key IN ('behavior', 'neuropsych_disease')
            GROUP BY family_key
            """
        )
        leftovers = cur.fetchall()
        if leftovers:
            for r in leftovers:
                print(f"  WARNING: {r['family_key']} still has {r['cnt']} rules!")
        else:
            print("Verified: behavior and neuropsych_disease families dissolved")

        # ── Insert new rules ──────────────────────────────────────
        inserted = 0
        for row in NEW_RULES:
            cur.execute(
                """
                INSERT INTO solemd.entity_rule
                    (entity_type, concept_id, canonical_name,
                     family_key, confidence, min_citation_count)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (entity_type, concept_id) DO NOTHING
                """,
                row,
            )
            inserted += cur.rowcount

        skipped = len(NEW_RULES) - inserted
        print(f"\nInserted {inserted} new rules ({skipped} already existed or duplicated)")

        # ── After-state summary ───────────────────────────────────
        after = _print_family_counts(cur, "AFTER STATE")

        # ── Diff ──────────────────────────────────────────────────
        print(f"\n{'=' * 60}")
        print(f"  DIFF")
        print(f"{'=' * 60}")
        all_families = sorted(set(before) | set(after))
        for fk in all_families:
            b = before.get(fk, 0)
            a = after.get(fk, 0)
            delta = a - b
            if delta != 0:
                sign = "+" if delta > 0 else ""
                print(f"  {fk:35s} {b:>5d} -> {a:>5d} ({sign}{delta})")
            elif fk in before and fk not in after:
                print(f"  {fk:35s} {b:>5d} -> DISSOLVED")
        before_total = sum(before.values())
        after_total = sum(after.values())
        delta_total = after_total - before_total
        sign = "+" if delta_total > 0 else ""
        print(f"  {'TOTAL':35s} {before_total:>5d} -> {after_total:>5d} ({sign}{delta_total})")

        conn.commit()
        print("\nTransaction committed")

    db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
