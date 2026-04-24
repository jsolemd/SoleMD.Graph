# SoleMD.Graph — Integrated Improvement Plan

**Authored**: 2026-04-23
**Inputs**: 12 per-slice audits (`tmp/audit/web-*.md`, `worker-*.md`,
`api-and-packages.md`, `db-and-infra.md`) + Codex cross-review
(`_codex_cross_review.md`) + 5 domain plans (`_plan_01`–`_plan_05`).
**Lead synthesis**: phase order, cross-cutting themes, risk-ordered top-20,
repo-wide release gate.

---

## 1. Headline verdict

The audit reveals a codebase that is **architecturally strong, with scaffolding
in some places and running code in others.** The Next.js frontend, browser
graph runtime, and worker pipeline each have solid ownership patterns (adapter
barrels, content-addressed bundles, cancellation model, idempotent resume).

**Severity must be read against product phase.** Nothing is in public
production yet. `apps/api` is a slice-1 rebuild target, `/api/evidence/chat`
is a stub not wired to a real LLM backend, and user-facing traffic is
pre-launch. Findings here are grouped into two buckets:

**Live-code-today (must fix for correctness now):**
1. **Worker connection lifecycle violates pool hygiene.** Two independent
   worker modules hold pool connections (and a PG advisory lock) across NCBI
   HTTP fetches. Under wave fanout this starves the pool. Compounded by
   error-cleanup paths that write to poisoned transactions.
2. **CI runs no tests.** `quality.yml` is lint + typecheck only. Jest and
   pytest exist but never run in CI. Every fix in this plan lacks a
   regression guard until this is fixed.
3. **Wave enqueue is non-transactional** (send-then-mark) — double-dispatch
   on crash, with sync `.send` blocking the async event loop.

**Pre-public-deploy (must fix before opening to real traffic, not before):**
- **No network-boundary gate.** No middleware, no auth, no rate limiting. Real
  when users land; not real today. Provider choice is still open — the plan 01
  design space is an outline, not a prescribed stack.
- Lab routes shipped to prod builds.
- Three different error envelopes leaking `error.message`.
- No CSP / HSTS / request-id.

Both buckets matter; the ordering in this document reflects that separation.

Underneath these systemic gaps sit ~80 slice-level issues spanning adapter
bypasses (Cosmograph + DuckDB internals reached directly), module-scope
mutable state (unbounded browser caches, global keydown handlers), duplicate
error envelopes, missing WebGL disposal, and LOC violations in Python worker
files (6 files over 600 LOC, all in the worker, all mixing concerns).

**What's solid**: the content-addressed bundle route (ETag/Range/HEAD all
correct), adapter barrels where they exist (`tiptap/index.ts`), cancellation
test coverage in the worker, the CSS token architecture (`globals.css` passes
the thin-entry-point test), reduced-motion hygiene in animations, and
near-complete secrets handling at rest (`.gitignore` + `.dockerignore` + pgbouncer).

---

## 2. Repo-wide phase order

**Phase 0 — Enable verification (must ship first).**
CI test enforcement. Without this nothing else can land with confidence.

**Phase 1 — Data-correctness blockers (live code, ship next).**
Worker connection lifecycle, advisory-lock scope, transactional dispatch,
SQL identifier allow-list, missing PK on staging table, baseline migration
drift, wiki abort race, WebGL leak + unbounded browser caches.

**Phase 2 — Network-boundary gate (before first public deploy, not before).**
Auth, rate limiting, lab-route stripping, CSP report-only, CSRF hardening.
Deferred until the product opens to real traffic AND an auth provider is
picked. Plan 01 is a design-space sketch — the library/store choices
(Better Auth / Redis / Vercel KV / Clerk / Auth.js) are open until the
product decision lands. The shape of the middleware + policy map + envelope
is provider-agnostic and can be built now; the identity layer waits.

**Phase 3 — Error-envelope + observability.**
One envelope across web + api, request-id middleware, structured logging,
worker telemetry self-observability, no `error.message` echo.

**Phase 4 — Scale + concurrency hardening.**
NCBI client hardening, async/sync correctness, DB principle-9 fixes
(batching, gather, set-based SQL, deduplication of `release_scope` CTE).

**Phase 5 — Adapter discipline + modularization.**
Cosmograph barrel enforcement, worker runtime-file splits (the 6 files
over 600 LOC), frontend layer-factory reuse, Lottie pipeline consolidation.

**Phase 6 — Polish.**
CSS consolidation (duplicate keyframes, graph-ui.css reshuffle, hairlines),
responsive parity (drag-resize touch, mouse parallax fallback),
`packages/graph` bug fixes, `packages/api-client` timeout + abort threading.

Dependencies flow strictly: 0 → 1 → 2 → 3 → 4 → 5 → 6. Phase 1 and 2 can
ship in parallel batches because their file ownership doesn't overlap.

---

## 3. Risk-ordered top-20 issues

Sorted for **current product phase** (pre-launch, worker running against real
data, frontend running locally/in dev). Auth gap is real but deferred to
Phase 2 — listed below the live-code issues it would otherwise top.

For each: title — owning plan(s) — why it matters — fix sketch.

| # | Severity | Title | Plan(s) | Why | Fix |
|---|----------|-------|---------|-----|-----|
| 1 | Critical | CI never runs tests | 05 B1–B3 | No regression guard for any fix in this plan | `web-tests.yml`, `worker-tests.yml` as required checks |
| 2 | Critical | Evidence worker holds pool connection + advisory lock across NCBI HTTP | 02 A1 | Pool starvation under wave fanout, affects live ingest | Bracket connection/lock around DB writes only; HTTP outside lease |
| 3 | Critical | Ingest abort-cleanup writes to poisoned control-connection | 02 A1 | `_set_terminal_status` silently swallowed; terminal state never persists | Fresh-pool `_record_terminal` in every except branch |
| 4 | Critical | Wave enqueue send-then-mark doubles on crash; sync `.send` blocks event loop | 02 A2 | Duplicate work + event-loop stalls in live ingest | Outbox table + transactional claim + `asyncio.to_thread` dispatch + actor-side dedupe |
| 5 | Deferred-Critical | Zero auth / zero rate-limiting on every route | 01 A1+A2 | Real the moment the product opens to public traffic; provider choice still open so defer detailed design | Outline-only now; decide stack + implement before first public deploy |
| 6 | Critical | `useWikiPageBundle` writes state after abort | 03 A7 | User-visible wrong content on fast slug navigation | Gate every `setState` on `signal.aborted` |
| 7 | Critical | `useChatThread` window keydown hijacks Space/Enter site-wide | 03 A4 | Keyboard breaks anywhere `<ChatThread>` is mounted | Scope listener to the chat root element |
| 8 | Critical | `FieldScene` WebGL geometry + materials leak on unmount; four `useEffect`s have empty deps | 03 A1+A2 | GPU leak + re-attached controllers on every commit | Dispose ShaderMaterial/BufferGeometry/pointTexture; add dep arrays |
| 9 | Deferred-Major | Lab routes (`/smoke`, `/loading-preview`, `/surface-lab`, `/field-lab`, `/ambient-field-lab`) shipped to prod | 01 A3 | Matters at first public deploy, not now; duplicate `/field-lab` is a dev-today cleanup | `notFound()` when `NODE_ENV=production`; delete duplicate `/field-lab` |
| 10 | Critical | `s2_paper_reference_metrics_stage` has no PK/UNIQUE | 05 A1 | Silent double-counting of citation metrics | Forward migration adding UNIQUE |
| 11 | Critical | `_assert_not_aborted` races orchestrator's control connection across N worker tasks | 02 A1 | `promote_family` transactions race on same connection | Dedicated read-only abort-check connection or pubsub signaling |
| 12 | Critical | No ErrorBoundary around lazy wiki module imports | 03 A5 | Failed dynamic import crashes the whole wiki panel | Add ErrorBoundary + retry |
| 13 | Major | SQL identifier f-string interpolation in `writers/s2.py` | 02 A3 | Latent injection if caller-supplied column names ever land | `assert_safe_identifier` + `TextPatchColumn(Enum)` |
| 14 | Major | `currentPointScopeSql` concatenated as raw string into 6+ widget queries | 03 B (hardening) | Any future caller pipes user input = browser DuckDB injection | Branded opaque type + factory |
| 15 | Major | Baseline migration drift (\ir-chain over mutable schema/ dir) | 05 A2 | Fresh apply diverges from incremental apply | CI drift check, freeze-at-release next cycle |
| 16 | Major | Cosmograph adapter barrel declared but bypassed in 9+ files (incl. deep internals) | 03 B | Vendor version bomb one upstream bump away | Enforce via ESLint no-restricted-imports + centralize the remaining surfaces |
| 17 | Major | Three different error envelopes; `error.message` leaked to clients | 01 B2 / 04 C1 | Schema + hostname leakage; inconsistent client model | One `ErrorResponse` shape shared web + api |
| 18 | Major | No CSP / HSTS / COOP / COEP; inline FOUC `<script>` blocks clean CSP | 01 A4 | Defense-in-depth gap | Add headers in report-only first; consolidate FOUC to one of three triplicated sources |
| 19 | Major | `mount-wiki-graph.ts` rAF / destroy race + missing cancelAnimationFrame | 03 A (field/wiki race cluster) | Graphics disposal mid-rAF | Cancel rAF on destroy; guard render against destroyed state |
| 20 | Major | Lottie `structuredClone` on every mode/theme tick defeats useMemo | 03 C (perf) | Hundreds of KB clones per tick | Stable key via `resolveCssColor` memoization + clone key fix |

Cross-review consensus: all 12 items flagged CRITICAL by per-slice agents
that Codex verified are in the top 12 above, in roughly the right order.
Codex recalibrated two Critical → Major (CSP moved to #18; Lottie clone to
#20) and one Major → Critical (wiki abort race moved to #6).

---

## 4. Cross-cutting themes (from Codex §2)

- **Theme A — Zero network-boundary enforcement**: appears in every slice
  with any external entry point. Owned by plan 01 Phase A.
- **Theme B — DB connection held across async non-DB work**: appears in
  evidence runtime AND ingest runtime. Owned by plan 02 Phase A. Pool
  starvation class, not a smell.
- **Theme C — Adapter boundary declared but violated**: Cosmograph barrel,
  api-client engine wire types. Owned by plan 03 Phase B and plan 04 Phase B.
- **Theme D — Silent error swallowing**: each slice caught one instance;
  the systemic fix is request-id + structured logging + no-swallow discipline.
  Owned by plan 01 Phase C + plan 02 (telemetry self-observability) + plan 03
  (error boundaries + error reporting).
- **Theme E — Module-scope mutable singletons** (unbounded caches, global
  tween maps, dropped subscriptions): browser cross-session leaks + test
  pollution. Owned by plan 03 (cache bounds) + 04 (api-client error class
  consolidation).
- **Theme F — Duplicate error envelopes / JSON parse blocks**: owned by
  plan 01 B1+B2 and plan 04 C1 (shared shape).
- **Theme G — LOC budget violations concentrated in Python worker** (6
  files > 600 LOC). Critical bugs live inside the biggest functions. Owned
  by plan 02 Phase C.

---

## 5. Gaps in the original 12-slice partition (Codex §4)

Noted for follow-up, not covered by any existing plan:

- **End-to-end auth flow review** — no slice owned this because there is no
  auth model. Addressed by plan 01 A1.
- **Cross-process observability** — no slice owned the web→api→worker
  request-id trace. Addressed jointly by 01 C1, 02 telemetry, 04 C3.
- **Build/CI pipeline depth** — only db-infra-ci looked at it. Addressed by
  plan 05 Phase B.
- **Dependency CVE scanning** — not addressed. Add to plan 05 Phase C
  (`npm audit --production` + `pip-audit` in CI).
- **Accessibility audit** — explicitly out of scope of /clean and /audit but
  noted for future pass.
- **i18n** — not applicable at current product phase.
- **Performance budgets across the whole shell** — addressed partially by
  plan 03 §5 regression-test list; extend to a bundle-size budget in CI.

---

## 6. Work partitioning for implementation

When implementation teams pick this up, the file ownership for each phase
should follow the per-plan file lists. Non-overlapping ownership table:

| Phase | Owner | Primary dirs |
|-------|-------|--------------|
| 0 | plan 05 | `.github/workflows/` |
| 1 | plan 01 | `apps/web/middleware.ts`, `apps/web/app/api/_lib/`, `apps/web/next.config.ts`, lab route files |
| 2a (worker) | plan 02 | `apps/worker/app/evidence/runtime.py`, `apps/worker/app/ingest/runtime.py`, `apps/worker/app/corpus/wave_runtime.py`, writers/s2.py |
| 2b (frontend race) | plan 03 | `apps/web/features/wiki/hooks/use-wiki-page-bundle.ts`, `features/field/scene/FieldScene.tsx`, `module-runtime/interactions/ChatThread/` |
| 2c (schema) | plan 05 | `db/schema/warehouse/40_tables_core.sql`, new migration |
| 3 | plan 01 + plan 04 | `apps/web/app/api/_lib/`, `apps/api/app/` |
| 4 | plan 02 | worker-wide |
| 5 | plan 03 + plan 02 | `apps/web/features/graph/cosmograph/` enforcement, worker file splits |
| 6 | plan 03 + plan 04 | CSS partials, `packages/graph`, `packages/api-client` |

Phases 1 and 2 (a/b/c) have no overlapping files — can ship in parallel.

---

## 7. Consolidated open questions for the user

From the 5 domain plans, ordered by urgency:

1. **Auth library**: Better Auth (scaffolded) vs Auth.js vs Clerk. Blocks plan 01 A1.
2. **Public product posture**: which wiki/entity GETs are public-read? Blocks plan 01 A1 policy map.
3. **Baseline migration contract**: CI drift check (quick fix) vs freeze-at-release (larger). Blocks plan 05 A2.
4. **`apps/api` access**: browser-direct vs SSR-only. Drives CORS + auth-header scope. Blocks plan 04 C1+C2.
5. **`packages/ui` disposition**: keep placeholder vs remove. Blocks plan 04 D.
6. **Worker pgbouncer routing**: future plan, makes asyncpg `statement_cache_size=0` hard-required. Blocks plan 05 D + plan 02 pool-routing.
7. **CSP strictness**: start with `unsafe-inline` for styles vs nonce Mantine up front. Default permissive.
8. **`graph-bundles` URLs**: content-addressed public vs HMAC-signed. Default public until non-public bundles appear.
9. **Rate-limit store**: Redis (preferred, already running) vs Vercel KV vs Upstash.
10. **Service-to-service auth** (web→api): static bearer vs mTLS vs signed JWT. Default static bearer in env-rotated header.
11. **Lab routes**: delete (preferred) vs env-flag ship (internal demos). Default delete `/field-lab`, gate the rest.
12. **Animation registry**: schema location + consumer migration path (plan 04 handoff to plan 03).

Items 1–4 block Phase 1 planning. Items 5–8 block Phase 3. 9–12 are detail.

---

## 8. Release gate (codified)

A deploy to public production requires **all** of the following:

1. All Phase 0 test suites passing in CI, required-status-check on `main`.
2. All Phase 1 items shipped (auth, rate limiting, lab gating, CSP
   report-only, CSRF origin check, request-id, `lib/env.ts` boot check).
3. All Phase 2 items shipped (worker connection lifecycle + advisory lock
   scope + identifier allow-list + staging PK + baseline drift guard +
   wiki abort race + field WebGL disposal + ChatThread scoped listener).
4. Error envelope normalized; no `error.message` echoed anywhere in web or api.
5. CSP enforce mode (not report-only) after 2 deploys of stability.
6. Dependency scan (`npm audit --production` + `pip-audit`) green in CI.
7. Public-env allowlist check green in CI.
8. No commits to `main` with uncommitted changes under `.env*`.
9. Signed release bundle (content-addressed, or HMAC-signed per product decision).
10. Documented rollback path (prior graph bundle + prior deploy).

---

## 9. What's left after this plan executes

Not in scope; documented as follow-up:

- Accessibility full audit pass.
- Internationalization foundation when product scope requires it.
- Vendor version-bump playbook (Cosmograph, DuckDB-WASM, Mantine) — the
  adapter enforcement work in Phase 5 is the precondition; the playbook is
  the next layer.
- Formal load-testing against the rate-limit bucket config.
- SBOM + dependency provenance.
- Signed container images / supply-chain hardening for the worker.

---

## 10. Summary of the 5 domain plans

| Plan | File | Lines | Top priority |
|------|------|-------|--------------|
| 01 Security & Prod Readiness | `_plan_01_security.md` | ~420 | Middleware + Better Auth + Redis rate limiter |
| 02 Worker Hardening | `_plan_02_worker.md` | 465 | Connection + advisory-lock bracketing, wave enqueue outbox, SQL identifier allow-list |
| 03 Frontend Runtime | `_plan_03_frontend_runtime.md` | 788 | Wiki abort race, ChatThread keydown scope, FieldScene disposal + effect deps, lazy-import ErrorBoundary |
| 04 apps/api + packages | `_plan_04_api_packages.md` | 429 | `packages/graph` correctness bugs, api-client error class + timeout + abort, apps/api error envelope mirror |
| 05 DB + Infra + CI | `_plan_05_db_infra_ci.md` | 634 | CI test enforcement, UNIQUE on staging table, baseline migration drift |

All five plans agree on the phase order and cross-team handoffs. No
contradictions found during integration.
