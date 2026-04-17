---
name: graph
description: |
  SoleMD.Graph architecture, bundle publication, checksum asset-serving, local networking,
  and failure ownership. Use for project structure, run/build flow, graph bundles,
  graph_runs, parquet publish, 127.0.0.1 or localhost issues, tailscale, and runtime
  ownership questions.

  Triggers: graph architecture, graph bundle, graph_runs, publish current, parquet publish,
  checksum asset serving, graph startup, local networking, localhost, 127.0.0.1,
  bundle serving, runtime ownership, who owns this failure.

  Do NOT use for: browser DuckDB or Cosmograph runtime internals, UI styling,
  or database schema tuning.
version: 6.3.0
allowed-tools:
  - Read
  - Bash
metadata:
  short-description: SoleMD.Graph architecture, bundle contract, and runtime ownership boundaries
---

# SoleMD.Graph - Project Architecture

## What /graph owns

Use `/graph` for the system-level contract:

- engine build and publish flow
- PostgreSQL release metadata and `solemd.graph_runs`
- bundle artifact layout and checksum-addressed browser URLs
- Next.js/backend asset serving and local networking
- operational triage for "which layer owns this failure?"

Use `/cosmograph` when the problem is inside the browser runtime after the bundle
contract is already valid: DuckDB-WASM bootstrap, active views, native Cosmograph
props, camera, overlay, or panel/query behavior.

Use `/langfuse` when the problem is evaluation, benchmark workflow, prompt
management, score interpretation, or traced backend quality feedback.

Use `/clean` after meaningful implementation changes. If the durable graph
contract changes, update this skill or its references in the same batch and run
`solemd skill-sync`.

## Companion Skill Chain

| Situation | Skill |
|-----------|-------|
| Cross-project/runtime orientation first | `/solemd` |
| System ownership, bundle publication, asset-serving, startup failure ownership | `/graph` |
| Browser runtime after asset URLs resolve | `/cosmograph` |
| Evaluation, benchmarks, prompts, score workflows | `/langfuse` |
| New files, exports, or directory splits | `/naming` |
| Post-change cleanup, deduplication, modularization, contract close-out | `/clean` |
| Skill or prompt contract changed | `/config-sync` |

## Read First

| Need | Source |
|------|--------|
| Reader journey / system map | `docs/map/map.md` |
| Hard boundaries and adapters | `docs/map/architecture.md` |
| Frontend/runtime performance rules | `references/frontend-performance.md` |
| Browser graph runtime contract | `docs/map/graph-runtime.md` |
| Engine build and publish pipeline | `docs/map/graph-build.md` |
| Database ownership / release tables | `docs/map/database.md` |
| Local host / WSL / tailnet rules | `references/local-networking.md` |
| Runtime substrate, Docker, GPU, ports | `references/runtime-infrastructure.md` |
| Product vision | `docs/map/vision.md` |

If the task touches graph startup, bundle serving, DuckDB bootstrap, or shell
load timing, `references/frontend-performance.md` and `docs/map/graph-runtime.md`
are mandatory.

## Extended References

| Need | Source |
|------|--------|
| Browser query/runtime details | `references/browser.md` |
| Schema notes and query examples | `references/schema.md` |
| Cypher examples | `references/cypher-examples.md` |
| GDS algorithm reference | `references/gds-algorithms.md` |

## System Map

```text
PubTator3 + Semantic Scholar
          |
          v
  Python engine (`engine/app/**`)
    - corpus admission
    - graph build
    - parquet export
    - publish current run
          |
          v
  PostgreSQL (`solemd.graph_runs`, graph tables, paper metadata)
          |
          +--> published bundle directory / checksum alias
          |
          v
  Next.js app (port 3000)
    - resolves current bundle metadata
    - serves /graph-bundles/<checksum>/<asset>
          |
          v
  Browser runtime
    - DuckDB-WASM session
    - canonical active views
    - Cosmograph render
```

## Canonical Ownership Boundaries

These rules are the durable contract. Do not weaken them with convenience
fallbacks in the wrong layer.

### Engine / publish ownership

- The engine builds the bundle and writes the run-scoped artifact set.
- Publish metadata lives in PostgreSQL, primarily `solemd.graph_runs`.
- The backend publish step owns the checksum alias on disk.
- Run directories are an implementation detail. The browser does not know or care
  about graph-run ids or `bundle_uri` paths.

### Backend / asset-serving ownership

- Browser-visible assets are immutable checksum-addressed URLs:
  - `/graph-bundles/<checksum>/manifest.json`
  - `/graph-bundles/<checksum>/base_points.parquet`
  - `/graph-bundles/<checksum>/base_clusters.parquet`
- `features/graph/lib/bundle-assets.ts` is the backend resolver boundary for
  published bundle assets.
- If the published checksum alias is missing, backend recovery may use
  `solemd.graph_runs` to find the real run directory, but that recovery must not
  change the browser URL contract.
- Do not add run-id URLs, filesystem paths, or second browser-facing asset routes
  as a workaround.

### Browser/runtime ownership

- The browser consumes `GraphBundle` metadata and checksum URLs only.
- The browser must not derive `graphRunId`, `bundleUri`, or local filesystem paths.
- First paint depends on canonical base assets, not an alternate slim bundle
  invented in the frontend.
- Optional large relations remain lazy.

## Bundle Publication Contract

The graph runtime depends on one stable artifact contract:

```text
manifest.json
base_points.parquet
base_clusters.parquet
universe_points.parquet          (lazy attach)
paper_documents.parquet          (lazy attach)
cluster_exemplars.parquet        (lazy attach)
```

Non-negotiable rules:

- `base_points` and `base_clusters` are the hot first-paint tables.
- Checksums are the browser cache key and publication identity.
- The browser path stays checksum-addressed even if the backend repairs a broken
  alias or serves from a recovered run directory.
- `manifest.json` is part of the same immutable contract as the parquet assets.
- Do not paper over publication bugs by adding frontend fallback logic.

## Failure Ownership And Triage

When the user sees a graph bundle/bootstrap error, first decide whether the bug is
backend publication/serving or browser runtime wiring.

### Step 1: Test the asset URL directly

Use the exact checksummed asset URL from the failing bundle:

```bash
curl -I http://127.0.0.1:3000/graph-bundles/<checksum>/base_points.parquet
```

Interpretation:

- `200`: the asset route is serving; continue with `/cosmograph` runtime triage.
- `404` or `500`: this is a backend publish / asset-resolution problem first.

### Step 2: If the asset route is failing, inspect backend publication state

Check:

- `solemd.graph_runs` current completed row for `bundle_checksum`, `id`, `bundle_uri`
- on-disk published checksum alias versus real run directory
- `features/graph/lib/bundle-assets.ts`

Typical failure classes:

- checksum alias missing on disk
- backend resolver tied too tightly to the published alias and not recovering from
  `graph_runs`
- published root exists logically but is not writable in the current environment
- wrong host or stale local tab hiding a now-fixed backend route

### Step 3: Distinguish host problems from app problems

- Use `http://127.0.0.1:3000`, not `localhost`, for canonical local checks.
- If the phone works but the PC fails, compare the exact host, port, and freshness
  of the tab before assuming a server regression.
- A stale dev tab can preserve an earlier failed bootstrap even after the asset
  route is fixed.

## Local Networking Contract

SoleMD.Graph local development is expected to work in Windows + WSL with Tailscale.

Canonical endpoints:

| Surface | Canonical URL |
|---------|---------------|
| WSL shell checks | `http://127.0.0.1:3000` |
| Windows browser on same machine | `http://127.0.0.1:3000` |
| App-to-service local config | `127.0.0.1` |

Rules:

- Treat `127.0.0.1` as canonical for app-local verification and env config.
- Do not assume `localhost` behaves the same on this setup; IPv6 loopback can
  stall while IPv4 works.
- If asset-serving changes appear to break startup, clear `.next/dev` before
  claiming a transport regression.

## Clean Implementation Rules

When changing architecture, publish flow, or asset serving:

1. Keep one canonical browser contract: checksum URLs only.
2. Recover missing publication state in the backend boundary, not in the browser.
3. Do not add parallel metadata paths or duplicate "current bundle" resolvers.
4. Prefer the durable end state over compatibility shims.
5. Add or update regression tests for publication and bootstrap failures.

Signs of a bad implementation:

- frontend derives run directories or filesystem paths
- browser receives two URL styles for the same bundle
- backend route silently depends on writable alias repair to serve current assets
- asset-serving and browser bootstrap each invent their own fallback behavior

## Commands

### Frontend

| Command | Action |
|---------|--------|
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Jest tests |

### Engine

| Command | Action |
|---------|--------|
| `cd engine && uv run python -m app.graph.build --run --publish-current` | Full rebuild and publish |
| `cd engine && uv run python -m app.graph.build --run --resume-run <id> --publish-current` | Resume failed run |
| `cd engine && uv run python -m app.graph.build --publish-run <id> --publish-current` | Publish an existing run |
| `cd engine && uv run python -m app.graph.build --cleanup` | Purge stale runs and artifacts |

## Key Paths

| Area | Path |
|------|------|
| Engine build pipeline | `engine/app/graph/` |
| Current runtime docs | `docs/map/graph-runtime.md` |
| Performance requirements | `references/frontend-performance.md` |
| Backend asset resolver | `features/graph/lib/bundle-assets.ts` |
| DuckDB runtime boundary | `features/graph/duckdb/` |
| Cosmograph adapter boundary | `features/graph/cosmograph/` |

## Update This Skill When

- bundle publication or checksum URL rules change
- startup/failure ownership moves between engine, backend, and browser
- canonical local ports, hosts, or runtime topology change
- the handoff boundary between `/graph`, `/cosmograph`, and `/langfuse` changes
