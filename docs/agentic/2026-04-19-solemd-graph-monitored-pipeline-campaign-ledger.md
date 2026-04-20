# 2026-04-19 SoleMD.Graph Monitored Pipeline Campaign Ledger

- Date: `2026-04-19`
- Repo: `SoleMD.Graph`
- Scope: bounded monitored pipeline campaign over the already-landed worker slices
- Status: `completed`
- Primary goal: measure the real `raw -> corpus -> mapped -> evidence` stage sizes and lock policy recommendations from observed warehouse and telemetry output

## Intent

This ledger is for a measurement-and-policy pass, not an architecture pass.

The worker/runtime contract is already landed:

- queue-backed worker lanes:
  - `ingest`
  - `corpus`
  - `evidence`
- worker-root Prometheus metrics:
  - ingest: `http://127.0.0.1:9464/metrics`
  - corpus: `http://127.0.0.1:9465/metrics`
  - evidence runtime: `http://127.0.0.1:9466/metrics`
- observability stack:
  - Prometheus: `http://127.0.0.1:9095`
  - Grafana: `http://127.0.0.1:3300`

The campaign objective is to run a fresh bounded release pair under telemetry,
measure stage counts and reason mixes, and recommend a locked policy contract
for:

- `raw -> corpus`
- `corpus -> mapped`
- `mapped -> evidence`
- evidence enqueue rate
- paper-text resolution outcomes

## Constraints

- no row-at-a-time warehouse loops where SQL can do the work
- no live API calls to decide membership
- no reimplementation of evidence-text fetch inside corpus selection
- no chunking / grounding in this slice
- no fallback to old engine/runtime patterns
- use the existing Dramatiq actors and worker roots
- keep policy surfaces explicit and measurable

## Runtime Contract In Use

### Worker roots

- `uv run --project apps/worker --directory apps/worker python -m app.ingest_worker`
- `uv run --project apps/worker --directory apps/worker python -m app.corpus_worker`
- `uv run --project apps/worker --directory apps/worker python -m app.evidence_worker`

### Health checks

- `uv run --project apps/worker --directory apps/worker python -m app.main check`
- `uv run scripts/schema_migrations.py verify --cluster warehouse --dsn "$WAREHOUSE_DSN_ADMIN" --check`

### Queue/runtime surfaces

- corpus selection actor: `corpus.start_selection`
- evidence dispatcher actor: `corpus.dispatch_evidence_wave`
- current evidence acquisition actor: `evidence.acquire_for_paper`

### Policy/runtime surfaces

- selector policy builder: `apps/worker/app/corpus/policies.py`
- corpus admission selector: `apps/worker/app/corpus/selectors/corpus.py`
- mapped promotion selector: `apps/worker/app/corpus/selectors/mapped.py`
- evidence dispatch runtime: `apps/worker/app/corpus/wave_runtime.py`
- evidence acquisition runtime: `apps/worker/app/evidence/runtime.py`

## Environment Notes

The repo-local shell config is currently split:

- `.env.local` points `REDIS_URL` at `redis://:local_dev@127.0.0.1:6380/0`
- the already-running worker roots are actually using:
  - `REDIS_URL=redis://127.0.0.1:57379/0`
  - `WAREHOUSE_DSN_INGEST=postgresql://engine_ingest_write:engine_ingest_write@127.0.0.1:54432/warehouse?application_name=graph-worker-ingest`
  - `WAREHOUSE_DSN_READ=postgresql://engine_warehouse_read:engine_warehouse_read@127.0.0.1:54432/warehouse?application_name=graph-worker-warehouse-read`
  - `WAREHOUSE_DSN_ADMIN=postgresql://engine_warehouse_admin:engine_warehouse_admin@127.0.0.1:54432/warehouse?application_name=schema-migrations-warehouse`
  - `SERVE_DSN_READ=postgresql://engine_serve_read:engine_serve_read@127.0.0.1:56432/serve?application_name=graph-engine-api`
  - `SERVE_DSN_ADMIN=postgresql://engine_admin:engine_admin@127.0.0.1:55432/serve?application_name=graph-engine-api-admin`

Campaign commands should use the live worker env rather than the stale
`.env.local` Redis target so queue-backed execution and startup checks match the
already-running worker roots.

## Measured Campaign Inputs

- prior proof release pair: `s2 2026-03-10-audit` + `pt3 2026-03-21-audit`
- prior proof sample releases:
  - `codex-live-s2-20260419170908`
  - `codex-live-pt3-20260419170908`
- prior live selector version: `selector-v2-live-metrics`
- current wave policy key: `evidence_missing_pmc_bioc`

Fresh run inputs for this ledger:

- S2 release tag: `2026-03-10-audit`
- PT3 release tag: `2026-03-21-audit`
- selector version: `selector-v2-monitored-policy-r1`
- wave policy key: `evidence_missing_pmc_bioc`
- max papers: `10`
- corpus selection run id: `019da859-c77e-787e-8ae5-1dce29b30e89`
- evidence wave run id: `019da85a-b1f9-73b9-9ba8-16ba64075d01`

## Measurement Worksheet

### Stage counts

| Measure | Value | Notes |
|---|---:|---|
| Raw paper count in sampled release pair | 2 | `solemd.s2_papers_raw` on S2 release `11` |
| Corpus paper count | 1 | selection summary `current_status IN ('corpus', 'mapped')` |
| Mapped paper count | 1 | selection summary `current_status = 'mapped'` |
| Evidence cohort count | 1 | mapped + recency + priority + locator, independent of fetch backlog |
| Evidence-selected count | 0 | current wave selected zero because the only evidence-grade paper already has active `pmc_bioc` |
| Evidence-enqueued count | 0 | no wave members with `enqueued_at` |
| Paper-text success count | 0 | no new acquisition attempt in this campaign window |
| Paper-text unavailable count | 0 | no new acquisition attempt in this campaign window |
| Paper-text failed count | 0 | no new acquisition attempt in this campaign window |

### Reason mixes

| Measure | Value | Notes |
|---|---:|---|
| Top corpus admission reasons | `vocab_entity_match:vocab_alias = 14 signals` | corpus admission on this pair is overwhelmingly vocab-alias driven |
| Top mapped promotion reasons | `mapped_entity_rule_match:behavior = 1 signal` | no pattern or relation promotion fired on this pair |
| Top evidence selection reasons | `none selected by current wave` | measured exclusion reason was `already_has_pmc_bioc` for the only evidence-grade mapped paper |

### Quality/usefulness proxies

| Measure | Value | Notes |
|---|---:|---|
| Has abstract | `1 true / 1 false` | summary `has_abstract` |
| Has PMID / PMCID / DOI locator | `2 true / 0 false` | summary `has_locator_candidate` |
| Has PT3 annotations | `1 true / 1 false` | release-scope PT3 entity presence by PMID |
| Has PT3 relations | `0 true / 2 false` | release-scope PT3 relation presence by PMID |
| Year distribution | `2018: 1`, `2024: 1` | mapped paper is 2018 |
| Venue distribution | `european journal of clinical investigation: 1`, `plos one: 1` | normalized venues from summary |
| Reference-out distribution | `0: 2` | both release-scope papers have zero references in this pair |

## Grafana / Prometheus Observation Log

- Grafana dashboard was healthy and reachable at `http://127.0.0.1:3300`.
- After the new selection run, Grafana displayed new series for:
  - `selector-v2-monitored-policy-r1` in `Corpus Selection Phase Duration p95`
  - `selector-v2-monitored-policy-r1` in `Corpus Selection Volume (24h)`
  - `selector-v2-monitored-policy-r1` in `Evidence Wave Selected vs Enqueued (24h)`
  - `selector-v2-monitored-policy-r1` in `Evidence Wave Phase Duration p95`
- Grafana still showed `No data` for the Dramatiq panels during this campaign.
- `Paper Text Outcomes (24h)` and `Paper Text Duration p95` did not gain a new
  series for this run because the evidence wave selected and enqueued zero
  members.
- Prometheus API verification for this run:
  - `corpus_selection_runs_total{selector_version="selector-v2-monitored-policy-r1"} = 1`
  - `corpus_wave_members_selected_total{selector_version="selector-v2-monitored-policy-r1",wave_policy_key="evidence_missing_pmc_bioc"} = 0`
  - `corpus_wave_enqueued_total{selector_version="selector-v2-monitored-policy-r1",wave_policy_key="evidence_missing_pmc_bioc"} = 0`
- Later on `2026-04-19`, the initial dashboard gaps were traced to two separate
  observability defects:
  - the worker-side Dramatiq Prometheus wrapper was not delegating the runtime
    middleware hooks that actually increment `dramatiq_*` counters and
    histograms
  - the provisioned Grafana panels were using short-window `rate(...)` and
    plain `increase(...)` queries that collapse to zero or `No data` for sparse,
    bounded worker runs
- Those defects were repaired in Batch 4 below and Grafana now returns non-zero
  series for the monitored campaign through its own datasource proxy.

## Worker Processes

- ingest worker: `running before campaign`
- corpus worker: `running before campaign`
- evidence runtime worker: `running before campaign`

## Batches

### Batch 0 — Recon and Setup

Completed:

- read:
  - `docs/rag/README.md`
  - `docs/rag/14-implementation-handoff.md`
  - `docs/rag/05e-corpus-selection.md`
  - `docs/rag/05f-evidence-text-acquisition.md`
  - `docs/rag/06-async-stack.md`
  - `docs/rag/02-warehouse-schema.md`
- inspected current implementation:
  - `apps/worker/app/corpus/*`
  - `apps/worker/app/actors/corpus.py`
  - `apps/worker/app/evidence/runtime.py`
  - `apps/worker/app/actors/evidence.py`
  - `apps/worker/app/main.py`
  - `apps/worker/app/config.py`
  - `apps/worker/app/db.py`
- confirmed the current runtime naming contract:
  - architectural tier name: `evidence`
  - current worker module/queue name: `evidence`
- confirmed live observability endpoints are healthy:
  - Prometheus `:9095`
  - Grafana `:3300`
- confirmed the three worker metric roots are serving on:
  - `:9464`
  - `:9465`
  - `:9466`
- identified one environment caveat:
  - shell-side startup checks default to stale `.env.local` Redis `:6380`
  - live worker roots are using Redis `:57379`

Next:

- run startup and migration checks with the live worker env
- execute a fresh bounded queue-backed campaign
- record warehouse counts, metrics, and policy signals here before changing code

### Batch 1 — Live Measured Campaign

Completed:

- ran startup and migration checks with the live worker env:
  - `app.main check -> status=ready`
  - warehouse migration verify -> `ready: true`
- selected the only loaded real release pair with useful PT3 overlap:
  - S2: `2026-03-10-audit`
  - PT3: `2026-03-21-audit`
- queued a fresh monitored corpus-selection run:
  - selector version: `selector-v2-monitored-policy-r1`
  - run id: `019da859-c77e-787e-8ae5-1dce29b30e89`
  - terminal status: `published`
- queued a fresh monitored evidence wave:
  - wave policy: `evidence_missing_pmc_bioc`
  - max papers: `10`
  - run id: `019da85a-b1f9-73b9-9ba8-16ba64075d01`
  - terminal status: `published`

Measured Prometheus phase durations:

- corpus selection:
  - `assets = 0.454 s`
  - `corpus_admission = 0.043 s`
  - `mapped_promotion = 0.038 s`
  - `canonical_materialization = 0.052 s`
  - `selection_summary = 0.012 s`
- evidence wave:
  - `member_selection = 0.007 s`
  - `enqueue = 0.004 s`

Measured selection output:

- per-paper summary rows:
  - `900001 -> mapped -> vocab_entity_match`
    - `publication_year = 2018`
    - `mapped_priority_score = 285`
    - `evidence_priority_score = 370`
    - `has_locator_candidate = true`
    - `has_abstract = true`
    - `has_mapped_entity_match = true`
  - `11 -> retired -> selection_retired`
    - `publication_year = 2024`
    - `mapped_priority_score = 10`
    - `evidence_priority_score = 115`
    - `has_locator_candidate = true`
    - `has_abstract = false`

Measured evidence/backlog split:

- the only evidence-grade mapped paper on this pair is `corpus_id = 900001`
- it already has an active `pmc_bioc` document row:
  - `document_source_kind = 3`
  - `source_priority = 5`
  - `source_revision = PMC6220770`
- therefore:
  - evidence cohort count = `1`
  - evidence backlog count = `0`
  - evidence wave selected count = `0`
  - evidence wave enqueued count = `0`

Outcome:

- the monitored run produced real selection and wave telemetry on a real
  release pair
- the current wave key is measuring acquisition backlog, not the full evidence
  cohort size
- that distinction is now the main policy issue to lock in docs and runtime

### Batch 2 — Policy Readout

Measured conclusions:

1. Corpus admission:
   the current pair admitted the meaningful paper entirely through a vocab-alias
   path. That is a valid broad-recall corpus signal, but on sparse release pairs
   it can dominate the whole admission surface. Corpus admission should remain
   broad and keep vocab-alias hits, but the ledger should always record whether
   the admitted set has any journal/pattern corroboration.
2. Mapped promotion:
   the only mapped promotion on this pair came from a direct entity rule
   (`behavior`). That supports keeping mapped as a stronger, direct-signal gate.
   Nothing in this run argues for widening mapped with weaker fallback logic.
3. Evidence promotion:
   the current `evidence_missing_pmc_bioc` wave is not a full evidence-stage
   definition. It is a backlog dispatcher for evidence-grade papers still
   missing a `pmc_bioc` document. The measured run had:
   - `mapped = 1`
   - evidence cohort = `1`
   - wave selected/enqueued = `0`
   because the mapped paper was already satisfied.

Recommended policy contract from this measured run:

- Keep `raw -> corpus -> mapped -> evidence` as the public ladder.
- Keep corpus admission broad:
  - journal inventory match
  - venue-pattern match
  - vocab alias/entity hits
- Keep mapped promotion narrow:
  - direct mapped journal/pattern/entity/relation signals only
  - keep `requires_second_gate` families gated
- Split evidence into two explicit measured concepts:
  - `evidence cohort`
    - mapped
    - recent by default
    - high evidence score
    - locator-capable or already source-satisfied
  - `evidence acquisition backlog`
    - evidence cohort members still missing the preferred active full-text
      source
- Do not let `evidence_missing_pmc_bioc` stand in for the whole evidence stage.

Recommended threshold posture:

- Recency:
  keep the current default 10-year lookback for evidence, but treat it as the
  evidence cohort gate rather than the fetch backlog gate.
- Quality:
  keep the current `evidence_priority_score >= 150` floor until a larger loaded
  release pair exists; this campaign does not justify lowering it.
- Source awareness:
  count papers with active `pmc_bioc` as evidence-satisfied, not as
  evidence-missing.

Doc update proposal for `docs/rag`:

- `docs/rag/05e-corpus-selection.md`
  - clarify that the current wave key measures backlog dispatch, not full
    evidence-stage membership
  - add an explicit evidence-cohort vs evidence-backlog split
- `docs/rag/02-warehouse-schema.md`
  - document the SQL-observable distinction between evidence eligibility and
    acquisition backlog
- `docs/rag/14-implementation-handoff.md`
  - update the next-pass work from generic evidence policy tuning to explicitly
    locking evidence cohort vs backlog semantics
- `docs/rag/10-observability.md`
  - add a manual SQL worksheet section for raw/corpus/mapped/evidence counts
    and evidence exclusion reasons

### Batch 3 — Naming Cutover

Completed:

- renamed the evidence-acquisition implementation package from
  `apps/worker/app/hot_text` to `apps/worker/app/evidence`
- renamed the worker root to `app.evidence_worker`
- renamed the paper-level actor/queue to `evidence.acquire_for_paper` on
  queue `evidence`
- renamed the direct operator CLI entrypoints to
  `enqueue-evidence-text` and `run-evidence-text-now`
- renamed the `05f` runtime doc to
  `docs/rag/05f-evidence-text-acquisition.md`
- updated the current worker docs and this ledger to use `evidence` naming
- verified the rename with:
  - `uv run --project apps/worker --directory apps/worker python -m app.main --help`
  - `uv run --project apps/worker --directory apps/worker python -c "import app.evidence_worker, app.actors.evidence, app.evidence.runtime; print('ok')"`
  - `uv run --project apps/worker pytest apps/worker/tests/test_evidence_cli.py apps/worker/tests/test_evidence_runtime.py apps/worker/tests/test_corpus_cli.py apps/worker/tests/test_corpus_runtime.py apps/worker/tests/test_telemetry_bootstrap.py apps/worker/tests/test_db.py -q`
  - result: `17 passed`

### Batch 4 — Observability Repair And Live Verification

Completed:

- fixed the worker-side Dramatiq telemetry wrapper in
  `apps/worker/app/telemetry/dramatiq_prometheus.py`
  so the scoped middleware delegates the real Dramatiq lifecycle hooks:
  - `after_worker_shutdown`
  - `after_nack`
  - `after_enqueue`
  - `before_delay_message`
  - `before_process_message`
  - `after_process_message`
  - `after_skip_message`
- added a regression test in
  `apps/worker/tests/test_telemetry_bootstrap.py`
  to lock those delegations
- verified the repo-side fix with:
  - `uv run --project apps/worker pytest apps/worker/tests/test_telemetry_bootstrap.py apps/worker/tests/test_evidence_runtime.py apps/worker/tests/test_corpus_runtime.py -q`
  - result: `14 passed`
- updated the provisioned Grafana worker dashboard so sparse bounded runs are
  measurable over a `24h` window:
  - count panels now use `last_over_time(...) - baseline` deltas instead of
    short-window `increase(...)`
  - duration panels now use histogram deltas over `24h` instead of
    `rate(...[5m])`
  - Dramatiq panels now filter on
    `job=~"graph-(ingest|corpus|evidence)-worker"` and legend on
    `{{actor_name}}`
- updated the shared Prometheus scrape config so the evidence lane is labeled
  canonically:
  - job name: `graph-evidence-worker`
  - `worker_scope="evidence"`
- reloaded both stacks live:
  - Grafana dashboard provisioning reload -> `200`
  - Prometheus config reload -> `200`
- restarted the three worker roots under the live worker env so the fixed
  middleware and metric roots were actually in process
- ran a bounded verification pass under live telemetry:
  - selector version: `selector-v2-monitored-policy-r2`
  - corpus selection run id: `019da886-7ff6-789f-b028-95d0a532e6dc`
  - evidence wave run id: `019da886-838c-7fc7-a25f-171e9f054b65`
  - direct evidence acquisition: `enqueue-evidence-text 900001 --force-refresh`

Verified live from Grafana's Prometheus datasource:

- worker scrape labels:
  - `graph-ingest-worker / ingest = 1`
  - `graph-corpus-worker / corpus = 1`
  - `graph-evidence-worker / evidence = 1`
- Dramatiq processed messages over `24h`:
  - `corpus.start_selection = 1`
  - `corpus.dispatch_evidence_wave = 1`
  - `evidence.acquire_for_paper = 1`
- ingest rows loaded over `24h`:
  - `pt3 / bioconcepts = 1`
  - `s2 / papers = 2`
  - `s2 / abstracts = 2`
  - `s2 / authors = 1`
  - `s2 / publication_venues = 2`
  - `s2 / citations = 1`
- corpus selection volume over `24h`:
  - `selector-v2-monitored-policy-r2 / corpus_admission = 14`
  - `selector-v2-monitored-policy-r2 / mapped_promotion = 1`
- evidence wave selected over `24h`:
  - `selector-v2-monitored-policy-r2 / evidence_missing_pmc_bioc = 0`
- paper-text outcomes over `24h`:
  - `published / pmcid / paper_row_pmcid = 2`
  - `unavailable / pmid / pmid_direct = 1`
- document spine rows written over `24h`:
  - `documents = 2`
  - `sections = 28`
  - `blocks = 236`
  - `sentences = 950`

Verified latest direct evidence acquisition outcome:

- `corpus_id = 900001`
- `locator_kind = pmcid`
- `locator_value = PMC6220770`
- publish outcome: `published`
- rows written:
  - `sections = 14`
  - `blocks = 118`
  - `sentences = 475`

Outcome:

- Grafana is no longer pinned to zero-value short-window queries for bounded
  worker campaigns
- the dashboard now surfaces real ingest, corpus, evidence, Dramatiq, and
  paper-text activity from the existing worker slices
- the observability path is usable for the next ingestion-analysis and policy
  locking pass without introducing new architecture

## Open Policy Questions To Answer From Measurements

1. Corpus admission:
   what broad-but-not-useless rules define the selected canonical warehouse corpus?
2. Mapped promotion:
   what stronger gates move a corpus paper into mapped?
3. Evidence promotion:
   what narrower rules move a mapped paper into evidence?

## Remaining Follow-On Work

- update any broader downstream docs outside this measured campaign once the
  policy contract is agreed
- keep future policy dashboards on sparse-safe `24h` delta queries unless the
  system starts producing dense enough traffic to justify short-window rates
