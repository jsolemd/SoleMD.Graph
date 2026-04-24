# Plan: apps/api + packages

Scope: `apps/api/` (FastAPI clean-room rebuild target, slice 1),
`packages/api-client/` (~2,639 LOC TS), `packages/graph/` (~1,044 LOC TS),
`packages/ui/` (empty).

Sources: `tmp/audit/api-and-packages.md`; `tmp/audit/_codex_cross_review.md`
(Themes C, F; risk-ordered #9, #10, #11, #15; spot-checks #2, #4; I1).

## 1. Headline summary

`apps/api` slice-1 scaffolding is honest and correctly shaped (app factory +
lifespan + two asyncpg pools split by use case with `statement_cache_size=0`
on the transaction-pooled read pool; `/healthz` liveness vs `/readyz`
readiness is correctly split). Outstanding work is not "rewrite" — it is
**lock the contract before slice 2 grows routes on top**: pin the error
envelope, decide the auth header shape, add CORS + request-id + structured
logging middleware, and wire the first pytest files into CI so the lifespan
and readiness paths have a regression guard.

`packages/api-client` has the right seam in principle (wire → mapper → DTO),
but the seam leaks: `server/rag.ts` re-exports 17 `Engine*` interfaces
through `server/index.ts`, two browser error classes coexist, engine HTTP
helpers have no timeout default, and `server/wiki.ts` silently drops
`AbortSignal` on three of five calls. All bounded, surgical fixes.

`packages/graph` has three real bugs (all small): stray `*** Add File:`
test-utils dump in the README, `resolveClusterLabelClassName` returns a CSS
declaration where a className is expected, and `STORAGE_KEY = "solemd:camera"`
collides across graph vs graph-overlay on same origin. Plus: missing
peer-deps on `react` + `@cosmograph/react`.

`packages/ui` is empty — recommend excluding from the `workspaces` glob
until a real consumer lands, keep the placeholder dir + README. Open
question for lead.

**Top 3 priorities**:
1. Phase A fixes in `packages/graph` (A1/A2/A4 — one MAJOR user-visible
   rendering bug, two small correctness items) plus B6 (`encodeWikiSlug` on
   engine path builders).
2. B3 + B4 + B5: collapse browser error classes, add default timeout,
   thread `AbortSignal` through `wiki.ts`.
3. C1: error envelope Pydantic model + global exception handler —
   **blocks the security-planner's web-side envelope shape** and every
   slice-2 route.

## 2. Phase order

- **Phase A** — `packages/graph` correctness. 4 items, ~1 engineer-day.
- **Phase B** — `packages/api-client` hardening. 7 items, ~3 engineer-days.
- **Phase C** — `apps/api` slice-2 contract (envelope, middleware, test
  scaffold). 6 items, ~3 engineer-days. **Gates slice-2 route work.**
- **Phase D** — `packages/ui` decision. ~30 min.

Phase A and early Phase B are parallelizable. C1 must be agreed with the
security-planner before either side ships.

## 3. Detailed work items

### Phase A — packages/graph correctness

#### A1. Strip stray test-utils block from `packages/graph/README.md`

- **Severity**: MINOR (visible bug in docs).
- **Source**: `api-and-packages.md` Critical #1; README lines 3–14.
- **Files**: `packages/graph/README.md`.
- **Approach**: Delete lines 3–14 (`*** Add File:` + `__tests__/test-utils.ts`
  dump). Replace with one paragraph: what the package is (Cosmograph hooks
  + bundle/query/cluster types, no `GraphBundleQueries` implementation),
  public exports, and the directive rule (`cosmograph/*` is `"use client"`
  only; `types/*` is server-safe).
- **Effort**: 15 min. **Deps**: None.

#### A2. Fix `resolveClusterLabelClassName` returning CSS declaration

- **Severity**: MAJOR (rendering bug — empty/null labels never hidden;
  className set to `"display: none;"` which matches no rule).
- **Source**: `api-and-packages.md` Critical #2; `_codex_cross_review.md`
  spot-check #2; `packages/graph/src/cosmograph/label-appearance.ts:1, 29-35`.
- **Files**: `packages/graph/src/cosmograph/label-appearance.ts`;
  new `label-appearance.test.ts`; plus `apps/web` call sites (hand-off).
- **Approach**:
  1. Change return to a discriminated result:
     `{ hidden: true } | { hidden: false, className: string }`.
  2. Drop `HIDDEN_LABEL_STYLE`; export `HIDDEN_LABEL_CLASS_NAME` if a real
     class is needed; let `apps/web` own the CSS rule.
  3. Migrate callers. Codeatlas `find_patterns` for
     `resolveClusterLabelClassName` to locate them. If no callers, delete
     the function entirely.
  4. Tests: null / undefined / empty / whitespace / non-empty cases.
- **Open questions**: Caller inventory? Determines whether this is a
  one-PR fix or multi-repo migration.
- **Effort**: 1–2 hours. **Deps**: Consumer migration hand-off to web planner.

#### A3. Make `STORAGE_KEY` + `DEFAULT_INITIAL_CAMERA` configurable

- **Severity**: MAJOR for graph-overlay (same-origin collision), MINOR in
  isolation.
- **Source**: `api-and-packages.md` Minor #5 and #6;
  `_codex_cross_review.md` I1;
  `packages/graph/src/cosmograph/camera-persistence.ts:7-13`.
- **Files**: `camera-persistence.ts`,
  `hooks/use-graph-camera.ts`, `camera-persistence.test.ts`.
- **Approach**:
  1. Accept a `config: { storageKey, initialCamera, maxAgeMs }` parameter on
     `useGraphCamera` (single config object, single migration).
  2. Default `storageKey = "solemd:camera"` for back-compat; deprecation
     comment; graph-overlay sets `"solemd-overlay:camera"`.
  3. Test covers custom key isolation.
- **Open questions**: Bundle `DEFAULT_INITIAL_CAMERA` into the same
  config? Lean yes.
- **Effort**: 1 hour. **Deps**: Consumer migration in web + overlay
  (cross-project hand-off per `/workspaces/CLAUDE.md`).

#### A4. Peer deps + sideEffects + exports map on `packages/graph`

- **Severity**: MAJOR (hidden hoisting dependency; breaks publish /
  non-workspace consumption).
- **Source**: `api-and-packages.md` Major #8.
- **Files**: `packages/graph/package.json`; optional `types/index.ts`
  barrel.
- **Approach**:
  1. Add `peerDependencies`: `react`, `@cosmograph/react` (extract
     versions from root lockfile).
  2. Add `"sideEffects": false`.
  3. Add `"exports"` map with `/cosmograph` and `/types` subpaths.
- **Open questions**: Does `types/` need an `index.ts` barrel? Audit
  suggests only the root re-exports; likely yes.
- **Effort**: 30 min. **Deps**: Version pins from root.

### Phase B — packages/api-client hardening

#### B1. Stop leaking engine wire surface through `server/index.ts`

- **Severity**: MAJOR (defeats adapter purpose; engine renames cascade).
- **Source**: `api-and-packages.md` Critical #4; `_codex_cross_review.md`
  risk-ordered #9, Theme C.
- **Files**: `packages/api-client/src/server/index.ts`,
  `.../server/rag.ts`, `.../server/graph-rag.ts`,
  new `__tests__/public-surface.test.ts`.
- **Approach**:
  1. Convert `Engine*` interfaces in `server/rag.ts` from `export
     interface` to `interface` (internal).
  2. Remove `export * from './rag'` from `server/index.ts`; name
     only public functions.
  3. Compile-time test: `@ts-expect-error` on root-imported `Engine*`
     types.
  4. Codeatlas `dependents` on each `Engine*` symbol to surface web
     consumers; migrate to DTO types where needed.
- **Open questions**: Are there current web consumers of `Engine*`? If
  yes → two-PR migration.
- **Effort**: Half day (no web consumers) → 1–2 days with migration.
- **Deps**: Codeatlas recon.

#### B2. Subpath exports map; split `src/index.ts`

- **Severity**: MAJOR (`"server-only"` + `"use client"` modules share the
  root barrel; mis-import crashes SSR or leaks server code to browser).
- **Source**: `api-and-packages.md` Major #1.
- **Files**: `package.json`, `src/index.ts` (shrink or delete),
  `server/index.ts`, new `client/index.ts`, `shared/index.ts`.
- **Approach**: Add `"exports"` with `/server`, `/client`, `/shared`
  entries. Drop the root barrel (keep only pure DTO re-exports, if any).
  `"sideEffects": false`. Migrate consumers to subpath imports.
- **Open questions**: How many web consumers import from the bare root?
- **Effort**: 1 day with consumer migration. **Deps**: B1 (exports map
  should not encode the leak).

#### B3. Collapse browser error classes + shared JSON fetch helper

- **Severity**: MAJOR (duplicated logic, divergent fallbacks).
- **Source**: `api-and-packages.md` Major issues "Two error class
  hierarchies" + "Two ad-hoc error message resolvers";
  `_codex_cross_review.md` Theme F.
- **Files**: new `shared/http-error.ts` (`BaseHttpError`),
  `shared/resolve-error-message.ts`, `client/http-client.ts`
  (`fetchJson<T>` with `cache: 'no-store'`, timeout, AbortSignal);
  update `client/wiki-client.ts`, `client/entity-service.ts`;
  re-parent `server/client.ts::EngineApiError` onto `BaseHttpError`;
  consolidate tests.
- **Approach**:
  1. `BaseHttpError<TPayload>` with `status`, `errorCode`, `requestId`,
     `retryAfter`, `payload`.
  2. `resolveErrorMessage` consolidates the priority ladder (`message` →
     `error` → `error_message` → `detail` w/ FastAPI 422 flatten → status
     text).
  3. `fetchJson` owns the `!ok` → throw path, headers, timeout, abort
     composition.
  4. Migrate browser clients one at a time; preserve typed payload
     via generic. Keep `WikiRequestError`/`GraphEntityRequestError`
     as named subclasses only if consumers type-match on them.
- **Open questions**: Existing type-matches on subclasses?
- **Effort**: 1–1.5 days. **Deps**: Feeds B4 and B5.

#### B4. Default request timeout on engine HTTP helpers

- **Severity**: MAJOR, near-CRITICAL in prod (slow engine hangs SSR →
  Next.js worker exhaustion).
- **Source**: `api-and-packages.md` Major #2; `_codex_cross_review.md`
  risk-ordered #11 + severity upgrade.
- **Files**: `server/client.ts`, `client/http-client.ts`.
- **Approach**:
  1. `ENGINE_REQUEST_TIMEOUT_MS = 15000` (env override).
  2. `AbortSignal.timeout(...)` composed with caller signal via
     `AbortSignal.any([...])`; fall back to manual `AbortController` if
     runtime lacks `any`.
  3. Timeout → throw `BaseHttpError` with `status: 504`,
     `errorCode: 'engine_timeout'`.
- **Open questions**: `AbortSignal.any` availability in Next.js SSR
  runtime.
- **Effort**: Half day. **Deps**: B3.

#### B5. Thread `AbortSignal` through `server/wiki.ts` + fix duck-typed 404

- **Severity**: MAJOR (three of five wiki fetchers drop the signal;
  cancellations leak engine work).
- **Source**: `api-and-packages.md` Major #3, Minor #3;
  `server/wiki.ts:49, 55, 67, 85, 92, 100`.
- **Files**: `server/wiki.ts`, new `__tests__/wiki.test.ts`.
- **Approach**:
  1. Every `getEngineJson` call forwards `{ signal: options.signal }`.
  2. Replace `'status' in error && ... === 404` with
     `error instanceof EngineApiError && error.status === 404`.
  3. Tests: happy path + abort mid-flight per fetcher.
- **Effort**: 2–3 hours. **Deps**: None (B3 compatible in parallel).

#### B6. URL-encode slugs in engine path builders

- **Severity**: MAJOR (silent 404s / wrong endpoint on slugs with `/`,
  `?`, or Unicode).
- **Source**: `api-and-packages.md` Critical #3;
  `_codex_cross_review.md` risk-ordered #15, spot-check #4;
  `shared/wiki-paths.ts:24, 33, 42, 50`.
- **Files**: `shared/wiki-paths.ts`, new
  `shared/__tests__/wiki-paths.test.ts`.
- **Approach**: Collapse engine/client builder pair per path into
  `buildWikiPagePath(slug, { target: 'engine' | 'client' })` — always
  calls `encodeWikiSlug`; target only controls the prefix.
- **Effort**: 2 hours. **Deps**: None — land early.

#### B7. Minor tightening: `postEngineBinary` generic + prod `ENGINE_URL` guard

- **Severity**: MINOR.
- **Source**: `api-and-packages.md` Major #7, Minor #2.
- **Files**: `server/client.ts`.
- **Approach**:
  1. Change `body: unknown` → `body: TRequest` in `executeEnginePost`
     so the generic is not phantom.
  2. On module load in prod: if `process.env.ENGINE_URL` unset, throw at
     boot (fail fast vs silent localhost default).
- **Effort**: 1 hour. **Deps**: None.

### Phase C — apps/api slice-2 contract

#### C1. Error envelope Pydantic model + global exception handler

- **Severity**: MAJOR (contract gap — api-client already assumes
  `error_code`, `error_message`, `request_id`, `retry_after`; no
  server-side model exists yet).
- **Source**: `api-and-packages.md` Major #6, Reuse #1;
  `packages/api-client/src/server/client.ts:17-31`.
- **Files**: new `apps/api/app/errors.py` (`EngineErrorPayload`
  `BaseModel`, `EngineApiError` exception, `ErrorCode(StrEnum)`);
  `apps/api/app/main.py` (register handlers via
  `add_exception_handler`); new `apps/api/tests/test_errors.py`.
- **Approach**:
  1. Fields match TS side byte-for-byte: `error_code`, `error_message`,
     `request_id`, `retry_after: float | None`, `detail: Any | None`.
  2. `RequestValidationError` handler flattens FastAPI 422 detail arrays
     into `error_message` + `detail`.
  3. `request_id` pulled from `request.state.request_id` (set by C3
     middleware); defensive UUID v4 fallback.
  4. `ErrorCode` enum mirrors TS `isGraphRagErrorCode` /
     `isGraphEntityErrorCode` ladders — server is source of truth.
- **Open questions**: `retry_after` meaningful on non-429? Keep nullable;
  document as 429/503-only.
- **Effort**: 1 day. **Deps**: Agreement with security-planner on the
  web-side envelope shape **before anyone ships**.

#### C2. CORS middleware + Origin allowlist

- **Severity**: MAJOR (no decision recorded).
- **Source**: `api-and-packages.md` apps/api status ("no CORS
  middleware"); `_codex_cross_review.md` Theme A.
- **Files**: `apps/api/app/main.py`, `apps/api/app/config.py`.
- **Approach**: Add `CORS_ALLOWED_ORIGINS: list[str]` to `Settings`,
  default empty. Wire `CORSMiddleware` only when non-empty. Dev config
  allows `http://localhost:3000`.
- **Open questions**: Is apps/api browser-facing, or SSR-only? Today's
  `"server-only"` + `127.0.0.1:8300` design says SSR-only. Lead decision:
  keep invariant (CORS stays defensive) or open browser direct (bigger
  surface: auth, rate limit).
- **Effort**: 2 hours. **Deps**: Optional alignment with C6.

#### C3. Request-id middleware + structured logging

- **Severity**: MAJOR (observability gap;
  `_codex_cross_review.md` Theme D, Gap 4).
- **Source**: Same.
- **Files**: new `apps/api/app/middleware.py`, new
  `apps/api/app/logging.py`, wire in `main.py`.
- **Approach**:
  1. Request-id middleware: read `X-Request-Id` or generate UUID v4;
     attach to `request.state.request_id`; mirror on response header.
  2. Std-lib `logging.config.dictConfig` + JSON formatter; `contextvars`
     filter injects request-id into every log record.
  3. Feed request-id into C1's error envelope.
- **Open questions**: structlog vs std-lib (lean std-lib); OpenTelemetry
  traceparent now or later (defer).
- **Effort**: 1 day. **Deps**: C1.

#### C4. pytest + httpx test scaffold

- **Severity**: MAJOR (zero tests; lifespan + readiness uncovered; CI
  cannot regress-guard the rebuild).
- **Source**: `api-and-packages.md` Major #5;
  `_codex_cross_review.md` Theme H, risk-ordered #6, Gap 2.
- **Files**:
  - `apps/api/pyproject.toml` — `[dependency-groups.dev]`: `pytest`,
    `pytest-asyncio`, `httpx`, `pytest-httpx`; `[tool.pytest.ini_options]`
    with `asyncio_mode = "auto"`; add `[tool.ruff]`, `[tool.mypy]` (Minor #9).
  - `apps/api/tests/conftest.py` — `async_client` (httpx AsyncClient +
    ASGITransport on `create_app()`), `mock_settings`, `mock_pools`
    (monkey-patch `create_serve_pools`).
  - `apps/api/tests/test_main.py` — `/healthz` 200, `/readyz` 200/503
    via parametrized mock pool states.
  - `apps/api/tests/test_errors.py` (C1), `test_middleware.py` (C3).
- **Effort**: 1 day. **Deps**: Hand-off to db-infra-ci-planner to wire
  `uv run --project apps/api pytest` into `quality.yml`.

#### C5. OpenAPI customization + `/v1` router prefix

- **Severity**: MINOR (slice-2 convention).
- **Source**: `api-and-packages.md` apps/api status.
- **Files**: `apps/api/app/main.py`, `apps/api/app/routes/__init__.py`.
- **Approach**: `FastAPI(title, version, docs_url=None unless
  settings.enable_docs)`. `v1_router = APIRouter(prefix="/v1")` attached
  to domain routers. `/healthz`/`/readyz` stay at root.
- **Open questions**: Gate `/docs` in prod? Lean yes (off by default).
- **Effort**: 2 hours. **Deps**: None.

#### C6. Settings-as-dependency + `probe_pool` dedup

- **Severity**: MINOR.
- **Source**: `api-and-packages.md` Major #7, Reuse #7.
- **Files**: `app/config.py`, `app/routes/health.py`, `app/db.py`,
  `app/main.py`.
- **Approach**:
  1. `@lru_cache def get_settings() -> Settings`; remove module-level
     `settings = Settings()`; use `Depends(get_settings)` in routes.
  2. `/readyz` calls `probe_pool(pools.serve_read)` instead of
     reimplementing asyncio.timeout + connect-fetch inline.
- **Effort**: 3 hours. **Deps**: Easier after C4 (test guardrail).

### Phase D — packages/ui decision

#### D1. packages/ui: keep / stub / remove

- **Severity**: MINOR.
- **Source**: `api-and-packages.md` packages/ui status.
- **Recommendation**: Remove `packages/ui/` from the root `workspaces`
  glob until a real consumer lands. Keep the placeholder dir + 1-line
  README so the intent is not lost. Avoids the tooling tax (tsc ref
  pass, jest project discovery, turbo graph traversal).
- **Open questions**: Lead — planned first consumer in the next ~month?
  If yes, stub it now (`package.json` with `react` peer +
  `"sideEffects": false`, empty `src/index.ts`). If no,
  exclude-from-workspaces.
- **Effort**: 15 min either way. **Deps**: None.

## 4. Cross-team handoffs

- **Error envelope (C1 ↔ security-planner)**: `EngineErrorPayload` must
  match web-side `lib/api/error-response.ts` byte-for-byte: `error_code`,
  `error_message`, `request_id`, `retry_after`, `detail`.
  api-packages-planner owns the field names + `ErrorCode` enum;
  security-planner consumes. Agreement needed before either ships.
- **api-client auth headers (B3/B4 ↔ security-planner)**: Once auth model
  is decided, `fetchJson` needs the auth-header injection contract.
  Proposal: api-client exposes
  `configureAuth({ getAuthHeader: () => Promise<string | null> })`
  apps/web calls on bootstrap. Final model owned by security-planner;
  this planner implements the hook.
- **CI wiring (C4 ↔ db-infra-ci-planner)**: Add `uv sync --project
  apps/api` + `uv run --project apps/api pytest` to `quality.yml`. Also
  `npm test -- --runInBand packages/api-client packages/graph`.
  db-infra-ci-planner owns the workflow edit; this planner defines the
  commands.
- **Web consumer migrations (A2, B1, B2, B3)**: Removing `Engine*`
  public types, subpath exports, error-class rename, cluster-label
  contract change all touch `apps/web`. Per SoleMD hand-off protocol,
  coordinated PRs — web-feature planners own consumer updates; this
  planner provides the old→new symbol mapping in each PR description.
- **graph-overlay (A3)**: Configurable `STORAGE_KEY` unblocks
  graph-overlay co-existence on the same origin. Hand-off per
  `/workspaces/CLAUDE.md` — issue filed in graph-overlay repo; no
  cross-project edit.

## 5. Test list

| Item | Test that locks it |
|------|--------------------|
| A1 | N/A (docs) |
| A2 | `label-appearance.test.ts` — null/undefined/empty/whitespace → `{ hidden: true }`; non-empty → `{ hidden: false, className }`. Consumer render-test in `apps/web` asserts hidden label not in DOM. |
| A3 | `camera-persistence.test.ts` extended — custom `storageKey` isolates reads/writes; two keys do not collide. |
| A4 | Package schema check + tsc compile gate on peer imports. |
| B1 | Compile-time `@ts-expect-error` on root `import type { EngineGraphContext } from '@solemd/api-client/server'`. |
| B2 | CI e2e: `"use server"` → `/server` import OK; `"use client"` → `/client` import OK; crossed imports fail Next.js build. |
| B3 | Unit tests on `BaseHttpError`, `resolveErrorMessage` priority ladder (incl. 422 flatten), `fetchJson` 2xx/4xx/5xx/abort. |
| B4 | Mock fetch never resolves → timeout fires, throws `BaseHttpError` with `error_code === 'engine_timeout'`, `status === 504`. Caller signal wins when earlier. |
| B5 | `wiki.test.ts` — each fetcher: happy path + abort mid-flight (`AbortError` preserved); 404-to-null via `instanceof EngineApiError`. |
| B6 | `wiki-paths.test.ts` — slug with `/`, `?`, trailing slash, Unicode, empty — engine and client builders produce identically-encoded URLs. |
| B7 | Generic body flows without `as unknown` casts. Prod boot with no `ENGINE_URL` → module load throws. |
| C1 | `test_errors.py` — `EngineApiError(code, message)` → response has envelope + status + JSON content-type. `RequestValidationError` → flattened `detail`. |
| C2 | Preflight from allowed origin → ACAO header; disallowed → no ACAO. |
| C3 | `test_middleware.py` — incoming `X-Request-Id` mirrored on response + in log record; missing → UUID v4 generated. |
| C4 | Scaffold is the test: `/readyz` 503 on pool-down; `/healthz` 200 always. |
| C5 | `/openapi.json` valid; `/v1` prefix applies to a dummy route. |
| C6 | `/readyz` calls `probe_pool` (mock assertion); `get_settings()` cached (two calls → same instance). |
| D1 | N/A — structural decision. |

---

**Open questions summary (7)**: A2 caller inventory; A3 bundle
`DEFAULT_INITIAL_CAMERA` with `storageKey`; A4 `types/` barrel; B1
web consumers of `Engine*`; B2 web root-barrel importers; B3 type-matches
on subclasses; B4 `AbortSignal.any` runtime support; C1 `retry_after`
scope; C2 browser-direct vs SSR-only; C3 structlog vs std-lib; C5
`/docs` in prod; D1 planned ui consumer.
