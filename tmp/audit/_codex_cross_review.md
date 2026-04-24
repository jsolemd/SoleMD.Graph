# Codex Cross-Review of 12-Slice Audit

Generated: 2026-04-22. All spot-checks performed against live source in
`/home/workbench/SoleMD/SoleMD.Graph`.

---

## 1. Top-tier critical verification

**Claim: No auth on any route, including LLM chat (web-app-routes C1)**
- Spot-checked `apps/web/app/api/evidence/chat/route.ts:1-20`: confirmed —
  `POST` handler accepts requests immediately, no session check, no header
  guard, no middleware intercept.
- Searched the entire `apps/web` tree for `middleware.ts` / `middleware.js`:
  none found.
- Verdict: **accurately described and correctly marked CRITICAL.** The LLM
  endpoint (`/api/evidence/chat`) is publicly callable with no rate limit.
  Combined with k=50, rerank_topn=200 bounds in `stream.ts:31-33`, one
  attacker can drain compute budget indefinitely.

**Claim: `resolveClusterLabelClassName` returns CSS declaration as className
(api-and-packages critical #2)**
- Spot-checked `packages/graph/src/cosmograph/label-appearance.ts:29-35`:
  confirmed — `HIDDEN_LABEL_STYLE = "display: none;"` (a CSS declaration
  string, not a CSS class name) is returned by `resolveClusterLabelClassName`
  when text is empty/null/undefined.
- The return value is used wherever the caller passes it as a `className` prop.
  In Cosmograph's label API this would set `className="display: none;"` on
  the label element — a no-op visually (no such class exists), meaning empty
  labels are never hidden via this path.
- Verdict: **real bug, accurately described.** Severity is MAJOR not CRITICAL
  (cosmetically broken, not data-loss), but the per-slice agent was right to
  flag it prominently.

**Claim: Evidence worker holds DB connection across NCBI HTTP fetches
(worker-corpus-evidence C1)**
- Spot-checked `apps/worker/app/evidence/runtime.py:53-110`: confirmed —
  `async with ingest_pool.acquire() as connection:` wraps the entire function
  body including `resolve_locators` (NCBI E-utilities) and
  `_fetch_first_available_payload` (PMC BioC HTTP download). Both network
  calls occur with the connection checked out from the pool.
- Verdict: **accurately described and correctly marked CRITICAL.** Under
  wave fanout this will exhaust the asyncpg pool and stall all other
  consumers on the same pool. Fix: acquire connection for DB steps only; do
  HTTP outside the connection context manager.

**Claim: wiki-paths engine builders do not call `encodeWikiSlug`
(api-and-packages critical #3)**
- Spot-checked `packages/api-client/src/shared/wiki-paths.ts:24-50`:
  confirmed — `buildWikiPageEnginePath`, `buildWikiPageBundleEnginePath`,
  `buildWikiPageContextEnginePath` interpolate `slug` raw; client-side
  builders at lines 77-95 DO call `encodeWikiSlug`.
- Verdict: **real, accurately described.** Slugs containing `/`, `?`, or
  unicode will generate malformed engine URLs silently.

---

## 2. Cross-cutting themes

**Theme A — Zero auth / zero rate-limiting at every network boundary
(web-app-routes C1+C2, web-wiki, web-graph-cosmograph bundle endpoint)**
All 9 route handlers and 1 server action are completely open. The pattern is
not an oversight in one slice — it is a global design gap. No middleware,
no per-route check, no `Origin` allowlist, no token bucket anywhere in the
stack. Every slice that has a network boundary inherits this.

**Theme B — DB connection held across async non-DB work
(worker-corpus-evidence C1+C2, worker-ingest C1)**
Two independent slices found the same structural pattern: `acquire()` wraps
work that has nothing to do with the DB (NCBI HTTP, advisory lock while
fetching). Both slices flagged this CRITICAL. This is a pool starvation bug
class, not just a smell.

**Theme C — Adapter boundary declared but violated
(web-graph-cosmograph Major, web-graph-shell "What's solid" contradiction,
api-and-packages Major)**
cosmograph/index.ts declares it is the only `@cosmograph/react` import
surface — cosmograph/ itself breaks this rule in 8+ files (GraphRenderer,
all widgets, hooks). `packages/api-client` declares engine wire types are
internal but leaks all 17 `Engine*` interfaces through `server/index.ts`.
Both represent a vendor-lock-in risk that is one upstream bump away from
cascading failures.

**Theme D — Silent error swallowing across worker and frontend
(worker-ingest C1 half-fix, worker-corpus-evidence M4/M5/M6, web-graph-shell
Minor #5, web-graph-cosmograph Major, web-wiki critical #4)**
The per-slice agents each caught one instance. Cross-slice this is a
systemic observability gap: exception branches in Python are wrapped in
`LOGGER.exception` inconsistently; JS async hooks call `.catch(() => {})`
or suppress rejection silently; no centralized error reporter, no request-id
correlation, no structured logging on any route. There is no telemetry to
know when any of these silent paths fire in production.

**Theme E — Module-scope mutable singletons escaping component lifecycle
(web-graph-cosmograph unbounded widget caches, web-wiki global tween map,
web-graph-shell module-level layout cache, web-graph-shell wiki-route-mirror
subscription, worker-ingest module-level constants)**
Pattern: module scope used as a free variable for state that should be
instance-scoped. In the browser this causes cross-session leaks; in tests it
causes inter-test pollution. Appeared in at least 4 slices independently.

**Theme F — Duplicate error-handling and envelope logic
(api-and-packages Major, web-app-routes M5+M6+M7, worker-corpus-evidence M4)**
Three error envelope shapes exist (server action, wiki routes, entity routes).
Two near-duplicate `getErrorCode` ladders in api-client. Two near-duplicate
JSON parse + 400 blocks in route handlers. The pattern is consistent: each
feature area reinvents its own error handling rather than sharing a single
`toErrorResponse` and a single `parseJsonBody` helper. Net result: three
inconsistent client-side error models that callers must handle separately.

**Theme G — LOC budget violations in backend Python
(worker-ingest: runtime.py 783 LOC, s2.py 998 LOC, pubtator sources 650 LOC;
worker-corpus-evidence: selection_runtime.py 773 LOC, wave_runtime.py 758 LOC,
materialize.py 608 LOC)**
All six largest Python files are in the worker. All exceed the 600-LOC limit.
All mix multiple concerns (orchestration + progress + error handling + cleanup).
The two criticals in worker-ingest (C1, the abort-cleanup hazard) both live
inside the 400-LOC `run_release_ingest` mega-function. Size is not just a
cleanliness concern here — it is directly correlated with the bug surface.

**Theme H — No CI beyond lint/typecheck; zero tests in apps/api
(db-and-infra, api-and-packages, worker-ingest)**
`quality.yml` runs `npm run quality` (lint + typecheck) and `uv sync`. No
Jest invocation, no pytest invocation. `apps/api` has zero tests. `apps/worker`
tests run locally per the README but are not wired into CI. A merge to main
cannot regress the test suite because CI never runs it.

---

## 3. Severity recalibrations

**Downgrade: web-app-routes C3 (missing CSP) — CRITICAL → MAJOR**
CSP absence is a real security gap but the `dangerouslySetInnerHTML` in
`layout.tsx` is a static literal with no interpolation; there is no current
XSS vector. Missing HSTS and COOP/COEP are important for hardening but not
production-blocking in the same way as C1. Correct severity: MAJOR.

**Downgrade: web-graph-cosmograph "direct interpolation of `tableName`"
(Major) — confirm MAJOR, not CRITICAL**
`getLayerTableName` today returns a constant; the path to injection requires
a code change and no current caller bypasses it. Accurately labeled MAJOR;
would be CRITICAL only if a future change wires user input into it. Keep MAJOR.

**Upgrade: worker-ingest C1 (abort cleanup on poisoned connection) — confirm
CRITICAL**
The `except` branches in `runtime.py:415-500` write terminal status to a
connection that may already be in `InFailedSQLTransactionError`. The per-slice
agent correctly marked this CRITICAL. Cross-slice context makes it more severe:
the half-fix already visible in the `CancelledError` branch (`try/except
Exception: LOGGER.exception`) proves this exact failure was already observed.
A run failure can silently fail to record its terminal status. **Keep CRITICAL,
elevated concern.**

**Upgrade: web-wiki critical #4 (stale state after abort) — MAJOR → CRITICAL**
`use-wiki-page-bundle.ts` writes stale backlinks/context into state for the new
slug after navigation. This is a user-visible data correctness bug on any fast
navigation, not a theoretical hazard. Per-slice agent called it CRITICAL —
agreed. Confirmed critical.

**Upgrade: web-wiki critical #3 (module-global tween registry) — MAJOR →
CRITICAL**
`graph-runtime/interactions.ts:27` module-scope tween map + `clearTweens()`
called per-instance teardown means two mounted `WikiGraphView` instances destroy
each other's tweens. Per-slice agent called this CRITICAL. Confirmed — the
acknowledgment of "dual-instance Pixi texture issue" in the same file
(`WikiPanel.tsx:158-166`) confirms the broader multi-instance hazard class is
known but this specific registry was not fixed.

**Downgrade: web-animations C1 (`recolorLottie` deep clone) — CRITICAL →
MAJOR**
Real GC pressure and measurable jank on theme toggle, but this is a
performance issue on a UI loading path, not a data-loss or security issue.
The blast radius is frame drops during loading; no production blocker.
Correct severity: MAJOR.

**Upgrade: api-and-packages "no request timeout on engine HTTP helpers"
(Major) — MAJOR, confirmed elevated**
Combined with the no-AbortSignal gap on wiki.ts fetch calls, a slow/hung
engine backend will block SSR indefinitely. In production this translates to
request queue backup and Next.js worker exhaustion. Keep MAJOR but treat as
near-CRITICAL in production context.

Total recalibrations: **6** (2 downgrades, 4 confirmation/upgrades).

---

## 4. Gaps in the slice partition

**Gap 1 — End-to-end auth flow review [CRITICAL importance]**
No slice owned the user-session boundary because there is none. The question
"what is the auth model?" cannot be answered from any single slice. The cross-
slice answer is: there is no auth model. The `auth` schema is a placeholder
(`db/schema/serve/10_schemas.sql`). `better-auth` is referenced in a comment
but not installed. Until an auth model is decided and implemented, every
production-readiness assessment for any route is conditional.

**Gap 2 — CI / CD pipeline review [HIGH importance]**
`quality.yml` was glanced in db-and-infra but not audited as a subject. The
workflow runs only `npm run quality` — no tests, no build verification, no
deploy gate. This means: (a) no regression protection on merge, (b) Vercel
deploys can ship broken builds if `npm run build` is not in the pipeline, (c)
the Python worker has no CI at all. A dedicated CI-audit would find the missing
test invocations and the absent deploy gate.

**Gap 3 — Dependency security (npm + pyproject CVE scan) [HIGH importance]**
No slice scanned installed package versions for known CVEs. The api-and-packages
slice confirmed pinned versions but did not cross-reference advisories. The
Cosmograph version in use (deep `@cosmograph/cosmograph/internal` path access)
may have known issues. No automated `npm audit` or `uv audit` output was
reviewed.

**Gap 4 — Cross-process observability (worker → api → web trace) [MEDIUM]**
No slice owned the distributed trace. worker-corpus-evidence noted telemetry
gaps (`M4: emit_event has zero observability of itself`), web-app-routes noted
no request-id on route responses, api-and-packages noted no logging
configuration in apps/api. These combine: a failure that starts in the worker
and surfaces as a broken panel in the browser has no traceable correlation ID
across the boundary. No slice could see this because each was scoped to one
process.

**Gap 5 — Build / bundle size analysis [MEDIUM]**
The partition had no slice for build output: Next.js bundle sizes, dynamic
import split effectiveness, DuckDB-WASM binary size contribution, or whether
the Cosmograph vendor chunks are properly split. web-graph-cosmograph
mentioned worker blob injection but no slice measured actual bundle regression.

**Gap 6 — Accessibility [MEDIUM]**
web-graph-shell mentioned WCAG violations on resize handles (Major #5) but
no slice systematically audited keyboard navigation, focus management, ARIA
roles, or color-contrast. The landing page particle field (web-field-runtime)
and the wiki panel (web-wiki) have no accessibility coverage.

**Gap 7 — Data migration / schema drift [LOW-MEDIUM]**
db-and-infra called out the baseline-vs-incremental drift (Critical #2) but
no slice tracked whether apps/worker's SQL matches the current schema. If a
migration adds a column but the worker's SQL uses a hardcoded column list, the
ingest breaks silently. No slice owned the schema-to-code parity check.

---

## 5. Independent additions

**I1. `packages/graph/src/cosmograph/camera-persistence.ts:13` — `STORAGE_KEY`
collision between graph and graph-overlay apps**
`STORAGE_KEY = "solemd:camera"` is a non-configurable constant in a shared
package. Both SoleMD.Graph and SoleMD.Graph-overlay apps share the same origin
in dev (same localhost port) and will stomp each other's camera state on every
session. The per-slice agent flagged this as MINOR; given the cross-project
context (graph-overlay is a parallel branch product) it is MAJOR for that
workflow.

**I2. `apps/web/app/api/evidence/chat/stream.ts` — no deduplication of
`citedCorpusIds`**
`stream.ts:38-51` regex-extracts all `@[NN]` mentions and passes the array to
`searchGraphEvidence` with no dedup. A user typing `@[1] @[1] @[1]` 50 times
inflates the corpus IDs array beyond the intended cap. The cap is on the regex
match count, not unique IDs. Add `[...new Set(matches)]` before passing.

**I3. `apps/web/lib/db/index.ts` — pool never closed on process exit**
The `globalThis.__solemdGraphDb__` singleton is created but `postgres-js`
connections are never explicitly ended. In a long-running Node server, this is
fine as the process exits eventually. In a Vercel Serverless environment,
function instances recycle and never call process.exit cleanly — postgres-js
recommends calling `.end()` in the `beforeExit` or cleanup path. Not wired.

**I4. `apps/worker/app/ingest/writers/s2.py` — `_load_citations` bare
`except Exception` swallows `KeyboardInterrupt` and `SystemExit`**
Lines ~475-484: the bare `except Exception` in the cleanup block is noted in
worker-ingest M4, but the full hazard is that re-acquiring a pool connection
during cancellation (`asyncio.CancelledError` is NOT a subclass of `Exception`
in Python 3.8+, but `KeyboardInterrupt` and `SystemExit` are also not caught
here). The missing case is that a SIGTERM during the cleanup block leaves the
metrics stage row undeleted and the next resume attempt may double-count. Use
`except BaseException` and `asyncio.shield` the DELETE.

**I5. `apps/web/features/graph/cosmograph/widgets/SelectionToolbar.tsx:80-95`
— MutationObserver cleanup is confirmed broken**
Cross-referencing the web-graph-cosmograph report claim: the `discover` helper
returns `() => {}` as cleanup instead of `() => obs.disconnect()`. If the
Cosmograph native button never renders an id-child, the observer runs forever.
The per-slice agent was correct. This is a definite resource leak in error
states.

---

## 6. Risk-ordered top-15 issues

| # | Title | Slice(s) | Why it matters | Fix sketch |
|---|-------|----------|----------------|------------|
| 1 | **No auth model on any route or server action** | web-app-routes C1 | LLM endpoint, entity match, wiki search, and bundle streaming are fully public. Pre-prod blocker. | Decide public-vs-authed; add `middleware.ts` with at minimum a JWT/session check for LLM and POST endpoints. |
| 2 | **No rate limiting on `/api/evidence/chat` and entity POSTs** | web-app-routes C2 | Unbounded LLM calls drain compute budget; one client can DoS the backend. | Add per-IP token bucket (Upstash or Vercel KV middleware) before any public launch. |
| 3 | **Evidence worker holds DB connection across NCBI HTTP** | worker-corpus-evidence C1+C2 | Wave fanout (thousands of `acquire_for_paper`) will exhaust the asyncpg pool and stall all worker consumers. | Move HTTP calls outside `async with pool.acquire()`. |
| 4 | **Abort cleanup writes to poisoned connection in ingest runtime** | worker-ingest C1 | Terminal status silently never persisted on run failure; ingest run appears stuck in non-terminal state. Half-fix already present proves this fired in prod. | Open a fresh pool connection for every cleanup/terminal-status write in `except` branches. |
| 5 | **Wiki stale state written after AbortController fires** | web-wiki critical #4 | Fast slug navigation shows wrong backlinks/context for new page — user-visible data corruption. | Add `if (signal?.aborted) return` before each `setState` in `use-wiki-page-bundle.ts`. |
| 6 | **No CI test invocation; `apps/api` has zero tests** | db-and-infra, api-and-packages, worker-ingest | Merges to main never run the test suite. Worker criticals (C1, C2) have no regression guard. | Add `npm test -- --runInBand` and `pytest` to `quality.yml`; add 3 pytest files for apps/api lifespan + readiness. |
| 7 | **Module-global tween registry destroyed across dual WikiGraph mounts** | web-wiki critical #3 | Two mounted `WikiGraphView` (graph + overlay) destroy each other's hover tweens; teardown of one wipes running tweens of the other. | Move `tweens` Map into per-scene closure returned by `wireNodeInteractions`. |
| 8 | **Lab/preview routes (smoke, loading-preview, field-lab, surface-lab) in prod** | web-app-routes C5 | Debug surfaces with internal progress state exposed publicly. Duplicate `/field-lab = /` splits analytics. | Gate with `if (process.env.NODE_ENV === 'production') notFound()` or build-time strip. |
| 9 | **Engine wire surface leaks through `packages/api-client`** | api-and-packages | 17 `Engine*` interfaces are public API; adapter contract is void. Any engine schema change requires coordinated refactor across consuming code. | Remove `export * from './rag'` from `server/index.ts`; export only mapped DTOs from `shared/`. |
| 10 | **`resolveClusterLabelClassName` returns CSS declaration as className** | api-and-packages | Labels that should be hidden are never hidden — cosmetically broken for empty/null cluster labels in the graph view. | Return a boolean or a proper class name; apply `display:none` style in the consumer. |
| 11 | **No request timeout on engine HTTP helpers; wiki AbortSignal dropped** | api-and-packages | Slow engine backend hangs SSR indefinitely; under load this exhausts Next.js worker slots. | Add default AbortSignal timeout in `getEngineJson`; fix `server/wiki.ts:92-107` to forward signal. |
| 12 | **Error messages from backends leaked to clients** | web-app-routes M5 | Postgres errors, DNS failures, and stack traces can expose schema names and hostnames in 500 responses. | Replace raw `error.message` passthrough with fixed message + server-side log + request_id. |
| 13 | **`s2.py` and `runtime.py` exceed 600-LOC limit; 400-LOC orchestration function** | worker-ingest M1 | Bug density correlates with file size; the abort-cleanup critical (C1) lives inside the mega-function. | Extract `FamilyProgressTracker`, phase helpers, and centralized `_record_terminal` from `run_release_ingest`. |
| 14 | **Missing CSP, HSTS, COOP/COEP in `next.config.ts`** | web-app-routes C3 | XSS, clickjacking (beyond X-Frame-Options), and DuckDB-WASM cross-origin isolation all require explicit headers. | Add `Content-Security-Policy`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy` to `headers()`. |
| 15 | **Wiki-paths engine builders don't URL-encode slug** | api-and-packages critical #3 | Slugs with `/`, `?`, or unicode characters generate malformed engine URLs, producing silent 404s or wrong content. | Call `encodeWikiSlug(slug)` in `buildWikiPageEnginePath`, `buildWikiPageBundleEnginePath`, `buildWikiPageContextEnginePath`. |

---

## 7. Brief verdict on the overall audit quality

**Where the per-slice agents were strong:**
- Security and data-correctness nose was good. Every agent in the worker and
  app-routes slices independently found the auth gap, the connection-across-HTTP
  pattern, and the error-leakage vectors.
- Code-level specificity was high. Most findings include file:line and a
  concrete fix sketch. The api-and-packages and worker-ingest reports are the
  best examples: dense, accurate, actionable.
- The db-and-infra report is unusually thorough: it correctly identified the
  baseline-migration drift risk, the pgbouncer security posture, the role
  separation, and the fillfactor rationale. Strongest single-slice report.

**Where the per-slice agents were weak:**
- No agent connected the auth gap across slices to say "this is a whole-system
  gap, not a per-route issue." Each called it CRITICAL but could not see the
  pattern from its scoped position.
- Severity calibration was inconsistent. `recolorLottie` GC pressure and
  missing CSP both received CRITICAL labels alongside genuinely production-
  blocking issues (unauthenticated LLM, connection pool starvation). This
  dilutes the critical tier.
- Cross-process observability was invisible to every slice. No agent could see
  the end-to-end trace gap because the trace spans multiple scopes.
- The CI gap was mentioned only in passing in db-and-infra and never flagged
  as a standalone critical risk. Not running tests in CI is a meta-bug that
  makes every other issue harder to catch.
- web-field-surfaces and web-styling-css were the weakest reports: fewer
  specifics, less code-level grounding, more descriptive than prescriptive.
  The animations report was mid-tier.

