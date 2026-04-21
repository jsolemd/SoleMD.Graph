# 2026-04-20 SoleMD.Graph Stage Contract Implementation Plan Ledger

- Date: `2026-04-20`
- Repo: `SoleMD.Graph`
- Scope: lock the staged persistence contract and the next implementation batch
  for `raw -> corpus -> mapped -> evidence`
- Status: `implementation landed; live ingest verification in progress`
- Commit hashes: none in this pass

## Purpose

The monitored campaign and downstream doc/code review made the next move clear:
the public stage ladder is correct, but the current worker implementation still
materializes some heavy mapped-owned surfaces too early.

This ledger locks the next implementation batch so later code work can proceed
without reopening the boundary question.

## Documents Reviewed Before Locking

Core contract and schema docs:

- `docs/rag/README.md`
- `docs/rag/02-warehouse-schema.md`
- `docs/rag/04-projection-contract.md`
- `docs/rag/05-ingest-pipeline.md`
- `docs/rag/05a-chunking.md`
- `docs/rag/05b-graph-bundles.md`
- `docs/rag/05e-corpus-selection.md`
- `docs/rag/05f-evidence-text-acquisition.md`
- `docs/rag/06-async-stack.md`
- `docs/rag/07-opensearch-plane.md`
- `docs/rag/10-observability.md`
- `docs/rag/14-implementation-handoff.md`

Code surfaces reviewed:

- `apps/worker/app/ingest/manifest_registry.py`
- `apps/worker/app/ingest/sources/semantic_scholar.py`
- `apps/worker/app/ingest/writers/s2.py`
- `apps/worker/app/ingest/writers/pubtator.py`
- `apps/worker/app/corpus/materialize.py`
- `apps/worker/app/corpus/selection_runtime.py`
- `apps/worker/app/corpus/models.py`
- `apps/worker/app/corpus/runtime_support.py`
- `apps/worker/app/corpus/selectors/mapped.py`
- `apps/worker/app/corpus/selectors/provenance.py`
- `apps/worker/app/corpus/wave_runtime.py`
- `apps/worker/app/evidence/runtime.py`
- `apps/worker/app/telemetry/metrics.py`

## Locked Stage Contract

### `raw`

Persist the broad, rebuildable warehouse substrate:

- `s2_papers_raw`
- `s2_paper_authors_raw`
- venue inputs used to normalize / resolve `solemd.venues`
- `pubtator.*_stage`
- paper-level citation aggregates as the default pre-mapped citation surface:
  `reference_out_count`, `influential_reference_count`, and ideally
  `linked_reference_count`

Do not treat broad raw as the public corpus.

Do not make full citation edges the default broad raw contract. If edge rows are
needed later for graph or citation-quality work, they become a mapped-owned or
child-wave enrichment, not the default pre-corpus substrate.

### `corpus`

Persist the broad admitted canonical paper universe and the audit surfaces that
explain it:

- `solemd.corpus`
- `solemd.corpus_selection_runs`
- `solemd.corpus_selection_signals`
- `solemd.paper_selection_summary`
- baseline canonical paper surfaces only:
  - `solemd.papers`
  - `solemd.paper_text`

`corpus` is deliberately broad and reproducible. It is the paper universe worth
carrying forward, not the place to materialize every fanout table.

### `mapped`

Persist the stricter active paper universe and the heavier canonical surfaces
that downstream projection, graph, and paper-level retrieval actually need:

- `solemd.paper_authors` and `solemd.authors` if `author_line` remains part of
  paper cards
- canonical `pubtator.entity_annotations`
- canonical `pubtator.relations`
- mapped-only citation-edge enrichment if a downstream graph/retrieval wave
  truly needs it beyond the aggregate counts already present on
  `paper_selection_summary`
- mapped-owned embeddings / projection / graph inputs

`mapped` is where higher-cost fanout belongs because these surfaces support the
smaller active paper universe rather than every admitted corpus paper.

### `evidence`

Persist the smaller, source-aware, full-document child wave:

- `solemd.corpus_wave_runs`
- `solemd.corpus_wave_members`
- `solemd.paper_text_acquisition_runs`
- canonical document spine:
  - `solemd.paper_documents`
  - `solemd.paper_sections`
  - `solemd.paper_blocks`
  - `solemd.paper_sentences`
- downstream chunking / grounding surfaces from `05a`

`evidence` owns full-document payloads, chunking, and grounding. It is not a
fallback place to define corpus or mapped membership.

## Locked Criteria Summary

- `raw -> corpus`
  - broad, high-recall, warehouse-local admission
  - journal / venue normalization, curated alias/entity evidence, and other
    explicit rule families
- `corpus -> mapped`
  - stricter direct or corroborated signal families
  - citation aggregates are fair game here; full citation-edge rows are not a
    prerequisite
- `mapped -> evidence`
  - recent, source-aware, locator-ready, quality-weighted papers suitable for
    grounded answer generation and downstream document work

## Downstream Preservation Check

The review against `docs/rag` produced these constraints:

- `05a`, `07`, and `08` do not require broad pre-`mapped` full text, broad
  author rows, or broad citation edges.
- `04` and `06` only force author materialization if `author_line` remains part
  of the paper card/profile contract.
- `03` is compatible because serve does not expose the broad warehouse
  selection/fact surfaces directly.
- `05f` is compatible as long as PT3 stage remains broad raw substrate and
  canonical document work stays evidence-owned.
- `05b` and graph-facing code can consume mapped-owned heavy surfaces; they do
  not need those surfaces for every admitted corpus paper.

## Implemented Batch

### Worker / warehouse changes landed

- S2 default families now defer heavy optional inputs by default:
  `authors`, `tldrs`, and `s2orc_v2`.
- S2 raw author ingest now writes the author-registry surface
  `solemd.s2_authors_raw`.
- S2 citations now default to the aggregate raw surface
  `solemd.s2_paper_reference_metrics_raw` instead of broad
  `s2_paper_references_raw` edge persistence.
- PT3 raw ingest now resets only `pubtator.*_stage`, not canonical PT3.
- Corpus runtime now has explicit
  `corpus_baseline_materialization` and
  `mapped_surface_materialization` phases.
- Baseline materialization now rebuilds admitted-corpus `papers` /
  `paper_text`.
- Mapped materialization now rebuilds mapped-only `paper_authors` and
  canonical PT3 surfaces.
- Release-scope cleanup now clears stale mapped fanout and legacy
  `paper_citations` rows before rematerialization so reruns do not leave old
  rows behind.
- Remaining active runtime naming now uses `evidence` terminology rather than
  `hot_text` for the evidence-acquisition lane.
- Warehouse migration
  `20260420003000_warehouse_raw_stage_contract_alignment.sql`
  was added and applied live.
- Follow-on warehouse migration
  `20260420004500_warehouse_corpus_materialization_delete_grants.sql`
  was added and applied live so corpus rematerialization can clear and rebuild
  `papers` / `paper_text` under `engine_ingest_write`.

### Live ingest verification so far

- Fresh `dramatiq` worker roots were brought up for `ingest`, `corpus`, and
  `evidence`.
- Ingest metrics resumed emitting live non-zero state on `:9464`.
- PT3 `2026-03-21` was resumed under the patched runtime and showed active run
  state in Prometheus.
- A full S2 `2026-03-10` retry was queued behind that PT3 work under the new
  raw-surface contract.
- Two ingest issues were fixed during verification:
  - venue upsert now handles duplicate ISSN rows without aborting the run
  - `force_new_run` now rejects unfinished runs cleanly instead of falling
    through to the active-lock unique constraint
- Two more ingest/telemetry issues were fixed in the follow-on two-process
  pass:
  - venue upsert now also deduplicates and updates by normalized venue name,
    preventing `uq_venues_normalized_name` failures during live S2 retries
  - worker metrics bootstrap no longer races shard cleanup across forked
    processes during `--processes 2` startup
- PT3 BioCXML duplicate-stage failures were fixed at the real write boundary:
  - `iter_file_batches()` no longer replays the same batch under queue
    backpressure
  - PT3 stage writes now flow through temp-buffered bulk merge rather than
    direct concurrent COPY into PK-constrained final stage tables
  - BioCXML entity parsing now deduplicates exact duplicate entity keys within
    one document before the warehouse write boundary

### Targeted verification

Worker test command:

```bash
uv run --project apps/worker pytest \
  apps/worker/tests/test_ingest_runtime.py \
  apps/worker/tests/test_corpus_runtime.py \
  apps/worker/tests/test_telemetry_metrics.py -q
```

Latest result:

- `17 passed, 2 warnings`

Follow-on verification after the two-process fixes:

```bash
uv run --project apps/worker pytest \
  apps/worker/tests/test_telemetry_bootstrap.py \
  apps/worker/tests/test_telemetry_metrics.py -q

uv run --project apps/worker pytest \
  apps/worker/tests/test_ingest_runtime.py \
  apps/worker/tests/test_corpus_runtime.py -q
```

Latest result:

- `7 passed, 2 warnings`
- `16 passed, 2 warnings`

PT3 duplicate-stage verification:

```bash
uv run --project apps/worker pytest \
  apps/worker/tests/test_ingest_writer_base.py \
  apps/worker/tests/test_ingest_runtime.py -k 'pubtator or iter_file_batches' -q
```

Latest result:

- `6 passed, 8 deselected, 2 warnings`

Final worker regression sweep after the helper and PT3 fixes:

```bash
uv run --project apps/worker pytest \
  apps/worker/tests/test_ingest_writer_base.py \
  apps/worker/tests/test_ingest_runtime.py \
  apps/worker/tests/test_corpus_runtime.py \
  apps/worker/tests/test_telemetry_bootstrap.py \
  apps/worker/tests/test_telemetry_metrics.py -q
```

Latest result:

- `27 passed, 2 warnings`

Live worker endpoints after process rotation:

- ingest metrics: `http://127.0.0.1:9464/metrics`
- corpus metrics: `http://127.0.0.1:9465/metrics`
- evidence metrics: `http://127.0.0.1:9466/metrics`

Observed live ingest state after restart:

- PT3 worker resumed run `019dab4b-280e-7491-928f-a655f1d0f277`
- active labels on `:9464` show:
  - `run_label="pt3:2026-03-21"`
  - `phase="loading"`
  - `work_item="biocxml"`
- `worker_active_run_progress_units{progress_kind="current_work_item_rows"}`
  increased after restart, confirming forward movement rather than a stale
  zero-only panel

Current queue note:

- PT3 is the active ingest run right now
- S2 `2026-03-10` with families
  `publication_venues`, `authors`, `papers`, `abstracts`, `citations`
  has been re-enqueued under the updated worker image
- operator decision for the next live pass: widen ingest to two processes so
  PT3 and S2 can overlap on the ingest queue under one metrics surface

### Two-process live confirmation

Confirmed live worker command:

```bash
uv run --project apps/worker dramatiq app.ingest_worker --processes 2 --threads 1 --queues ingest
```

Observed after the latest restart on `2026-04-20`:

- both worker processes booted cleanly under one ingest root
- S2 `2026-03-10` advanced past `publication_venues` into `authors`
- PT3 `2026-03-21` resumed on the second ingest process
- `http://127.0.0.1:9464/metrics` showed both active runs concurrently:
  - `run_label="s2:2026-03-10"` with `work_item="authors"`
  - `run_label="pt3:2026-03-21"` with `work_item="biocxml"`
- lock-age gauges were present for both releases at the same time
- progress gauges were non-zero for both releases at the same time

Condensed operator map for the ingest root:

```text
ingest queue
  +--> process 0 -> S2 2026-03-10
  |       publication_venues -> authors -> papers -> abstracts -> citations
  |
  +--> process 1 -> PT3 2026-03-21
          biocxml -> bioconcepts -> relations
```

### PT3 duplicate-stage root cause and fix

Observed live failure before the fix:

- PT3 `biocxml` hit `UniqueViolationError` on
  `entity_annotations_stage_pkey`
- the failing key shape matched the strict stage PK:
  `(source_release_id, pmid, start_offset, end_offset, concept_id_raw, resource)`

Root cause:

- the old `iter_file_batches()` helper could replay one logical batch under
  queue backpressure because it retried `queue.put(item)` by issuing a fresh
  `queue.put` future rather than waiting on the original future
- PT3 also wrote directly from concurrent workers into the PK-constrained
  stage tables, so any replayed or duplicate source row crashed the run

Durable fix:

- `iter_file_batches()` now creates one `queue.put` future per logical batch
  and waits on that same future until it completes or shutdown is requested
- PT3 stage writes now COPY into session-local temp buffers and then merge into
  `pubtator.entity_annotations_stage` / `pubtator.relations_stage` with
  deterministic set-based insert/upsert semantics
- `_stream_biocxml()` now drops exact duplicate entity keys within one parsed
  document before they ever reach the stage merge

What this is not:

- not a thread-count reduction
- not a `--processes 1` fallback
- not retry-only masking

### Live PT3 validation after the fix

After the fixed ingest root restart on `2026-04-20`:

- PT3 `2026-03-21` resumed immediately on worker boot
- no repeat `entity_annotations_stage_pkey` failure was observed during the
  monitored window
- `worker_active_run_progress_units{run_label="pt3:2026-03-21",progress_kind="current_work_item_rows"}`
  advanced from `0` to `60,000`, then `310,000`, then `460,000`
- S2 was re-enqueued and resumed on the second ingest process while PT3 kept
  advancing
- the ingest metrics root again showed both active run labels concurrently:
  - `pt3:2026-03-21` with `work_item="biocxml"`
  - `s2:2026-03-10` with `work_item="papers"`

## Implementation Plan

### Phase 1 — Docs lock

Update the contract authorities first:

- `docs/rag/README.md`
- `docs/rag/02-warehouse-schema.md`
- `docs/rag/05-ingest-pipeline.md`
- `docs/rag/05e-corpus-selection.md`
- `docs/rag/05f-evidence-text-acquisition.md`
- `docs/rag/10-observability.md`
- `docs/rag/14-implementation-handoff.md`

Goal: make the target split explicit without pretending the code already landed.

### Phase 2 — Raw citation-surface split

Land a broad raw aggregate surface for citation support:

- add a raw aggregate table for paper-level citation metrics
- switch mapped/provenance logic to consume those aggregates
- make full citation edges opt-in or mapped-owned instead of default broad raw

Primary files:

- `apps/worker/app/ingest/sources/semantic_scholar.py`
- `apps/worker/app/ingest/writers/s2.py`
- `apps/worker/app/corpus/selectors/mapped.py`
- `apps/worker/app/corpus/selectors/provenance.py`

### Phase 3 — Corpus baseline vs mapped-surface split

Replace the single broad `canonical_materialization` block with a staged split:

- `corpus_baseline_materialization`
  - sync PT3 stage `corpus_id`
  - upsert `papers`
  - upsert `paper_text`
- `mapped_surface_materialization`
  - upsert `authors` / `paper_authors`
  - materialize canonical PT3
  - materialize citation edges only if the mapped wave requires them

Primary files:

- `apps/worker/app/corpus/materialize.py`
- `apps/worker/app/corpus/selection_runtime.py`
- `apps/worker/app/corpus/models.py`
- `apps/worker/app/corpus/runtime_support.py`

### Phase 4 — PT3 ownership correction

Ensure raw PT3 stays stage-only during raw ingest and does not overwrite
mapped-owned canonical PT3 surfaces.

Primary files:

- `apps/worker/app/ingest/writers/pubtator.py`
- warehouse schema / migration files under `db/schema/warehouse` and
  `db/migrations/warehouse`

### Phase 5 — Evidence naming cleanup

Completed for active runtime and current docs:

- active worker/runtime surfaces now use `evidence` / `evidence_text`
- remaining `hot_text` references are historical ledger notes documenting the
  earlier transition rather than active runtime contract

Runtime behavior was not changed by naming alone.

## Risks To Carry Into Implementation

1. PT3 raw ingest currently has the highest risk surface. If raw refresh still
   touches canonical PT3, it can wipe mapped-owned surfaces.
2. Removing raw author handling entirely is not obviously optimal. Raw authors
   remain acceptable as a broad helper surface even though canonical author
   materialization should move to `mapped`.
3. Projection and graph docs/code that assume `paper_authors` or
   `paper_citations` for every corpus paper must be updated to mapped-only
   semantics before the split lands.
4. Observability has to split with the runtime. One opaque materialization phase
   defeats the point of the contract.

## Definition Of Done For The Next Code Batch

- Raw ingest writes the intended broad raw substrate and no longer implies broad
  canonical PT3 or broad citation-edge persistence.
- `paper_selection_summary` remains the stable pre-mapped gating surface and no
  longer depends on mapped-only heavy tables.
- Corpus baseline materialization and mapped-surface materialization are
  separate runtime phases with separate telemetry.
- Downstream docs and dashboards show the same stage contract the code now
  implements.
