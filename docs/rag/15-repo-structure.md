# 15 — Repo Structure and Naming

> **Status**: locked for deployable boundaries, top-level directory names, the
> "apps vs packages" rule, the placement of wiki and graph runtime code, the
> flat `apps/web` shape, and the cutover order for repository reshaping.
> **Provisional**: exact workspace tooling files (`pnpm-workspace.yaml`,
> `turbo.json`, CI matrix) until the first implementation PR lands.
> **Deferred**: any shared Python package extraction and any auth-specific
> package or app boundary before `13-auth.md` activates.
>
> **Date**: 2026-04-17
>
> **Scope**: the target repository layout for the clean cutover. This document
> names what each top-level directory is for, which parts are deployable, where
> wiki and graph-bundle code belong, and how the current mixed roots should be
> cut over without creating new ambiguity.

## Purpose

The current repository shape still reflects incremental growth:

- root-level Next.js app directories (`app`, `components`, `features`, `lib`)
- one broad Python `engine/` root
- schema, runtime, and deployment concerns spread across multiple homes

That shape is survivable during exploration, but it is not the right cutover
shape for a system with three clear runtime roles:

1. web UI
2. HTTP API
3. background worker

The clean cutover rule is simple:

- **Deployable code lives under `apps/`.**
- **Shared, non-deployable code lives under `packages/`.**
- **Database DDL and migrations live under `db/`.**
- **Infra and deployment wiring live under `infra/`.**

Top-level names must answer either "what runs here?" or "what is reused here?"
If a directory name cannot answer one of those questions plainly, it should not
be a top-level root in the cutover layout.

## 1. Naming rules

These naming rules are locked for the cutover:

- Use **runtime-role names** for deployables: `web`, `api`, `worker`.
- Use **capability names** for shared packages: `ui`, `graph`, `api-client`.
- Prefer single-word names when the scope is plain, such as `ui` and `graph`.
  Use two words only when clarity would otherwise drop, such as `api-client`.
- Do not use broad top-level buckets like `engine`, `shared`, `common`, or
  `core` as the primary repository shape. Those words are only acceptable as a
  suffix when the scope is already clear, such as `backend-core`.
- Keep product-only code inside the owning app unless there is real cross-app
  reuse.
- Do not create a standalone wiki package by default. The wiki is a product
  surface owned by the web app, with server-side activation owned by the worker.
- Do not create a shared Python package by default at cutover. Start with
  `apps/api` and `apps/worker`; extract shared Python later only when reuse is
  proven by the rebuilt backend.

## 2. Locked target layout

The target repository shape after the cutover is:

```text
apps/
  web/                 # Next.js app; the only browser-facing deployable
  api/                 # FastAPI HTTP API; serve/read/write boundary
  worker/              # Dramatiq workers; ingest/build/publish/sync boundary

packages/
  ui/                  # Shared React UI primitives used by web + Storybook
  graph/               # Shared graph runtime types, bundle helpers, DuckDB-WASM, Cosmograph
  api-client/          # Typed API entrypoints and shared transport types

db/
  schema/
    warehouse/
    serve/
  migrations/
    warehouse/
    serve/

docs/
  rag/
  map/

infra/
  docker/
  vercel/

scripts/
```

This is the smallest structure that keeps deployment boundaries obvious without
turning every folder into an internal package.

## 3. What lives where

### 3.1 `apps/web`

`apps/web` owns the browser product surface:

- App Router routes
- wiki UI
- graph UI shell
- route handlers that are truly web-owned
- app-specific feature code

Expected internal shape:

```text
apps/web/
  app/
  features/
    graph/
    wiki/
  lib/
  public/
```

Important rule: the wiki stays here as a feature because it is rendered and
composed as part of the web product. It is not a platform package.
Use Next.js route groups like `(group)` and private folders like `_internal`
inside `app/` to keep route organization clean without adding another mandatory
`src/` layer. Add `apps/web/components` only if a genuinely cross-feature app
primitive appears; do not create it for one-off wrappers.

### 3.2 `apps/api`

`apps/api` owns request-time backend behavior:

- FastAPI routes
- serve-cluster reads/writes
- bounded OpenSearch access
- bundle metadata and asset resolution
- wiki page read/context endpoints

This is the runtime that turns the serve-side projections into HTTP surfaces.

### 3.3 `apps/worker`

`apps/worker` owns durable background work:

- ingest
- chunking
- projection
- OpenSearch build
- graph bundle build/publish
- wiki sync/activation
- backup and maintenance jobs that belong to the queue plane

This is where Dramatiq lives. If a workload is durable, retry-governed, or
batch-oriented, it belongs here rather than in `apps/api`.

### 3.4 `packages/graph`

`packages/graph` is the shared graph runtime package:

- graph runtime types
- bundle helpers and release resolution
- DuckDB-WASM bootstrap
- OPFS hot-table/session reuse
- active-view materialization
- browser-only Cosmograph primitives

This package owns the client-side graph runtime contract. It does **not** own
bundle publication or server-side asset serving.

### 3.5 `packages/ui`

`packages/ui` holds reusable visual primitives that are truly shared across the
web app and Storybook. It is not the place for domain feature orchestration.

### 3.6 `packages/api-client`

`packages/api-client` holds typed API entrypoints, shared transport types, and
normalization helpers used by the web app, route handlers, tests, and tools.

### 3.7 Shared Python code

Shared Python code is **deferred** as a package boundary during the initial
cutover.

Day one of the rebuild should create only `apps/api` and `apps/worker`.
Reusable Python code should stay inside the owning deployable until reuse is
real and the new backend contracts have settled. If a later extraction becomes
necessary, it should be introduced deliberately as a follow-up refactor rather
than pre-committed as part of the empty-room reset.

### 3.8 `db`

`db` is the only home for canonical SQL:

- schema baselines
- ordered migrations
- helper SQL checked into version control

This remains aligned with the SQL-first posture already locked in `12`.

## 4. Wiki and graph-bundle placement

These placements are locked:

- **Wiki frontend** lives in `apps/web/features/wiki`.
- **Wiki sync/activation** lives in `apps/worker`.
- **Wiki read/context HTTP surfaces** live in `apps/api`.
- **Browser graph runtime** lives in `packages/graph`.
- **Graph bundle build/publish** lives in `apps/worker`.
- **Graph bundle asset resolution / metadata HTTP surface** lives in `apps/api`.

This split matches the architecture already established in `05b`, `05c`, and
`05d`:

- worker builds and activates
- API serves request-time contracts
- web renders product surfaces
- the graph package owns the client runtime contract

## 5. Deployment model

The deployment model should follow the same boundary names:

- `apps/web` is the Vercel project root for the frontend deployable.
- `apps/api` is a separate backend deployable with its own environment and
  scaling policy. Vercel compatibility is optional, but the backend should not
  depend on Vercel Services or any private-beta deployment feature.
- `apps/worker` is a separate backend deployable with its own queue/Redis/DB
  environment and no browser-facing routing.
- `packages/*` are never deployed directly.

This keeps the repository aligned with standard monorepo deployment best
practice:

- deployables are the leaves of the package graph
- shared libraries are imported explicitly
- each deployable has a distinct root directory and environment contract

## 6. Current-to-target mapping

The cutover should treat the current layout like this:

| Current root | Target home |
|---|---|
| `app/` | `apps/web/app/` |
| `components/` | `apps/web/components/` or `packages/ui/` depending on reuse |
| `features/graph/` | `apps/web/features/graph/` and `packages/graph/` for reusable runtime pieces |
| `features/wiki/` | `apps/web/features/wiki/` |
| `lib/` | `apps/web/lib/` or `packages/api-client/` depending on ownership |
| `engine/` | split into `apps/api/` and `apps/worker/`; shared Python extraction is deferred until reuse is proven |
| `engine/db` and schema SQL | `db/schema/` + `db/migrations/` |
| `docker/` | `infra/docker/` |
| `bin/` | `scripts/` or `infra/` depending on whether it is operator tooling or deployment wiring |

If ownership is unclear during migration, use this test:

- if it is deployed, move it to `apps/`
- if it is reused but not deployed, move it to `packages/`
- if it is only used by `web`, keep it in `apps/web`

## 7. Cutover sequence

The repository cutover should happen in this order:

1. **Lock the roots**
   Create `apps/`, `packages/`, `db/`, `infra/`, and `scripts/` without
   changing behavior yet.
2. **Move the frontend first**
   Move the current Next.js roots under `apps/web` and keep the product working
   with the same runtime behavior.
3. **Rebuild the backend into runtime-role apps**
   Delete the old `engine/` implementation, then rebuild into `apps/api` and
   `apps/worker` by execution boundary rather than by historical file location.
4. **Move SQL to `db/`**
   Land the SQL-first schema and migration directories under `db/` before
   generating the new baseline/migration chain.
5. **Extract only true shared browser code**
   Move DuckDB-WASM / bundle-bootstrap / Cosmograph runtime code into
   `packages/graph`; keep wiki feature orchestration in `apps/web`.
6. **Re-wire deployment config**
   Point Vercel at `apps/web`; point backend container/runtime config at
   `apps/api` and `apps/worker`; keep packages as internal dependencies only.
7. **Defer shared Python extraction until it is real**
   Only after `apps/api` and `apps/worker` stabilize should a shared Python
   package be introduced, and only if the duplication is concrete.
8. **Finish the runtime cutover on the new shape**
   Land bundle publish, wiki activation, retrieval, and serve cutover work on
   top of the clarified repository boundaries rather than alongside the old
   mixed roots.

## 8. Immediate naming decisions

These names are final for the cutover plan:

- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/ui`
- `packages/graph`
- `packages/api-client`
- `db/schema`
- `db/migrations`
- `infra/docker`
- `infra/vercel`
- `scripts`

Anything that would require a more abstract or ambiguous name should stay out of
the top-level structure until it proves necessary.
