`apps/worker` is the permanent Dramatiq runtime root for the SoleMD.Graph rebuild.

The first production raw-ingest, corpus-selection/evidence-dispatch, and
paper-text acquisition lanes now live here:

- `app/main.py` owns the startup probe plus the operator CLI entrypoints
  (`check`, `enqueue-release`, `dispatch-manifest`,
  `enqueue-corpus-selection`, `run-corpus-selection-now`,
  `enqueue-evidence-wave`, `run-evidence-wave-now`,
  `enqueue-evidence-text`, `run-evidence-text-now`).
- `app/ingest_worker.py` is the dedicated Dramatiq worker root for the
  `ingest` queue and binds only the `ingest_write` pool.
- `app/actors/ingest.py` owns the release-level actor
  `ingest.start_release`.
- `app/ingest/` owns request validation, planning, runtime orchestration,
  source adapters, and bounded asyncpg COPY writers for Semantic Scholar
  and PubTator. It also owns source-retention planning for hot-storage
  cleanup after family-level ingest checkpoints are durable.
- `app/corpus_worker.py` is the dedicated Dramatiq worker root for the
  `corpus` queue and binds only the `ingest_write` pool.
- `app/actors/corpus.py` owns the release-pair actor
  `corpus.start_selection` plus the evidence-wave actor
  `corpus.dispatch_evidence_wave`.
- `app/corpus/` owns selection policies, curated asset materialization,
  release-pair planning, selection runtime orchestration, mapped promotion,
  summary refresh, and evidence-wave dispatch.
- `app/evidence/` owns the targeted paper-level evidence-text refresh lane
  backed by the PMC BioC API.
- `app/actors/evidence.py` owns the paper-level actor
  `evidence.acquire_for_paper`.
- `app/evidence_worker.py` is the dedicated Dramatiq worker root for the
  `evidence` queue and binds only the `ingest_write` pool.

Local commands from the repo root:

```bash
uv sync --project apps/worker
uv run --project apps/worker python -m app.main check
uv run --project apps/worker python -m app.main enqueue-release s2 2026-03-10 --force-new-run
uv run --project apps/worker python -m app.main dispatch-manifest pt3 2026-03-21
uv run --project apps/worker python -m app.main source-retention s2 2026-03-10
uv run --project apps/worker python -m app.main source-retention s2 2026-03-10 --execute --action delete --provenance-ok
uv run --project apps/worker python -m app.main enqueue-corpus-selection 2026-03-10 2026-03-21 v1
uv run --project apps/worker python -m app.main run-corpus-selection-now 2026-03-10 2026-03-21 v1
uv run --project apps/worker python -m app.main enqueue-evidence-wave 2026-03-10 2026-03-21 v1 --max-papers 100
uv run --project apps/worker python -m app.main run-evidence-wave-now 2026-03-10 2026-03-21 v1 --max-papers 100
uv run --project apps/worker python -m app.main enqueue-evidence-text 123456 --requested-by operator
uv run --project apps/worker python -m app.main run-evidence-text-now 123456 --force-refresh
dramatiq_queue_prefetch=1 uv run --project apps/worker dramatiq app.ingest_worker --processes 2 --threads 1 --queues ingest
uv run --project apps/worker dramatiq app.corpus_worker --processes 1 --threads 1 --queues corpus
uv run --project apps/worker dramatiq app.evidence_worker --processes 1 --threads 1 --queues evidence
```

The `check` command verifies the current env contract can reach the local
compose dependencies. `enqueue-release` and `dispatch-manifest` validate the
same `StartReleaseRequest` payload shape before enqueueing.
`source-retention` is dry-run by default. It acquires the same release-level
advisory lock as ingest, reads `source_releases` / `ingest_runs`, and prints
which S2 source directories are `keep`, `archive_candidate`,
`delete_candidate`, or `manual_review`. Mutation requires `--execute` plus an
explicit action. `--action delete` also requires `--provenance-ok`; manifests
unregistered directories are never deleted automatically. Deferred registered
families are also kept until their owner tier consumes or waives them:
`tldrs` and `embeddings-specter_v2` belong to mapped rollout, while
`s2orc_v2` belongs to evidence. `--action archive` is a same-filesystem rename
only; off-device copies must be verified outside the worker before using the
guarded delete path.
`enqueue-corpus-selection` / `run-corpus-selection-now` and
`enqueue-evidence-wave` / `run-evidence-wave-now` use the shared validated
corpus request models before enqueueing or executing the selection/evidence
runtime in-process. `enqueue-evidence-text` and `run-evidence-text-now` use the same
validated `AcquirePaperTextRequest` payload shape before either enqueueing or
executing the PMC BioC-backed refresh path.

Telemetry is now worker-owned under `app/telemetry/`.

- Each queue-owned worker root calls `prepare_worker_metrics_environment(...)`
  before broker setup, so Dramatiq's Prometheus middleware and
  `prometheus_client` application metrics share one per-scope multiprocess
  store.
- The local default scopes are separate by worker root:
  `ingest -> .state/prometheus/ingest -> :9464`,
  `corpus -> .state/prometheus/corpus -> :9465`,
  `evidence -> .state/prometheus/evidence -> :9466`.
- The CLI uses its own `cli` multiprocess scope for direct runs/tests but is
  not a standing scrape target.
- Leave `WORKER_METRICS_PORT` unset for local multi-root development. Setting
  it pins every scope to one port, which is only safe if a single worker root
  is running in that host namespace.
