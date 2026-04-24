# Audit: api-and-packages

Scope: `apps/api/`, `packages/api-client/src/`, `packages/graph/src/`, `packages/ui/`, package READMEs.

## Slice inventory

apps/api (clean-room rebuild, slice 1 only — 296 LOC Python total):
- `apps/api/README.md` — 20 lines, declares slice 1 scope (config + lifespan + `/healthz`/`/readyz`).
- `apps/api/pyproject.toml` — 24 lines; deps strictly pinned (`fastapi==0.136.0`, `pydantic==2.13.2`, `pydantic-settings==2.13.1`, `uvicorn==0.44.0`, `asyncpg==0.31.0`); Python `>=3.13,<3.14`. `uv.lock` present.
- `apps/api/app/__init__.py` (empty).
- `apps/api/app/main.py` (46 LOC) — app factory + lifespan + uvicorn entry.
- `apps/api/app/config.py` (82 LOC) — `Settings(BaseSettings)`, `DependencyTarget`, URL helpers.
- `apps/api/app/db.py` (59 LOC) — `ServePools` dataclass (`serve_read`, `serve_admin` asyncpg pools), `create_serve_pools`, `probe_pool`.
- `apps/api/app/routes/__init__.py` (empty).
- `apps/api/app/routes/health.py` (107 LOC) — `/healthz`, `/readyz`, `DependencyStatus`/`HealthResponse`/`ReadinessResponse`.
- No tests under `apps/api/`.

packages/api-client (~2,639 LOC TS incl. tests):
- `package.json` minimal (private, `type: module`, no deps, no exports map, no scripts, no `sideEffects`).
- `README.md` — single line stub.
- `src/index.ts` re-exports `client/`, `server/`, `shared/` flat.
- `src/server/` — engine HTTP adapter to backend at `127.0.0.1:8300`: `client.ts` (213), `entities.ts` (203), `entity-wire.ts` (58), `graph-attachment.ts` (26), `graph-rag.ts` (312), `rag.ts` (260), `wiki.ts` (122).
- `src/shared/` — wire/DTO + normalizers: `graph-entity.ts` (98), `graph-rag.ts` (283), `wiki-normalize.ts` (263), `wiki-paths.ts` (96), `wiki-types.ts` (119).
- `src/client/` — browser fetchers to Next.js API routes: `wiki-client.ts` (210), `entity-service.ts` (95).
- Tests: `client.test.ts` (79), `graph-attachment.test.ts` (48), `graph-rag.test.ts` (56), `wiki-normalize.test.ts` (81).

packages/graph (~1,044 LOC TS incl. tests):
- `package.json` minimal (private, `type: module`, no deps declared).
- `README.md` — corrupted: README content is followed by a stray `*** Add File:` header + code from `__tests__/test-utils.ts` (lines 3–14).
- `src/index.ts` re-exports types + `resolveGraphReleaseId`.
- `src/release.ts` (10) — single helper.
- `src/cosmograph/` — browser-only Cosmograph primitives: `GraphShell.tsx` (6), `camera-persistence.ts` (67), `label-appearance.ts` (35), `cosmograph-label-style-module.d.ts` (13), hooks (`use-graph-camera`, `use-graph-export`, `use-graph-instance`, `use-zoom-labels`), widgets (`SizeLegend`, `ColorLegends`, `widget-range-utils`).
- `src/types/` — `bundle.ts`, `clusters.ts`, `detail.ts`, `layer.ts`, `nodes.ts`, `points.ts`, `query.ts` (217 — the largest).
- Tests: `camera-persistence.test.ts`, `use-graph-camera.test.ts`, `use-zoom-labels.test.ts`, `use-graph-export.test.ts`, plus `test-utils.ts`.

packages/ui:
- README only (`packages/ui/README.md`, 1 line: "reserved for shared React UI primitives").
- No `package.json`, no `src/`. Truly empty placeholder.

packages/README.md — one-line stub.

## apps/api status (scaffolding completeness)

The contract is genuinely scaffolding-only and is honest about it (`README.md:3`).
- App factory pattern with `lifespan` + `factory=True` uvicorn launch is FastAPI-native (`app/main.py:15-42`).
- Health vs readiness are correctly split: `/healthz` is liveness (no deps), `/readyz` polls each pool with `asyncio.timeout` and returns 503 on any failure (`app/routes/health.py:82-107`).
- Two asyncpg pools are correctly separated by use case: a `serve_read` pool with `statement_cache_size=0` (transaction-pooled-safe; comment at `app/db.py:33-35`) and a `serve_admin` pool with caching enabled.
- Pool teardown uses `asyncio.gather` and partial-failure cleanup is handled (`app/db.py:23-49`).
- Pydantic v2 + `pydantic-settings` v2; `Settings` uses `extra="ignore"` (acceptable for env files).
- No routes beyond health are implemented. There is no router auto-discovery, no v1 prefix, no auth dependency, no error handler, no logging configuration, no CORS middleware, no request-id middleware. All of these are fine *for slice 1* but the doc only mentions the bootstrap; there is no contract document under `apps/api/` describing what slice 2 will own (auth, error envelope, request-id, CORS, rate limiting). The api-client already assumes a `request_id` field on engine error bodies (`packages/api-client/src/server/client.ts:21-24`) and an `error_code`/`retry_after`/`error_message` envelope (`client.ts:17-31, 86-92`); no Pydantic model for this envelope exists in the api yet.

## packages/api-client review

What it does well:
- `'server-only'` import on every server-side module enforces the build-time boundary (`server/client.ts:1`, `server/wiki.ts:1`, `server/entities.ts:1`, `server/rag.ts:1`, `server/graph-rag.ts:1`, `server/graph-attachment.ts:1`).
- `'use client'` on the browser fetcher (`client/entity-service.ts:1`).
- Wire types (`server/entity-wire.ts`) are kept separate from public DTOs (`shared/graph-entity.ts`); `server/entities.ts:42-58` does the snake→camel mapping at the seam.
- `EngineApiError` extracts `error_code`, `request_id`, `retry_after` from engine envelopes and degrades gracefully (`server/client.ts:5-33`).
- FastAPI 422 detail arrays are flattened into one readable message (`server/client.ts:96-128`); covered by test (`server/__tests__/client.test.ts:24-49`).
- AbortError is preserved verbatim (`client.ts:140-142, 173-175`); covered by test.
- Wiki normalizers are defensive against legacy backend payloads with sane fallbacks (`shared/wiki-normalize.ts:80-86`, default `page_kind: 'topic'`, `graph_focus: 'none'`).

Issues:
- **Adapter leak.** `server/rag.ts` exports the entire `Engine*` snake_case wire surface (`EngineGraphContext`, `EnginePaperSummary`, `EngineEvidenceBundle`, etc., 17 interfaces, lines 5-247) and `server/index.ts:6` re-exports `./rag` so all of it bleeds out of the package. The package is supposed to be a stable adapter; instead the engine wire shape is part of the public API. `graph-rag.ts` already has a mapper (`mapEngineRagResponse`) — the engine types should be internal.
- **Dual mapping path with subtle drift.** `server/graph-rag.ts:188-218` `mapEvidenceBundleToResult` reconstructs a `GraphRagResult` from `EngineEvidenceBundle` while `server/graph-rag.ts:220-235` `mapEvidenceBundle` returns a separate `GraphEvidenceBundle`; both responses are returned in the same payload (`response.results` and `response.evidence_bundles`). Two shapes derived from one source is a centralization smell.
- **Inconsistent casing strategy.** `shared/graph-entity.ts` uses camelCase fields (`entityType`, `sourceIdentifier`); `shared/graph-rag.ts` keeps snake_case (`graph_paper_ref`, `cited_corpus_ids`); `shared/wiki-types.ts` is also snake_case. Picking either is fine; mixing inside the same package is a centralization gap that forces consumers to remember per-domain conventions.
- **Two duplicate copies of error-code branching.** The `getErrorCode(status)` + `isGraphRagErrorCode` / `isGraphEntityErrorCode` ladders in `server/graph-rag.ts:248-281` and `server/entities.ts:155-194` are near-identical. Same for `getBodyStringField` (`server/graph-rag.ts:283-291` vs `server/entities.ts:196-203`). Centralize once.
- **Two ad-hoc error message resolvers.** `client/wiki-client.ts:38-59` (`resolveWikiErrorMessage`) reproduces the priority list (`message`, `error`, `error_message`, `detail`) that `server/client.ts:74-128` (`getErrorMessage`) handles for the engine. They diverge: the client version does not flatten FastAPI 422 arrays.
- **Two error class hierarchies on the browser side.** `WikiRequestError` (`client/wiki-client.ts:28-36`) and `GraphEntityRequestError` (`client/entity-service.ts:13-21`) coexist with no shared base; `GraphEntityRequestError` carries a typed payload, `WikiRequestError` does not.
- **`postEngineBinary` ignores body type safety.** Signature is `<TRequest>(path, body, init)` but `TRequest` is not used in `executeEnginePost` (`server/client.ts:130-156, 203-213`); `body: unknown` flattens the contract.
- **No `exports` map / no `sideEffects: false`.** `packages/api-client/package.json` is six lines. Without an `exports` field consumers cannot import subpaths cleanly; without `sideEffects: false` the bundler cannot tree-shake. The same applies to `packages/graph/package.json`.
- **Public `index.ts` flattens client + server + shared.** `packages/api-client/src/index.ts:1-3` re-exports server (`'server-only'`-tagged) and client (`'use client'`-tagged) modules into one entry. Anything that imports the root barrel from a server context will pull `'use client'` modules and vice versa. Subpath entries (`@solemd/api-client/server`, `/client`, `/shared`) would be safer.
- **`server/wiki.ts:49, 67, 85` 404 detection uses a duck-typed status check** (`'status' in error && (error as { status: number }).status === 404`). The package already exports `EngineApiError`; use `instanceof EngineApiError && error.status === 404` (the fetchWikiGraph branch at `server/wiki.ts:115` does exactly that).
- **Hardcoded engine URL default.** `server/client.ts:3` `const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8300'`. Fine for dev, but there is no validation that `ENGINE_URL` is set in production. A non-localhost default or a startup assertion would prevent silent prod misconfig.
- **No request timeout.** `getEngineJson`/`postEngineJson`/`postEngineBinary` accept an `AbortSignal` but no internal timeout default. A slow engine will hang the SSR request indefinitely.
- **`server/wiki.ts:55, 92, 100` `getEngineJson` calls do NOT forward `AbortSignal`** — `fetchWikiPages`, `searchWiki`, `fetchWikiBacklinks` all swallow the option. Inconsistent with the entity/rag side which threads `options.signal` through.
- **`buildWikiPageEnginePath`/`buildWikiPageBundleEnginePath`/`buildWikiPageContextEnginePath` accept raw slug** (`shared/wiki-paths.ts:24-50`) — they do NOT call `encodeWikiSlug`, while the client variants do (`shared/wiki-paths.ts:71-96`). A slug containing `/` or special characters routed via the engine path will hit the wrong URL or 404.

## packages/graph review

What it does well:
- Single Cosmograph re-export surface (`cosmograph/index.ts:1-20`); browser-only modules consistently marked `"use client"` (`GraphShell.tsx:1`, `hooks/*.ts:1`, `widgets/*.tsx:1`).
- Type files are small and well-bounded (`types/bundle.ts`, `clusters.ts`, `detail.ts`, `points.ts`, `nodes.ts`, `layer.ts`).
- `camera-persistence.ts` defensively wraps every `sessionStorage` access in try/catch (SSR + private browsing safe), validates schema before returning, expires on age.
- `useGraphCamera`/`useZoomLabels` are well-tested for both the populated and null-cosmograph branch.
- Hooks are pure delegations; no state duplication of cosmograph-internal state.

Issues:
- **`packages/graph/README.md` is corrupted.** Lines 3–14 are an `*** Add File:` block that should never have been committed to README.md — it is the contents of `cosmograph/__tests__/test-utils.ts` mistakenly appended. The README is broken and ships into any docs reader.
- **`DEFAULT_INITIAL_CAMERA` in `camera-persistence.ts:7-11`** hardcodes a dataset-specific default camera (`zoomLevel: 0.6717..., transformX: -511.4044...`). This belongs in app config, not in a shared package; if the bundle changes geometry, every consumer of the package gets the wrong default.
- **`label-appearance.ts:1` `HIDDEN_LABEL_STYLE = "display: none;"` is a CSS string used as a className.** `resolveClusterLabelClassName` returns `"display: none;"` as a class name — that is not a valid class name. Probably the wrong abstraction (should return an object `{ style }` or `{ hidden: true }` and let the consumer apply styles). Looks like a real bug, not just a smell.
- **`STORAGE_KEY = "solemd:camera"`** (`camera-persistence.ts:13`) is a hard-coded session key inside a shared package; multiple consumers in the same origin (graph + graph-overlay) will collide.
- **`types/query.ts` (217 LOC)** declares the entire `GraphBundleQueries` interface (33 methods) in one block. This is the runtime contract for the bundle query layer in `apps/web`. The package re-exports types but provides no implementation; defining a 33-method contract in a `types/` file with no docstrings makes the contract very hard to evolve safely.
- **`type GraphLayer = "corpus";`** (`types/layer.ts:1`) — single literal exported as an alias. Either YAGNI (delete) or clearly future-facing (document why a single-value union exists).
- **`packages/graph/package.json`** has no `dependencies` or `peerDependencies` for `@cosmograph/react` or React, even though `GraphShell.tsx`, all hooks, and widgets import from `@cosmograph/react` and `react`. The package compiles only because the root workspace happens to provide them. A peerDependency declaration is the native way to express this.
- **No barrel for `widgets/`.** `cosmograph/index.ts:17-19` lists `ColorLegends`, `SizeLegend`, `widget-range-utils` individually; one more widget and this will sprawl.
- **`GraphBundleQueries` includes `runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>`** (`types/query.ts:211`). The "read-only" guarantee lives in the implementation, not the type. Worth a docstring noting the contract that callers must not pass user-provided SQL.

## packages/ui status

Truly empty; only `packages/ui/README.md` (1 line). No `package.json`, no `src/`. Consistent with the project memo ("reserved for future shared React primitives"). No issues — leave the placeholder until the first real consumer arrives, or delete the directory until then.

## Critical issues

1. `packages/graph/README.md:3-14` contains stray test-utility source code instead of documentation. Visible bug in the published README.
2. `packages/graph/src/cosmograph/label-appearance.ts:1, 30-35` `resolveClusterLabelClassName` returns a CSS declaration (`"display: none;"`) where a class name is expected. Likely wrong at use sites — needs investigation in `apps/web`.
3. `packages/api-client/src/shared/wiki-paths.ts:24, 33, 42` engine path builders accept raw slug and do not URL-encode (`encodeWikiSlug`), unlike the client variants (`:71, 80, 89`). Slugs with reserved characters will 404 or hit wrong endpoints.
4. **Engine wire surface leaks publicly** through `packages/api-client/src/server/index.ts` → `server/rag.ts` 17 `Engine*` interfaces. Defeats the entire adapter purpose.

## Major issues

1. `packages/api-client/src/index.ts` flattens `'server-only'` and `'use client'` modules into a single barrel; need subpath exports (`/server`, `/client`, `/shared`).
2. No request timeouts on engine HTTP helpers (`packages/api-client/src/server/client.ts:158-213`). Slow engine = stuck SSR.
3. `packages/api-client/src/server/wiki.ts:92-107` `fetchWikiPages`, `searchWiki`, `fetchWikiBacklinks` ignore `AbortSignal`; inconsistent cancellation contract across the package.
4. Duplicate error envelope mapping (`server/graph-rag.ts:248-291` ≈ `server/entities.ts:155-203`); duplicate error message resolution (`client/wiki-client.ts:38-59` ≈ `server/client.ts:74-128`).
5. `apps/api` has zero tests — the readiness probe path (which actually executes SQL) and the lifespan teardown are uncovered. Even three pytest files at this scale would be cheap insurance.
6. `apps/api` has no error envelope contract; `api-client` consumers already assume `error_code` / `request_id` / `retry_after` shape (`server/client.ts:17-31`). When apps/api grows, the envelope must match or the client error class breaks silently.
7. `apps/api/app/config.py:82` `settings = Settings()` is constructed at import time; any consumer that imports `app.config` without `SERVE_DSN_READ` / `SERVE_DSN_ADMIN` env vars crashes immediately. Standard FastAPI pattern is `@lru_cache get_settings()` exposed via `Depends`. Not blocking, but worth noting for slice 2.
8. `packages/graph/package.json` does not declare `react` or `@cosmograph/react` as `peerDependencies`. Hidden hoisting dependency.

## Minor issues

1. `packages/api-client/package.json` and `packages/graph/package.json` are 6-line stubs. Add `"sideEffects": false`, `"exports"` map, possibly `"types"` entry.
2. `packages/api-client/src/server/client.ts:3` `DEFAULT_ENGINE_URL = 'http://127.0.0.1:8300'` is fine for dev but should fail loud in prod when `ENGINE_URL` is unset.
3. `packages/api-client/src/server/wiki.ts:49, 67, 85` use duck-typed 404 detection; replace with `instanceof EngineApiError`.
4. `packages/api-client/src/server/client.ts:203-213` `postEngineBinary<TRequest>` does not actually use `TRequest`; either constrain it or drop the type parameter.
5. `packages/graph/src/cosmograph/camera-persistence.ts:13` `STORAGE_KEY = "solemd:camera"` should be configurable to avoid same-origin collisions across deployable apps.
6. `packages/graph/src/cosmograph/camera-persistence.ts:7-11` `DEFAULT_INITIAL_CAMERA` is bundle-specific and should be passed in by the consumer.
7. `apps/api` has `__pycache__` directories committed-shaped (or simply present in the working tree); confirm `.gitignore` covers them.
8. `apps/api/app/config.py:11` walks `parents[3]` to find `.env`; brittle if the layout shifts. Use `Path(__file__).parent` plus an explicit `pyproject` anchor or env override.
9. `apps/api/pyproject.toml` has no `[tool.ruff]` / `[tool.pytest]` / `[tool.mypy]` configuration; standard for slice 1 but should land before slice 2.
10. `packages/graph/src/types/layer.ts` single-literal type alias — either delete or document.
11. `packages/api-client/src/shared/index.ts` re-exports five files flat; one of the names (`graph-rag.ts`) collides with `server/graph-rag.ts` re-exported through the root barrel. No actual TS conflict because the symbols are distinct, but the file names are confusing.
12. README of `packages/api-client` is a single line — a `## Public surface / @solemd/api-client/server vs /client vs /shared` paragraph would prevent consumers from reaching for the wrong import.

## Reuse / consolidation opportunities

1. **Centralize the engine error envelope.** One `EngineErrorPayload` Pydantic model in `apps/api` + one TS interface in `packages/api-client/src/shared/`, used by both `server/graph-rag.ts` and `server/entities.ts` `to*ErrorResponse` mappers. Removes the two near-duplicate `getErrorCode`/`isXxxErrorCode` ladders.
2. **One HTTP error class.** `EngineApiError` (server side), `WikiRequestError`, and `GraphEntityRequestError` should share a `BaseHttpError` with `status`, `errorCode`, `requestId`, `retryAfter`. Probably lives in `shared/`.
3. **One JSON-fetch helper** in `client/` shared by `wiki-client.ts` and `entity-service.ts` — both reimplement `fetch + headers + cache: 'no-store' + parse + throw on !ok`.
4. **Engine wire types should be internal.** Stop exporting `Engine*` from `server/rag.ts`. Re-export only the mapped DTOs from `shared/graph-rag.ts`. The mapper is the seam.
5. **Path builders should always encode.** Collapse `buildWikiPageEnginePath` / `buildWikiPageClientPath` pair into a single function that always calls `encodeWikiSlug` with a prefix argument.
6. **Snake/camel choice.** Pick one. The `shared/graph-entity.ts` camelCase + `shared/graph-rag.ts` snake_case split adds friction with no payoff.
7. **`apps/api` readiness check duplication.** `app/db.py:56-59` `probe_pool` is functionally what `app/routes/health.py:46-55` does inline; route should call `probe_pool` rather than reimplementing it.
8. **`packages/graph/src/types/query.ts` (217 LOC, 33 methods)** is a contract that lives in a types-only package; the implementation (presumably in `apps/web`) cannot evolve it ergonomically. Consider extracting it into a `@solemd/graph/queries` subpath with reference docs.

## What's solid

- `apps/api` slice 1 is honest, minimal, and well-shaped: app-factory + lifespan + asyncpg pool separation by use case + correct `statement_cache_size` choice for transaction-pooled reads (`db.py:33-35`). Pinned dependencies, `uv.lock` checked in, Python pinned to 3.13.
- Liveness vs readiness is correctly distinguished (`/healthz` is dependency-free, `/readyz` returns 503 on dependency failure with structured detail).
- `packages/api-client/src/server/client.ts` covers the harder cases (FastAPI 422 detail array, AbortError preservation, engine-down message, error envelope extraction) and they are tested.
- Wire→DTO mapping seam exists (`server/entities.ts:42-58`, `server/graph-rag.ts:94-131`); it is exactly the right pattern.
- `'server-only'` / `'use client'` directives are applied consistently and correctly.
- Camera persistence is properly defensive (try/catch SSR-safe, finite-number guards, age-based expiry, schema validation), and well tested.
- Cosmograph hooks are thin pass-throughs — no over-abstraction, no shadow state.
- Tests cover the camera, the camera-less Cosmograph branch, the zoom-label hook, and engine error paths. Coverage is small but the high-value paths are picked.

## Recommended priority (top 5)

1. **Fix `packages/graph/README.md`.** Strip the stray `*** Add File:` block at lines 3–14. (5 min.)
2. **Fix `resolveClusterLabelClassName` in `packages/graph/src/cosmograph/label-appearance.ts:30-35`.** It returns a CSS declaration where a className is expected. Verify the call sites in `apps/web` and either return an object/boolean or rename. Likely a live rendering bug.
3. **Stop leaking the engine wire surface.** Remove `export *` of `server/rag.ts` from `packages/api-client/src/server/index.ts:6`; export only the mapped DTO types from `shared/graph-rag.ts` and the public `searchEvidence` / `searchGraphEvidence` functions. Lock the adapter contract.
4. **URL-encode wiki slugs in engine paths.** Apply `encodeWikiSlug` inside `buildWikiPageEnginePath`, `buildWikiPageBundleEnginePath`, `buildWikiPageContextEnginePath`, and `buildWikiBacklinksEnginePath` (`packages/api-client/src/shared/wiki-paths.ts:24-65`). Single bug class, three call sites.
5. **Land the error-envelope contract in `apps/api`** (Pydantic model: `error_code`, `error_message`, `request_id`, `retry_after`) plus a global exception handler, then deduplicate `getErrorCode`/`isXxxErrorCode` in `packages/api-client/src/server/{graph-rag,entities}.ts` against a single shared mapper. Aligns the api-client contract with the API before any new routes ship in slice 2.
