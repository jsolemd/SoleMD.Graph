# CodeAtlas Quality

Repo-owned CodeAtlas dogfood benchmark for `SoleMD.Graph`.

This repo is a strong quality surface because it spans:

- global CSS custom properties and TS token mirrors
- Mantine theme wiring and Tailwind-backed global CSS
- DuckDB-Wasm and Cosmograph adapter boundaries
- Python backend repository and retrieval orchestration code
- external docs dependencies across frontend, runtime, and backend

## Canonical runner

```bash
cd engine && uv run python scripts/evaluate_codeatlas_quality.py --allow-failures
```

Queue any missing repo-critical docs libraries before the run:

```bash
cd engine && uv run python scripts/evaluate_codeatlas_quality.py \
  --sync-required-docs \
  --allow-failures \
  --report-path data/codeatlas_eval/latest.json
```

Without `--allow-failures`, the script exits non-zero whenever a benchmark case
fails. That makes it usable as a local gate once the service is healthy.

## Lanes

| Lane | What it checks |
|---|---|
| `repo-health` | index population and drift signals |
| `repo-frontend` | CSS tokens and Mantine ownership |
| `repo-runtime` | DuckDB-Wasm and Cosmograph adapter discovery |
| `repo-backend` | backend repository and retrieval orchestration discovery |
| `repo-graph-context` | file-context chunk availability |
| `docs-catalog` | critical docs libraries registered for this repo |
| `docs-frontend` | Mantine docs retrieval |
| `docs-runtime` | Cosmograph and DuckDB docs coverage |
| `docs-backend` | FastAPI and pgvector docs coverage |

## Required docs

The benchmark treats these libraries as structural dependencies for
`SoleMD.Graph`:

- Mantine
- Next.js
- Tailwind CSS
- React
- Cosmograph
- FastAPI
- DuckDB
- DuckDB-Wasm
- pgvector

The repo-owned sync helper only bootstraps the docs libraries managed from this
repo surface today:

- `duckdb/duckdb-web`
- `duckdb/duckdb-wasm`
- `pgvector/pgvector`

Other libraries are already managed in the shared CodeAtlas registry and are
validated as required presence checks.

## Interpretation

This benchmark is intentionally structural, not prompt-tuned. Cases are grouped
by surface and ownership lane so failures tell us which part of the system is
degraded:

- empty or drifting repo index
- broken exact-path or exact-symbol retrieval
- broken file-context graph surfaces
- missing critical docs libraries
- docs search coverage regressions for runtime-critical libraries
