# PubTator3 Entity Analysis

> **Date**: 2026-03-19
> **Source**: `pubtator.entity_annotations` (318M rows) + `pubtator.relations` (24.7M rows)
> **Scope**: All candidate papers (14.06M PMIDs) in `solemd.corpus`

---

## Entity Type Value Ranking

| entity_type | Annotations | Distinct concept_ids | C-L Value | Notes |
|-------------|-------------|---------------------|-----------|-------|
| disease | ~80M | ~100K | **Highest** | Behaviors, symptoms, diagnoses — core domain |
| chemical | ~65M | ~90K | **High** | Drugs, neurotransmitters, metabolites |
| gene | ~55M | ~80K | **High** | Receptors, transporters, enzymes |
| species | ~30M | ~5K | Low | Mostly "human" / "mouse" — limited signal |
| mutation | ~15M | ~50K | Moderate | SNPs, variants — pharmacogenomics |
| cellline | ~8M | ~10K | Low | Lab context, not clinical |

**Key insight**: Disease entities are the richest signal for neuropsychiatric content because PubTator3 tags behavioral phenotypes (aggression, impulsivity, anhedonia) as diseases.

---

## Behavioral Entities

PubTator3 tags behavioral phenotypes under `entity_type = 'disease'`. These are central to C-L psychiatry but would be missed by journal-only filtering.

| concept_id | Name | Top mention | Papers | Graph ratio | min_cite |
|-----------|------|------------|--------|-------------|----------|
| MESH:D010554 | Aggression | "aggression" (48K) | 211K | 0.046 | 10 |
| MESH:D007174 | Impulsivity | "impulsivity" (23K) | 80K | 0.044 | 10 |
| MESH:D009771 | OCD behaviors | "obsessive-compulsive disorder" (12K) | 61K | 0.082 | 10 |
| MESH:D003072 | Cognitive impairment | "cognitive impairment" (92K) | 601K | 0.033 | 20 |
| MESH:D008569 | Memory impairment | "memory loss" (16K) | 173K | 0.057 | 10 |
| MESH:D003193 | Compulsive behaviors | "compulsive behaviors" (0.9K) | 8.4K | 0.119 | 5 |
| MESH:D000073932 | Compulsions | "compulsions" (1.2K) | 11K | 0.109 | 10 |
| MESH:D020921 | Arousal disorders | "anxious arousal" (0.6K) | 5K | 0.200 | 10 |

**Dropped behavioral candidates** (noisy or wrong concept_ids):
- MESH:D016388 — top mention is "loss" / "tooth loss", not behavioral
- MESH:D012816 — generic "symptoms" bucket
- MESH:D059445 — mixed with "physical disability"
- MESH:C000719212 — "fear" too broad (includes animal fear conditioning)
- MESH:D001308 — actually maps to inattention, mixed with ADHD
- MESH:D001523 — "psychiatric" (870K papers, too broad to be useful)

---

## Circuit Dysfunction Entities

Brain regions/circuits have NO dedicated entity type in PubTator3. However, dysfunction terms appear when NER triggers on structural pathology.

| concept_id | Name | Top mention | Papers | Issues |
|-----------|------|------------|--------|--------|
| MESH:D006331 | Corticolimbic | "diastolic dysfunction", "sexual dysfunction" | ~200K | Generic dysfunction bucket |
| MESH:C537734 | DMN/Salience | "Feingold syndrome", "abnormal intelligence" | ~15K | Mixed with genetic syndromes |
| MESH:C536673 | Frontoparietal | "frontoparietal tumors", "AVM" | ~5K | Tumor/malformation noise |

**All 6 circuit concept_ids HELD** — too noisy for automated promotion. Strategy: use dysfunction aliases in vocab instead (Step 3 of entity promotion plan).

---

## High-Graph-Ratio Neuropsych Diseases

Diseases with high graph ratios (fraction of papers already in graph tier) indicate strong domain relevance. Those NOT yet in graph tier are promotion candidates.

| concept_id | Name | Top mention | Papers | Graph ratio |
|-----------|------|------------|--------|-------------|
| MESH:D000091323 | PNES | "pseudoseizures" (0.3K) | 2.2K | 0.63 |
| MESH:D017109 | Akathisia | "akathisia" (3.3K) | 5.3K | 0.62 |
| MESH:D000341 | Affective psychosis | "psychotic depression" (1.6K) | 11K | 0.55 |
| MESH:D057174 | FTD | "frontotemporal lobar degeneration" (2.1K) | 9.2K | 0.48 |
| MESH:D004833 | Epilepsy | "temporal lobe epilepsy" (9.4K) | 36K | 0.44 |

**Dropped neuropsych disease candidates** (wrong concept_ids):
- MESH:D019967 — is schizophrenia spectrum, not substance use disorders
- MESH:D000088282 — is corticobasal degeneration, not autoimmune encephalitis
- MESH:D061218 — is treatment-resistant depression, not early-onset AD
- MESH:D012569 — is personality disorders, not suicidality

---

## High-Value Neurotransmitter Genes

Gene entities that serve as neurotransmitter system markers. These require a second gate (co-occurring disease entity or treat/cause relation) to avoid noise from pure genetics papers.

| concept_id | entity_type | Name | Top mention | Papers | min_cite |
|-----------|------------|------|------------|--------|----------|
| 627 | gene | BDNF | "BDNF" (15K) | 51K | 10 |
| 6531 | gene | DAT | "dopamine transporter" (4K) | 17K | 10 |
| 6532 | gene | SERT | "serotonin transporter" (3K) | 17K | 10 |
| 1312 | gene | COMT | "COMT" (4K) | 14K | 10 |
| 4128 | gene | MAOA | "MAO-A" (2K) | 7.5K | 5 |

**Dropped gene candidates**:
- 1995 — is ELAVL3/HuC (RNA binding protein), not ChAT
- 2550 — is Gbeta1 (G-protein subunit), not GABA-R
- 2902 — NR1 is ambiguous (nuclear receptor vs NMDA receptor subunit)

**Note**: Gene IDs 6531 and 6532 appear under BOTH `gene` AND `species` entity_types. All entity_rule JOINs must match on BOTH `entity_type` AND `concept_id`.

---

## Noise Entities — Stoplist Recommendations

High-frequency entities with no neuropsychiatric signal. Should be excluded from any entity-based scoring.

| concept_id | Name | Papers | Why noisy |
|-----------|------|--------|-----------|
| MESH:D014867 | Water | 1.4M | Ubiquitous chemical |
| MESH:D005947 | Glucose | 989K | Universal metabolite |
| 6597 | GAPDH | 155K | Housekeeping gene |
| - | (unmapped) | 5.5M | No concept_id assigned |

---

## Relation Type Value

| Relation | Count | C-L Value | Notes |
|----------|-------|-----------|-------|
| **treat** | 4.7M | **Gold** | Drug-disease pairs — pharmacotherapy network |
| **cause** | 2.7M | **Gold** | Etiology + adverse drug effects |
| associate | 8.2M | Low | Too broad, high false positive |
| stimulate | 1.8M | Moderate | Mechanism of action |
| inhibit | 1.6M | Moderate | Mechanism of action |
| interact | 1.2M | Moderate | Drug-drug, protein-protein |
| bind | 0.8M | Moderate | Receptor pharmacology |

### Top TREAT Pairs (Pharmacotherapy Network)

| Subject | Object | Count | Clinical domain |
|---------|--------|-------|----------------|
| Levodopa | Parkinson disease | 12K | Movement disorders |
| Fluoxetine | Depression | 8K | Mood disorders |
| Donepezil | Alzheimer disease | 7K | Cognitive disorders |
| Lithium | Bipolar disorder | 6K | Mood stabilization |
| Risperidone | Schizophrenia | 5K | Psychosis |
| Clozapine | Schizophrenia | 4K | Treatment-resistant psychosis |
| Carbamazepine | Epilepsy | 4K | Seizure disorders |

### Top CAUSE Pairs (Etiology + Adverse Effects)

| Subject | Object | Count | Type |
|---------|--------|-------|------|
| Haloperidol | Extrapyramidal symptoms | 3K | Adverse effect |
| Ethanol | Liver cirrhosis | 3K | Substance toxicity |
| Corticosteroids | Osteoporosis | 2K | Iatrogenic |
| Antipsychotics | Weight gain | 2K | Metabolic side effect |
| SSRIs | Serotonin syndrome | 1K | Drug toxicity |

---

## Five Natural Entity Clusters

Papers cluster naturally around disease entities, revealing the major subdomains:

| Cluster | Anchor diseases | Papers | Key drugs | Key genes |
|---------|----------------|--------|-----------|-----------|
| **Neurodegenerative** | Alzheimer, Parkinson, ALS, Huntington | ~2.5M | Donepezil, levodopa, riluzole | APP, MAPT, SNCA, SOD1 |
| **Affective** | Depression, bipolar, anxiety, PTSD | ~2.0M | Fluoxetine, lithium, ketamine | BDNF, SERT, COMT |
| **Epilepsy** | Epilepsy, seizures, status epilepticus | ~0.8M | Carbamazepine, valproate, levetiracetam | SCN1A, GABA-R |
| **Cerebrovascular** | Stroke, TBI, SAH, aneurysm | ~1.2M | tPA, nimodipine, mannitol | APOE |
| **Substance use** | Alcohol use, opioid use, cocaine, nicotine | ~0.6M | Naltrexone, methadone, buprenorphine | OPRM1, DRD2 |

---

## PubTator3 Anatomy Blind Spot

PubTator3 does NOT have a brain region or circuit entity type. Brain structures appear only when:
1. They co-occur with a disease term (e.g., "hippocampal atrophy" tagged as disease)
2. They appear as species-level annotations (rare)

**Mitigation strategy**: Dysfunction aliases in vocab (e.g., "amygdala dysfunction", "salience network dysconnectivity") create PubTator3-matchable strings that bridge the anatomy gap. These are generated as alias_type = `DY` with lower quality scores (55-65) than hand-curated aliases (75-90).

---

## C-L Bridge Entities

Entities that score highest on the bridge formula — appearing frequently as candidates but with low graph ratios, indicating they live in non-specialty journals.

**Bridge scoring formula**: `bridge_score = candidate_papers * graph_ratio * (1 - graph_ratio)`

Maximum bridge score occurs at graph_ratio = 0.5 (equally split between graph and candidate tiers).

| Entity | Papers | Graph ratio | Bridge score | Specialty crossings |
|--------|--------|-------------|-------------|---------------------|
| Pain | 890K | 0.091 | 73.6K | Rheumatology, orthopedics, anesthesia |
| Stroke | 520K | 0.148 | 65.5K | Cardiology, vascular surgery, rehab |
| Inflammation | 1.2M | 0.061 | 68.8K | Immunology, rheumatology, gastro |
| Diabetes | 780K | 0.038 | 28.5K | Endocrine, cardiology, nephrology |
| Hypertension | 650K | 0.045 | 27.9K | Cardiology, nephrology, obstetrics |
| Obesity | 450K | 0.067 | 28.1K | Endocrine, bariatric, cardiology |
| Sleep disorders | 180K | 0.156 | 23.7K | Pulmonology, ENT, cardiology |

These are Phase 1.5 targets — high-signal C-L papers waiting for PMI-based overlay promotion.

---

## Entity Stoplist Recommendations

For any entity-based scoring or graph construction, exclude:
1. **Ubiquitous chemicals**: water, glucose, oxygen, sodium chloride, ethanol (solvent context)
2. **Housekeeping genes**: GAPDH, beta-actin, 18S rRNA
3. **Generic diseases**: "disease", "syndrome", "symptoms", "disorder" (no specific concept)
4. **Unmapped entities**: concept_id = '-' or empty (5.5M annotations with no resolution)
5. **Species noise**: "human", "mouse", "rat" (present in nearly every paper)

---

## Future Work

### Missing concept_ids (need targeted PubTator3 queries)

| Concept | Why missing | Action |
|---------|-------------|--------|
| Anhedonia | No clean MESH ID found | Search PubTator3 for "anhedonia" mention → find concept_id |
| Apathy | No clean MESH ID found | Search for "apathy" mention |
| Hyperarousal | No clean MESH ID found | Search for "hyperarousal" mention |
| Fear conditioning | Too broad (MESH:C000719212 includes animal studies) | Find more specific concept_id |
| SUDs | MESH:D019967 is schizophrenia spectrum | Find correct SUD concept_id |
| Autoimmune encephalitis | MESH:D000088282 is corticobasal degeneration | Find correct concept_id |
| Early-onset AD | MESH:D061218 is treatment-resistant depression | Find correct concept_id |
| Suicidality | MESH:D012569 is personality disorders | Find correct concept_id |
| ChAT | Gene 1995 is ELAVL3/HuC | Find correct gene ID for choline acetyltransferase |
| GABA-R | Gene 2550 is Gbeta1 | Find correct gene ID for GABA receptor |
| NMDAR | Gene 2902 (NR1) is ambiguous | Find unambiguous NMDAR gene ID |

### Circuit entity rules (held for manual review)

All 6 proposed circuit concept_ids were too noisy for automated promotion. Potential approaches:
1. Find better MESH IDs by querying PubTator3 for specific circuit-related mentions
2. Use dysfunction aliases in vocab (implemented in round 1) to capture circuit papers via the vocab signal
3. Consider compound rules: circuit concept_id + co-occurring disease entity
