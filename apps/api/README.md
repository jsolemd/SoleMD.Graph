`apps/api` is the permanent FastAPI runtime root for the SoleMD.Graph rebuild.

Slice 1 lands only the durable bootstrap:

- `app/config.py` owns the API env contract.
- `app/main.py` owns the app factory and lifespan root.
- `app/routes/health.py` exposes `/healthz` and `/readyz`.

Local commands from the repo root:

```bash
uv sync --project apps/api
uv run --project apps/api python -m app.main
```

With the local stack up, the API answers:

- `GET http://127.0.0.1:8010/healthz`
- `GET http://127.0.0.1:8010/readyz`
