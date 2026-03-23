# Corpus Filter

> **Domain corpus**: 14.06M papers total (journal filter + PubTator3 vocab match)
> **Candidate tier**: ~11.32M papers live
> **Graph tier**: ~2.74M papers live (core journals + venue_rule + entity_rule + relation_rule)
> **Domain**: Neuroscience → Neurology → Psychiatry (bench to bedside)
> **Frame**: Consultation-Liaison — where neuro/psych concepts exist across ALL of medicine
> **Key constraint**: PMID required (bridge to PubTator3 annotations)

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  INPUTS (versioned, refreshable)                                        │
│                                                                         │
│  data/nlm_neuro_psych_journals.json   661 NLM-classified journals      │
│  engine/app/corpus/venues.py          Venue patterns (NLM gaps)        │
│  data/vocab_terms.tsv                 3,171 curated domain terms       │
│  data/vocab_aliases.tsv               29,099 aliases (avg 9.2/term)    │
│                                                                         │
│  These files ARE the filter definition. Edit them to refine the corpus. │
└────────────────────┬──────────────────────────────────┬─────────────────┘
                     │                                  │
                     ▼                                  ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│  STEP 1: PubTator3 stream    │    │  RAW DATA                            │
│                              │    │                                      │
│  bioconcepts2pubtator3.gz    │    │  S2 papers: 60 shards, 51 GB         │
│  (448M lines, 5.7 GB)       │    │  ~292M papers, ~50M with PMIDs       │
│                              │    │                                      │
│  Stream line by line:        │    │  PubTator3: entities + relations     │
│  → parse entity mentions     │    │  (448M + 39M lines)                  │
│  → match against vocab       │    │                                      │
│    aliases (29K, in-memory)  │    │  Refreshed: S2 weekly, PT3 monthly   │
│  → collect PMID set          │    └──────────────┬───────────────────────┘
│                              │                   │
│  Output: vocab_pmids set     │                   │
│  (~18M PMIDs, in memory)     │                   │
│  Time: ~5 min                │                   │
└──────────┬───────────────────┘                   │
           │                                       │
           ▼                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 2: Single DuckDB pass over S2 shards                              │
│                                                                         │
│  For each paper with a PMID, check TWO signals:                         │
│                                                                         │
│  Signal 1 — JOURNAL IDENTITY                                            │
│    Is this paper's venue in the NLM list (661 journals)?                │
│    OR does the venue match our patterns (%neurosci%, %psychiatr%, ...)?  │
│    → filter_reason = 'journal_match'                                    │
│    → Catches: ~4.0M papers from ~1,189 neuro/psych/pharmacol venues     │
│                                                                         │
│  Signal 2 — VOCAB ENTITY MATCH (the C-L bridge)                         │
│    Is this paper's PMID in the vocab_pmids set from Step 1?             │
│    → filter_reason = 'vocab_entity_match'                               │
│    → Catches: ~900K papers where neuro/psych terms appear in            │
│      cardiology, nephrology, rheumatology, heme, GI, etc.              │
│                                                                         │
│  Include paper IF: has_pmid AND (signal_1 OR signal_2)                  │
│  Papers matching both signals: filter_reason = 'journal_and_vocab'      │
│                                                                         │
│  Output: corpus_id, pmid, doi, pmc_id, filter_reason                   │
│          + full paper metadata (title, year, venue, citations, etc.)    │
│  Time: ~20 min for 60 shards                                           │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 3: Write to PostgreSQL                                            │
│                                                                         │
│  solemd.corpus   ← corpus_id, pmid, filter_reason                      │
│  solemd.papers   ← full metadata from S2 bulk                          │
│                                                                         │
│  Uses COPY for bulk insert. Idempotent via ON CONFLICT (corpus_id).     │
│  solemd.load_history tracks each run.                                   │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 3b: Venue-rule promotion                                          │
│                                                                         │
│  solemd.venue_rule contains specialty venues (critical_care, etc.)     │
│  Papers whose normalized venue matches → promoted to graph tier.       │
│  Source: NLM classification, venue patterns, manual C-L picks.         │
│  Adds ~41K additional papers to graph tier.                             │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 3d: Entity-rule promotion                                          │
│                                                                         │
│  solemd.entity_rule promotes candidates by PubTator3 concept_id.       │
│  Three confidence tiers:                                                │
│    high/moderate → promote if citation gate passes                     │
│    requires_second_gate → promote only if ALSO has high-confidence     │
│      entity match OR treat/cause relation on same PMID                │
│  Categories: behavior (14), neuropsych_disease (5), gene (5),         │
│              systemic_bridge (7), iatrogenic_syndrome (6),            │
│              endocrine_metabolic (2)                                  │
│  Live impact: +634,793 papers to graph tier (through 2026-03-20).     │
│  CLI: --promote-entities [--dry-run]                                   │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 3e: Relation-rule promotion                                       │
│                                                                         │
│  solemd.relation_rule promotes high-precision chemical->cause bridges.  │
│  Current baseline families: metabolic, cardiac, hematologic, GI,       │
│  neurologic, renal, dermatologic, and hepatic/pancreatic toxicity.     │
│  Overlay-targeted relation families can be staged later via             │
│  target_layer = 'overlay' without immediate promotion.                  │
│  Live impact: +87,108 papers to graph tier (through 2026-03-20).       │
│  CLI: --promote-relations [--dry-run]                                   │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 3c: Quality filter (graph_papers VIEW)                             │
│                                                                         │
│  graph_papers VIEW (null-safe ANY() logic) excludes from graph tier:   │
│  → Pre-1945 papers (keeps NULLs)                                       │
│  → Null/empty pub types with < 50 citations                            │
│  → News with < 50 citations                                            │
│  → LettersAndComments with < 50 citations                              │
│  → Editorials with < 20 citations                                      │
│  Purpose: Phase 2 export (Parquet, UMAP, clustering), NOT enrichment. │
│  Enrichment targets all graph-tier papers.                              │
│  Result: ~2.74M graph → ~2.60M quality-filtered for map export         │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 4: PubTator3 entity/relation loading                              │
│                                                                         │
│  Stream bioconcepts2pubtator3.gz AGAIN (same file, second pass):        │
│  → keep rows where PMID is in solemd.corpus                            │
│  → COPY into pubtator.entity_annotations (UNLOGGED)                    │
│  → build indexes after load                                             │
│                                                                         │
│  Same for relation2pubtator3.gz → pubtator.relations                    │
│  Time: ~10-15 min                                                       │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 5: S2 batch API enrichment (graph-tier only, background)           │
│                                                                         │
│  For graph-tier papers in solemd.corpus, pull via batch API:            │
│  → abstract, tldr, SPECTER2 embedding, text_availability               │
│  → UPDATE solemd.papers SET abstract = ..., embedding = ...             │
│                                                                         │
│  500 papers/request, 1 req/sec:                                         │
│    ~1.98M graph-tier papers → ~4K requests → ~1.1 hours                │
│  Resumable: skips papers already enriched.                              │
│  Candidate papers enriched later after Phase 1.5 promotion.            │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STEP 6: Retraction filter (post-build)                                  │
│                                                                         │
│  S2 dataset has no retraction flag. PubMed is authoritative.            │
│                                                                         │
│  solemd.papers.is_retracted BOOLEAN DEFAULT false                       │
│  Populated via PubMed E-utilities (esearch retracted[pt] by PMID).     │
│  Run after corpus build; re-run on monthly refresh.                     │
│  Downstream queries filter WHERE NOT is_retracted.                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Tiered Corpus: Candidate vs Graph

The completed filter run produced **14.06M candidate papers** and **1,980,474 graph-tier papers**. Three nested data layers manage what gets embedded, mapped, and rendered.

### Three Data Layers

| Layer | Size | What | Storage |
|-------|------|------|---------|
| **Database universe** | ~14.06M | All papers matching journal or vocab signal | Metadata + MedCPT index. Full PubTator3 entities (318M annotations, 24.7M relations). |
| **Mapped universe** | 3-5M | Papers with SPECTER2 embeddings + UMAP x/y coordinates | `is_mapped = true`. Pre-computed positions for instant overlay. |
| **Active canvas** | ~2M | Currently rendered in Cosmograph | Baseline (~1.85M, `is_default_visible = true`) + dynamic overlay from mapped universe. |

### Promotion Rules

**Phase 1 promotion** (SQL UPDATE after filter):
```sql
UPDATE solemd.corpus SET corpus_tier = 'graph'
WHERE filter_reason IN ('journal_match', 'pattern_match', 'journal_and_vocab');
```

**Venue-rule promotion** (specialty journals, via `solemd.clean_venue()` for consistent normalization):
```sql
UPDATE solemd.corpus c SET corpus_tier = 'graph'
FROM solemd.papers p
JOIN solemd.venue_rule vr ON solemd.clean_venue(p.venue) = vr.venue_normalized
WHERE c.corpus_id = p.corpus_id
  AND c.corpus_tier = 'candidate';
```

The `venue_rule` table captures specialty venues (critical care, psycho-oncology, etc.) identified by NLM classification, venue patterns, or manual C-L picks. Live effect after Migration 004: ~41K papers promoted into graph tier.

CLI: `uv run python -m app.corpus.filter --promote-venues` (runs automatically after filter, or standalone).

**Entity-rule promotion** (PubTator3 concept annotations, via `solemd.entity_rule`):
```sql
-- High/moderate confidence: direct promotion with citation gate
UPDATE solemd.corpus c SET corpus_tier = 'graph'
FROM solemd.papers p
JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
JOIN solemd.entity_rule er ON ea.entity_type = er.entity_type AND ea.concept_id = er.concept_id
WHERE c.corpus_id = p.corpus_id
  AND c.corpus_tier = 'candidate'
  AND er.confidence IN ('high', 'moderate')
  AND COALESCE(p.citation_count, 0) >= er.min_citation_count;

-- Second-gate: gene entities require co-occurring high-confidence entity OR treat/cause relation
```

The `entity_rule` table promotes candidate papers based on PubTator3 annotations. Live set: 39 rules across 6 categories: behavior (14), neuropsych_disease (5), neurotransmitter_gene (5), systemic_bridge (7), iatrogenic_syndrome (6), endocrine_metabolic (2). Live effect through 2026-03-20: +634,793 papers to graph tier. The final pre-freeze entity additions were hypoxia, respiratory insufficiency, acute lung injury, diabetic ketoacidosis, and myxedema.

CLI: `uv run python -m app.corpus.filter --promote-entities` (runs automatically after filter, or standalone).

**Relation-rule promotion** (PubTator3 relations, via `solemd.relation_rule`):
- current live use: `chemical -> cause -> disease`
- current baseline families: weight gain, metabolic syndrome, hyperglycemia, myocarditis, agranulocytosis, neutropenia, ileus, seizures, kidney injury, nephritis, acute kidney failure, toxic epidermal necrolysis, Stevens-Johnson syndrome, pancreatitis, hepatitis, drug-induced liver injury
- live effect through 2026-03-20: +87,108 papers to graph tier

CLI: `uv run python -m app.corpus.filter --promote-relations` (runs automatically after filter, or standalone).

### State Transitions

Papers track their progress through the mapping pipeline:

```
corpus_tier = 'candidate'  →  corpus_tier = 'graph'     (promoted by journal/venue_rule)
is_mapped = false          →  is_mapped = true           (SPECTER2 + UMAP computed)
is_default_visible = false →  is_default_visible = true  (in baseline canvas load)
```

### Quality Filter

The `graph_papers` VIEW applies quality filters for Phase 2 export and map visibility:
- Excludes pre-1945 papers
- Keeps null/empty publication types only if citation_count >= 50
- Keeps `News` only if citation_count >= 50
- Keeps `LettersAndComments` only if citation_count >= 50
- Keeps `Editorial` only if citation_count >= 20
- Result: ~2.74M graph → ~2.60M after quality filters

### Phase 1.5 — Overlay Promotion

Promotes high-signal C-L bridge papers from candidate to the mapped universe using a **reservoir/overlay** strategy:

- **PMI-based scoring**: Compute pointwise mutual information between vocab entities and non-specialty venues. Papers where neuro/psych terms appear unexpectedly in general medical contexts score highest.
- **Reservoir**: Pre-embed and pre-map top candidate papers with SPECTER2 + UMAP coordinates, stored as dormant (is_mapped = true, is_default_visible = false).
- **Overlay**: When the user explores a specialty topic, relevant mapped papers flow onto the active canvas from the reservoir. The graph feels alive — always ~2M papers, but which 2M changes based on what you're exploring.

The candidate pool is cheap (metadata only). Nothing is lost — bridge papers wait for empirical promotion rules, not guesswork.

---

## Signal 1: Journal Identity

Two complementary sources, unioned:

**NLM Catalog classification** (661 English journals)
- Subject terms queried: Psychiatry, Neurology, Behavioral Sciences,
  Substance-Related Disorders, Psychology
- Source: `data/nlm_neuro_psych_journals.json`
- Matching: exact (cleaned venue name = cleaned NLM title or MEDLINE abbreviation)

**Venue pattern matching** (16 LIKE patterns, fills NLM gaps)
- Catches: Frontiers series, Brain Research, psychopharmacology, cross-discipline neuro
- Patterns defined in `engine/app/corpus/filter.py:VENUE_PATTERNS`
- Cross-check on shard 0: captures ~5K papers/shard that NLM misses

```
Frontiers:        frontiers in neuro%, frontiers in psychiatr%,
                  frontiers in pharmacol%, frontiers in aging neuroscience,
                  frontiers in behavioral neuroscience
Brain Research:   brain research%, brain sciences
Pharmacology:     %neuropharmacol%, %psychopharmacol%
Cross-discipline: %neuropsychiatr%, %neuroimmunol%, %neuroendocrinol%,
                  %neuropathol%, %neurotoxicol%
```

---

## Signal 2: Vocab Entity Match (the C-L Bridge)

Papers in ANY journal where PubTator3 found a Disease, Chemical, or Gene
entity whose mention text matches a curated vocab alias.

**Why this is the point of the project**:
This signal captures the consultation-liaison map — where neuroscience and
psychiatry concepts exist across all of medicine. A single mention is
sufficient because the *existence* of a neuro/psych entity in a non-specialty
context IS the signal:

```
Circulation:        "QT prolongation + antipsychotics"     → pharmacovigilance
Kidney Int:         "lithium nephrotoxicity"                → renal-psych bridge
Blood:              "SSRI-induced platelet dysfunction"     → heme-psych bridge
Rheumatology:       "autoimmune encephalitis"               → neuroimmunology
Crit Care Med:      "ICU delirium + haloperidol"            → C-L core
Ann Surg:           "postoperative delirium"                → perioperative psych
```

The corpus isn't "neuroscience papers" — it's "papers where neuroscience-
psychiatry concepts exist in any medical context."

**Why this works technically**:
- PubTator3's NER handles context ("depression" as disease ≠ "cardiac depression")
- Vocab aliases handle coverage (29K names for 3,171 terms: brand names, synonyms, abbreviations)
- Entity type filter (Disease/Chemical/Gene only) excludes Species, Variant, CellLine noise
- Together: precise domain filtering without heuristic keyword guessing

**Alias length cutoff** (`>= 4` chars):
- Excludes 2-3 char aliases (AD, MAO, 5HT, ACh) — too ambiguous across biomedical literature
- Includes 4-char aliases (GABA, PTSD, ADHD, APOE, MAOI, SNRI, fMRI, MMSE) — clinically essential
- No per-category complexity needed: PubTator3's NER quality + entity type filter already gate noise
  from common English words at this length (e.g., PubTator3 won't annotate "home" as a Disease)

**Vocab categories used for matching** (from SoleMD.App):

| Category | Terms | What it catches |
|---|---|---|
| clinical.diagnosis | 375 | Schizophrenia, delirium, epilepsy, ADHD in JAMA/NEJM |
| clinical.symptom | 400 | Psychosis, insomnia, tremor in Lancet/BMJ |
| clinical.symptom.neuropsychiatric | 177 | Hallucinations, catatonia in Critical Care Med |
| intervention.pharmacologic | 285 | Sertraline, lithium, clozapine in Nature/Cell |
| intervention.pharmacologic.class | 80 | SSRIs, benzodiazepines, antipsychotics |
| neuroscience.neurotransmitter | 53 | Dopamine, serotonin, GABA in Science/PNAS |
| neuroscience.receptor | 97 | D2, NMDA, 5-HT2A in basic science journals |
| neuroscience.structure | 140 | Prefrontal cortex, amygdala, hippocampus |
| pharmacology.mechanism | 57 | Reuptake inhibition, receptor binding |
| pharmacology.enzyme | 45 | CYP2D6, MAO-A, COMT |
| biology.gene | 82 | BDNF, COMT, APOE in Nature Genetics |

---

## Actual Numbers (from completed filter run)

| Component | Papers |
|---|---|
| Signal 1: journal identity (journal_match + pattern_match) | ~2.0M |
| Signal 2: vocab entity match (expansion) | ~12.8M |
| Overlap (journal_and_vocab) | ~0.8M |
| **Combined domain corpus** | **14,060,679** |
| **Candidate tier (live after promotions)** | **11,316,980** |
| **Graph tier (live after venue/entity/relation promotions)** | **2,743,699** |
| After quality filters (graph_papers VIEW, live) | **2,599,157** |
| Entity annotations loaded | 318M |
| Relations loaded | 24.7M |
| Venue-rule additions (live) | ~41K |
| Entity-rule additions (live) | 634,793 |
| Relation-rule additions (live) | 87,108 |

The tiered approach now gives you a much broader first-pass baseline across bedside neuropsychiatry, systemic encephalopathy, respiratory brain-failure, endocrine-metabolic reversibility, and high-yield iatrogenic syndromes while still preserving ~11.32M candidate papers for future overlay-style promotion.

---

## Reproducibility and Refresh

### Monthly refresh cycle

```
TRIGGER: New S2 release (weekly) or PubTator3 FTP update (monthly)

1. DOWNLOAD
   S2:  GET /datasets/v1/diffs/{last_release}/to/latest/papers
        → incremental diff (new + changed papers only)
   PT3: curl ftp.ncbi.nlm.nih.gov/.../bioconcepts2pubtator3.gz
        → full monthly dump (no incremental available)

2. RE-RUN FILTER
   Same pipeline, same config files, new data.
   Step 1: stream new PT3 dump → updated vocab_pmids set
   Step 2: scan S2 diffs (not all 60 shards) → new corpus members
   Step 3: UPSERT into solemd.corpus + solemd.papers

3. RE-LOAD PUBTATOR
   Stream new PT3 dump → filter by updated corpus PMIDs
   Atomic swap: load into staging tables, then rename

4. ENRICH NEW PAPERS
   Batch API for papers missing abstract/embedding/tldr
   Resumable: only fetches what's missing
```

### What makes this reproducible

- **Filter config is files, not code**: `nlm_neuro_psych_journals.json`,
  `venues.py` patterns, `vocab_terms.tsv`, `vocab_aliases.tsv`.
  Change a file, re-run, get a different corpus. No code changes needed.

- **Idempotent writes**: `ON CONFLICT (corpus_id) DO UPDATE` means running
  the filter twice gives the same result. Safe to re-run.

- **Load history tracking**: `solemd.load_history` records each run with
  source, row counts, timestamp, and filter config hash.

- **filter_reason audit trail**: every paper records WHY it's in the corpus.
  If you change the filter, you can see which papers came from which signal.

### Honing over time

The filter improves through three levers:

```
LEVER 1: VOCAB GROWTH (highest impact)
  SoleMD.App's vocab grows as new terms are promoted.
  Re-export vocab_terms.tsv + vocab_aliases.tsv.
  Re-run filter → new papers appear from general journals.
  Example: add "psilocybin" as a term → catches Nature papers on psychedelics.

LEVER 1b: DYSFUNCTION ALIASES (high impact, automated)
  Generate "X dysfunction", "X atrophy", "X hyperactivation" for brain structures
  and "X dysfunction", "X dysconnectivity", "X hypoactivation" for networks.
  Bridges PubTator3's anatomy blind spot — brain regions have no entity type,
  but dysfunction terms trigger disease NER.
  alias_type = 'DY', lower scores (55-65) than hand-curated (75-90).
  Round 1: 558 aliases (140 structures × 3 + 43 networks × 3 + 3 new × 3).

LEVER 2: JOURNAL LIST EDITS (medium impact)
  Add/remove journals from nlm_neuro_psych_journals.json
  or venue patterns in venues.py.
  Example: add Critical Care Medicine as an explicit include.

LEVER 3: S2/PT3 DATA FRESHNESS (automatic)
  Monthly refresh brings in newly published papers.
  No filter changes needed — same criteria, new data.
```

---

## Implementation Structure

```
engine/app/corpus/
├── venues.py          # Signal 1: NLM list + venue patterns
│                        load_nlm_venues(), register_duckdb_helpers()
│
├── vocab.py           # Signal 2: vocab alias loading + PubTator3 matching
│                        load_vocab_aliases(), stream_pubtator_matches()
│
├── filter.py          # Orchestrator: combines signals, writes to PG
│                        main() runs the full pipeline:
│                          1. stream_pubtator_matches() → vocab_pmids set
│                          2. DuckDB scan with journal + vocab filters
│                          3. COPY results to solemd.corpus + solemd.papers
│                          4. log to solemd.load_history
│
├── pubtator.py        # PubTator3 entity/relation loading (Step 4)
│                        stream_and_load_entities(), stream_and_load_relations()
│
├── s2_client.py       # S2 API client with rate limiting
│                        fetch_batch(), exponential backoff
│
├── enrich.py          # Batch API enrichment (Step 5)
│                        fill abstract/tldr/embedding for corpus papers
│
└── explore.py         # DuckDB exploration (development tool)
```

All runnable as `cd engine && uv run python -m app.corpus.<module>`.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| C-L frame, not neuro-only | The corpus captures where neuro/psych concepts live across ALL of medicine. Signal 2 is the C-L bridge, not noise. |
| Single pass, not phases | Simpler pipeline. Both signals evaluated together. |
| PubTator3 streaming before DuckDB | Vocab PMID set must be in memory for the DuckDB join. ~18M PMIDs ≈ ~150 MB — fits easily. |
| NLM + patterns hybrid | NLM is authoritative but has gaps (Frontiers, Brain Research). Patterns fill gaps. Neither alone is sufficient. |
| Vocab aliases, not title keywords | 29K curated aliases vs ad-hoc keywords. Aliases include brand names, abbreviations, UMLS synonyms. |
| Alias cutoff >= 4 chars | Recovers GABA/PTSD/ADHD/APOE/MAOI/SNRI/fMRI/MMSE (+354 aliases). PubTator3 NER + entity type filter (Disease/Chemical/Gene) already prevents false matches from common English words at this length. Simpler than per-category cutoffs. |
| PubTator3 NER, not raw title matching | Context-aware: "depression" as Disease ≠ "cardiac depression". False positive rate ~10x lower than title matching. |
| Pharmacology included | Bench-to-bedside requires receptor binding, PK/PD, drug mechanism data. ~670K papers from pharmacology journals. |
| Non-English excluded | Non-English journals won't have useful English abstracts for RAG or meaningful graph connections. |
| PMID required | Non-negotiable bridge to PubTator3 entity annotations. ~17% of S2 papers have PMIDs. |
| filter_reason tracked | Audit trail: know why each paper is in the corpus. Essential for refinement. |
| Retracted papers excluded | `is_retracted` column on solemd.papers, populated post-build via PubMed E-utilities. S2 dataset has no retraction flag. |
| Refresh-ready | S2 diffs + PT3 monthly dumps. Filter is idempotent. Config is files, not code. |
