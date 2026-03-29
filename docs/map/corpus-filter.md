# Corpus Filter

> **Goal**: build a domain-rich corpus and a clean base scaffold
> **Target base**: roughly `1.0M` high-quality points
> **Long-term universe**: mapped papers that remain available for later overlay promotion

This document describes the corpus-admission pipeline, not the browser runtime.
The runtime uses `base_points`, `universe_points`, and active DuckDB views. The
filtering job decides which papers enter the corpus and which of those qualify
for base admission.

---

## Filter Inputs

The filter is driven by four inputs:

1. A curated journal list for the neuro / psych / neuroscience domain.
2. Venue patterns that catch NLM gaps.
3. A curated vocab alias set for PubTator3 entity matching.
4. PubTator3 annotations and relations for rule-based admission.

The important principle is that the filter should preserve breadth across
medicine while still keeping the opening scaffold high quality.

---

## Canonical Admission Model

The older multi-tier admission model is replaced by two simple decisions:

- **Corpus admission**: does the paper belong in the mapped domain corpus?
- **Base admission**: should the paper be in the always-loaded scaffold?

That yields three useful states:

- `admitted` - the paper belongs in the corpus
- `mapped` - the paper has coordinates for the current graph run
- `in_base` - the paper belongs in `base_points`

Everything else remains in `universe_points` for later promotion.

---

## Pipeline

### Step 1 - Build the vocab PMID set

Stream PubTator3 annotations and collect PMIDs whose mentions match the curated
vocab aliases. This is the consultation-liaison link across all of medicine.

Outputs:

- a PMID set for direct vocab hits
- audit counts by alias group
- a stable filter input for the paper pass

### Step 2 - Scan Semantic Scholar papers

Run a single DuckDB pass over the S2 papers dataset and admit papers when they
meet either signal:

- journal identity matches the curated journal list or venue patterns
- PMID appears in the vocab PMID set

Papers matching both signals are retained as joint-evidence admissions.

The result is the domain corpus: papers that are relevant to the graph and
worth carrying forward into mapping and base admission.

### Step 3 - Write canonical corpus tables

Persist the admitted corpus into:

- `solemd.corpus`
- `solemd.papers`

At this stage the paper is in the mapped domain corpus, but not yet necessarily
in the base scaffold.

### Step 4 - Apply base admission

Base admission uses the simplified rule system:

`base = rule evidence OR flagship journal OR narrow vocab anchor`

The rule sources are:

- `solemd.entity_rule`
- `solemd.relation_rule`
- `solemd.base_journal_family`
- `solemd.journal_rule`

This is where the schema simplification matters:

- `base_journal_family` defines curated journal families
- `journal_rule` maps normalized venues into those families
- `entity_rule` and `relation_rule` capture rule evidence
- corpus `admission_reason` distinguishes `vocab_entity_match` from broader venue-led admissions

The output is written onto the mapped run tables as `is_in_base` and
`base_rank`.

### Step 5 - Build the mapped graph tables

Materialize the graph run into:

- `solemd.graph_runs`
- `solemd.graph_points`
- `solemd.graph_clusters`
- `solemd.graph_base_features`

The graph points table is the canonical source for:

- coordinates
- cluster assignments
- base membership
- base ordering

### Step 6 - Export base and universe

The export step splits the mapped run into:

- `base_points.parquet`
- `base_clusters.parquet`
- `universe_points.parquet`

The base export is the first-paint scaffold.
The universe export is the mapped tail that can be attached later.

### Step 7 - Load PubTator evidence

Filter PubTator3 annotations and relations by corpus PMID and load them into
the `pubtator` schema.

This is the evidence substrate that powers:

- base admission QA
- semantic summaries
- future detail panels
- relation lookup

---

## Quality Policy

Base admission is intentionally selective. The opening scaffold should be rich
enough to cover the main neuro / psych spaces and broad enough to include
important overlap from other systems.

The practical base mix is:

- rule-backed papers from the neuro / psych domain
- flagship journals that reliably preserve foundational and clinical core coverage
- narrow vocab-anchored overlap that belongs in the first-paint scaffold

That means the base should include strong representation across:

- neurology
- psychiatry
- neuropsychiatry
- neuroscience
- psychology
- neuropsychology
- clinically relevant overlap from the rest of medicine

The key is not to make base exhaustive. The key is to make it the right
opening set.

Practical exclusions:

- `journal_match` alone is not enough for base admission
- `pattern_match` alone is not enough for base admission
- `journal_and_vocab` is not automatically rule evidence
- broad specialty tails remain in `universe_points` unless they also carry
  curated rule support or a narrow approved vocab-anchor path

---

## Reproducibility

The filter is reproducible when the input files and rule tables are versioned.

Recommended source of truth:

- journal lists and patterns in files
- vocab aliases in files
- `base_journal_family` and `journal_rule` in graph-db
- `entity_rule` and `relation_rule` in graph-db

That combination lets the corpus and base scaffold be rebuilt cleanly as new
papers arrive.

---

## Refresh Cycle

When new papers arrive:

1. Refresh the vocab PMID set from PubTator3.
2. Re-run the S2 paper scan.
3. Upsert corpus membership and metadata.
4. Recompute `is_in_base` and `base_rank`.
5. Rebuild the graph run.
6. Re-export `base_points` and `universe_points`.

This makes new papers flow into the right layer automatically if they satisfy
the quality and domain requirements.

---

## What This Doc Does Not Use

- no legacy multi-tier policy
- no extra first-paint tiering
- no compatibility mapping from old naming

The intent is a clean corpus filter feeding a clean base scaffold.
