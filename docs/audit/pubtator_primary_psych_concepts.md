# PubTator Primary Psychiatric & Neuropsychiatric Concept Audit

**Date**: 2026-03-31
**Scope**: Entity annotations in `pubtator.entity_annotations` cross-referenced against `solemd.entity_rule`
**Purpose**: Identify missing, miscategorized, and correctly-mapped psychiatric MESH concepts for C-L psychiatry knowledge graph

---

## Executive Summary

- **101 known MESH codes** checked across 24 psychiatric/neuropsych categories
- **84 found in PubTator** (17 not present in our PubTator data)
- **52 already in entity_rule** (62% coverage of PubTator-present codes)
- **33 MISSING from entity_rule** (critical gaps)
- **21 MISCATEGORIZED** in entity_rule (wrong family_key)
- **16 additional codes discovered** via mention search
- **39 additional codes discovered** via PubTator3 API autocomplete (second pass)

### Critical gaps by impact:
1. **MESH:D003866** (Depressive Disorder, Major) — 1,002,088 papers — NOT in entity_rule
2. **MESH:D000438** (Alcohol Drinking) — 627,952 papers — NOT in entity_rule
3. **MESH:D019966** (Substance-Related Disorders) — 387,475 papers — NOT in entity_rule
4. **MESH:D003704** (Dementia) — 274,812 papers — NOT in entity_rule
5. **MESH:D000437** (Alcoholism) — 230,473 papers — NOT in entity_rule

---

## Category-by-Category Findings

### 1. Schizophrenia Spectrum

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D012559 | Schizophrenia | 262,639 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D011618 | Psychotic Disorders | 173,894 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D012563 | Schizophrenia, Paranoid | 15,373 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D019967 | Schizophrenia Spectrum & Other Psychotic Disorders | 9,503 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D054062 | Schizotypal Personality Disorder | 8,524 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D012562 | Schizophrenia, Disorganized | 7,164 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D012560 | Schizophrenia, Catatonic | 2,849 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D012569 | Shared Paranoid Disorder | 7,538 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D063045 | Schizophrenia Spectrum (DSM-5) | N/A | — | — | — | Not in PubTator |

**Note**: Schizoaffective Disorder has no dedicated MESH code; it maps to MESH:D011618 (Psychotic Disorders) in PubTator annotations.

### 2. Bipolar Spectrum

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D001714 | Bipolar Disorder | 144,982 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:C535338 | Cyclothymic personality | 7,578 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D003527 | Cyclothymic Disorder | 2,384 | YES | psychiatric_disorder | psychiatric_disorder | OK |

### 3. Depressive Disorders

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| **MESH:D003866** | **Depressive Disorder, Major** | **1,002,088** | **NO** | — | **psychiatric_disorder** | **ADD (CRITICAL)** |
| MESH:D003865 | Depressive Disorder | 145,064 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D019052 | Depression, Postpartum | 33,548 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D019263 | Dysthymic Disorder | 13,194 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D061218 | Depressive Disorder, Treatment-Resistant | 7,715 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D016574 | Seasonal Affective Disorder | 7,021 | NO | — | psychiatric_disorder | **ADD** |

**MESH:D003866 is the #1 gap in the entire entity_rule system.** It's the primary MeSH heading for major depression with over 1 million annotated papers. Its top mention is simply "depression" (459K papers). Without this rule, the graph is blind to the most common psychiatric condition in the literature.

### 4. Anxiety Disorders

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D001007 | Anxiety (symptom) | 663,867 | YES | neuropsych_symptom | neuropsych_symptom | OK |
| MESH:D001008 | Anxiety Disorders (diagnosis) | 151,688 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D016584 | Panic Disorder | 53,925 | YES | neuropsych_symptom | **psychiatric_disorder** | **RECLASSIFY** |
| MESH:D010698 | Phobic Disorders | 35,624 | YES | neuropsych_symptom | **psychiatric_disorder** | **RECLASSIFY** |
| MESH:D000379 | Agoraphobia | 10,857 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D001010 | Separation Anxiety Disorder | 8,817 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D012585 | Social Phobia | 7,427 | NO | — | psychiatric_disorder | **ADD** |

**Key distinction**: MESH:D001007 (Anxiety) = the symptom. MESH:D001008 (Anxiety Disorders) = the DSM diagnostic category. The symptom is correctly classified as neuropsych_symptom; the diagnosis should be psychiatric_disorder. Panic Disorder and Phobic Disorders are full DSM diagnoses, not symptoms.

### 5. OCD Spectrum

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D009771 | Obsessive-Compulsive Disorder | 60,800 | YES | behavior | **psychiatric_disorder** | **RECLASSIFY** |
| MESH:D057215 | Body Dysmorphic Disorder | 18,673 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D006816 | Hoarding Disorder* | 79,523 | YES | neurological_disorder | **psychiatric_disorder** | **RECLASSIFY** |
| MESH:D057846 | Excoriation Disorder | 4,261 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D014256 | Trichotillomania | 3,287 | YES | neuropsych_symptom | **psychiatric_disorder** | **RECLASSIFY** |

**Important D006816 clarification**: PubTator3 API confirms the real Hoarding Disorder is **MESH:D000067836** (817 papers, already in entity_rule as psychiatric_disorder). MESH:D006816 (79K papers) is Huntington Disease — keep as neurological_disorder. Removed from reclassification list.

| MESH:D000067836 | Hoarding Disorder (correct code) | 817 | YES | psychiatric_disorder | psychiatric_disorder | OK |

### 6. Trauma and Stress

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D013313 | PTSD | 136,785 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D000275 | Adjustment Disorders | 25,481 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D040701 | Acute Stress Disorder | 7,220 | YES | psychiatric_disorder | psychiatric_disorder | OK |

All correctly mapped.

### 7. Personality Disorders

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D010554 | Personality Disorders | 210,999 | YES | behavior | **psychiatric_disorder** | **RECLASSIFY** |
| MESH:D000987 | Antisocial PD | 27,301 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D001883 | Borderline PD | 19,622 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D054062 | Schizotypal PD | 8,524 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D003193 | Compulsive PD | 8,392 | YES | behavior | **psychiatric_disorder** | **RECLASSIFY** |

The general "Personality Disorders" concept and Compulsive PD are both miscategorized as behavior.

### 8. Eating Disorders

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D001068 | Feeding and Eating Disorders | 156,960 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D000855 | Anorexia Nervosa | 74,263 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D000856 | Bulimia Nervosa | 29,577 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D002032 | Bulimia (symptom) | 23,821 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D056912 | Binge-Eating Disorder | 9,679 | YES | psychiatric_disorder | psychiatric_disorder | OK |

Anorexia Nervosa missing is a significant gap — 74K papers for one of the most well-studied eating disorders.

### 9. Substance Use Disorders

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D000438 | Alcohol Drinking | 627,952 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D019966 | Substance-Related Disorders | 387,475 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D000437 | Alcoholism | 230,473 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D009293 | Opioid-Related Disorders | 63,071 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D013375 | Substance Withdrawal Syndrome | 43,954 | NO | — | neuropsych_symptom | **ADD** |
| MESH:D001039 | Cocaine-Related | 24,759 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D019970 | Cocaine-Related Disorders | 20,726 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D002189 | Cannabis-Related | 14,160 | NO | — | psychiatric_disorder | **ADD** |

Substance use is the most under-represented category. Three of the top 5 overall gaps are substance-related.

### 10. Neurodevelopmental

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D001289 | ADHD | 170,756 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D001321 | Autistic Disorder | 118,596 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D000067877 | Autism Spectrum Disorder | 84,883 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D065886 | Neurodevelopmental Disorders | 8,173 | NO | — | psychiatric_disorder | **ADD** |

Both autism codes missing is a major gap — combined 200K+ papers.

### 11. Dissociative Disorders

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D000647 | Amnesia | 25,359 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D004213 | Dissociative Disorders | 17,173 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D009105 | Multiple Personality Disorder | 9,027 | YES | psychiatric_disorder | psychiatric_disorder | OK |

Well-covered. Depersonalization (MESH:D003861) not in PubTator.

### 12. Somatic/Functional

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D003291 | Conversion Disorder | 103,860 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D013001 | Somatoform Disorders | 53,091 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D000071896 | Somatic Symptom Disorder | 13,039 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D006998 | Hypochondriasis | 4,455 | YES | neuropsych_symptom | **psychiatric_disorder** | **RECLASSIFY** |

Hypochondriasis (= Illness Anxiety Disorder in DSM-5) is a full diagnosis, not a symptom.

### 13. Sleep Disorders

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D012893 | Sleep Wake Disorders | 192,140 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D007319 | Insomnia | 109,155 | YES | neurological_disorder | **psychiatric_disorder** | **RECLASSIFY** |
| MESH:D021081 | Circadian Rhythm Sleep Disorders | 55,391 | NO | — | psychiatric_disorder | **ADD** |
| MESH:D020187 | REM Sleep Behavior Disorder | 16,406 | NO | — | neurological_disorder | **ADD** |
| MESH:D012148 | Restless Legs Syndrome | 13,216 | YES | neurological_disorder | neurological_disorder | OK* |
| MESH:D009290 | Narcolepsy | 12,093 | YES | neurological_disorder | neurological_disorder | OK* |

*RLS and Narcolepsy could arguably be either neurological or psychiatric depending on perspective. DSM-5 includes them in sleep-wake disorders, but they have clear neurological substrates. Current classification is defensible.

REM Sleep Behavior Disorder should be neurological_disorder (prodromal synucleinopathy marker).

### 14. Suicidality

| Concept ID | Label | Papers | entity_rule | Action |
|---|---|---:|---|---|
| MESH:D015775 | Self-Injurious Behavior | 10,789 | NO | **ADD** as neuropsych_symptom |
| MESH:D013405 | Suicide | N/A | — | Not in PubTator |
| MESH:D059020 | Suicidal Ideation | N/A | — | Not in PubTator |
| MESH:D016728 | Self-Injurious Behavior (alt) | N/A | — | Not in PubTator |

**Major gap**: Most suicide/suicidality MESH codes are absent from our PubTator data. Only MESH:D015775 exists (10,789 papers). PubTator3 may not annotate suicidality concepts consistently. This needs investigation — suicidality is critical for C-L psychiatry.

---

## Neuropsychiatric Phenotypes

### 15. Psychosis Phenotypes

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D006212 | Hallucinations | 56,379 | YES | behavior | **neuropsych_symptom** | **RECLASSIFY** |
| MESH:D010259 | Paranoid Disorders | 19,387 | YES | behavior | **neuropsych_symptom** | **RECLASSIFY** |
| MESH:D011605 | Psychoses, Substance-Induced | 7,265 | NO | — | psychiatric_disorder | **ADD** |

Hallucinations and paranoia are classic neuropsychiatric symptoms, not behaviors.

### 16. Catatonia/Mutism

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D009155 | Mutism | 9,836 | YES | neuropsych_symptom | neuropsych_symptom | OK |
| MESH:D002389 | Catatonia | 6,202 | YES | behavior | **neuropsych_symptom** | **RECLASSIFY** |

Catatonia is a neuropsychiatric syndrome (DSM-5 recognizes it as a specifier), not a behavior.

### 17. Agitation/Aggression

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D011595 | Psychomotor Agitation | 63,809 | YES | behavior | **neuropsych_symptom** | **RECLASSIFY** |
| MESH:D007174 | Impulse Control Disorders | 79,952 | YES | behavior | **psychiatric_disorder** | **RECLASSIFY** |

Psychomotor agitation is a neuropsychiatric symptom (e.g., delirium, mania). Impulse control disorders are DSM diagnoses.

### 18. Apathy/Motivation

| Concept ID | Label | Papers | entity_rule | Action |
|---|---|---:|---|---|
| MESH:D000071085 | Apathy | N/A | — | Not in PubTator |

Apathy not in PubTator. It may be annotated under MESH:D001523 (Mental Disorders) generically.

### 19. Emotional Dysregulation

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D059445 | Anhedonia | 136,760 | YES | neuropsych_symptom | neuropsych_symptom | OK |
| MESH:D019964 | Mood Disorders | 185,054 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D003410 | Crying (pathological) | 5,961 | YES | neurological_disorder | **neuropsych_symptom** | **RECLASSIFY** |
| MESH:D020828 | Pseudobulbar Palsy | 1,769 | NO | — | neurological_disorder | **ADD** |

### 20. Cognitive

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D003072 | Cognition Disorders | 601,068 | YES | behavior | **neuropsych_symptom** | **RECLASSIFY** |
| MESH:D003704 | Dementia | 274,812 | NO | — | neurological_disorder | **ADD** |
| MESH:D008569 | Memory Disorders | 173,071 | YES | behavior | **neuropsych_symptom** | **RECLASSIFY** |
| MESH:D060825 | Cognitive Dysfunction | 167,250 | YES | psychiatric_disorder | **neuropsych_symptom** | **RECLASSIFY** |
| MESH:D000544 | Alzheimer Disease | 432,915 | YES | neurological_disorder | neurological_disorder | OK |

Cognition Disorders and Memory Disorders classified as "behavior" is clearly wrong — these are neuropsychiatric symptoms. Cognitive Dysfunction should be neuropsych_symptom, not psychiatric_disorder.

### 21. Delirium

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D003221 | Confusion | 71,719 | NO | — | neuropsych_symptom | **ADD** |
| MESH:D003693 | Delirium | 49,607 | YES | behavior | **neuropsych_symptom** | **RECLASSIFY** |

Delirium classified as "behavior" is the most clinically wrong miscategorization. Delirium is the quintessential neuropsychiatric emergency.

### 22. Memory/Amnesia

| Concept ID | Label | Papers | entity_rule | Current Family | Recommended Family | Action |
|---|---|---:|---|---|---|---|
| MESH:D000647 | Amnesia | 25,359 | YES | psychiatric_disorder | psychiatric_disorder | OK |
| MESH:D000648 | Amnesia, Retrograde | 2,585 | NO | — | neuropsych_symptom | **ADD** |

---

## Summary Tables

### Concepts to ADD to entity_rule (33 gaps)

| Priority | Concept ID | Label | Papers | Recommended Family |
|---|---|---|---:|---|
| **P0** | MESH:D003866 | Depressive Disorder, Major | 1,002,088 | psychiatric_disorder |
| **P0** | MESH:D000438 | Alcohol Drinking | 627,952 | psychiatric_disorder |
| **P0** | MESH:D019966 | Substance-Related Disorders | 387,475 | psychiatric_disorder |
| **P0** | MESH:D003704 | Dementia | 274,812 | neurological_disorder |
| **P0** | MESH:D000437 | Alcoholism | 230,473 | psychiatric_disorder |
| **P1** | MESH:D012893 | Sleep Wake Disorders | 192,140 | psychiatric_disorder |
| **P1** | MESH:D001008 | Anxiety Disorders | 151,688 | psychiatric_disorder |
| **P1** | MESH:D001321 | Autistic Disorder | 118,596 | psychiatric_disorder |
| **P1** | MESH:D000067877 | Autism Spectrum Disorder | 84,883 | psychiatric_disorder |
| **P1** | MESH:D000855 | Anorexia Nervosa | 74,263 | psychiatric_disorder |
| **P1** | MESH:D003221 | Confusion | 71,719 | neuropsych_symptom |
| **P1** | MESH:D021081 | Circadian Rhythm Sleep Disorders | 55,391 | psychiatric_disorder |
| **P1** | MESH:D013001 | Somatoform Disorders | 53,091 | psychiatric_disorder |
| **P1** | MESH:D013375 | Substance Withdrawal Syndrome | 43,954 | neuropsych_symptom |
| **P2** | MESH:D019052 | Depression, Postpartum | 33,548 | psychiatric_disorder |
| **P2** | MESH:D002032 | Bulimia | 23,821 | psychiatric_disorder |
| **P2** | MESH:D019970 | Cocaine-Related Disorders | 20,726 | psychiatric_disorder |
| **P2** | MESH:D020187 | REM Sleep Behavior Disorder | 16,406 | neurological_disorder |
| **P2** | MESH:D002189 | Cannabis-Related Disorders | 14,160 | psychiatric_disorder |
| **P2** | MESH:D019263 | Dysthymic Disorder | 13,194 | psychiatric_disorder |
| **P2** | MESH:D000071896 | Somatic Symptom Disorder | 13,039 | psychiatric_disorder |
| **P2** | MESH:D015775 | Self-Injurious Behavior | 10,789 | neuropsych_symptom |
| **P3** | MESH:D019967 | Schizophrenia Spectrum & Other Psychotic Disorders | 9,503 | psychiatric_disorder |
| **P3** | MESH:D054062 | Schizotypal PD | 8,524 | psychiatric_disorder |
| **P3** | MESH:D065886 | Neurodevelopmental Disorders | 8,173 | psychiatric_disorder |
| **P3** | MESH:D061218 | Treatment-Resistant Depression | 7,715 | psychiatric_disorder |
| **P3** | C535338 | Cyclothymic personality | 7,578 | psychiatric_disorder |
| **P3** | MESH:D012585 | Social Phobia | 7,427 | psychiatric_disorder |
| **P3** | MESH:D011605 | Psychoses, Substance-Induced | 7,265 | psychiatric_disorder |
| **P3** | MESH:D016574 | Seasonal Affective Disorder | 7,021 | psychiatric_disorder |
| **P3** | MESH:D057846 | Excoriation Disorder | 4,261 | psychiatric_disorder |
| **P3** | MESH:D000648 | Amnesia, Retrograde | 2,585 | neuropsych_symptom |
| **P3** | MESH:D020828 | Pseudobulbar Palsy | 1,769 | neurological_disorder |

### Concepts to RECLASSIFY in entity_rule (21 miscategorizations)

| Concept ID | Label | Papers | Current Family | Recommended Family | Rationale |
|---|---|---:|---|---|---|
| MESH:D009771 | OCD | 60,800 | behavior | psychiatric_disorder | DSM-5 OCD spectrum disorder |
| MESH:D010554 | Personality Disorders | 210,999 | behavior | psychiatric_disorder | DSM diagnosis category |
| MESH:D003193 | Compulsive PD | 8,392 | behavior | psychiatric_disorder | DSM personality disorder |
| MESH:D007174 | Impulse Control Disorders | 79,952 | behavior | psychiatric_disorder | DSM diagnostic category |
| MESH:D006212 | Hallucinations | 56,379 | behavior | neuropsych_symptom | Core neuropsychiatric symptom |
| MESH:D010259 | Paranoid Disorders | 19,387 | behavior | neuropsych_symptom | Neuropsychiatric phenotype |
| MESH:D002389 | Catatonia | 6,202 | behavior | neuropsych_symptom | Neuropsychiatric syndrome |
| MESH:D011595 | Psychomotor Agitation | 63,809 | behavior | neuropsych_symptom | Neuropsychiatric symptom |
| MESH:D003693 | Delirium | 49,607 | behavior | neuropsych_symptom | Neuropsychiatric emergency |
| MESH:D003072 | Cognition Disorders | 601,068 | behavior | neuropsych_symptom | Neuropsychiatric symptom domain |
| MESH:D008569 | Memory Disorders | 173,071 | behavior | neuropsych_symptom | Neuropsychiatric symptom |
| MESH:D016584 | Panic Disorder | 53,925 | neuropsych_symptom | psychiatric_disorder | Full DSM diagnosis |
| MESH:D010698 | Phobic Disorders | 35,624 | neuropsych_symptom | psychiatric_disorder | DSM anxiety disorder category |
| MESH:D014256 | Trichotillomania | 3,287 | neuropsych_symptom | psychiatric_disorder | DSM OCD-spectrum disorder |
| MESH:D006998 | Hypochondriasis | 4,455 | neuropsych_symptom | psychiatric_disorder | = Illness Anxiety Disorder (DSM-5) |
| ~~MESH:D006816~~ | ~~Hoarding Disorder~~ | 79,523 | neurological_disorder | neurological_disorder | **KEEP** — confirmed Huntington Disease, not Hoarding. Real Hoarding = D000067836 |
| MESH:D007319 | Insomnia | 109,155 | neurological_disorder | psychiatric_disorder | DSM-5 sleep-wake disorder |
| MESH:D003410 | Crying (pathological) | 5,961 | neurological_disorder | neuropsych_symptom | Neuropsychiatric symptom |
| MESH:D060825 | Cognitive Dysfunction | 167,250 | psychiatric_disorder | neuropsych_symptom | Symptom, not diagnosis |

### Concepts NOT in PubTator (17 — data gaps)

| Concept ID | Label | Category | Notes |
|---|---|---|---|
| MESH:D013405 | Suicide | Suicidality | **Critical gap** — PubTator may not annotate |
| MESH:D059020 | Suicidal Ideation | Suicidality | **Critical gap** |
| MESH:D016728 | Self-Injurious Behavior | Suicidality | |
| MESH:D000091029 | Suicide, Attempted | Suicidality | |
| MESH:D000374 | Aggression | Phenotypes | |
| MESH:D007175 | Impulsive Behavior | Phenotypes | |
| MESH:D000071085 | Apathy | Phenotypes | |
| MESH:D000080207 | Emotional Lability | Phenotypes | |
| MESH:D007508 | Irritable Mood | Phenotypes | |
| MESH:D053444 | Stupor | Phenotypes | |
| MESH:D003702 | Delusions | Phenotypes | |
| MESH:D003861 | Depersonalization | Dissociative | |
| MESH:D056344 | Executive Function | Cognitive | |
| MESH:D063045 | Schizophrenia Spectrum | Schizo | DSM-5 category, not classic MeSH |
| MESH:D063326 | Schizoaffective Disorder | Schizo | May not exist as separate MeSH |
| MESH:D065505 | Narcissistic PD | Personality | May not exist as separate MeSH |
| MESH:D000071180 | Functional Neurological Disorder | Somatic | |

---

## Pattern Analysis

### The "behavior" family problem
The `behavior` family_key is being used as a catch-all for psychiatric concepts that don't fit neatly elsewhere. **11 of 21 miscategorizations** involve concepts in `behavior` that should be either `psychiatric_disorder` or `neuropsych_symptom`. This suggests the original classification may have relied on PubTator's entity_type without clinical domain knowledge.

### Substance use blind spot
Substance use disorders are the most under-represented psychiatric category in entity_rule. Five major substance concepts totaling 1.3M+ papers are entirely missing. This is critical for C-L psychiatry where substance use is encountered in >30% of consultations.

### Neurodevelopmental gap
Both autism MESH codes (D001321 + D000067877 = 200K+ papers combined) are missing. ADHD (D001289) is the only neurodevelopmental concept in entity_rule.

### Suicidality data gap
Most suicidality MESH codes are absent from PubTator entirely. This may be a PubTator3 annotation limitation (suicide as a behavior may not be annotated as a "disease" entity). Only MESH:D015775 (Self-Injurious Behavior, 10K papers) exists. Consider supplementing with manual rules or alternative data sources.

---

## API-Discovered Additional Concepts

A second discovery pass using the PubTator3 autocomplete API (`/entity/autocomplete/`) found 39 additional concepts not in the original curated list. Clinically relevant additions:

| Priority | Concept ID | API Name | Papers | Recommended Family |
|---|---|---|---:|---|
| **P2** | MESH:D000072861 | Phobia, Social | 39,337 | psychiatric_disorder (already in rule) |
| **P2** | MESH:D052018 | Bulimia Nervosa (alt code) | 14,475 | psychiatric_disorder (already in rule) |
| **P3** | MESH:D012562 | Schizophrenia, Disorganized | 7,164 | psychiatric_disorder |
| **P3** | MESH:C562465 | Phobia, Specific | 6,962 | psychiatric_disorder |
| **P3** | MESH:D000405 | Akinetic Mutism | 3,229 | neuropsych_symptom |
| **P3** | MESH:D020324 | Amnesia, Anterograde | 3,096 | neuropsych_symptom |
| **P3** | MESH:D012560 | Schizophrenia, Catatonic | 2,849 | psychiatric_disorder |
| **P4** | MESH:D000068105 | Bipolar and Related Disorders | 545 | psychiatric_disorder |

### API corrections to original audit:
- **MESH:D006816** is Huntington Disease, NOT Hoarding Disorder. Real Hoarding = **MESH:D000067836** (817 papers, already in rule)
- **MESH:D054062** is listed as "Deaf-Blind Disorders" in some API contexts but maps to Schizotypal PD in MeSH — verify before adding
- **MESH:D000856** (Anorexia Nervosa) confirmed at 29K papers — the original D000855 code (74K) may actually be the broader "Anorexia" concept
- Social Phobia has two codes: **D012585** (7K, original) and **D000072861** (39K, API) — the latter is the preferred modern code and is already in entity_rule

---

## Methodology

1. **Known code lookup**: 101 MESH codes for psychiatric conditions compiled from MeSH Browser, cross-referenced against `pubtator.entity_annotations` using indexed `concept_id` queries
2. **Discovery search**: 28 key psychiatric terms searched as exact mention matches to find additional MESH codes
3. **PubTator3 API discovery**: 89 psychiatric terms queried via `/entity/autocomplete/` API, yielding 93 unique MESH codes (39 new, not in original list)
4. **Entity rule audit**: All found concepts checked against `solemd.entity_rule` for presence and family_key correctness
5. **Clinical validation**: Family_key recommendations based on DSM-5 diagnostic framework and C-L psychiatry clinical practice
