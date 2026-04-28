`apps/worker` is the permanent Dramatiq runtime root for the SoleMD.Graph rebuild.

The first production raw-ingest, corpus-selection/evidence-dispatch, and
paper-text acquisition lanes now live here:

- `app/main.py` owns the startup probe plus the operator CLI entrypoints
  (`check`, `enqueue-release`, `dispatch-manifest`,
  `enqueue-corpus-selection`, `run-corpus-selection-now`,
  `enqueue-evidence-wave`, `run-evidence-wave-now`,
  `enqueue-evidence-text`, `run-evidence-text-now`).
- `app/ingest_worker.py` is the dedicated Dramatiq worker root for the
  `ingest` and `ingest_file` queues and binds only the `ingest_write`
  pool.
- `app/actors/ingest.py` owns the release-level actor
  `ingest.start_release` plus the S2 citation file actor
  `ingest.s2_citation_file`.
- `app/ingest/` owns request validation, planning, runtime orchestration,
  source adapters, and bounded asyncpg COPY writers for Semantic Scholar
  and PubTator. S2 citation files fan out through durable
  `solemd.ingest_file_tasks` rows on the `ingest_file` queue before the
  release actor performs the final aggregate merge. It also owns
  source-retention planning for hot-storage cleanup after family-level
  ingest checkpoints are durable, plus the S2 Datasets API diff cursor and
  manifest ledger.
- `app/corpus_worker.py` is the dedicated Dramatiq worker root for the
  `corpus` queue and binds only the `ingest_write` pool.
- `app/actors/corpus.py` owns the release-pair actor
  `corpus.start_selection` plus the evidence-wave actor
  `corpus.dispatch_evidence_wave`.
- `app/corpus/` owns selection policies, curated asset materialization,
  release-pair planning, selection runtime orchestration, mapped promotion,
  reusable selection rollups, mapped-surface materialization, summary refresh,
  and evidence-wave dispatch.
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
uv run --project apps/worker python -m app.main s2-diff-plan 2026-03-10 latest --family papers
uv run --project apps/worker python -m app.main enqueue-corpus-selection 2026-03-10 2026-03-21 v1
uv run --project apps/worker python -m app.main run-corpus-selection-now 2026-03-10 2026-03-21 v1
uv run --project apps/worker python -m app.main enqueue-evidence-wave 2026-03-10 2026-03-21 v1 --max-papers 100
uv run --project apps/worker python -m app.main run-evidence-wave-now 2026-03-10 2026-03-21 v1 --max-papers 100
uv run --project apps/worker python -m app.main enqueue-evidence-text 123456 --requested-by operator
uv run --project apps/worker python -m app.main run-evidence-text-now 123456 --force-refresh
dramatiq_queue_prefetch=1 POOL_INGEST_MIN=1 POOL_INGEST_MAX=8 INGEST_MAX_CONCURRENT_FILES=1 INGEST_MAX_CONCURRENT_BATCHES_PER_FILE=2 uv run --project apps/worker dramatiq app.ingest_worker --processes 8 --threads 1 --queues ingest ingest_file
uv run --project apps/worker dramatiq app.corpus_worker --processes 1 --threads 1 --queues corpus
uv run --project apps/worker dramatiq app.evidence_worker --processes 1 --threads 1 --queues evidence
```

The `check` command verifies the current env contract can reach the local
compose dependencies and that `/mnt/solemd-graph` is safe for warehouse writes.
The warehouse storage preflight blocks `ingest_write` pool startup when the
expected mount is missing, the filesystem is not `ext4`, the mount is not
writable, the block device is offline or read-only, the fsync write probe fails,
usage is above `WAREHOUSE_STORAGE_MAX_USED_PERCENT` (default `90`), or available
space is below `WAREHOUSE_STORAGE_MIN_FREE_BYTES` (default `100 GiB`). Because
WSL can report free space inside the VHD even when the Windows drive hosting the
VHD is exhausted, the same check also requires the parent drive of
`WAREHOUSE_STORAGE_HOST_PATH` (default `/mnt/e/wsl2-solemd-graph.vhdx`) to have
at least `WAREHOUSE_STORAGE_HOST_MIN_FREE_BYTES` (default `100 GiB`) free.
`enqueue-release` and `dispatch-manifest` validate the same `StartReleaseRequest`
payload shape before enqueueing. Default S2 ingest is the corpus-decision core:
`publication_venues`, `authors`, `papers`, and `abstracts`.
Default PT3 ingest is the mapped-corpus signal core: `bioconcepts` and
`relations`; BioCXML is opt-in evidence-tier work.
The PT3 core families are loaded as one parallel runtime group. Within each
single-file PT3 lane, `INGEST_MAX_CONCURRENT_BATCHES_PER_FILE` controls bounded
parallel COPY/merge consumers fed by the streaming gzip parser.
S2 citation fanout is opt-in mapped enrichment; when an operator explicitly
allows the `citations` family, keep an `ingest_file` consumer running. File
task recovery is controlled by `INGEST_FILE_TASK_MAX_ATTEMPTS`,
`INGEST_FILE_TASK_STALE_AFTER_SECONDS`, and
`INGEST_FILE_TASK_POLL_INTERVAL_SECONDS`.
`source-retention` is dry-run by default. It acquires the same release-level
advisory lock as ingest, reads `source_releases` / `ingest_runs` /
`s2_dataset_cursors`, and prints which S2 source directories are `keep`,
`archive_candidate`, or `manual_review`. Mutation requires `--execute` plus an
explicit action. `--action delete` also requires `--provenance-ok` and a
hot-delete-safe S2 diff cursor; manifests and unregistered directories are
never deleted automatically. Deferred registered families are kept until their
owner tier consumes or waives them. `citations`, `tldrs`, and
`embeddings-specter_v2` belong to mapped rollout, while `s2orc_v2` belongs to
evidence. `--action archive` is a same-filesystem rename only; off-device
copies must be verified outside the worker before using the guarded delete
path.
`s2-diff-plan` queries the Semantic Scholar Datasets API and can optionally
record the returned update/delete file URLs with `--record`. Run API-backed
commands through `solemd op-run graph -- ...` so `S2_API_KEY` is injected
without writing it to disk.
`enqueue-corpus-selection` / `dispatch-corpus-selection` /
`run-corpus-selection-now` and
`enqueue-evidence-wave` / `run-evidence-wave-now` use the shared validated
corpus request models before enqueueing or executing the selection/evidence
runtime in-process. `enqueue-evidence-text` and `run-evidence-text-now` use the same
validated `AcquirePaperTextRequest` payload shape before either enqueueing or
executing the PMC BioC-backed refresh path.
Corpus selection builds run-scoped UNLOGGED rollups in `solemd_scratch` and
tracks them in logged `solemd.corpus_selection_artifacts` rows, so a crash can
resume from the current run rather than losing the scratch-table map. Mapped
surface materialization uses logged hash-bucket chunk rows in
`solemd.corpus_selection_chunks`; `CORPUS_MATERIALIZATION_BUCKET_COUNT`
controls the bucket count and is part of the selection plan checksum, while
`CORPUS_MATERIALIZATION_MAX_PARALLEL_CHUNKS` controls bounded asyncpg
parallelism for the mapped bucket drain.
`CORPUS_MATERIALIZATION_CHUNK_MAX_ATTEMPTS` caps poison-bucket retries before a
chunk remains terminal failed for operator review. `CORPUS_ARTIFACT_RETENTION_RUNS`
keeps the most recent run artifacts for the same S2/PT3/selector pair and drops
older scratch tables after publish. `enqueue-corpus-selection` still enqueues one
full release-pair job; `dispatch-corpus-selection` enqueues
`corpus.dispatch_selection_phases`, which chains one phase per Dramatiq message
through `corpus.run_selection_phase`.

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
