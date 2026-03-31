# PubTator C-L Psychiatry Concept Audit

> Generated: 2026-03-31
> Source: PubTator3 autocomplete API (`entity/autocomplete`) + batch `pubtator.entity_annotations` indexed query
> Purpose: Discover MESH concepts for C-L psychiatry conditions missing from `solemd.entity_rule`

Legend:
- **IN** = already in entity_rule (with current family_key)
- **MISSING** = not in entity_rule — candidate for addition
- Paper counts = distinct PMIDs in local PubTator corpus (indexed concept_id query)

---

## A. Autoimmune Encephalitis

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D060426 | Anti-NMDA Receptor Encephalitis | 4,986 | IN (neurological_disorder) | — |
| MESH:D020274 | Autoimmune Diseases of the Nervous System | 42,215 | IN (neurological_disorder) | — |
| MESH:C531729 | Autoimmune Limbic Encephalitis | 535 | MISSING | autoimmune_encephalitis |
| MESH:C535841 | Hashimoto's Encephalitis / SREAT | 1,188 | MISSING | autoimmune_encephalitis |
| MESH:D004660 | Encephalitis (general — catches LGI1, CASPR2, Rasmussen) | 71,895 | IN (neurological_disorder) | — |
| MESH:C535291 | Rasmussen Subacute Encephalitis | 4 | MISSING | autoimmune_encephalitis |
| MESH:D020363 | Limbic Encephalitis | 5,191 | IN (neurological_disorder) | — |
| MESH:D020945 | Lupus Vasculitis, CNS (neuropsychiatric lupus / NPSLE) | 3,985 | MISSING | autoimmune_neuropsychiatric |
| MESH:D012859 | Sjögren's Syndrome | 33,746 | MISSING | systemic_autoimmune |
| MESH:D016111 | Sjögren-Larsson Syndrome | 2,230 | MISSING | neurological_disorder |
| MESH:D001528 | Behcet Syndrome | 33,920 | MISSING | systemic_autoimmune |
| MESH:C535814 | Neurosarcoidosis | 2,552 | MISSING | autoimmune_neuropsychiatric |

**API gaps** (no autocomplete result — may need manual MESH lookup):
- LGI1 encephalitis, CASPR2 encephalitis, GABA-B encephalitis, DPPX encephalitis
- IgLON5 disease, GAD65 encephalitis, GFAP astrocytopathy, autoimmune psychosis

---

## B. Paraneoplastic Syndromes

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D010257 | Paraneoplastic Syndromes | 15,677 | MISSING | paraneoplastic |
| MESH:D020361 | Paraneoplastic Syndromes, Nervous System | 2,702 | MISSING | paraneoplastic |
| MESH:D059545 | Paraneoplastic Syndromes, Ocular | 1,534 | MISSING | paraneoplastic |
| MESH:D020362 | Paraneoplastic Cerebellar Degeneration | 1,133 | IN (neurological_disorder) | — |
| MESH:D016750 | Stiff-Person Syndrome | 28,260 | IN (neurological_disorder) | — |
| MESH:C538136 | Hereditary Hyperekplexia | 942 | MISSING | neurological_disorder |
| MESH:D053578 | Opsoclonus-Myoclonus Syndrome | 3,533 | MISSING | paraneoplastic |
| MESH:D009188 | Myelitis, Transverse | 12,425 | IN (neurological_disorder) | — |

**API gaps**: anti-Hu syndrome, anti-Ma2 encephalitis (no autocomplete result)

---

## C. Infectious Neuropsychiatric Conditions

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D020803 | Encephalitis, Herpes Simplex | 32,048 | IN (neurological_disorder) | — |
| MESH:D015526 | AIDS Dementia Complex | 5,731 | MISSING | infectious_neuropsych |
| MESH:D009494 | Neurosyphilis | 8,259 | IN (neurological_disorder) | — |
| MESH:D013606 | Tabes Dorsalis | 1,439 | MISSING | infectious_neuropsych |
| MESH:D020852 | Lyme Neuroborreliosis | 2,925 | MISSING | infectious_neuropsych |
| MESH:D014390 | Tuberculosis, Meningeal | 49,513 | MISSING | infectious_neuropsych |
| MESH:D008061 | Whipple Disease | 2,489 | MISSING | infectious_neuropsych |
| MESH:D007562 | Creutzfeldt-Jakob Syndrome | 18,818 | IN (neurological_disorder) | — |
| MESH:C565143 | Creutzfeldt-Jakob Disease, Sporadic | 2,169 | MISSING | prion_disease |
| MESH:C566981 | Creutzfeldt-Jakob Disease, Heidenhain Variant | 49 | MISSING | prion_disease |
| MESH:D017096 | Prion Diseases | 24,090 | IN (neurological_disorder) | — |
| MESH:D007968 | Leukoencephalopathy, Progressive Multifocal | 9,383 | IN (neurological_disorder) | — |
| MESH:D016919 | Meningitis, Cryptococcal | 7,878 | MISSING | infectious_neuropsych |
| MESH:D020019 | Neurocysticercosis | 5,551 | IN (neurological_disorder) | — |
| MESH:D016779 | Malaria, Cerebral | 8,315 | IN (neurological_disorder) | — |

**API gaps**: HIV associated neurocognitive disorder (HAND), COVID-19 encephalitis (no autocomplete result)

---

## D. Epilepsy Neuropsychiatry

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D004827 | Epilepsy | 268,915 | IN (neurological_disorder) | — |
| MESH:D004833 | Epilepsy, Temporal Lobe | 36,190 | IN (neuropsych_disease) | — |
| MESH:D004830 | Epilepsy, Tonic-Clonic | 32,657 | MISSING | epilepsy_neuropsych |
| MESH:D004832 | Epilepsy, Absence | 22,523 | MISSING | epilepsy_neuropsych |
| MESH:D004834 | Epilepsy, Post-Traumatic | 35,386 | MISSING | epilepsy_neuropsych |
| MESH:D013226 | Status Epilepticus | 38,112 | IN (neurological_disorder) | — |
| MESH:D020270 | Alcohol Withdrawal Seizures | 3,348 | MISSING | epilepsy_neuropsych |

**API gaps**: postictal psychosis, interictal dysphoric disorder, forced normalization, nonconvulsive status epilepticus (no autocomplete results — rare/specific terms)

---

## E. TBI Neuropsychiatry

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D000070642 | Brain Injuries, Traumatic | 115,594 | IN (neurological_disorder) | — |
| MESH:D001924 | Brain Concussion | 21,850 | MISSING | tbi_neuropsych |
| MESH:D038223 | Post-Concussion Syndrome | 5,503 | IN (psychiatric_disorder) | — |
| MESH:D000070627 | Chronic Traumatic Encephalopathy | 3,461 | IN (psychiatric_disorder) | — |

**API gaps**: post-traumatic psychosis (no autocomplete result)

---

## F. Toxic-Metabolic Encephalopathies

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D006501 | Hepatic Encephalopathy | 26,088 | IN (systemic_bridge) | — |
| MESH:D014899 | Wernicke Encephalopathy | 4,414 | MISSING | toxic_metabolic |
| MESH:D020915 | Korsakoff Syndrome | 2,907 | IN (neurological_disorder) | — |
| MESH:D000076042 | Alcoholic Korsakoff Syndrome | 306 | MISSING | toxic_metabolic |
| MESH:D006527 | Hepatolenticular Degeneration (Wilson Disease) | 21,059 | IN (neurological_disorder) | — |
| MESH:D011164 | Porphyrias | 3,848 | MISSING | toxic_metabolic |
| MESH:D017118 | Porphyria, Acute Intermittent | 2,915 | MISSING | toxic_metabolic |
| MESH:C562618 | Porphyria, Acute Hepatic | 2,158 | MISSING | toxic_metabolic |
| MESH:D017119 | Porphyria Cutanea Tarda | 3,354 | MISSING | toxic_metabolic |
| MESH:D046350 | Porphyria, Variegate | 4,070 | MISSING | toxic_metabolic |
| MESH:D017590 | Myelinolysis, Central Pontine | 2,074 | IN (neurological_disorder) | — |
| MESH:D001928 | Brain Diseases, Metabolic | 10,209 | MISSING | toxic_metabolic |

**API gaps**: uremic encephalopathy, osmotic demyelination syndrome (no autocomplete result)

---

## G. Cerebrovascular Neuropsychiatry

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D046589 | CADASIL | 3,329 | IN (neurological_disorder) | — |
| MESH:D020293 | Vasculitis, Central Nervous System | 4,899 | MISSING | cerebrovascular |
| MESH:D020943 | AIDS Arteritis, CNS | 1,969 | MISSING | cerebrovascular |
| MESH:D016736 | Antiphospholipid Syndrome | 21,807 | MISSING | systemic_autoimmune |
| MESH:C531622 | Familial Antiphospholipid Syndrome | 7,269 | MISSING | systemic_autoimmune |

**API gaps**: strategic infarct dementia (no autocomplete result)

---

## H. Other Neuropsychiatric Conditions

| Concept ID | MESH Name | Papers | Status | Recommended family_key |
|---|---|---|---|---|
| MESH:D006850 | Hydrocephalus, Normal Pressure | 6,093 | IN (psychiatric_disorder) | — |
| MESH:D009459 | Neuroleptic Malignant Syndrome | 5,669 | IN (iatrogenic_syndrome) | — |
| MESH:D020230 | Serotonin Syndrome | 5,438 | IN (iatrogenic_syndrome) | — |
| MESH:D054038 | Posterior Leukoencephalopathy Syndrome (PRES) | 8,482 | IN (psychiatric_disorder) | — |
| MESH:D003693 | Delirium | 49,607 | IN (behavior) | — |
| MESH:D000071257 | Emergence Delirium | 7,458 | MISSING | iatrogenic_neuropsych |
| MESH:D000430 | Alcohol Withdrawal Delirium | 3,009 | IN (neuropsych_symptom) | — |
| MESH:D002389 | Catatonia | 6,202 | IN (behavior) | — |
| MESH:D000405 | Akinetic Mutism | 3,229 | MISSING | neurological_disorder |
| MESH:D065166 | Sepsis-Associated Encephalopathy | 1,042 | MISSING | toxic_metabolic |
| MESH:D019965 | Neurocognitive Disorders | 49,556 | IN (neurological_disorder) | — |

**API gaps**: steroid psychosis, immune checkpoint inhibitor neurotoxicity, calcineurin inhibitor neurotoxicity, tacrolimus neurotoxicity (no autocomplete results)

---

## Summary

### Already in entity_rule: 33 concepts

| Concept ID | family_key | Canonical Name |
|---|---|---|
| MESH:D060426 | neurological_disorder | Anti-NMDA Receptor Encephalitis |
| MESH:D020274 | neurological_disorder | Autoimmune Encephalitis |
| MESH:D004660 | neurological_disorder | Acute Disseminated Encephalomyelitis |
| MESH:D020363 | neurological_disorder | Limbic Encephalitis |
| MESH:D020362 | neurological_disorder | Paraneoplastic Cerebellar Degeneration |
| MESH:D016750 | neurological_disorder | Stiff-Person Syndrome |
| MESH:D009188 | neurological_disorder | Acute Transverse Myelitis |
| MESH:D020803 | neurological_disorder | Herpes Simplex Encephalitis |
| MESH:D009494 | neurological_disorder | Neurosyphilis |
| MESH:D007562 | neurological_disorder | Creutzfeldt-Jakob Disease |
| MESH:D017096 | neurological_disorder | Prion Disease |
| MESH:D007968 | neurological_disorder | Progressive Multifocal Leukoencephalopathy |
| MESH:D020019 | neurological_disorder | Neurocysticercosis |
| MESH:D016779 | neurological_disorder | Cerebral Malaria |
| MESH:D004827 | neurological_disorder | Epilepsy |
| MESH:D004833 | neuropsych_disease | Epilepsy, Temporal Lobe |
| MESH:D013226 | neurological_disorder | Status Epilepticus |
| MESH:D000070642 | neurological_disorder | Traumatic Brain Injury |
| MESH:D038223 | psychiatric_disorder | Post-Concussion Syndrome |
| MESH:D000070627 | psychiatric_disorder | Chronic Traumatic Encephalopathy |
| MESH:D006501 | systemic_bridge | Hepatic Encephalopathy |
| MESH:D020915 | neurological_disorder | Wernicke-Korsakoff Syndrome |
| MESH:D006527 | neurological_disorder | Wilson Disease |
| MESH:D017590 | neurological_disorder | Central Pontine Myelinolysis |
| MESH:D046589 | neurological_disorder | CADASIL |
| MESH:D006850 | psychiatric_disorder | Normal Pressure Hydrocephalus |
| MESH:D009459 | iatrogenic_syndrome | Neuroleptic Malignant Syndrome |
| MESH:D020230 | iatrogenic_syndrome | Serotonin Syndrome |
| MESH:D054038 | psychiatric_disorder | Posterior Reversible Encephalopathy Syndrome |
| MESH:D003693 | behavior | Delirium |
| MESH:D000430 | neuropsych_symptom | Alcohol Withdrawal Delirium |
| MESH:D002389 | behavior | Catatonia |
| MESH:D019965 | neurological_disorder | Mild Neurocognitive Disorder |

### Missing from entity_rule: 51 concepts — HIGH PRIORITY

| Concept ID | MESH Name | Papers | Category | Recommended family_key |
|---|---|---|---|---|
| MESH:D014390 | Tuberculosis, Meningeal | 49,513 | C | infectious_neuropsych |
| MESH:D004834 | Epilepsy, Post-Traumatic | 35,386 | D | epilepsy_neuropsych |
| MESH:D012859 | Sjögren's Syndrome | 33,746 | A | systemic_autoimmune |
| MESH:D001528 | Behcet Syndrome | 33,920 | A | systemic_autoimmune |
| MESH:D004830 | Epilepsy, Tonic-Clonic | 32,657 | D | epilepsy_neuropsych |
| MESH:D004832 | Epilepsy, Absence | 22,523 | D | epilepsy_neuropsych |
| MESH:D016736 | Antiphospholipid Syndrome | 21,807 | G | systemic_autoimmune |
| MESH:D001924 | Brain Concussion | 21,850 | E | tbi_neuropsych |
| MESH:D010257 | Paraneoplastic Syndromes | 15,677 | B | paraneoplastic |
| MESH:D013132 | Spinocerebellar Degenerations | 11,537 | A | neurological_disorder |
| MESH:D001928 | Brain Diseases, Metabolic | 10,209 | F | toxic_metabolic |
| MESH:D054038 | (already in — PRES) | — | — | — |
| MESH:D000071257 | Emergence Delirium | 7,458 | H | iatrogenic_neuropsych |
| MESH:C531622 | Familial Antiphospholipid Syndrome | 7,269 | G | systemic_autoimmune |
| MESH:D015526 | AIDS Dementia Complex | 5,731 | C | infectious_neuropsych |
| MESH:D020293 | Vasculitis, CNS | 4,899 | G | cerebrovascular |
| MESH:D014899 | Wernicke Encephalopathy | 4,414 | F | toxic_metabolic |
| MESH:D046350 | Porphyria, Variegate | 4,070 | F | toxic_metabolic |
| MESH:D020945 | Lupus Vasculitis, CNS (NPSLE) | 3,985 | A | autoimmune_neuropsychiatric |
| MESH:D011164 | Porphyrias | 3,848 | F | toxic_metabolic |
| MESH:D053578 | Opsoclonus-Myoclonus Syndrome | 3,533 | B | paraneoplastic |
| MESH:D017119 | Porphyria Cutanea Tarda | 3,354 | F | toxic_metabolic |
| MESH:D020270 | Alcohol Withdrawal Seizures | 3,348 | D | epilepsy_neuropsych |
| MESH:D000405 | Akinetic Mutism | 3,229 | H | neurological_disorder |
| MESH:D020852 | Lyme Neuroborreliosis | 2,925 | C | infectious_neuropsych |
| MESH:D017118 | Porphyria, Acute Intermittent | 2,915 | F | toxic_metabolic |
| MESH:D020361 | Paraneoplastic Syndromes, Nervous System | 2,702 | B | paraneoplastic |
| MESH:C535814 | Neurosarcoidosis | 2,552 | A | autoimmune_neuropsychiatric |
| MESH:D008061 | Whipple Disease | 2,489 | C | infectious_neuropsych |
| MESH:D016111 | Sjögren-Larsson Syndrome | 2,230 | A | neurological_disorder |
| MESH:C565143 | Creutzfeldt-Jakob Disease, Sporadic | 2,169 | C | prion_disease |
| MESH:C562618 | Porphyria, Acute Hepatic | 2,158 | F | toxic_metabolic |
| MESH:D020943 | AIDS Arteritis, CNS | 1,969 | G | cerebrovascular |
| MESH:D059545 | Paraneoplastic Syndromes, Ocular | 1,534 | B | paraneoplastic |
| MESH:D013606 | Tabes Dorsalis | 1,439 | C | infectious_neuropsych |
| MESH:C535841 | Hashimoto's Encephalitis / SREAT | 1,188 | A | autoimmune_encephalitis |
| MESH:D065166 | Sepsis-Associated Encephalopathy | 1,042 | H | toxic_metabolic |
| MESH:C538136 | Hereditary Hyperekplexia | 942 | B | neurological_disorder |
| MESH:C531729 | Autoimmune Limbic Encephalitis | 535 | A | autoimmune_encephalitis |
| MESH:C565728 | Alzheimer + Prion Pathology (familial) | 482 | C | prion_disease |
| MESH:C536990 | Mowat-Wilson Syndrome | 477 | F | neurological_disorder |
| MESH:D000076042 | Alcoholic Korsakoff Syndrome | 306 | F | toxic_metabolic |
| MESH:C566981 | CJD Heidenhain Variant | 49 | C | prion_disease |
| MESH:C566398 | Huntington Disease-Like 1 | 45 | C | neurological_disorder |
| MESH:C536668 | Sjögren-Larsson-like Syndrome | 40 | A | neurological_disorder |
| MESH:C535273 | Presenile Dementia, Kraepelin Type | 25 | H | neurological_disorder |
| MESH:C567519 | Essential Tremor + NPH | 15 | H | neurological_disorder |
| MESH:C535291 | Rasmussen Subacute Encephalitis | 4 | A | autoimmune_encephalitis |
| MESH:C566769 | Porphyria AIP Nonerythroid Variant | 4 | F | toxic_metabolic |
| MESH:C536669 | Sjögren-Mikulicz Syndrome | 4 | A | systemic_autoimmune |

### Concepts not found via PubTator3 API (manual MESH lookup needed)

| Search Term | Category | Notes |
|---|---|---|
| LGI1 encephalitis | A | Likely maps to D004660 (general Encephalitis) |
| CASPR2 encephalitis | A | Likely maps to D004660 (general Encephalitis) |
| GABA-B encephalitis | A | Likely maps to D004660 (general Encephalitis) |
| DPPX encephalitis | A | Likely maps to D004660 (general Encephalitis) |
| IgLON5 disease | A | Relatively new entity — may not have MESH code |
| GAD65 encephalitis | A | May map to D020274 (Autoimmune Diseases of NS) |
| GFAP astrocytopathy | A | Very new entity — likely no MESH code yet |
| autoimmune psychosis | A | Maps to D011618 (Psychotic Disorders) — already covered |
| anti-Hu syndrome | B | Maps to D065766 (found in text search, not API) |
| anti-Ma2 encephalitis | B | Rare — maps to D004660 |
| HIV associated neurocognitive disorder | C | HAND — maps to D016263 (found in text search) |
| COVID-19 encephalitis | C | Very new — may not have specific MESH |
| postictal psychosis | D | No specific MESH — maps to D011618 |
| interictal dysphoric disorder | D | No MESH code — clinical concept only |
| forced normalization | D | Extremely rare — C537354 found in text search |
| nonconvulsive status epilepticus | D | Maps to D013226 (Status Epilepticus) |
| post-traumatic psychosis | E | No specific MESH |
| uremic encephalopathy | F | Maps to D006463 (found in text search) |
| osmotic demyelination syndrome | F | Maps to D003711 (found in text search) |
| strategic infarct dementia | G | No specific MESH — clinical concept |
| steroid psychosis | H | No specific MESH — maps to D011618 |
| immune checkpoint inhibitor neurotoxicity | H | Very new — no MESH code |
| calcineurin inhibitor neurotoxicity | H | No MESH code |
| tacrolimus neurotoxicity | H | No MESH code |

### Proposed new family_keys

| family_key | Description | Concept count |
|---|---|---|
| autoimmune_encephalitis | Antibody-mediated encephalitides | 3 |
| autoimmune_neuropsychiatric | Autoimmune with prominent neuropsych features | 2 |
| systemic_autoimmune | Systemic autoimmune with neuropsych manifestations | 5 |
| paraneoplastic | Paraneoplastic syndromes | 4 |
| infectious_neuropsych | Infectious causes of neuropsychiatric illness | 7 |
| prion_disease | Prion disease subtypes | 3 |
| epilepsy_neuropsych | Epilepsy subtypes and related phenomena | 4 |
| tbi_neuropsych | TBI-related conditions | 1 |
| toxic_metabolic | Metabolic/toxic encephalopathies | 10 |
| cerebrovascular | Cerebrovascular causes of neuropsych illness | 3 |
| iatrogenic_neuropsych | Drug/treatment-induced neuropsych conditions | 1 |
