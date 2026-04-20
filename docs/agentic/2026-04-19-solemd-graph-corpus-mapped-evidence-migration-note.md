# Corpus Mapped Evidence Migration Note

Date: 2026-04-19
Repo: SoleMD.Graph
Status: implemented

## Purpose

This note records the correction from the older business shape
`raw -> candidate -> mapped -> hot`
to the cleaner warehouse/runtime shape:

- `raw`
- `corpus`
- `mapped`
- `evidence`

This is both a database migration and a worker-contract migration. The corpus
lane now owns the selected canonical corpus boundary, the mapped paper-level
active universe, and the evidence child-wave dispatcher that feeds the existing
`hot_text.acquire_for_paper` runtime.

## ASCII Flow

```text
published raw releases
    |
    |  s2_papers_raw
    |  s2_paper_authors_raw
    |  s2_paper_references_raw
    |  s2orc_documents_raw
    |  pubtator.entity_annotations_stage
    |  pubtator.relations_stage
    v
corpus selection run
    |
    +--> assets
    |      load curated vocab_terms.tsv / vocab_aliases.tsv
    |      materialize selector temp tables
    |
    +--> corpus_admission
    |      broad OR gate:
    |      - curated journal match
    |      - curated venue pattern match
    |      - PubTator mention joined to curated vocab aliases
    |      allocate corpus_id inside warehouse
    |      set solemd.corpus.domain_status = corpus | retired
    |
    +--> mapped_promotion
    |      stricter mapped gate from curated journal / pattern families
    |      set solemd.corpus.domain_status = mapped where promoted
    |
    +--> canonical_materialization
    |      upsert selected canonical warehouse surfaces:
    |      - solemd.papers
    |      - solemd.paper_text
    |      - solemd.paper_authors
    |      - solemd.paper_citations
    |      - pubtator.entity_annotations
    |      - pubtator.relations
    |
    +--> selection_summary
           refresh durable per-paper summary and ranking:
           - admission / mapped provenance
           - PubTator counts
           - reference counts
           - open-access / PMC / abstract flags
           - mapped_priority_score
           - evidence_priority_score
    v
selected canonical corpus
    |
    |  solemd.corpus.domain_status IN ('corpus', 'mapped')
    v
mapped active universe
    |
    |  solemd.corpus.domain_status = 'mapped'
    |  feeds paper-level serving / embedding / graph rollout work
    v
evidence wave dispatch
    |
    |  solemd.corpus_wave_runs
    |  solemd.corpus_wave_members
    |  selects mapped papers lacking PMC BioC documents
    |  orders by evidence_priority_score
    v
hot_text.acquire_for_paper
    |
    v
paper_documents / sections / blocks / sentences
    |
    v
future chunking / grounding / OpenSearch evidence units
```

## What Each Layer Does

### 1. Raw

What it is:
- Release-backed upstream landing zone only.
- No selection decisions and no canonical serving assumptions.

Primary tables:
- `solemd.s2_papers_raw`
- `solemd.s2_paper_authors_raw`
- `solemd.s2_paper_references_raw`
- `solemd.s2orc_documents_raw`
- `pubtator.entity_annotations_stage`
- `pubtator.relations_stage`

What fills it:
- `apps/worker/app/ingest/*`

### 2. Corpus

What it is:
- The broad selected warehouse universe derived from raw S2 + PubTator +
  curated assets.
- This is the answer to "which upstream papers do we keep in our warehouse at all?"

Primary tables:
- `solemd.corpus`
- `solemd.corpus_selection_runs`
- `solemd.corpus_selection_signals`
- `solemd.paper_selection_summary`

What fills it:
- `apps/worker/app/corpus/runtime.py`
- `apps/worker/app/corpus/selectors/corpus.py`
- `apps/worker/app/corpus/selectors/provenance.py`

Current admission policy:
- broad OR over:
  - exact curated journal match
  - curated venue pattern match
  - PubTator mention matched to curated vocab alias

### 3. Mapped

What it is:
- The stricter paper-level active universe used for graph/embedding/serving
  rollout.
- `mapped` is a subset of `corpus`.
- `warm` is not a separate durable status in this model; it is rollout behavior
  applied to mapped papers.

Primary tables:
- `solemd.corpus` with `domain_status = 'mapped'`
- `solemd.paper_selection_summary` with `mapped_priority_score`

What fills it:
- `apps/worker/app/corpus/selectors/mapped.py`
- summary refresh in `apps/worker/app/corpus/selectors/provenance.py`

Current mapped policy:
- curated journal and mapped pattern promotion families
- durable promotion provenance in `solemd.corpus_selection_signals`

### 4. Evidence

What it is:
- The smallest selected subset of mapped papers that are promoted into full-text
  acquisition and then downstream chunk/evidence assembly.
- `evidence` is modeled as durable child-wave membership, not as another
  `solemd.corpus.domain_status` value.

Primary tables:
- `solemd.corpus_wave_runs`
- `solemd.corpus_wave_members`
- downstream canonical document spine:
  - `solemd.paper_documents`
  - `solemd.paper_sections`
  - `solemd.paper_blocks`
  - `solemd.paper_sentences`

What fills it:
- `apps/worker/app/corpus/runtime.py::dispatch_evidence_wave`
- existing `apps/worker/app/hot_text/*` runtime after enqueue

Current evidence policy:
- `evidence_missing_pmc_bioc`
- parent scope is `mapped`
- excludes papers that already have a PMC BioC canonical document
- ranks by `paper_selection_summary.evidence_priority_score`
- snapshots ranking inputs into `corpus_wave_members.selection_detail`

## Tables Filled By This Slice

### Selection-owned

- `solemd.corpus`
- `solemd.corpus_selection_runs`
- `solemd.corpus_selection_signals`
- `solemd.paper_selection_summary`
- `solemd.corpus_wave_runs`
- `solemd.corpus_wave_members`

### Canonical materialization owned by corpus selection

- `solemd.papers`
- `solemd.paper_text`
- `solemd.paper_authors`
- `solemd.paper_citations`
- `pubtator.entity_annotations`
- `pubtator.relations`

### Not filled by this slice

- `solemd.paper_documents`
- `solemd.paper_sections`
- `solemd.paper_blocks`
- `solemd.paper_sentences`
- `solemd.paper_chunks`
- `solemd.paper_evidence_units`

Those remain downstream of evidence acquisition and chunk/evidence assembly.

## Policy Surfaces

### Policy 1: Corpus admission

Owned by:
- `selectors/corpus.py`

Intent:
- keep the warehouse universe broad enough to preserve downstream optionality
  while still avoiding full upstream saturation

Current rule families:
- journal inventory
- venue pattern family
- curated vocab alias hit through PubTator stage

### Policy 2: Mapped promotion

Owned by:
- `selectors/mapped.py`

Intent:
- produce the stricter paper-level active universe

Current rule families:
- mapped journal match
- mapped pattern match

### Policy 3: Mapped rollout ranking

Owned by:
- `selectors/provenance.py`

Intent:
- create a stable ranking surface for paper-level serving/embedding rollout
  without introducing a separate durable `warm` status

Current summary columns:
- `mapped_priority_score`
- `has_open_access`
- `has_abstract`
- `reference_out_count`
- `influential_reference_count`
- PubTator entity/relation counts

### Policy 4: Evidence-wave ranking

Owned by:
- `runtime.py::_refresh_wave_members`
- `selectors/provenance.py`

Intent:
- select the mapped papers most worth promoting into full-text acquisition and
  later chunk/evidence grounding

Current ranking inputs:
- `evidence_priority_score`
- `has_pmc_id`
- `has_open_access`
- vocab/entity/relation counts
- influential reference count

## Database Migration Work

Implemented migration:
- `db/migrations/warehouse/20260419204500_warehouse_corpus_mapped_evidence_contract.sql`

What it does:
- renames durable `candidate` state to `corpus`
- renames persisted selection phase `candidate_admission` to `corpus_admission`
- normalizes existing selection-run manifests and phase arrays to the new phase name
- renames `contributes_to_candidate` to `contributes_to_corpus`
- renames persisted wave policy key from `mapped_missing_pmc_bioc` to `evidence_missing_pmc_bioc`
- recomputes run `plan_checksum` values after manifest normalization
- adds ranking columns to `solemd.paper_selection_summary`
- adds ranking snapshot columns to `solemd.corpus_wave_members`
- adds the supporting ranking/reference indexes

## Code Migration Work

Implemented code surfaces:
- `apps/worker/app/corpus/models.py`
- `apps/worker/app/corpus/runtime.py`
- `apps/worker/app/corpus/selectors/corpus.py`
- `apps/worker/app/corpus/selectors/mapped.py`
- `apps/worker/app/corpus/selectors/provenance.py`
- `apps/worker/app/corpus/cli.py`
- `apps/worker/app/actors/corpus.py`
- `apps/worker/app/main.py`

Key code changes:
- `candidate` naming removed from the active worker contract
- canonical dispatch name is now `dispatch_evidence_wave`
- CLI now exposes evidence-wave commands only
- summary refresh computes ranking once in SQL
- evidence-wave membership stores both `priority_score` and `selection_detail`

## Documentation Follow-up

Docs updated in parallel across the owned RAG files to match the same hierarchy:
- `raw -> corpus -> mapped -> evidence`

The next documentation pass should likely add:
- explicit mapped rollout examples once embedding work lands
- scoring calibration notes after the first real warehouse ranking review
- chunk/evidence policy details once the downstream slice is implemented

## Verification

Executed:
- `uv run --project apps/worker pytest apps/worker/tests/test_corpus_cli.py apps/worker/tests/test_corpus_runtime.py -q`
- `uv run --project apps/worker pytest apps/worker/tests/test_ingest_runtime.py apps/worker/tests/test_corpus_cli.py apps/worker/tests/test_corpus_runtime.py apps/worker/tests/test_hot_text_cli.py apps/worker/tests/test_hot_text_runtime.py -q`
- `uv run --project apps/worker python -m py_compile apps/worker/app/corpus/models.py apps/worker/app/corpus/runtime.py apps/worker/app/corpus/selectors/corpus.py apps/worker/app/corpus/selectors/mapped.py apps/worker/app/corpus/selectors/provenance.py apps/worker/app/corpus/cli.py apps/worker/app/actors/corpus.py apps/worker/app/main.py`

Result:
- `16 passed`

Not executed:
- `python -m app.main check` against live local services in this pass
  because service readiness depends on local Redis/Postgres availability outside
  the isolated testcontainers path.
