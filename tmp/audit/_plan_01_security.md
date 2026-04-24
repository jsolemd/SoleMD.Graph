# Plan: Security & Production Readiness

Scope: the Next.js web shell — route handlers, server actions, lab routes,
middleware, response headers, secrets, CSRF, and the production-readiness
gate-set. Authored by the team lead after security-planner failed to spawn;
sources are `tmp/audit/web-app-routes.md` + `tmp/audit/_codex_cross_review.md`.

## 1. Headline summary

- There is no auth model. No `middleware.ts` anywhere. Every route handler,
  the server action, and the bundle file-server are publicly callable. The
  LLM-backed `/api/evidence/chat` is the highest-impact instance.
- There is no rate limit anywhere. `evidence/chat` accepts k≤50 /
  rerank_topn≤200 per request. One attacker drains LLM/compute budget.
- `next.config.ts` ships without CSP or HSTS. A hand-written inline FOUC
  `<script>` in `app/layout.tsx:56-60` blocks a clean CSP.
- Five lab routes are shipped in production with no gate.
- Three different error envelopes leak `error.message` (schema, hostnames,
  stack fragments) to the client.
- No request-id, no structured logging, no audit trail on any endpoint.
- Secrets posture is OK at rest (`.gitignore` covers `.env*`, `.dockerignore`
  covers the same) but no `NEXT_PUBLIC_*` audit gate exists.

**The #1 repo-wide priority** (from the Codex cross-review) is this plan's
Phase A. No other production-readiness work can ship a deploy until auth +
rate limiting + CSP + lab-gate are in place.

---

## 2. Phase order

**Phase A — Network-boundary gate (production-blocking).**
Nothing public-facing deploys until A is done. Ship A1–A5 in one batch.

**Phase B — Error-envelope + body-cap normalization.**
Removes `error.message` leaks, caps all bodies, centralizes JSON parsing.
Blocks `api-packages-planner`'s `apps/api` error envelope, which must mirror
shape. Ships immediately after A.

**Phase C — Observability + request correlation.**
Request-id middleware, structured logger, 4xx/5xx logging. Enables every
downstream debug/triage.

**Phase D — Secrets & build-time hygiene.**
`NEXT_PUBLIC_*` allowlist, CI scan for leaked tokens, `.gitignore` hardening
(coordinate with db-infra-ci-planner).

**Phase E — Release-gate checklist.**
Codify the production gate-set in CI (coordinate with db-infra-ci-planner's
required-status-check list).

---

## 3. Detailed work items

### A1. Introduce `apps/web/middleware.ts` with a central auth + policy gate

- **Severity**: Critical
- **Source**: `web-app-routes.md` C1; `_codex_cross_review.md` §2 Theme A, §6 #1
- **Files to change/create**:
  - CREATE `apps/web/middleware.ts`
  - CREATE `apps/web/lib/auth/session.ts`
  - CREATE `apps/web/lib/auth/policy.ts` (route → policy map)
  - MODIFY `apps/web/app/api/*/route.ts` (add per-route opt-in/opt-out marker)
  - MODIFY `apps/web/app/actions/graph.ts` (gate with same policy helper)
- **Approach**:
  - Install **Better Auth** (the DB already has a placeholder `auth` schema
    per `db-and-infra.md`). Confirm vs alternatives (Clerk, Auth.js) in the
    open question below; Better Auth is the current scaffolded direction.
  - Cookie session with `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`
    for state-changing routes); rotate on sensitive actions.
  - `middleware.ts` runs on every request. It:
    1. Short-circuits static assets and `/graph-bundles/*` to its own policy
       (see A1b).
    2. Loads a session from cookie; attaches `x-request-id` (A1 dep on C1).
    3. Consults `lib/auth/policy.ts` — a static map `{pathname → 'public' | 'authed' | 'signed-bundle'}`.
    4. For `authed` without session → 401 JSON envelope.
    5. For `public` → pass through.
    6. Sets `request.headers.set('x-user-id', …)` for downstream handlers.
  - Policy map must enumerate every route explicitly. Default-deny: any
    route not in the map → 404 (fails closed — this is what catches a new
    route author forgetting the gate).
- **A1b. Bundle route policy**: `graph-bundles/[checksum]/[asset]` stays
  `public` short-term (content-addressed cache-forever). Longer-term move
  to `signed-bundle` (short-lived HMAC-signed URL) — track as open question.
- **Open question for the lead**:
  - Better Auth vs Auth.js vs Clerk — confirm Better Auth.
  - Public vs private for `wiki/*` GETs — product decision.
  - `graph-bundles` signed URLs or keep content-addressed public.
- **Effort**: L (3–5 days incl. session model + Better Auth wiring + policy)
- **Dependencies**:
  - Blocks: B3 (error envelope must include 401 shape), C1 (request-id), E1
  - Blocked by: none — this is the gate
  - Cross-team: `api-packages-planner` C1 (`apps/api` auth middleware must
    accept the same session token / service-to-service header)

### A2. Token-bucket rate limiting on expensive POSTs

- **Severity**: Critical
- **Source**: `web-app-routes.md` C2; `_codex_cross_review.md` §2 Theme A
- **Files to change/create**:
  - CREATE `apps/web/lib/rate-limit/bucket.ts`
  - MODIFY `apps/web/middleware.ts` (wire bucket check after auth)
  - MODIFY `apps/web/app/api/evidence/chat/route.ts`
  - MODIFY `apps/web/app/api/entities/{match,overlay,detail}/route.ts`
  - MODIFY `apps/web/app/api/graph/attach-points/route.ts`
- **Approach**:
  - State lives in **Redis** (already deployed for the worker per
    `runtime-infrastructure.md`). Use a Lua script for atomic token-bucket
    (`CL.THROTTLE` from `redis-cell` if available, else hand-rolled Lua).
  - Buckets per `(policy, user_id || client_ip)`:
    - `chat`: 20 req / 10 min, burst 5 (LLM cost)
    - `entities`: 120 req / min, burst 20 (engine cost)
    - `attach-points`: 60 req / min, burst 10 (blob fetcher)
    - `wiki-search`: 300 req / min, burst 50 (cheap but easy DoS amplifier)
  - 429 response: include `Retry-After` and the existing `retry_after`
    envelope field (already used by wiki routes per M6).
  - Middleware sets `x-rate-limit-remaining` header for the client.
- **Open question**: per-IP vs per-session bucketing for unauthenticated
  routes. Default to IP with X-Forwarded-For trust boundary at Vercel.
- **Effort**: M (1–2 days)
- **Dependencies**:
  - Blocked by: A1 (needs user_id from session), C1 (request-id for logs)
  - Cross-team: `frontend-runtime-planner` — the retry-aware UI toast for
    429 responses (they flagged this in §4)

### A3. Strip lab routes from production builds

- **Severity**: Critical
- **Source**: `web-app-routes.md` C5, m5, m6
- **Files to change**:
  - MODIFY `apps/web/app/smoke/page.tsx`
  - MODIFY `apps/web/app/loading-preview/page.tsx`
  - MODIFY `apps/web/app/surface-lab/page.tsx`
  - MODIFY `apps/web/app/field-lab/page.tsx` (delete — duplicate of `/`)
  - MODIFY `apps/web/app/ambient-field-lab/page.tsx` (move redirect to `next.config.ts redirects()`)
  - MODIFY `apps/web/next.config.ts` (add redirects + optional route group)
- **Approach**:
  - Wrap each lab `page.tsx` with `if (process.env.NODE_ENV === 'production') notFound()`.
  - Delete `/field-lab` (verbatim duplicate of `/`).
  - Move `/ambient-field-lab → /field-lab` redirect into `next.config.ts`.
  - Alternative (cleaner): group all labs under `app/(labs)/` and gate the
    entire segment via `(labs)/layout.tsx` — decide during implementation.
  - CI enforcement: db-infra-ci-planner adds a test that `pnpm build` in
    production mode returns 404 for each lab path.
- **Effort**: S (half day)
- **Dependencies**:
  - Cross-team: `db-infra-ci-planner` C3 (production-build lab-route test)

### A4. CSP + HSTS + COOP/COEP in `next.config.ts`

- **Severity**: Major (demoted from Critical per Codex §3 recalibration —
  CSP is a defense-in-depth gate, not a first-line gap when auth + rate
  limit land)
- **Source**: `web-app-routes.md` C3; `_codex_cross_review.md` §3
- **Files to change**:
  - MODIFY `apps/web/next.config.ts` (headers)
  - MODIFY `apps/web/app/layout.tsx` (replace inline `<script>` with nonce-able
    `<Script strategy="beforeInteractive" />` OR delete — Mantine
    `ColorSchemeScript` overlaps per m4)
  - CREATE `apps/web/app/layout-fouc.ts` (if kept as separate module)
- **Approach**:
  - Ship CSP in **report-only mode first** for two deploys; then enforce.
    This is what the frontend-runtime-planner asked for in §4 so the Field
    readiness handshake doesn't break silently.
  - Policy baseline:
    ```
    default-src 'self';
    script-src 'self' 'nonce-{nonce}';
    style-src 'self' 'unsafe-inline';  // Mantine inline styles; tighten later
    img-src 'self' blob: data:;
    worker-src 'self' blob:;           // DuckDB-WASM
    connect-src 'self' <engine-origin>;
    frame-ancestors 'none';
    ```
  - HSTS: `max-age=31536000; includeSubDomains; preload` (after DNS
    confirmation).
  - COOP=`same-origin`, COEP=`require-corp` — DuckDB-WASM threading benefits.
    Verify Cosmograph and Lottie assets serve with CORP.
  - Inline FOUC script: pick one of Mantine `ColorSchemeScript`, the inline
    script, and `DarkClassSync` (per m4 — they triplicate). Delete the other
    two. Then the remaining one takes a nonce injected via middleware.
- **Open question**: do we keep `'unsafe-inline'` for styles or migrate
  Mantine to nonce'd styles? Start with unsafe-inline; harden later.
- **Effort**: M (1–2 days incl. report-only tuning)
- **Dependencies**:
  - Blocked by: A1 (middleware generates the nonce)
  - Cross-team: `frontend-runtime-planner` §4 (FieldScene readiness
    handshake — they've flagged this as a known affect)

### A5. CSRF hardening

- **Severity**: Major (becomes Critical the moment A1 lands cookie sessions)
- **Source**: `web-app-routes.md` C4
- **Files to change**:
  - MODIFY `apps/web/middleware.ts` (add Origin + Sec-Fetch-Site check)
- **Approach**:
  - For state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`):
    - Require `Origin` header to match one of the allowlist (site origin).
    - Require `Sec-Fetch-Site: same-origin` OR `same-site`.
    - Reject otherwise with 403.
  - Double-submit CSRF tokens NOT required if `SameSite=Lax` cookies are
    used and Origin check is strict — document the contract.
- **Open question**: third-party embeds allowed? Default no.
- **Effort**: S (half day, inside A1)
- **Dependencies**: A1

### B1. Centralize JSON body parsing

- **Severity**: Major
- **Source**: `web-app-routes.md` M7, M8, M9
- **Files to change**:
  - CREATE `apps/web/app/api/_lib/parse-body.ts` (promote + generalize
    `entities/_lib.ts`'s existing pattern)
  - MODIFY `apps/web/app/api/evidence/chat/route.ts`
  - MODIFY `apps/web/app/api/graph/attach-points/route.ts`
  - MODIFY `apps/web/app/api/entities/_lib.ts` (use new module, keep the
    existing 64KB default)
- **Approach**:
  - `parseJsonBody<T>(request, schema: ZodSchema<T>, opts?: { maxBytes?: number })`:
    - Content-Length pre-check → 413 before JSON.parse.
    - UTF-8 byte-length second check (per `entities/_lib.ts` pattern).
    - Zod parse → 400 with field-level errors (no `error.message` echo).
  - Default `maxBytes = 64 * 1024`. `attach-points` can set 256KB explicitly
    (Zod already caps at 1000 refs, but cap the raw body too).
  - Move `evidence/chat` `@[NN]` mention cap inside Zod schema: `z.array(z.number().int().nonnegative()).max(50)`.
- **Effort**: S (half day)
- **Dependencies**: blocks B2 (error envelope uses same shape)

### B2. One `ErrorResponse` type, one `toErrorResponse()` helper

- **Severity**: Major
- **Source**: `web-app-routes.md` M5, M6; `_codex_cross_review.md` §2 Theme F
- **Files to change**:
  - CREATE `apps/web/app/api/_lib/error-response.ts`
  - MODIFY `apps/web/app/api/wiki/_lib.ts` (delete local envelope)
  - MODIFY `apps/web/app/api/entities/_lib.ts` (delete
    `toGraphEntityErrorResponse`)
  - MODIFY `apps/web/app/api/evidence/chat/route.ts` (catch → shared)
  - MODIFY `apps/web/app/api/graph/attach-points/route.ts` (catch → shared)
  - MODIFY `apps/web/app/actions/graph.ts` (align server-action shape)
- **Approach**:
  - Envelope shape — shared with `apps/api` (cross-team contract):
    ```ts
    type ErrorResponse = {
      error_code: string;     // snake_case enum, stable across API
      error_message: string;  // human-safe, no stack/schema/hostname
      request_id: string;     // A1/C1
      retry_after?: number;   // seconds, for 429 + 503
      detail?: Record<string, unknown>;  // field errors for 400
    };
    ```
  - `toErrorResponse(err, requestId, route)`:
    - Known class → map (`EngineApiError`, `GraphEntityError`, `ZodError`).
    - Unknown → `{ error_code: 'internal_error', error_message: 'Internal server error' }`;
      log full error server-side with `request_id`.
  - **Never** echo `error.message` from a generic `Error`. Per-slice audit
    confirmed three current sinks.
- **Cross-team**: `api-packages-planner` C1 uses the same shape on the
  FastAPI side. The api-packages plan is the authority on the
  `error_code` enum; this web module imports it.
- **Effort**: S (half day after B1)
- **Dependencies**: B1; blocks C1

### B3. Validate `graph_release_id` shape + allowlist

- **Severity**: Major
- **Source**: `web-app-routes.md` M10; `web-graph-cosmograph.md` (bundleChecksum)
- **Files to change**:
  - MODIFY `apps/web/app/api/wiki/_lib.ts`
  - MODIFY `apps/web/app/graph-bundles/[checksum]/[asset]/route.ts`
- **Approach**:
  - Add `isValidGraphReleaseId(s: string): boolean` — UUID or
    `^[a-z0-9-]{8,64}$`. Reject early at every entry point.
  - `bundleChecksum` regex: `^[a-f0-9]{64}$` (SHA-256 hex). Reject at the
    route boundary BEFORE handing to `resolvePublishedGraphBundleAsset`.
  - Asset name allowlist: `.json`, `.parquet` only. Reject absolute paths,
    path traversal (`..`), NUL bytes explicitly even if resolver does.
- **Effort**: S
- **Dependencies**: none; can ship in A-batch

### C1. Request-id middleware + structured logging

- **Severity**: Major
- **Source**: `web-app-routes.md` "Production readiness" #9, #10;
  `_codex_cross_review.md` §2 Theme D
- **Files to change**:
  - MODIFY `apps/web/middleware.ts` (generate + attach `x-request-id`)
  - CREATE `apps/web/lib/log/logger.ts` (thin pino wrapper; JSON to stdout)
  - MODIFY every route handler (wrap with `withRequestId` that logs 4xx/5xx)
- **Approach**:
  - Generate `x-request-id` (ULID) in middleware if absent.
  - Set on request headers (downstream) and response headers.
  - Logger logs `{ request_id, route, method, status, duration_ms, user_id? }`.
  - Integrates with `toErrorResponse` so logged server-side detail is not
    echoed client-side.
  - **Do not log**: request/response bodies, user-content, auth tokens.
- **Effort**: M (1 day)
- **Dependencies**: A1, B2

### D1. Secrets audit at build + `NEXT_PUBLIC_*` allowlist

- **Severity**: Major
- **Source**: inferred from `web-app-routes.md` Prod readiness #5 + cross-review
- **Files to change**:
  - CREATE `apps/web/lib/env.ts` (Zod-validated env at boot)
  - CREATE `apps/web/scripts/check-public-env.ts` (CI script)
  - MODIFY `.github/workflows/quality.yml` (add public-env check step)
- **Approach**:
  - `lib/env.ts` parses `process.env` against a Zod schema at module import;
    throws loudly on missing. Split `server` and `client` schemas so a
    server-only key can never be imported client-side.
  - `check-public-env.ts`: grep client bundle for any env var starting with
    `NEXT_PUBLIC_` that isn't in the explicit allowlist. CI fails on new ones.
  - Cross-team: db-infra-ci-planner runs this in CI.
- **Effort**: S
- **Dependencies**: none

### D2. `.gitignore` defense-in-depth

- **Severity**: Minor (already solid per `db-and-infra.md`)
- **Source**: `db-and-infra.md` verdict
- **Files to change**: `.gitignore`
- **Approach**: Add `*.key`, `*.pem`, `*.p12`, `*.pfx`, `id_rsa*`, `*.credential`.
- **Effort**: Trivial
- **Dependencies**: Owned by `db-infra-ci-planner` — cross-linked here.

### E1. Production release-gate

- **Severity**: Process
- **Source**: synthesizes A1–D1
- **Files**:
  - CREATE `.github/workflows/release-gate.yml`
  - MODIFY branch-protection on `main`
- **Approach**: see §5 checklist; owned jointly with db-infra-ci-planner.

---

## 4. Cross-team handoffs

**→ `api-packages-planner`:**
- B2 `ErrorResponse` shape is the canonical envelope — their C1 FastAPI
  `EngineErrorPayload` must match byte-for-byte (field names: `error_code`,
  `error_message`, `request_id`, `retry_after`, `detail`).
- Their `ErrorCode(StrEnum)` is the source of truth for the `error_code`
  string set; web imports it (via `packages/api-client` if appropriate).
- A1 auth boundary: whatever header shape the web middleware injects for
  service-to-service calls into `apps/api` must be consumed by their auth
  middleware.

**→ `db-infra-ci-planner`:**
- A3: add a CI test that production-mode `next build` returns 404 for every
  lab path.
- A4: add a CI header-assert that CSP + HSTS + COOP/COEP are present in
  `next start` output.
- D1: run `check-public-env.ts` in every CI pipeline.
- D2: the `.gitignore` hardening list in D2 is the same as their secrets
  defense-in-depth — they own the edit.
- E1: the required-status-check set must include the auth/policy test, the
  rate-limit integration test, the header-assert test, and the public-env
  check.

**→ `frontend-runtime-planner`:**
- A2: they need a 429 retry-aware toast/banner (they already flagged this
  in their §4).
- A4 CSP nonce: the FieldScene readiness handshake depends on an inline
  script path — report-only first lets them catch regressions without
  breaking prod; they must migrate before we switch to enforce.
- A4 FOUC script consolidation (m3/m4): frontend-runtime owns the
  consolidation of `ColorSchemeScript` vs inline vs `DarkClassSync`. This
  plan requires exactly one of them to remain.
- B3 `bundleChecksum` regex: they rely on the format; they should define
  the regex constant in `packages/graph` and we import it.

**→ `worker-planner`:**
- No direct handoff except the shared `ErrorCode` enum (B2): if worker
  errors ever cross the web boundary (via `apps/api`), codes must align.

---

## 5. Production readiness checklist

Ship-blockers (must pass before any public deploy):

- [ ] `apps/web/middleware.ts` exists and enforces the policy map (A1)
- [ ] Policy map default-denies unknown routes (A1)
- [ ] Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, signed (A1)
- [ ] Rate limiter active on `chat`, `entities/*`, `attach-points`,
      `wiki/search` (A2)
- [ ] 429 responses include `Retry-After` + envelope `retry_after` (A2)
- [ ] `/smoke`, `/loading-preview`, `/surface-lab`, `/field-lab`,
      `/ambient-field-lab` return 404 in production builds (A3)
- [ ] CSP `Content-Security-Policy-Report-Only` present (A4 phase 1)
- [ ] HSTS header present (A4)
- [ ] COOP + COEP headers present (A4)
- [ ] X-Frame-Options: DENY or frame-ancestors 'none' (already set)
- [ ] No inline `<script>` without nonce (A4)
- [ ] CSRF: Origin check on all state-changing methods (A5)
- [ ] Every 4xx/5xx response has `request_id` (C1)
- [ ] `toErrorResponse` used by every handler — no `error.message` echo (B2)
- [ ] Every POST path has body-size cap before parse (B1)
- [ ] `graph_release_id` + `bundleChecksum` regex-validated at entry (B3)
- [ ] `lib/env.ts` validates env at boot; missing required var = boot fail (D1)
- [ ] `NEXT_PUBLIC_*` allowlist enforced in CI (D1)
- [ ] `.gitignore` covers keys/certs/credentials (D2)
- [ ] Postgres pool has `statement_timeout`, `idle_in_transaction_session_timeout`,
      `application_name`, SSL per env (M3 — coordinate with
      db-infra-ci-planner)

Nice-to-have before deploy:

- [ ] CSP switched from Report-Only to enforce after two deploys
- [ ] Bundle route migrated to signed URLs (if any future non-public data)
- [ ] Pino logs shipped to an aggregator (Vercel logs, Datadog, etc.)
- [ ] Public auth flow end-to-end test in CI

---

## 6. Open questions for the lead

1. **Auth library**: Better Auth (scaffolded) vs Auth.js vs Clerk. Default:
   Better Auth — confirm.
2. **Public product posture**: `wiki/*` GETs — intended public, or behind
   auth? Affects the policy map shape.
3. **Lab routes**: delete (preferred) vs ship behind an env flag (lets us
   demo internally). Default: delete `/field-lab`; gate the others.
4. **CSP strictness**: start with `'unsafe-inline'` for styles and harden
   later vs nonce Mantine styles up front. Default: start permissive.
5. **Bundle URLs**: keep content-addressed public vs HMAC-signed. Default:
   content-addressed short-term; signed if we introduce non-public bundles.
6. **Rate-limit store**: Redis (preferred, already running) vs Vercel KV vs
   Upstash. Default: shared Redis instance.
7. **Service-to-service auth**: `apps/web` → `apps/api` — static bearer vs
   mTLS vs signed JWT. Default: static bearer in `Authorization` header,
   rotate via env.
8. **Origin allowlist**: own domain only vs explicit list for future embeds.
   Default: own domain only.
