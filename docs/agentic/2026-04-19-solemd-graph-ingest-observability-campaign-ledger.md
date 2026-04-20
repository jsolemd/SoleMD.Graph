# 2026-04-19 SoleMD.Graph Ingest Observability Campaign Ledger

## Scope

Establish the next execution stream for the post-ingest corpus pipeline:

- implement the minimal worker telemetry slice needed for measured execution
- run bounded real ingest against the current `apps/worker` runtime
- instrument ingest / corpus / evidence worker metrics that the RAG docs already expect
- measure real counts and throughput across:
  - raw upstream
  - corpus
  - mapped
  - evidence
- validate that the current async / Dramatiq / asyncpg / PostgreSQL 18 stack is behaving correctly under live-ish load
- produce the data needed to tune corpus, mapped, and evidence policies from measured warehouse reality instead of intuition

This ledger is for the implementation-and-validation pass after the initial
policy lock.

Telemetry-first scope for this ledger is intentionally narrow:

- yes: worker-native metrics helper, lane metrics, `/metrics` exposure, tests,
  and bounded live validation
- no: full Grafana dashboard authoring, Alertmanager policy, shared-infra
  collector expansion, or broad observability-platform work beyond what the
  landed worker needs right now

## Ranked Themes And Findings

1. **This is the right next task.**
   The current selection and evidence dispatch contracts are now explicit enough
   that the next highest-value work is measured execution against real data.

2. **The worker runtime already has durable control surfaces.**
   Ingest, corpus selection, and evidence dispatch each have explicit run rows,
   advisory locks, resumable phases, and structured phase events. That is the
   correct substrate for live validation.

3. **The metrics contract exists in docs, but the worker implementation is not fully there yet.**
   `docs/rag/05-ingest-pipeline.md` and `docs/rag/10-observability.md` already
   declare ingest metrics such as:
   - `ingest_phase_duration_seconds`
   - `ingest_index_build_duration_seconds`
   - `ingest_failures_total`
   - `ingest_active_lock_age_seconds`

   The current worker code primarily emits structured log events. The next pass
   should add explicit Prometheus-compatible metrics surfaces for the worker
   lanes rather than relying on logs alone.

4. **Telemetry should land before the first serious live validation pass.**
   Because the docs already define the runtime metrics contract, the better
   sequence is:
   - land the narrow worker telemetry slice first
   - then run the bounded live cycle against the instrumented path

   If any instrumentation edge remains unfinished, the campaign still records
   measurements directly in this ledger from:
   - run-table timestamps
   - warehouse SQL count snapshots
   - structured worker events
   - bounded queue / outcome inspection

5. **We need measured stage counts before policy widening.**
   The current `corpus -> mapped -> evidence` policy is reasonable, but the next
   threshold discussions should be driven by real warehouse counts:
   - how many papers land in raw
   - how many enter corpus
   - how many promote to mapped
   - how many qualify for the evidence wave
   - how many actually resolve into canonical document spines

6. **This is also the optimization checkpoint.**
   A bounded live run gives the first useful answer to:
   - whether asyncpg pool sizing is sane
   - whether the current SQL is actually set-based enough in practice
   - whether Redis / Dramatiq queue behavior is stable
   - which phases dominate wall-clock
   - where retries, lock age, or pool starvation show up first

## Current State Snapshot

- `apps/worker/app/ingest` is landed and resumable.
- `apps/worker/app/corpus` is landed for:
  - broad `corpus` admission
  - stricter `mapped` promotion
  - `evidence` child-wave dispatch into the current `hot_text` acquisition lane
- `apps/worker/app/hot_text` is landed for PMC BioC-driven canonical document acquisition.
- `docs/rag` now describes the hierarchy as:
  - raw upstream
  - selected canonical corpus
  - mapped paper-level active subset
  - evidence subset

## Execution Queue

1. **Narrow worker telemetry slice**
   Implement the worker-native telemetry surfaces needed for the current lanes:
   ingest, corpus selection, and evidence dispatch.

2. **Bounded live ingest run**
   Run a constrained S2 + PT3 ingest sample against the current warehouse and
   verify:
   - release rows
   - ingest run rows
   - loaded families
   - structured phase events
   - phase timings
   - stage counts in warehouse tables

3. **Post-ingest corpus run**
   Execute corpus selection for the same published release pair and record:
   - corpus count
   - mapped count
   - signal-family counts
   - per-paper summary distribution

4. **Evidence wave run**
   Dispatch a bounded evidence wave and record:
   - eligible mapped count
   - selected member count
   - enqueue count
   - publish / unavailable / failed outcomes after acquisition

5. **Optimization review**
   Compare observed timings and counts to the docs assumptions. Use the first
   measured cycle to decide:
   - whether pool sizing needs adjustment
   - whether any query needs more targeted indexing
   - whether evidence thresholds are too loose or too strict
   - whether corpus breadth is too narrow or too broad

## To Do

- define the manual measurement worksheet for:
  - ingest run timing
  - raw family counts
  - corpus / mapped counts
  - evidence eligibility / selection / acquisition outcomes
- run a bounded live ingest sample and persist the observed counts in this ledger
- run corpus selection on the ingested sample and persist the observed counts in this ledger
- run a bounded evidence wave on the selected sample and persist the observed counts in this ledger
- document any threshold or policy adjustments discovered from real measurements
- fall back to manual ledger capture only where the first telemetry pass is not
  yet wired

## Completed Batches

### Batch 0 — Reconnaissance

Completed:

- read `docs/agentic/README.md`
- inspected current worker runtime surfaces in:
  - `apps/worker/app/ingest/runtime.py`
  - `apps/worker/app/hot_text/runtime.py`
  - `apps/worker/app/corpus/selection_runtime.py`
  - `apps/worker/app/corpus/wave_runtime.py`
- inspected observability contract in `docs/rag/10-observability.md`
- inspected ingest metrics contract in `docs/rag/05-ingest-pipeline.md`
- confirmed `docs/rag/05e-corpus-selection.md` expects phase-specific logs / metrics
- confirmed the current worker runtime is event-driven but not yet fully metricized

Outcome:

- proceed with a telemetry-first validation campaign: land the worker-native
  metrics slice first, then run the bounded live cycle and capture any
  remaining gaps manually in the ledger

### Batch 1 — Worker Telemetry Slice

Completed:

- added worker-owned telemetry modules under:
  - `apps/worker/app/telemetry/__init__.py`
  - `apps/worker/app/telemetry/bootstrap.py`
  - `apps/worker/app/telemetry/metrics.py`
- added `prometheus-client==0.25.0` to `apps/worker/pyproject.toml`
- extended worker settings with telemetry env/config fields in
  `apps/worker/app/config.py`
- wired broker bootstrap to add Dramatiq's Prometheus middleware in
  `apps/worker/app/broker.py`
- prepared metrics environments per worker scope in:
  - `apps/worker/app/ingest_worker.py`
  - `apps/worker/app/corpus_worker.py`
  - `apps/worker/app/hot_text_worker.py`
  - `apps/worker/app/main.py`
- instrumented runtime metrics in:
  - `apps/worker/app/ingest/runtime.py`
  - `apps/worker/app/corpus/selection_runtime.py`
  - `apps/worker/app/corpus/wave_runtime.py`
  - `apps/worker/app/hot_text/runtime.py`
- added telemetry test support:
  - `apps/worker/tests/telemetry_test_support.py`
- added metric assertions to DB-backed runtime tests in:
  - `apps/worker/tests/test_ingest_runtime.py`
  - `apps/worker/tests/test_corpus_runtime.py`
  - `apps/worker/tests/test_hot_text_runtime.py`
- updated telemetry/docs/env contract in:
  - `.env.example`
  - `apps/worker/README.md`
  - `docs/rag/10-observability.md`
  - `docs/rag/05-ingest-pipeline.md`
  - `docs/rag/05e-corpus-selection.md`
  - `docs/rag/05f-hot-text-acquisition.md`

Landed metric families:

- ingest:
  - `ingest_phase_duration_seconds`
  - `ingest_runs_total`
  - `ingest_family_rows_total`
  - `ingest_family_files_total`
  - `ingest_failures_total`
  - `ingest_active_lock_age_seconds`
- corpus selection:
  - `corpus_selection_phase_duration_seconds`
  - `corpus_selection_runs_total`
  - `corpus_selection_signals_total`
  - `corpus_selection_materialized_papers_total`
  - `corpus_selection_summary_rows_total`
  - `corpus_selection_failures_total`
  - `corpus_selection_active_lock_age_seconds`
- evidence wave:
  - `corpus_wave_phase_duration_seconds`
  - `corpus_wave_runs_total`
  - `corpus_wave_members_selected_total`
  - `corpus_wave_enqueued_total`
  - `corpus_wave_failures_total`
  - `corpus_wave_active_lock_age_seconds`
- hot-text acquisition:
  - `paper_text_acquisitions_total`
  - `paper_text_acquisition_duration_seconds`
  - `paper_text_document_rows_total`
  - `paper_text_failures_total`
  - `paper_text_inprogress`

Verification:

- `uv run --project apps/worker pytest apps/worker/tests/test_ingest_runtime.py apps/worker/tests/test_corpus_runtime.py apps/worker/tests/test_hot_text_runtime.py -q`
  - result: `15 passed, 2 warnings`
- `uv run --project apps/worker pytest apps/worker/tests/test_ingest_runtime.py apps/worker/tests/test_corpus_cli.py apps/worker/tests/test_corpus_runtime.py apps/worker/tests/test_hot_text_runtime.py apps/worker/tests/test_hot_text_cli.py -q`
  - result: `18 passed, 2 warnings`
- `set -a && source .env.example && set +a && uv run --project apps/worker python -m app.main --help`
  - result: CLI import/bootstrap path is healthy with telemetry enabled

Outcome:

- the narrow worker telemetry slice is now landed end to end
- the next pass should be a bounded live ingest + corpus + evidence campaign
  using the instrumented worker roots, with warehouse SQL snapshots captured in
  this ledger alongside the scraped metrics

## Commit Hashes

- none yet for this ledger

## Blockers

- none hard-blocking yet

Open risks to resolve during execution:

- there may not yet be an existing worker-native Prometheus helper in `apps/worker`
- warehouse-local sample sizing must be bounded enough to finish quickly but large enough to expose real phase behavior
- current evidence acquisition is PMC BioC-first; if the sample skews heavily toward non-PMC content, evidence counts may be artificially low until source-aware fallback lands

## Newly Discovered Follow-On Work

- add warehouse SQL views or canned queries for stage-count snapshots:
  - raw release counts
  - corpus counts by status
  - mapped summary distributions
  - evidence eligibility vs selected vs acquired
- after the first measured run, revisit the recency and quality thresholds for evidence
- after the first measured run, revisit whether additional mapped scoring inputs from the historical pipeline are worth porting

## Next Recommended Passes

1. Add the manual SQL worksheet for stage counts and queue/outcome snapshots.
2. Run a bounded live ingest sample and capture phase timings plus row counts in this ledger.
3. Run corpus selection and evidence dispatch on that sample and capture stage counts in this ledger.
4. Tune policy and performance from measured data.
5. Decide what remains for the broader observability work after the first measured cycle.

### Batch 2 — Scrape + Graphs

Completed:

- created an Infra-owned Prometheus + Grafana stack under
  `../SoleMD.Infra/infra/observability/`
- added the new stack to `../SoleMD.Infra/infra/compose.yaml`
- added local port / auth defaults to `../SoleMD.Infra/.env.example`
- provisioned a default Grafana dashboard for:
  - Dramatiq in-progress / throughput / message duration
  - ingest phase duration, row volume, and outcomes
  - corpus selection phase duration and materialization volume
  - evidence-wave selected vs enqueued counts and phase duration
  - paper-text outcomes, duration, in-progress, and document-spine row counts
- updated Graph-side runtime-contract docs in:
  - `.claude/skills/graph/references/runtime-infrastructure.md`
  - `docs/rag/10-observability.md`

Implementation notes:

- the first bridge-based attempt exposed a real WSL/native-dockerd issue:
  Prometheus could not reliably reach host-run worker ports through
  `host.docker.internal`
- the landed Infra stack now uses host networking and scrapes the worker
  roots directly on `127.0.0.1`
- local ports:
  - Prometheus `9095`
  - Grafana `3300`
- named volumes:
  - `graph_prometheus_data`
  - `graph_grafana_data`
- pinned images:
  - `prom/prometheus:v3.11.2`
  - `grafana/grafana:13.0.1`

Additional Graph-side hardening:

- fixed `apps/worker/app/config.py` so `WORKER_METRICS_PORT=` is parsed as
  `None` instead of raising a startup validation error
- added a scope-aware Prometheus wrapper middleware in
  `apps/worker/app/telemetry/dramatiq_prometheus.py`
  - this fixes Dramatiq's separate exposition-server fork process so it
    binds the same per-scope port as the worker root instead of the
    upstream default `9191`

Pending verification:

1. run one bounded live ingest / corpus / evidence cycle with the metrics
   stack already up and capture real counter / histogram movement in this
   ledger

Verification completed:

- `node -e "JSON.parse(...solemd-graph-workers.dashboard.json...)"`
  - result: dashboard JSON valid
- `docker compose --env-file ../SoleMD.Infra/.env -f ../SoleMD.Infra/infra/observability/compose.yaml --profile observability config`
  - result: standalone compose valid
- `docker compose --env-file ../SoleMD.Infra/.env -f ../SoleMD.Infra/infra/observability/compose.yaml --profile observability up -d`
  - result: `graph-prometheus` and `graph-grafana` started successfully
- `curl http://127.0.0.1:9095/-/healthy`
  - result: Prometheus healthy
- `curl http://127.0.0.1:3300/api/health`
  - result: Grafana healthy
- `set -a && source .env.example && set +a && uv run --project apps/worker python -m app.main check`
  - result: worker startup path healthy against local Redis / serve / warehouse
- temporary worker proof:
  - started `app.ingest_worker` on queue `ingest`
  - Prometheus target `graph-ingest-worker` reported `health=up`
  - after verification, the temporary ingest worker was shut down cleanly

### Batch 3 — Runtime Hardening

Completed:

- fixed a live actor/bootstrap race in the queue-owned workers
  - stale queued `hot_text.acquire_for_paper` messages could arrive before the
    `ingest_write` asyncpg pool was published inside the worker process
  - landed `ensure_worker_pools_open(...)` in `apps/worker/app/db.py`
  - updated:
    - `apps/worker/app/actors/ingest.py`
    - `apps/worker/app/actors/corpus.py`
    - `apps/worker/app/actors/hot_text.py`
  - added regression coverage in `apps/worker/tests/test_db.py`
- fixed the worker Prometheus multiprocess bootstrap path
  - root cause 1: importing any `app.telemetry.*` submodule executed
    `app.telemetry.__init__`, which eagerly imported `metrics.py` and locked
    `prometheus_client` onto the non-multiprocess `MutexValue` class before
    the worker bootstrap could set `PROMETHEUS_MULTIPROC_DIR`
  - root cause 2: `prepare_worker_metrics_environment(...)` treated the
    `_PREPARED_FLAG` as sufficient even when the current process was missing
    `PROMETHEUS_MULTIPROC_DIR` / `dramatiq_prom_*`
- landed the telemetry fixes:
  - made `apps/worker/app/telemetry/__init__.py` side-effect free
  - moved runtime imports to `app.telemetry.metrics`
  - kept worker roots on `app.telemetry.bootstrap`
  - taught `prepare_worker_metrics_environment(...)` to re-establish the
    runtime metrics env on every process while only cleaning the scope dir
    once
  - isolated the bootstrap regression test into a subprocess so the direct
    runtime metric tests stay on the in-memory registry path they expect

Verification:

- standalone multiprocess probe:
  - `ValueClass == MultiProcessValue...MmapedValue`
  - files created under `/tmp/prom-test3/ingest/`
  - `collect_metrics_text()` returned real `ingest_runs_total`
- focused worker/runtime suite:
  - `uv run --project apps/worker pytest apps/worker/tests/test_telemetry_bootstrap.py apps/worker/tests/test_ingest_runtime.py apps/worker/tests/test_corpus_runtime.py apps/worker/tests/test_hot_text_runtime.py -q`
  - result: `17 passed, 2 warnings`

Outcome:

- the queue-owned workers now expose real Prometheus multiprocess data instead
  of blank `200 OK` responses
- actor startup is robust against queued messages landing immediately after
  worker boot

### Batch 4 — Measured Live Cycle

Completed:

- restarted the three queue-owned worker roots on the fixed telemetry/runtime
  stack:
  - `app.ingest_worker`
  - `app.corpus_worker`
  - `app.hot_text_worker`
- verified the observability stack remained healthy:
  - Prometheus: `http://127.0.0.1:9095`
  - Grafana: `http://127.0.0.1:3300`
  - all worker scrape targets `up`
- ran a bounded queue-backed cycle against fresh sample releases:
  - S2 release: `codex-live-s2-20260419170908`
  - PT3 release: `codex-live-pt3-20260419170908`
  - selector: `selector-v2-live-metrics`
  - note: the bounded PT3 sample fixture only contains `bioconcepts`, so the
    live PT3 enqueue used `--family bioconcepts` to match the current sample
    contract

Observed ingest metrics:

- ingest worker wrote real multiprocess files under
  `.state/prometheus/ingest/`
- `http://127.0.0.1:9464/metrics` exported:
  - `ingest_phase_duration_seconds_*`
  - `ingest_family_rows_total`
  - `ingest_family_files_total`
  - `ingest_runs_total`
- Prometheus query on `:9095` returned the same `ingest_*` samples with the
  expected scrape-time labels

Observed warehouse/raw counts for the live release pair:

- `s2_release_id = 28`
- `pt3_release_id = 27`
- `raw_paper_count = 2`
- `raw_with_corpus_id = 2`
- `raw_author_count = 2`
- `raw_reference_count = 1`
- `pt3_entity_stage_count = 1`
- `pt3_relation_stage_count = 0`

Observed corpus-selection output:

- selection run id:
  `019da838-addf-7896-a167-4c96351cb926`
- phase timings exported on `http://127.0.0.1:9465/metrics`
- selection metrics:
  - `corpus_selection_runs_total{selector_version="selector-v2-live-metrics",outcome="published"} = 1`
  - `corpus_selection_signals_total{phase="corpus_admission"} = 4`
  - `corpus_selection_signals_total{phase="mapped_promotion"} = 3`
  - `corpus_selection_materialized_papers_total = 2`
  - `corpus_selection_summary_rows_total = 2`
- per-paper summary rows:
  - `101 -> mapped -> journal_and_vocab`
    - `mapped_priority_score = 220`
    - `evidence_priority_score = 174`
    - `reference_out_count = 1`
    - `has_locator_candidate = true`
  - `102 -> mapped -> pattern_match`
    - `mapped_priority_score = 155`
    - `evidence_priority_score = 138`
    - `reference_out_count = 0`
    - `has_locator_candidate = true`

Observed evidence-wave output:

- wave run id:
  `019da839-3806-7485-8b1d-27e51c1501c1`
- wave metrics exported on `http://127.0.0.1:9465/metrics`
- wave metrics:
  - `corpus_wave_runs_total{wave_policy_key="evidence_missing_pmc_bioc",selector_version="selector-v2-live-metrics",outcome="published"} = 1`
  - `corpus_wave_members_selected_total = 1`
  - `corpus_wave_enqueued_total = 1`
- selected member:
  - `101`, ordinal `1`, `priority_score = 174`, `was_enqueued = true`

Observed hot-text output:

- hot-text worker processed the enqueued paper and exported `paper_text_*`
  metrics on `http://127.0.0.1:9466/metrics`
- acquisition run:
  - paper: `101`
  - status: `3` (`unavailable`)
  - `locator_kind = "pmid"`
  - `resolver_kind = "pmid_direct"`
  - `error_message = "PMC BioC reported no result for pmid:60101"`
- hot-text metrics:
  - `paper_text_acquisitions_total{outcome="unavailable",locator_kind="pmid",resolver_kind="pmid_direct"} = 1`
  - `paper_text_acquisition_duration_seconds_count{...} = 1`

Canonical surface snapshot after the live run:

- `papers_count = 19`
- `paper_text_count = 19`
- `paper_authors_count = 42`
- `paper_citations_count = 4`
- `entity_annotations_count = 762`
- `relations_count = 12`

Outcome:

- the current telemetry slice is now proven against real queue-backed worker
  execution, not only tests
- ingest, corpus-selection, evidence-wave, and hot-text lanes all emit
  scrapeable Prometheus metrics through the fixed worker roots
- Grafana can now graph these runs from the live Prometheus datasource without
  relying on manual ledger-only measurement

Updated open risks / follow-on notes after Batch 4:

- the bounded PT3 sample helper is intentionally `bioconcepts`-only; queue-backed
  sample proofs must either pass `--family bioconcepts` or expand the helper to
  generate the newer required `biocxml` / `relation2pubtator3.gz` datasets
- if completely idle dashboards are undesirable, add an always-present worker
  info/boot metric; the current metric families intentionally appear only after
  the first relevant event per scope
- the mapped-policy `requires_second_gate` branch remains a policy review item:
  the current SQL mirrors the locked docs contract where second-gate entity
  families are recorded and only count when a direct mapped signal already
  exists, but this likely deserves a deliberate follow-up decision before wider
  mapped-policy tuning

## Batch 5 — Windows Access Repair

Goal:

- make the Infra-hosted Prometheus and Grafana UIs reachable from the Windows
  laptop browser without requiring an SSH tunnel

Root cause:

- the observability stack was running in WSL2 with `network_mode: host`, but
  both web UIs were explicitly bound to `127.0.0.1`
- confirmed listeners before the fix:
  - `127.0.0.1:9095` for Prometheus
  - `127.0.0.1:3300` for Grafana
- that is a WSL2 bind-address issue, not an SSH config issue

Changes applied:

- updated `SoleMD.Infra/infra/observability/compose.yaml`
  - Prometheus `--web.listen-address` changed to
    `0.0.0.0:${GRAPH_PROMETHEUS_PORT:-9095}`
  - Grafana `GF_SERVER_HTTP_ADDR` changed to `0.0.0.0`
- updated `SoleMD.Infra/infra/observability/README.md`
  - clarified that worker scraping remains on `127.0.0.1`
  - documented the WSL2 localhost bridge model for the Windows browser
  - added WSL-IP fallback guidance when localhost forwarding is unavailable

Runtime verification:

- restarted the observability stack with:
  `docker compose --env-file ../SoleMD.Infra/.env -f ../SoleMD.Infra/infra/observability/compose.yaml --profile observability up -d graph-prometheus graph-grafana`
- confirmed listeners after the fix:
  - `*:9095`
  - `*:3300`
- confirmed HTTP readiness:
  - `curl -I http://127.0.0.1:9095/-/ready -> 200 OK`
  - `curl -I http://127.0.0.1:3300/login -> 200 OK`

Current WSL host addresses observed during verification:

- `192.168.0.160`
- `100.106.230.27`

Expected access paths from Windows:

- `http://localhost:9095`
- `http://localhost:3300`
- fallback if localhost bridging fails:
  - `http://192.168.0.160:9095`
  - `http://192.168.0.160:3300`

## Batch 6 — Laptop Reverse-Tunnel Access

Goal:

- make the PC-hosted Prometheus and Grafana UIs reachable from the laptop over
  the established Tailscale-backed WSL2 reverse-tunnel path

Clarification:

- the user-facing failure here was not the repo-hosted observability stack
  itself; it was the laptop access path into the PC
- the correct ownership surface is the laptop `jonpc` SSH alias described by
  the `remote` skill, not the Graph repo

Findings:

- the laptop reverse-tunnel service was healthy and connected to the PC
- the laptop WSL `jonpc` SSH alias already exposed many PC localhost services
  via `LocalForward`, but did not include:
  - `3300 -> 127.0.0.1:3300` for Grafana
  - `9095 -> 127.0.0.1:9095` for Prometheus
- canonical source for that alias:
  `SoleMD.Infra/vibe/config/ssh-solemd-pc.conf`

Changes applied:

- updated the canonical Infra SSH config to add:
  - `LocalForward 3300 127.0.0.1:3300`
  - `LocalForward 9095 127.0.0.1:9095`
- ran:
  `solemd laptop-sync`
- sync result:
  - laptop WSL SSH config updated
  - laptop Windows SSH config updated
- restarted the laptop WSL reverse-tunnel service

Verification:

- on the laptop WSL side, the new forwards now exist:
  - `127.0.0.1:3300`
  - `127.0.0.1:9095`
- `ssh -G jonpc` now shows:
  - `localforward 3300 [127.0.0.1]:3300`
  - `localforward 9095 [127.0.0.1]:9095`
- laptop-side HTTP probes succeed:
  - `http://127.0.0.1:3300/login -> 200 OK`
  - `http://127.0.0.1:9095/-/ready -> 200 OK`

Expected laptop access path:

- laptop browser:
  - `http://localhost:3300`
  - `http://localhost:9095`
