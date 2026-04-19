`apps/worker` is the permanent Dramatiq runtime root for the SoleMD.Graph rebuild.

The first production raw-ingest lane now lives here:

- `app/main.py` owns the startup probe plus the operator CLI entrypoints
  (`check`, `enqueue-release`, `dispatch-manifest`).
- `app/ingest_worker.py` is the dedicated Dramatiq worker root for the
  `ingest` queue and binds only the `ingest_write` pool.
- `app/actors/ingest.py` owns the release-level actor
  `ingest.start_release`.
- `app/ingest/` owns request validation, planning, runtime orchestration,
  source adapters, and bounded asyncpg COPY writers for Semantic Scholar
  and PubTator.
- `app/hot_text/` owns the targeted paper-level full-text refresh lane
  backed by the PMC BioC API.
- `app/actors/hot_text.py` owns the paper-level actor
  `hot_text.acquire_for_paper`.
- `app/hot_text_worker.py` is the dedicated Dramatiq worker root for the
  `hot_text` queue and binds only the `ingest_write` pool.

Local commands from the repo root:

```bash
uv sync --project apps/worker
uv run --project apps/worker python -m app.main check
uv run --project apps/worker python -m app.main enqueue-release s2 2026-03-10 --force-new-run
uv run --project apps/worker python -m app.main dispatch-manifest pt3 2026-03-21
uv run --project apps/worker python -m app.main enqueue-hot-text 123456 --requested-by operator
uv run --project apps/worker python -m app.main run-hot-text-now 123456 --force-refresh
uv run --project apps/worker dramatiq app.ingest_worker --processes 1 --threads 1 --queues ingest
uv run --project apps/worker dramatiq app.hot_text_worker --processes 1 --threads 1 --queues hot_text
```

The `check` command verifies the current env contract can reach the local
compose dependencies. `enqueue-release` and `dispatch-manifest` validate the
same `StartReleaseRequest` payload shape before enqueueing. The `dramatiq`
command is the durable raw-ingest worker root; later chunk/evidence lanes stay
command is the durable raw-ingest worker root; later chunk/evidence lanes stay
downstream instead of replacing it. `enqueue-hot-text` and `run-hot-text-now`
use the same validated `AcquirePaperTextRequest` payload shape before either
enqueueing or executing the PMC BioC-backed refresh path.
