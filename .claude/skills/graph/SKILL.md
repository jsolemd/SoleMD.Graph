---
name: graph
description: |
  SoleMD.Graph backend architecture: bundle publication, checksum-addressed
  asset serving, local networking, runtime infrastructure, and failure ownership.

  Triggers: graph architecture, graph bundle, graph_runs, publish current,
  parquet publish, bundle_checksum, bundle_uri, manifest.json,
  base_points.parquet, base_clusters.parquet, current bundle, alias missing,
  404 graph-bundles, dramatiq, redis, postgres ports, warehouse,
  /mnt/solemd-graph, vhd detach, FastAPI 8010, apps/api, apps/worker,
  localhost, 127.0.0.1, who owns this failure.

  Do NOT use for: browser graph runtime or DuckDB-WASM (use /cosmograph),
  LLM evaluation or RAG benchmarking (use /langfuse), UI styling
  (use /aesthetic), three.js or shaders (use /threejs), raw WebGPU
  (use /webgpu).
version: 6.4.0
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
metadata:
  short-description: SoleMD.Graph backend architecture and runtime contract
---

# SoleMD.Graph — Backend Architecture

## What /graph owns

Use `/graph` for the system-level backend contract:

- repo-shape boundaries across `apps/` and `packages/`
- bundle publication contract and the rebuild surfaces that own it
  (`apps/api` request-time, `apps/worker` build/publish/queue plane)
- PostgreSQL release metadata and the warehouse-vs-serve `graph_runs`
  divergence
- bundle artifact layout and checksum-addressed browser URLs
- current Next.js asset serving plus the migration into `apps/api`
- runtime infrastructure: Docker, GPU, storage, secrets, boot, ports
- operational triage for "which layer owns this failure?"

Use `/cosmograph` when the problem is inside the browser runtime after the
bundle contract is already valid: DuckDB-WASM bootstrap, active views, native
Cosmograph props, camera, overlay, or panel/query behavior.

Use `/langfuse` when the problem is evaluation, benchmark workflow, prompt
management, score interpretation, or traced backend quality feedback.

Use `/module` when the problem is the field/orb/particle WebGL runtime or any
module shell that consumes the shared stage. This skill does not own field
performance rules.

Use `/clean` after meaningful implementation changes. If the durable graph
contract changes, update this skill or its references in the same batch and
run `solemd skill-sync`.

## Companion Skill Chain

| Situation | Skill |
|-----------|-------|
| Cross-project/runtime orientation first | `/solemd` |
| System ownership, bundle publication, asset-serving, startup failure ownership | `/graph` |
| Browser graph runtime after asset URLs resolve | `/cosmograph` |
| Field/orb/particle WebGL substrate and module shells | `/module` |
| Evaluation, benchmarks, prompts, score workflows | `/langfuse` |
| Visual styling and Mantine/Tailwind tokens | `/aesthetic` |
| New files, exports, or directory splits | `/naming` |
| Post-change cleanup, deduplication, modularization, contract close-out | `/clean` |
| Skill or prompt contract changed | `/config-sync` (which calls `solemd skill-sync`) |

## Read First

| Need | Source |
|------|--------|
| Repo shape + cutover boundaries | `docs/rag/15-repo-structure.md` |
| Reader journey / system map | `docs/map/map.md` |
| Hard boundaries and adapters | `docs/map/architecture.md` |
| Bundle publication contract | `references/bundle-publication.md` |
| Database schema universe | `references/database-schema.md` |
| Frontend/runtime performance rules | `references/frontend-performance.md` |
| Browser graph runtime contract | `docs/map/graph-runtime.md` |
| Legacy graph build and publish inventory | `docs/map/graph-build.md` |
| Database ownership / release tables (human-facing) | `docs/map/database.md` |
| Local host / WSL / tailnet rules | `references/local-networking.md` |
| Runtime substrate, Docker, GPU, ports | `references/runtime-infrastructure.md` |
| Product vision | `docs/map/vision.md` |

If the task touches graph startup, bundle serving, DuckDB bootstrap, or shell
load timing, `references/frontend-performance.md` and `docs/map/graph-runtime.md`
are mandatory.

## Extended References

| Need | Source |
|------|--------|
| Bundle publication contract, manifest shape, `graph_runs` divergence | `references/bundle-publication.md` |
| Warehouse + serve schema universe, deferred extensions, partition layout | `references/database-schema.md` |
| Loopback policy, env DSNs, remote forwarding | `references/local-networking.md` |
| Docker, GPU, storage, secrets, boot, pinned ports | `references/runtime-infrastructure.md` |
| Frontend latency rules and runtime perf contract | `references/frontend-performance.md` |

## System Map

```text
PostgreSQL (`solemd.graph_runs`, graph tables, paper metadata)
          |
          +--> published bundle directory / checksum alias
          |
          +--> backend rebuild surfaces
          |      - `apps/api`    FastAPI 8010 (health/ready today, more landing)
          |      - `apps/worker` Dramatiq + Redis (ingest/build/publish plane)
          |
          v
  Next.js app (`apps/web`, port 3000)
    - resolves current bundle metadata
    - serves /graph-bundles/<checksum>/<asset>
    - hosts graph + wiki product surfaces
          |
          +--> shared packages
          |      - `packages/graph/src/**`
          |      - `packages/api-client/src/**`
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

### Backend / publish ownership

- `apps/api` (FastAPI on port 8010) and `apps/worker` (Dramatiq + Redis) are
  the only sanctioned homes for the rebuilt backend publish flow.
- Do not resurrect backend logic under random roots or reintroduce `engine/`
  as a canonical surface.
- Publish metadata lives in PostgreSQL: warehouse-side ledger in
  `solemd.graph_runs` (status SMALLINT 1..5) and runtime-side row in the
  serve-cluster `graph_runs` (text status, `bundle_uri`, `bundle_checksum`).
  See `references/bundle-publication.md` for the divergence.
- The backend publish step owns the checksum alias on disk
  (`/mnt/solemd-graph/bundles/by-checksum/<checksum>`).
- Run directories are an implementation detail. The browser does not know or
  care about graph-run ids or `bundle_uri` paths.

### Backend / asset-serving ownership

- The current browser-visible asset route lives at
  `apps/web/app/graph-bundles/[checksum]/[asset]/route.ts` and resolves through
  `apps/web/features/graph/lib/bundle-assets.ts`.
- When the resolver migrates behind `apps/api`, keep the browser URL contract
  identical: `/graph-bundles/<checksum>/<asset>`.
- Browser-visible assets are immutable checksum-addressed URLs:
  - `/graph-bundles/<checksum>/manifest.json`
  - `/graph-bundles/<checksum>/base_points.parquet`
  - `/graph-bundles/<checksum>/base_clusters.parquet`
- `apps/web/features/graph/lib/bundle-assets.ts` is the current resolver
  boundary for published bundle assets on `main`.
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
  The frontend boots from the `bundle_manifest` JSONB column on the
  serve-cluster `graph_runs` row, not from the on-disk file; keep the two
  byte-equivalent at publish time. See `references/bundle-publication.md`.
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

- the **serve-cluster** Drizzle `graph_runs` row for the failing checksum
  (status `'completed'`, latest `createdAt`, `bundleUri`) — this is what the
  resolver queries, not the warehouse `solemd.graph_runs` row
- on-disk published checksum alias under
  `/mnt/solemd-graph/bundles/by-checksum/<checksum>` versus the real run
  directory referenced by `bundleUri`
- `apps/web/features/graph/lib/bundle-assets.ts` resolver and recovery path

Typical failure classes:

- checksum alias missing on disk
- resolver tied too tightly to the published alias and not recovering from the
  serve-cluster `graph_runs` row
- run directory itself missing because publish only wrote the warehouse row
  and never projected into the serve cluster (the divergence — see
  `references/bundle-publication.md`)
- published root exists logically but is not writable in the current
  environment
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

### Backend Rebuild

`apps/api` ships a minimal FastAPI surface today — the lifespan in
`apps/api/app/main.py` opens serve-cluster pools and the
`apps/api/app/routes/health.py` router exposes `/healthz` and `/readyz`.
The readiness probe walks `serve_dsn_read` and `serve_dsn_admin` through
asyncpg pools and returns 503 if any dependency is unreachable.

```bash
solemd op-run graph -- uv run --project apps/api python -m app.main
curl -s http://127.0.0.1:8010/healthz | jq
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8010/readyz
```

`apps/worker` is the build/publish/queue plane (Dramatiq + Redis).
`apps/api/README.md`, `apps/worker/README.md`, and
`docs/rag/15-repo-structure.md` are the cutover contract for adding new
backend surfaces. Do not reintroduce a top-level `engine/` directory or
re-home backend logic outside `apps/api` and `apps/worker`.

## Key Paths

| Area | Path |
|------|------|
| Repo shape contract | `docs/rag/15-repo-structure.md` |
| Current runtime docs | `docs/map/graph-runtime.md` |
| Performance requirements | `references/frontend-performance.md` |
| Current asset route | `apps/web/app/graph-bundles/[checksum]/[asset]/route.ts` |
| Current asset resolver | `apps/web/features/graph/lib/bundle-assets.ts` |
| DuckDB runtime boundary | `apps/web/features/graph/duckdb/` |
| Web Cosmograph adapter boundary | `apps/web/features/graph/cosmograph/` |
| Shared Cosmograph package boundary | `packages/graph/src/cosmograph/` |
| Shared transport package | `packages/api-client/src/` |
| Request-time FastAPI surface | `apps/api/app/main.py`, `apps/api/app/routes/health.py` |
| Background worker plane | `apps/worker/README.md` |

## Update This Skill When

- bundle publication or checksum URL rules change
- startup/failure ownership moves between engine, backend, and browser
- canonical local ports, hosts, or runtime topology change
- the handoff boundary between `/graph`, `/cosmograph`, and `/langfuse` changes
