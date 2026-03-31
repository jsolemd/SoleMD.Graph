# Entity Rule Audit — Current State

> **Date**: 2026-03-31
> **Table**: `solemd.entity_rule`
> **Total**: 571 rules across 14 families

## Executive Summary

The entity_rule table contains 571 rules across 14 families. Four families are designated as **core** (receive a +200 per-family scoring bonus in base admission): `psychiatric_disorder`, `neurological_disorder`, `psychiatric_medication`, and `neurotransmitter_system`. Several critical miscategorizations exist — most notably **delirium** and **catatonia** in the `behavior` family instead of `psychiatric_disorder` — and multiple non-core families contain concepts that are clinically central to C-L psychiatry.

---

## 1. Paper Coverage by Family

Papers matched in `pubtator.entity_annotations`:

| Family | Papers | Core? |
|--------|-------:|:-----:|
| psychiatric_medication | 4,723,719 | Yes |
| neurological_disorder | 3,130,023 | Yes |
| psychiatric_disorder | 2,357,772 | Yes |
| neurotransmitter_system | 1,751,945 | Yes |
| neuropsych_symptom | 1,358,933 | |
| behavior | 1,018,223 | |
| drug_class | 635,012 | |
| biomarker | 574,093 | |
| systemic_bridge | 359,589 | |
| iatrogenic_syndrome | 169,731 | |
| neurotransmitter_gene | 93,168 | |
| neuropsych_disease | 62,708 | |
| endocrine_metabolic | 22,020 | |

## 2. Base Contribution by Family

Papers reaching `paper_evidence_summary` and their core-hit status:

| Family | Core-Hit Papers | Any-Hit Papers |
|--------|----------------:|---------------:|
| neurological_disorder | 721,586 | 993,460 |
| psychiatric_disorder | 642,668 | 902,487 |
| psychiatric_medication | 491,800 | 727,839 |
| behavior | 470,397 | 690,871 |
| neuropsych_symptom | 300,654 | 439,165 |
| neurotransmitter_system | 318,367 | 411,898 |
| systemic_bridge | 163,307 | 255,955 |
| drug_class | 144,758 | 205,624 |
| iatrogenic_syndrome | 91,819 | 148,805 |
| biomarker | 78,340 | 114,251 |
| neurotransmitter_gene | 45,420 | 55,631 |
| neuropsych_disease | 37,525 | 52,636 |
| endocrine_metabolic | 6,130 | 14,929 |

**Key observation**: `behavior` (690K any-hit papers) is the 4th largest family by base contribution but receives no core scoring bonus. This is significant because it contains delirium, catatonia, and other conditions that are clinically core.

---

## 3. Core Family Scoring Mechanism

From `paper_evidence.py:113-121`, core families are hardcoded:

```python
er.family_key IN (
    'psychiatric_disorder',
    'neurological_disorder',
    'psychiatric_medication',
    'neurotransmitter_system'
)
```

From `base_policy.py:31`, each distinct core family hit adds **+200** to the domain score. This is the single largest per-factor bonus in the scoring formula.

---

## 4. Family-by-Family Audit

### 4.1 `behavior` (14 rules) — NEEDS RECLASSIFICATION

**This family should be dissolved.** Every member belongs in a more specific core or non-core family.

| Concept ID | Name | Recommended Family | Rationale |
|------------|------|-------------------|-----------|
| MESH:D003693 | **Delirium** | `psychiatric_disorder` | DSM-5 diagnosis (neurocognitive disorder); #1 C-L consult reason |
| MESH:D002389 | **Catatonia** | `psychiatric_disorder` | DSM-5 specifier; psychiatric emergency requiring specific treatment |
| MESH:D063726 | Delusions | `neuropsych_symptom` | Symptom, not a standalone diagnosis |
| MESH:D006212 | Hallucinations | `neuropsych_symptom` | Symptom, not a standalone diagnosis |
| MESH:D010259 | Paranoia | `neuropsych_symptom` | Symptom, not a standalone diagnosis |
| MESH:D010554 | Aggression | `neuropsych_symptom` | Behavioral symptom |
| MESH:D011595 | Agitation | `neuropsych_symptom` | Behavioral symptom, common in delirium/dementia |
| MESH:D007174 | Impulsivity | `neuropsych_symptom` | Behavioral symptom |
| MESH:D003072 | Cognitive impairment | `neuropsych_symptom` | Symptom across many disorders |
| MESH:D008569 | Memory impairment | `neuropsych_symptom` | Symptom across many disorders |
| MESH:D009771 | OCD behaviors | `neuropsych_symptom` | Symptom (OCD itself is in psychiatric_disorder) |
| MESH:D000073932 | Compulsions | `neuropsych_symptom` | Symptom |
| MESH:D003193 | Compulsive behaviors | `neuropsych_symptom` | Symptom |
| MESH:D020921 | Arousal disorders | `neuropsych_symptom` | Symptom of altered consciousness |

**Impact**: Moving delirium and catatonia to `psychiatric_disorder` would give ~1M papers access to the core family bonus. Moving the remaining 12 to `neuropsych_symptom` improves semantic accuracy.

### 4.2 `psychiatric_disorder` (82 rules) — CORE

Well-populated. Covers major DSM-5 categories. Notable inclusions:

- Good: MDD, schizophrenia, bipolar, PTSD, ADHD, ASD, eating disorders, personality disorders, dissociative disorders, substance use
- Questionable placements (not necessarily wrong, but worth noting):
  - **Glioblastoma** (MESH:D005909) — brain tumor, not psychiatric disorder (requires_second_gate)
  - **Meningioma** (MESH:D008579) — brain tumor, not psychiatric disorder (requires_second_gate)
  - **Pheochromocytoma** (MESH:D010673) — adrenal tumor, psychiatric mimic (requires_second_gate)
  - **Functional Dyspepsia** (MESH:D004415) — GI disorder, not psychiatric (requires_second_gate)
  - **Inflammatory Bowel Disease Neuropsychiatric** (MESH:D015212) — edge case, reasonable as bridge
  - **Hyperhidrosis** (MESH:D006945) — somatic symptom, not a psychiatric disorder
  - **Postural Orthostatic Tachycardia Syndrome** (MESH:D054972) — autonomic, not psychiatric
  - **Takotsubo Cardiomyopathy** (MESH:D054549) — cardiac, stress-related but not psychiatric

**Missing from this family** (currently elsewhere or absent):
- Delirium (in `behavior`)
- Catatonia (in `behavior`)
- Generalized Anxiety Disorder (absent — only Social Anxiety is present)
- Panic Disorder (absent — only Panic Attack symptom in `neuropsych_symptom`)
- Obsessive-Compulsive Disorder (absent — only OCD behaviors symptom in `behavior`)
- Substance Use Disorders beyond opioid and tobacco (absent — no alcohol use disorder, stimulant use disorder, cannabis use disorder, sedative use disorder)
- Insomnia Disorder (in `neurological_disorder` — debatable placement)
- Somatic Symptom Disorder (absent)
- Illness Anxiety Disorder (absent — Hypochondriasis is in `neuropsych_symptom`)
- Brief Psychotic Disorder (absent)
- Persistent Depressive Disorder / Dysthymia (absent)
- Selective Mutism (in `neuropsych_symptom`)

### 4.3 `neurological_disorder` (128 rules) — CORE

The largest family. Comprehensive coverage of neurological conditions. Notable:

- Excellent coverage of: dementia subtypes, epilepsy syndromes, movement disorders, demyelinating diseases, neuromuscular disorders, headache disorders, sleep disorders, cerebrovascular disease, rare neurological syndromes
- **Insomnia Disorder** (MESH:D007319) — could arguably be `psychiatric_disorder` (DSM-5 lists it as sleep-wake disorder)
- Contains many conditions that overlap with psychiatry (e.g., Huntington's, Wilson's, autoimmune encephalitis) — these are correctly categorized as neurological

### 4.4 `psychiatric_medication` (183 rules) — CORE

The largest family by rule count and paper coverage. Includes:

- **Core psychotropics**: antidepressants (SSRIs, SNRIs, TCAs, MAOIs), antipsychotics, mood stabilizers, benzodiazepines, stimulants
- **Neurological medications**: anti-epileptics, MS disease-modifying therapies, Parkinson's medications
- **Substances of abuse**: cocaine, morphine, nicotine, alcohol, cannabis
- **Second-gate items** (requires_second_gate): alcohol, ammonia, azathioprine, carbohydrates, cholesterol, ciprofloxacin, creatinine, cyclophosphamide, fluconazole, glucose, insulin, lactose, lipids, methylprednisolone, mycophenolate mofetil, oxygen, prednisone, propofol, rifampicin, rituximab, steroids, triglycerides, urea

The second-gate items are appropriately gated — they are common lab values or general medications that would create excessive noise at `confidence=high`.

### 4.5 `neurotransmitter_system` (45 rules) — CORE

Well-curated. Covers all major neurotransmitter systems:

- Monoamines: dopamine, serotonin, norepinephrine, epinephrine, histamine
- Amino acids: GABA, glutamate, glycine (second-gate), aspartate
- Neuropeptides: substance P, neuropeptide Y, neurotensin, oxytocin, vasopressin, endorphins, enkephalins, dynorphins, cholecystokinin, galanin, CGRP, VIP, somatostatin, CRF, hypocretin/orexin, tachykinins, ghrelin
- Neuromodulators: endocannabinoids, adenosine, nitric oxide (second-gate), carbon monoxide (second-gate), melatonin, pregnenolone, BDNF, GDNF, kynurenic acid, quinolinic acid, taurine (second-gate)
- **Second-gate items**: acetate, carbon monoxide, glycine, nitric oxide, taurine — appropriate gating for ubiquitous molecules

### 4.6 `neuropsych_symptom` (29 rules) — NOT CORE

Psychiatric/neurological symptoms and signs. Well-differentiated from disorders.

**Items that may warrant reclassification**:
- **Mania** (MESH:D000087122) — could be `psychiatric_disorder` (DSM-5 manic episode is diagnostic)
- **Panic Attack** (MESH:D016584) — symptom vs. Panic Disorder (disorder); current placement is defensible
- **Alcohol Withdrawal Delirium** (MESH:D000430) — specific subtype of delirium; could be `psychiatric_disorder`
- **Selective Mutism** (MESH:D009155) — DSM-5 anxiety disorder, should be `psychiatric_disorder`
- **Trichotillomania** (MESH:D014256) — DSM-5 obsessive-compulsive related disorder, should be `psychiatric_disorder`
- **Pica** (MESH:D010842) — DSM-5 feeding/eating disorder, should be `psychiatric_disorder`
- **Enuresis** (MESH:D004775) — DSM-5 elimination disorder, should be `psychiatric_disorder`

**Clinically core concepts in this family**: Anhedonia, fatigue, cognitive symptoms, mania, psychomotor retardation, lethargy, stupor — these are high-signal symptoms for psychiatric/neurological papers. The family as a whole does not get core bonus, meaning papers about anhedonia in depression or psychomotor retardation in catatonia get no core family credit from these symptom matches alone.

### 4.7 `neuropsych_disease` (5 rules) — NOT CORE

| Concept ID | Name | Assessment |
|------------|------|-----------|
| MESH:D000341 | Affective psychosis | Should be `psychiatric_disorder` |
| MESH:D017109 | Akathisia | Should be `iatrogenic_syndrome` (drug-induced movement side effect) |
| MESH:D004833 | Epilepsy | **Duplicate** — MESH:D004827 "Epilepsy" already in `neurological_disorder` |
| MESH:D057174 | Frontotemporal dementia | Should be `neurological_disorder` (FTD is there; check if MESH differs) |
| MESH:D000091323 | PNES | Should be `psychiatric_disorder` (functional neurological disorder) |

**This family should be dissolved.** Each member belongs in an existing family.

### 4.8 `iatrogenic_syndrome` (6 rules) — NOT CORE

Treatment-emergent syndromes. All are clinically important:

| Concept | Assessment |
|---------|-----------|
| Drug-induced parkinsonism | Correct placement |
| Extrapyramidal symptoms | Correct placement |
| Neuroleptic malignant syndrome | Correct placement; psychiatric emergency |
| QT prolongation | Correct placement |
| Serotonin syndrome | Correct placement; psychiatric emergency |
| Torsades de pointes | Correct placement |

**Should this be core?** These syndromes are directly caused by psychiatric medications and are among the most clinically dangerous outcomes in psychopharmacology. Making this family core would give 148K papers the core bonus. However, the family is small (6 rules) and highly specific — the core bonus may be disproportionate. **Recommendation**: Keep non-core but ensure these concepts still get adequate scoring through entity_rule_families and entity_rule_count contributions.

### 4.9 `drug_class` (47 rules) — NOT CORE

Pharmacological classes (not individual drugs). Includes:

- Directly relevant to psychiatry: antidepressants, anxiolytics, anticonvulsants, antipsychotics (D2 antagonists), MAOIs, benzodiazepines, barbiturates, stimulants, psychedelics, opioid antagonists, muscarinic agonists
- General: immunosuppressants, NSAIDs, cytotoxins, hemostatic agents, GI agents, antidotes

Well-curated. Non-core status is appropriate — these are class-level terms that complement the specific medications in `psychiatric_medication`.

### 4.10 `biomarker` (17 rules) — NOT CORE

Neuroinflammatory and metabolic markers. Includes cortisol, IL-6, IL-1, TNF-alpha, BDNF (also in neurotransmitter_system as BDNF), amyloid beta, homocysteine, kynurenine, GLP-1, VEGF-A, NGF, CNTF.

Well-curated. Non-core status is appropriate.

### 4.11 `neurotransmitter_gene` (5 rules) — NOT CORE

| Gene | Assessment |
|------|-----------|
| BDNF (627) | Correct |
| COMT (1312) | Correct |
| DAT/SLC6A3 (6531) | Correct |
| MAOA (4128) | Correct |
| SERT/SLC6A4 (6532) | Correct |

All have `confidence=requires_second_gate`. Appropriate — gene mentions are noisy without clinical context.

### 4.12 `systemic_bridge` (7 rules) — NOT CORE

Medical conditions that cause neuropsychiatric symptoms:

| Concept | Assessment |
|---------|-----------|
| Acute Lung Injury | Edge case — hypoxic encephalopathy bridge |
| Encephalopathy | Broad term; correct bridge placement |
| Hepatic encephalopathy | Classic C-L psychiatry topic |
| Hyponatremia | Classic C-L psychiatry topic; causes delirium |
| Hypoxia | Bridge to neurological damage |
| Respiratory Insufficiency | Bridge to hypoxic encephalopathy |
| Uremia | Classic C-L psychiatry topic; causes encephalopathy |

**Clinically important for C-L psychiatry** but correctly non-core. These are medical conditions that produce neuropsychiatric symptoms, not primary psychiatric/neurological disorders.

### 4.13 `endocrine_metabolic` (2 rules) — NOT CORE

Only 2 rules: Diabetic Ketoacidosis and Myxedema. This family is severely underpopulated for its clinical importance. Missing:

- Thyrotoxicosis / Hyperthyroidism (psychiatric mimic)
- Hypothyroidism (beyond myxedema)
- Cushing syndrome
- Addison disease
- Hyperparathyroidism (causes psychiatric symptoms)
- Pheochromocytoma (currently miscategorized in `psychiatric_disorder`)
- Hypoglycemia
- Hepatic encephalopathy (currently in `systemic_bridge`)

### 4.14 `psychiatric_gene` (1 rule) — NOT CORE

Only HLA-B (MESH:D015235). This is relevant for carbamazepine pharmacogenomics (HLA-B*15:02 testing). Extremely sparse family — consider dissolving into `neurotransmitter_gene` or keeping for future expansion.

---

## 5. Critical Miscategorizations

### 5.1 Must Fix — Clinically Wrong

| Current Family | Concept | Should Be | Priority |
|---------------|---------|-----------|----------|
| behavior | Delirium | psychiatric_disorder | **P0** |
| behavior | Catatonia | psychiatric_disorder | **P0** |
| neuropsych_disease | Affective psychosis | psychiatric_disorder | P1 |
| neuropsych_disease | PNES | psychiatric_disorder | P1 |
| neuropsych_symptom | Selective Mutism | psychiatric_disorder | P1 |
| neuropsych_symptom | Trichotillomania | psychiatric_disorder | P1 |
| neuropsych_symptom | Pica | psychiatric_disorder | P1 |
| neuropsych_symptom | Enuresis | psychiatric_disorder | P1 |
| neuropsych_disease | Akathisia | iatrogenic_syndrome | P1 |
| neuropsych_disease | Epilepsy (D004833) | DELETE (duplicate) | P1 |
| psychiatric_disorder | Hyperhidrosis | DELETE or systemic_bridge | P2 |
| psychiatric_disorder | POTS | DELETE or systemic_bridge | P2 |
| psychiatric_disorder | Takotsubo | DELETE or systemic_bridge | P2 |

### 5.2 Families to Dissolve

- **`behavior`** (14 rules) → 2 to `psychiatric_disorder`, 12 to `neuropsych_symptom`
- **`neuropsych_disease`** (5 rules) → members to `psychiatric_disorder`, `neurological_disorder`, `iatrogenic_syndrome`, or delete

### 5.3 Duplicate Concepts

| Concept | Family A | Family B |
|---------|----------|----------|
| Epilepsy | neurological_disorder (D004827) | neuropsych_disease (D004833) |

Note: These are different MESH IDs (D004827 vs D004833) so both may be valid PubTator annotations, but they represent the same condition. Having both ensures broader matching but the `neuropsych_disease` one should be moved to `neurological_disorder`.

---

## 6. Coverage Gaps — Missing Concepts

### 6.1 Missing from `psychiatric_disorder` (DSM-5 diagnoses absent)

- Generalized Anxiety Disorder
- Panic Disorder (only Panic Attack symptom exists)
- Obsessive-Compulsive Disorder (only OCD behaviors symptom exists)
- Alcohol Use Disorder
- Cannabis Use Disorder
- Stimulant Use Disorder
- Sedative/Hypnotic Use Disorder
- Hallucinogen Use Disorder
- Somatic Symptom Disorder
- Illness Anxiety Disorder
- Brief Psychotic Disorder
- Persistent Depressive Disorder / Dysthymia
- Acute Psychosis (distinct from chronic schizophrenia)
- Intermittent Explosive Disorder
- Reactive Attachment Disorder
- Disinhibited Social Engagement Disorder
- Excoriation (Skin Picking) Disorder

### 6.2 Missing from `endocrine_metabolic`

- Thyrotoxicosis / Hyperthyroidism
- Hypothyroidism
- Cushing syndrome
- Addison disease
- Hyperparathyroidism
- Hypoglycemia
- Hypoparathyroidism
- Syndrome of Inappropriate ADH (SIADH)

### 6.3 Missing from `iatrogenic_syndrome`

- Tardive dyskinesia
- Anticholinergic toxicity
- Lithium toxicity
- SSRI discontinuation syndrome
- Refeeding syndrome
- Stevens-Johnson syndrome / Toxic epidermal necrolysis (relevant to carbamazepine, lamotrigine)
- Valproate-induced hyperammonemia
- Clozapine-induced agranulocytosis

---

## 7. Non-Core Families with Clinically Core Concepts

These non-core families contain concepts that are clinically central to C-L psychiatry and currently receive no core scoring bonus:

### `behavior` family (should be dissolved)
- **Delirium** — the #1 reason for psychiatric consultation in medical settings
- **Catatonia** — psychiatric emergency, treatable with benzodiazepines/ECT

### `neuropsych_symptom` family
- **Anhedonia** — cardinal symptom of depression
- **Mania** — diagnostic criterion for bipolar disorder
- **Cognitive symptoms** — central to neurocognitive disorders
- **Fatigue** — highly prevalent psychiatric symptom
- **Psychomotor retardation** — core feature of depression and catatonia

### `neuropsych_disease` family (should be dissolved)
- **Affective psychosis** — core psychiatric diagnosis
- **PNES** — core functional neurological disorder

### `iatrogenic_syndrome` family
- **Neuroleptic malignant syndrome** — life-threatening psychiatric emergency
- **Serotonin syndrome** — life-threatening medication complication
- **Extrapyramidal symptoms** — most common reason for medication non-adherence

---

## 8. Recommendations

1. **Immediate**: Move delirium and catatonia from `behavior` to `psychiatric_disorder`
2. **Short-term**: Dissolve `behavior` family (remaining → `neuropsych_symptom`); dissolve `neuropsych_disease` (members to appropriate families); move DSM-5 diagnoses from `neuropsych_symptom` to `psychiatric_disorder`
3. **Medium-term**: Add missing DSM-5 diagnoses to `psychiatric_disorder`; expand `endocrine_metabolic` and `iatrogenic_syndrome`
4. **Consider**: Whether `neuropsych_symptom` should become a 5th core family (439K any-hit papers, contains high-signal psychiatric symptoms)
