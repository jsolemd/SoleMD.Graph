# 2026-04-29 SoleMD.Graph Mapped Quality and RAG Plan Ledger

- Date: `2026-04-29`
- Repo: `SoleMD.Graph`
- Scope: mapped-paper quality control, RAG eligibility, clinical-liaison tracks,
  organ-system tracks, PubMed / Semantic Scholar / PubTator enrichment order,
  and the next implementation batch
- Status: `implementation landed; first production recompute/enrichment sweeps pending`
- Current live corpus-selection run:
  `019dd220-3f38-7684-9014-cd97657f05c5`
- Selector version: `selector-v2-durable-entity-20260428-r1`
- Completed at: `2026-04-28 21:32:52 UTC`

## Implementation Status

Implemented in the 2026-04-29 batch:

- relation-rule matching now accepts both canonical concept IDs and typed
  PubTator relation IDs such as `Disease|MESH:D009503`
- `paper_selection_summary` now separates raw PubTator counts from curated
  entity-signal counts and carries RAG/quality control fields
- summary refresh computes the local baseline for `rag_candidate`,
  `rag_eligible`, `content_status`, `relevance_band`, tracks, CL bridge, and
  warnings inside the existing chunked `selection_summary` phase
- evidence-wave dispatch now consumes the explicit curated signal columns and
  keeps the full-text queue entity/relation-positive rather than venue-only
- durable PubMed EFetch and Semantic Scholar Graph enrichment tables, task
  ledgers, CLI commands, and Dramatiq actors are in place
- migration `20260429100000_warehouse_mapped_quality_enrichment.sql` has been
  applied to the local warehouse

Still pending after this batch:

- recalibrate scoring weights after the new summary fields are measured on the
  full mapped corpus
- lift score weights into a versioned asset once the measured baseline is
  reviewed
- run the first real PubMed/S2 enrichment sweeps against selected mapped
  cohorts

## Purpose

We now have a broad `corpus` and a large `mapped` universe. The next problem is
not raw ingestion. It is making the mapped universe into a high-quality control
surface for enrichment, graph projection, and paper-grounded RAG.

This plan answers four current questions:

1. What do `RAG eligible`, `quality`, `organ-system track`, and `CL bridge`
   actually mean?
2. How do we avoid using a shallow hand-written anchor list as the real
   inclusion policy?
3. Which local bugs must be fixed before we trust mapped quality signals?
4. In what order should we use PubMed, Semantic Scholar, and PubTator APIs
   without wasting storage, API quota, or database scans?

## Current Runtime Contract

The stage ladder remains:

```text
raw -> corpus -> mapped -> evidence
```

- `raw` is source substrate: S2 release files, S2 diffs, PubTator stage tables,
  and other release-backed source material.
- `corpus` is the broad selected canonical paper universe. It is admitted by
  journal / venue / vocabulary / entity evidence, not by citations.
- `mapped` is the active paper-level universe for graph, enrichment, and RAG
  preparation. This is where expensive paper fanout belongs.
- `evidence` is the smaller full-document / chunk / grounding lane inside
  mapped.

The next implementation should extend `solemd.paper_selection_summary` as the
durable QA and control surface. It should not create a sibling mapped-quality
table at the same grain.

## Live Warehouse Baseline

Latest completed run checked locally against warehouse on `2026-04-29`:

| Metric | Value | Implication |
|---|---:|---|
| Mapped papers | `3,030,220` | The active universe is large enough that ordering and gating matter. |
| Has S2/current abstract | `1,227,216` | About 40.5 percent can be abstract-ready before PubMed recovery. |
| Has PMCID | `778,933` | Full-text RAG ceiling from obvious PMCID rows is about 25.7 percent before locator recovery. |
| No abstract and no PMCID | `1,792,056` | These are candidates only, not RAG-ready, until PubMed / PMC / other text recovery lands. |
| `mapped_entity_signal_count = 0` | `1,959,140` | Mapped contains venue/pattern-supported papers that need stronger ranking. |
| `has_mapped_relation_match = true` | `0` | Relation matching is currently broken or semantically disconnected. Fix before scoring. |
| Year null or pre-1900 | `1,560` | Small cleanup / warning bucket, not a central policy issue. |
| Mapped papers with raw PubTator entity rows | `2,533,887` | PubTator coverage is much broader than curated entity-signal coverage. |
| Summary `entity_annotation_count > 0` | `1,948,785` | The column currently behaves like curated entity-signal coverage, not raw annotation coverage. |

Relation substrate is present:

| Table | Source release | Rows |
|---|---:|---:|
| `pubtator.relations_stage` | `6` | `38,678,450` |
| `pubtator.relations` | `6` | `3,768,742` |
| `pubtator.relations` | `20` | `2` |

The relation-rule issue is concrete. Current matching compares rules like
`MESH:D009503` against PubTator relation object IDs stored like
`Disease|MESH:D009503`. Example stage counts for the prefixed form:

| PubTator object ID | Stage relation rows |
|---|---:|
| `Disease|MESH:D024821` | `24,595` |
| `Disease|MESH:D009503` | `24,273` |
| `Disease|MESH:D006943` | `20,000` |
| `Disease|MESH:D015430` | `18,622` |
| `Disease|MESH:D000380` | `4,610` |
| `Disease|MESH:D009205` | `4,146` |
| `Disease|MESH:D045823` | `1,286` |

## Terms To Use

### `rag_candidate`

A mapped paper worth trying to enrich for retrieval.

This can be true even when the paper has no usable text yet. It means the paper
is relevant enough that PubMed / PMC / S2 text recovery should spend effort on
it.

### `rag_eligible`

A mapped paper that can enter a RAG index now.

Minimum contract:

- relevant enough for the selected RAG lane
- not retracted / terminally warned
- has chunkable text now, either full text or an acceptable abstract source
- has explicit source provenance for that text

This must not mean "high quality paper." It means "retrieval can safely index
this paper now."

### `content_status`

The text-readiness state, separate from relevance.

Proposed values:

- `fulltext_ready`: usable full document exists or can be acquired now
- `abstract_ready`: abstract exists from S2 or PubMed and can be indexed with
  abstract-only provenance
- `metadata_only`: relevant metadata exists, but no chunkable text exists yet
- `missing_text`: no usable text and no immediate locator path

This split matters because a highly relevant paper with only a title is a
candidate, not eligible for paper-grounded RAG.

### `relevance_band`

The mapped relevance confidence, separate from text availability.

Proposed values:

- `high_confidence`: direct curated entity / MeSH / strong venue signal
- `clinical_bridge`: explicit psychiatry / neurobehavioral anchor plus medical
  organ-system or care-setting anchor
- `venue_supported`: good venue / pattern support but weak paper-specific
  biomedical signal
- `weak_candidate`: retained for enrichment because one signal is plausible but
  not enough for first-wave RAG
- `low_confidence`: mapped but likely not worth early enrichment without a
  stronger downstream signal

These bands are for operators and downstream ordering. They are not permanent
truth labels.

### `topic_tracks`

Paper-level topic labels used for filtering, sampling, graph coloring, and RAG
queue partitioning.

They should be derived from:

- curated SoleMD vocab categories and aliases
- PubTator concept IDs and entity types
- PubMed MeSH headings, especially major topics
- PubMed publication types when the track is a study-design track
- Semantic Scholar fields of study only as a secondary, coarse signal

### `organ_system_tracks`

Paper-level organ / care-setting labels.

They should be derived from:

- `solemd.vocab_terms.organ_systems`
- PubMed MeSH descriptor tree mappings
- selected PubTator disease / chemical / gene concept mappings
- curated venue families when the venue is specific enough

They must not be determined by a small hard-coded list of words.

### `has_cl_bridge`

Boolean control flag for consult-liaison / medical psychiatry overlap.

True when both conditions hold:

1. The paper has a psychiatry, neuropsychiatry, behavioral, cognitive, sleep,
   substance, delirium, capacity, trauma, somatic symptom, or related mental
   health anchor.
2. The paper also has a nontrivial medical organ-system, care-setting,
   perioperative, ICU, oncology, transplant, pregnancy, palliative, pain,
   infectious, immune, endocrine, cardiovascular, renal, pulmonary, GI, liver,
   neurologic, or other medical anchor.

The short lists discussed in chat are seed examples and UI labels, not the
inclusion universe.

### `quality_warnings`

Structured JSON warnings that explain why a paper is held back or downgraded.

Expected keys:

- `missing_text`
- `title_only`
- `retracted_or_retraction_related`
- `publication_type_low_signal`
- `year_outlier`
- `weak_entity_support`
- `venue_noise`
- `relation_signal_unavailable`
- `non_english`
- `duplicate_or_republished`

## Shallow Anchor List Correction

The earlier psych/neuro/behavior and organ-system lists are not enough. They are
useful only as visible track names and examples.

The implementation should use a layered vocabulary strategy:

1. `data/vocab_terms.tsv` and `data/vocab_aliases.tsv` remain the local curated
   asset layer. `vocab_terms.tsv` already carries `semantic_types`,
   `semantic_groups`, and `organ_systems`.
2. PubTator concept IDs provide paper-level biomedical entities. This keeps us
   from relying on title/abstract keyword scans.
3. PubMed MeSH headings provide the highest-value biomedical classification
   layer for PubMed-indexed papers. Major-topic flags and qualifiers should
   carry more weight than plain text matches.
4. PubMed publication types identify study design and low-signal article types.
   Examples include clinical trial, randomized controlled trial, systematic
   review, meta-analysis, guideline, case report, review, editorial, letter,
   comment, retraction notice, and published erratum.
5. Semantic Scholar fields of study and publication venue metadata help with
   coarse filtering and venue-noise cleanup, but should not replace MeSH.

The goal is a deep, inspectable control surface, not a static keyword list.

## API Grounding

### NCBI PubMed E-utilities

Use PubMed EFetch for metadata enrichment by PMID:

```text
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi
db=pubmed
id=<comma-separated-pmids-or-history-query>
retmode=xml
api_key=<injected>
tool=<NCBI_API_TOOL>
email=<NCBI_API_EMAIL>
```

Official NCBI E-utilities documentation says EFetch returns data records for a
list of UIDs in a specified format, and History Server workflows can batch large
UID lists through EPost / EFetch. NCBI usage guidance says to stay under three
requests per second without an API key and up to ten requests per second by
default with an API key. Large jobs should be scheduled during off-hours or
weekends when possible.

Use fields parsed from PubMed XML:

- MeSH headings, qualifiers, and major-topic flags
- publication types
- citation subsets
- author keywords
- grants
- chemical list
- comments / corrections / retraction links
- language
- publication status
- structured abstract section labels when present
- PubMed abstract text when S2 lacks an abstract

Current local support already has:

- `NCBI_API_KEY`, `NCBI_API_TOOL`, `NCBI_API_EMAIL`, and timeout settings in
  `apps/worker/app/config.py`
- PubMed ESummary locator recovery in `apps/worker/app/evidence/ncbi.py`
- the required secret handling contract through `solemd op-run graph -- ...`

### Semantic Scholar

Use two S2 API lanes, with different purposes:

1. Datasets API for release maintenance and diffs. This is already partially
   implemented in `apps/worker/app/ingest/s2_datasets_api.py` and exposed by
   `s2-diff-plan`.
2. Academic Graph API for missing per-paper enrichment fields on mapped papers.

S2 Datasets API release/diff endpoints to preserve:

```text
https://api.semanticscholar.org/datasets/v1/release/
https://api.semanticscholar.org/datasets/v1/release/{release_id}
https://api.semanticscholar.org/datasets/v1/release/{release_id}/dataset/{dataset_name}
https://api.semanticscholar.org/datasets/v1/diffs/{start_release_id}/to/{end_release_id}/{dataset_name}
```

The diff response contains sequential update-file and delete-file lists. Update
files must be inserted or replaced by primary key; delete files must be applied
as deletions for that dataset. This is the reason we keep S2 source cursor and
diff-manifest ledgers instead of blindly redownloading every release.

S2 official API docs describe the Academic Graph base URL:

```text
https://api.semanticscholar.org/graph/v1/
```

The paper details endpoint accepts a `fields` query parameter and supports API
key authentication through the `x-api-key` header. The official tutorial
examples include fields such as `title`, `year`, `abstract`, `citationCount`,
`publicationTypes`, `publicationDate`, and `openAccessPdf`. The API overview
also describes SPECTER2 embeddings, papers, citations, authors, and venues.
The public overview currently describes the introductory authenticated rate
limit as one request per second, so our worker should treat rate as
configuration, honor `Retry-After`, and never assume a higher quota.

Fields worth storing for mapped enrichment:

- incoming `citationCount`
- incoming `influentialCitationCount` when available
- `publicationVenue` and venue type when available
- `publicationTypes`
- `openAccessPdf` URL and OA status
- `fieldsOfStudy`
- `s2FieldsOfStudy`
- `externalIds`
- `journal` volume/pages where useful
- `embedding.specter_v2`, but only when a consumer is ready

Important rule: S2 Graph API enrichment is not the corpus backbone. It is a
mapped-paper enrichment lane and must be checkpointed, rate-limited, and
retryable.

### PubTator / PubTator3

We already have the PT3 dump locally, and it is the first source to trust for
broad entity and relation signals after local normalization bugs are fixed.

The PubTator export API supports:

```text
https://www.ncbi.nlm.nih.gov/research/pubtator-api/publications/export/<format>?<type>=<ids>&concepts=<concepts>
```

The official API page states export batches are up to 100 IDs by GET or 1000 by
POST, with formats `pubtator`, `biocxml`, and `biocjson`. It accepts `pmids` for
abstracts and `pmcids` for full text; PMCID export is restricted to BioC XML or
BioC JSON. Supported bioconcepts include gene, disease, chemical, species,
mutation, and cellline.

Use PubTator web export later for:

- targeted PMC full-text BioC recovery when the existing evidence path needs a
  second source
- section-aware annotations for papers already chosen for evidence work
- relation refresh only after the local relation-rule normalization bug is
  fixed and measured

Do not use the web API to rescan all mapped papers before using the local dump.

## Ordered Implementation Plan

### 1. Lock This Plan And Avoid A New Parallel Table

Deliverables:

- keep this ledger as the review surface
- link it from `docs/agentic/README.md`
- use `paper_selection_summary` as the durable QA/control surface

Justification:

The grain already exists: one row per paper per corpus-selection run. A sibling
quality table at the same grain would duplicate ownership, indexes, refresh
logic, and downstream joins.

### 2. Fix Relation Rule Matching Before Scoring Anything With Relations

Deliverables:

- normalize PubTator relation concept IDs before comparing them to relation
  rules
- support typed source IDs such as `Disease|MESH:D009503` and canonical IDs
  such as `MESH:D009503`
- add tests that prove prefixed PT3 relation IDs match curated rules
- rebuild relation rollups and summary for the current release pair

Likely files:

- `apps/worker/app/corpus/mapped_rollup_builders.py`
- `apps/worker/app/corpus/assets.py`
- `apps/worker/app/corpus/policies.py`
- `apps/worker/tests/test_corpus_runtime.py`

Justification:

`has_mapped_relation_match` is zero while relation rows exist. If we add quality
bands before fixing this, the score surface will encode a known false negative.

### 3. Split Raw PubTator Coverage From Curated Entity Signal Coverage

Deliverables:

- add explicit summary columns:
  - `raw_pubtator_entity_annotation_count`
  - `curated_entity_signal_count`
  - optionally `raw_pubtator_relation_count`
- change scoring to use `curated_entity_signal_count`
- migrate scoring, wave dispatch, Grafana, and QA queries to the explicit
  columns
- retire ambiguous `entity_annotation_count` from scoring and control
  decisions; if the physical column remains during migration, it is legacy
  compatibility only and should be marked deprecated in comments/docs
- update comments and docs so future agents do not interpret the same number in
  two ways

Likely files:

- `db/schema/warehouse/43_tables_corpus.sql`
- `db/schema/warehouse/53_indexes_corpus.sql`
- `db/schema/warehouse/83_comments_corpus.sql`
- a new migration under `db/migrations/warehouse/`
- `apps/worker/app/corpus/selectors/provenance.py`
- tests in `apps/worker/tests/test_corpus_runtime.py`

Justification:

The live summary undercounts raw PubTator coverage by about 585k mapped papers
because the current count is really curated signal coverage. Both numbers are
useful, but they answer different questions.

### 4. Add The Summary Columns For RAG And Quality Control

Deliverables:

Add columns to `solemd.paper_selection_summary`:

```sql
rag_candidate BOOLEAN NOT NULL DEFAULT false,
rag_eligible BOOLEAN NOT NULL DEFAULT false,
content_status TEXT NOT NULL DEFAULT 'metadata_only',
relevance_band TEXT NOT NULL DEFAULT 'weak_candidate',
topic_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
organ_system_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
publication_type_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
mesh_major_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
has_cl_bridge BOOLEAN NOT NULL DEFAULT false,
quality_warnings JSONB NOT NULL DEFAULT '{}'::JSONB
```

Add check constraints for controlled values and indexes that match expected
queries:

- run plus `rag_eligible`, ordered by score
- run plus `rag_candidate`, ordered by relevance / score
- run plus `content_status`
- GIN indexes for `topic_tracks` and `organ_system_tracks` if graph/RAG filters
  read them directly from summary

Justification:

These are operator and downstream control columns. They avoid recomputing joins
against S2, PT3, and vocab tables every time we need to queue enrichment or
sample quality.

### 5. Compute A Local Baseline From Existing Warehouse Data

Deliverables:

- compute `content_status`, `rag_candidate`, `rag_eligible`, `topic_tracks`,
  `organ_system_tracks`, `has_cl_bridge`, and warnings from current local data
  inside the existing `selection_summary` chunk drain
- use `paper_entity_signals` plus populated `vocab_terms.organ_systems` values
  for the first entity-driven organ tracks
- report the fraction of signal rows and mapped papers whose organ-system track
  is empty, because current vocab assets are known to be sparse
- treat organ-system tracks as provisional until PubMed MeSH metadata is merged
  in step 8; do not lock organ-system thresholds from this local-only baseline
- use venue, year, open-access, PMCID, abstract, locator, and relation signals
  already present in rollups
- make candidate and eligible different:
  - relevant but no text: `rag_candidate = true`, `rag_eligible = false`
  - abstract or full text present: can become `rag_eligible = true` if relevance
    passes

Likely files:

- `apps/worker/app/corpus/selectors/provenance.py`
- `apps/worker/app/corpus/entity_signals.py`
- `apps/worker/tests/test_corpus_runtime.py`

Justification:

This gives us a measured local baseline before any external API sweep or
scoring-weight refactor. It also tells us which track assets are actually
sparse before we move weights into a versioned asset.

### 6. Make Track And Score Inputs Data-Driven

Deliverables:

- keep core biomedical terms in `data/vocab_terms.tsv` and
  `data/vocab_aliases.tsv`
- audit and expand `organ_systems` and category metadata for high-value curated
  vocab rows where the local baseline proves they are empty or too coarse
- document that full organ-system coverage depends on PubMed MeSH enrichment;
  the pre-PubMed asset pass should improve obvious curated rows, not pretend to
  solve the entire organ mapping problem
- add a small versioned asset only if needed for track mapping, for example:
  `data/corpus_track_rules.tsv`
- after the local baseline is measured, lift mapped/evidence score weights from
  SQL-embedded logic into a versioned JSON asset, for example
  `data/corpus_scoring_weights.json`
- include the new assets in the corpus plan manifest and checksum

Likely files:

- `apps/worker/app/corpus/assets.py`
- `apps/worker/app/corpus/selectors/provenance.py`
- `data/vocab_terms.tsv`
- `data/vocab_aliases.tsv`
- new asset file if needed

Justification:

We should be able to change inclusion, exclusion, scoring, and track policy
without burying clinical concepts deep in SQL or Python. The selector version
and plan checksum should record exactly which policy produced a run. This
refactor belongs after the first baseline so the asset shape follows measured
need rather than guesswork.

### 7. Add Durable PubMed Metadata Enrichment

Deliverables:

- create a durable parsed PubMed metadata table keyed by PMID
- create a resumable fetch ledger for batches and failures
- implement an async bounded EFetch client using `NCBI_API_KEY` through
  `solemd op-run graph -- ...`
- parse and store:
  - MeSH descriptors / qualifiers / major-topic flags
  - publication types
  - citation subsets
  - keywords
  - grants
  - chemicals
  - comments/corrections/retraction links
  - language
  - publication status
  - structured abstract labels
  - PubMed abstract text and abstract hash
- store source timestamps and response checksums
- avoid raw XML storage by default; keep raw payload cache optional and
  operator-controlled

Likely new surfaces:

- `solemd.pubmed_metadata`
- `solemd.pubmed_metadata_fetch_runs`
- `solemd.pubmed_metadata_fetch_tasks`
- actor/CLI under `apps/worker/app/`

Justification:

PubMed metadata has the highest clinical ROI. It can recover abstracts for some
title-only mapped papers, provides MeSH for topic/organ-system tracks, and
provides publication types for study-design quality.

### 8. Recompute Summary With PubMed Metadata

Deliverables:

- update `paper_selection_summary` derivation to merge PubMed metadata when
  available
- use MeSH major topics to strengthen `topic_tracks` and
  `organ_system_tracks`
- use publication types to set `publication_type_tracks` and warnings
- flag retractions, errata, comments, editorials, letters, and non-English
  rows where appropriate
- recover `abstract_ready` for papers with PubMed abstract text and no S2
  abstract

Justification:

This converts PubMed from an external metadata cache into the operator-facing
control surface that RAG and enrichment jobs can consume cheaply.

### 9. Wire Text Acquisition To The Candidate / Eligible Split

Deliverables:

- evidence/full-text acquisition should prioritize:
  1. high-confidence `rag_candidate` rows with PMCID
  2. high-confidence `rag_candidate` rows with PubMed-recovered locators
  3. abstract-ready rows for abstract-only RAG lanes
  4. lower-confidence candidates later
- keep `rag_eligible` false until text is actually present and source-provenant
- update evidence-wave queries to consume the new fields when the counts are
  validated

Likely files:

- `apps/worker/app/corpus/wave_runtime.py`
- `apps/worker/app/evidence/runtime.py`
- `apps/worker/app/evidence/ncbi.py`

Justification:

The mapped set is too large to fetch everything at once. Candidate/eligible
separation lets us spend API and full-text acquisition effort where it changes
retrieval readiness.

### 10. Add Semantic Scholar Graph API Enrichment For Mapped Papers

Deliverables:

- create a durable S2 Graph enrichment table keyed by S2 paper ID and release
  context
- implement a rate-limited, checkpointed client for mapped papers only
- store incoming citations, influential citations, publication types, open
  access PDF metadata, venue type, S2 fields of study, external IDs, and
  response checksums
- do not fetch SPECTER2 embeddings until graph/RAG consumers are ready to read
  them

Likely new surface:

- `solemd.s2_paper_enrichment`

Justification:

S2 adds important ranking and cleanup signals that the release raw tables do not
fully cover, especially incoming citation count and venue type. It is lower ROI
than PubMed for clinical classification, so it should come after the PubMed
metadata path unless a specific consumer needs it first.

### 11. Use PubTator Web API Only For Targeted Gaps

Deliverables:

- after relation normalization is fixed, measure whether local PT3 relations are
  sufficient
- if not, run targeted PubTator export for PMCID/PMID subsets selected by
  `rag_candidate`
- prefer BioC JSON/XML for section-aware annotations when full text is needed

Justification:

We already have the PT3 dump. A broad PubTator web sweep before fixing local
normalization would waste API traffic and hide the real bug.

### 12. Update RAG, Graph, And Grafana Consumers

Deliverables:

- RAG queue and indexing use `rag_eligible` plus `content_status`
- graph / Cosmograph filters can use `topic_tracks`, `organ_system_tracks`,
  `relevance_band`, and `has_cl_bridge`
- Grafana panels show:
  - mapped count by content status
  - candidate vs eligible count
  - CL bridge count
  - organ-system distribution
  - warning distribution
  - PubMed metadata fetch progress
  - relation match count after fix
- avoid heavy live count sweeps; panels should read precomputed summary and run
  ledgers

Justification:

These fields only matter if they control real downstream behavior and
inspection. Grafana should observe precomputed surfaces, not trigger expensive
warehouse scans.

### 13. Validate With Distribution Reports And Manual Samples

Deliverables:

- generate distributions for:
  - `content_status`
  - `relevance_band`
  - `rag_candidate`
  - `rag_eligible`
  - organ-system tracks
  - topic tracks
  - publication types
  - warnings
- sample at least 20 papers per high-impact band:
  - high-confidence full-text
  - high-confidence abstract-only
  - CL bridge
  - venue-supported but entity-weak
  - low-confidence mapped
  - title-only but high candidate
- record the SQL and counts in a follow-up ledger

Justification:

Thresholds should be calibrated from observed distributions and qualitative
samples, not guessed upfront.

## Implementation Order Summary

1. Link this ledger and review it.
2. Fix relation ID normalization and tests.
3. Split raw PubTator coverage from curated entity-signal coverage.
4. Add summary columns for RAG and quality control.
5. Compute local baseline summary from existing warehouse data.
6. Move score and track policy into versioned assets after baseline
   measurement.
7. Add PubMed metadata schema, fetch tasks, and EFetch client.
8. Recompute summary with PubMed metadata.
9. Wire evidence/RAG acquisition to candidate vs eligible status.
10. Add S2 Graph API enrichment for mapped papers.
11. Use PubTator web API only for targeted gaps after local relation repair.
12. Add Grafana panels over precomputed summary and fetch ledgers.
13. Run distribution reports and manual quality samples before locking
    thresholds.

## Acceptance Criteria

The implementation is not done until:

- `has_mapped_relation_match` is nonzero when current relation rules match
  typed PubTator IDs.
- `raw_pubtator_entity_annotation_count` and curated entity signal counts are
  separately inspectable.
- scoring, wave dispatch, Grafana, and QA queries no longer depend on ambiguous
  `entity_annotation_count` semantics.
- `paper_selection_summary` has candidate, eligible, content, relevance, topic,
  organ-system, CL-bridge, and warning fields populated for a completed run.
- the local-only baseline reports organ-track empty coverage and marks
  organ-system tracks provisional until PubMed MeSH enrichment is merged.
- A title-only relevant paper can be a `rag_candidate` without being
  `rag_eligible`.
- A paper with PubMed-recovered abstract can become `abstract_ready` with source
  provenance.
- PubMed enrichment is resumable, rate-limited, and uses `NCBI_API_KEY` only via
  secret injection.
- S2 Graph enrichment is checkpointed and mapped-only.
- Grafana reads precomputed summary/fetch-ledger counts rather than launching
  heavy ad hoc count sweeps.
- A follow-up QA ledger records distributions and representative samples.

## Test Plan

Minimum tests:

- relation normalizer accepts `Disease|MESH:*` and canonical `MESH:*`
- relation aggregate produces rows for a fixture with prefixed PubTator IDs
- summary distinguishes raw PubTator annotation count from curated signal count
- summary computes `rag_candidate` and `rag_eligible` independently
- `content_status` changes correctly for full text, abstract, metadata-only,
  and missing-text fixtures
- organ-system tracks roll up from populated `vocab_terms.organ_systems`
- local baseline metrics report empty organ-track coverage
- CL bridge requires both psych/neurobehavioral and medical-system anchors
- PubMed EFetch parser handles MeSH, publication types, keywords, grants,
  chemicals, comments/corrections, language, structured abstracts, and missing
  optional sections
- PubMed fetch tasks resume after partial failure and respect max attempts
- S2 enrichment client retries 429/5xx and stores response checksums

Targeted commands after implementation:

```bash
uv run --project apps/worker pytest \
  apps/worker/tests/test_corpus_runtime.py \
  apps/worker/tests/test_corpus_materialize_chunks.py -q

uv run --project apps/worker pytest \
  apps/worker/tests/test_evidence_runtime.py -q
```

Secret-backed API checks must run through:

```bash
solemd op-run graph -- uv run --project apps/worker python -m app.main check
```

## Operational Notes

- Do not print `NCBI_API_KEY` or `S2_API_KEY`.
- Use `solemd op-run graph -- ...` for any command that needs API credentials.
- Use bounded async workers, durable task rows, and retry backoff for all
  external API sweeps.
- Prefer set-based SQL and chunked drains over row-at-a-time Python loops.
- Do not redownload broad S2 datasets when a Datasets API diff is available and
  the local cursor is valid.
- Do not treat citations as corpus admission.
- Do not fetch broad citation contexts before a consumer exists.
- Do not fetch SPECTER2 embeddings before graph/RAG consumers are ready.

## Deferred Explicitly

- `enrichment_priority` is intentionally deferred. No current consumer reads
  it, Dramatiq queue behavior is FIFO, and evidence dispatch currently orders
  by persisted selection/wave ordering rather than a separate enrichment
  priority. Revisit only when enrichment dispatch has real backpressure across
  multiple runnable lanes, such as PubMed metadata, S2 Graph enrichment, PMC
  full text, and targeted PubTator refresh. When revisited, wire the consuming
  dispatcher first, then add the schema field.

## API Sources Checked

- NCBI E-utilities introduction and EFetch:
  <https://www.ncbi.nlm.nih.gov/books/NBK25497/>
- NCBI E-utilities usage guidelines and API key rate guidance:
  <https://eutilities.github.io/site/API_Key/usageandkey/>
- PubMed data access and XML data element entry point:
  <https://pubmed.ncbi.nlm.nih.gov/download/>
- NLM PubMed XML data elements entry point:
  <https://www.nlm.nih.gov/bsd/licensee/data_elements_doc.html>
- Semantic Scholar API overview:
  <https://www.semanticscholar.org/product/api>
- Semantic Scholar Academic Graph API tutorial:
  <https://www.semanticscholar.org/product/api/tutorial>
- PubTator export API:
  <https://www.ncbi.nlm.nih.gov/CBBresearch/Lu/Demo/PubTatorCentral/api.html>

## Open Decisions For Human Review

1. Should abstract-only papers be allowed into the main RAG index, or should
   they enter a separate abstract-only retrieval lane?
2. Should ambiguous legacy `entity_annotation_count` be physically dropped in
   the first cleanup migration, or kept as a deprecated compatibility column
   until all dashboard/query consumers are migrated? The semantic decision is
   no longer open: scoring and control move to explicit columns.
3. How aggressive should early PubMed EFetch be: all mapped PMIDs, or only
   mapped papers that are `rag_candidate` under the local baseline?
4. Do we want CL bridge as a binary flag only, or also as a richer array such as
   `cl_bridge_tracks`?
5. Should S2 incoming citation count affect `relevance_band`, enrichment order,
   or only ranking within already eligible papers?

## Next Recommended Pass

After the landed schema/code batch:

1. recompute the current release-pair summary so the new fields are populated
   on the full mapped corpus;
2. sample the measured distributions for `relevance_band`, `content_status`,
   `rag_candidate`, `rag_eligible`, raw PubTator counts, and curated signal
   counts;
3. run bounded PubMed and S2 Graph enrichment sweeps on reviewed mapped cohorts;
4. refresh summary after enrichment so MeSH, publication types, incoming
   citation counts, S2 fields of study, venue type, and open-access PDF status
   affect the control surface;
5. then lift score weights into a versioned asset using the measured baseline.
