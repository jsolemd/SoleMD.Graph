`apps/worker` is the permanent Dramatiq runtime root for the SoleMD.Graph rebuild.

Slice 1 lands only the durable bootstrap:

- `app/config.py` owns the worker env contract.
- `app/broker.py` owns Redis broker and middleware setup.
- `app/main.py` exposes the importable Dramatiq root and a startup probe.

Local commands from the repo root:

```bash
uv sync --project apps/worker
uv run --project apps/worker python -m app.main check
uv run --project apps/worker dramatiq app.main --processes 1 --threads 1
```

The `check` command verifies the current env contract can reach the local
compose dependencies. The `dramatiq` command is the durable worker root that
later slices extend with real actors instead of replacing.
