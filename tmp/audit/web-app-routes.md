# Audit: web-app-routes

Slice scope: `apps/web/app/`, `apps/web/lib/`, `next.config.ts`, `drizzle.config.ts`.

## Slice inventory

App Router pages / segments:
- `app/layout.tsx` — root html/body, fonts, ColorSchemeScript + inline FOUC script
- `app/page.tsx` — `/` server page → `FieldLandingRoute` (uses `connection()`)
- `app/providers.tsx` — `"use client"` Mantine provider + DOM observers
- `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` — segment surfaces
- `app/graph/page.tsx` + `app/graph/loading.tsx` — `/graph` workspace
- `app/smoke/page.tsx` — animation smoke gallery (lab)
- `app/loading-preview/page.tsx` — loading-preview lab with Slider/Switch
- `app/ambient-field-lab/page.tsx` — `redirect("/field-lab")` (legacy alias)
- `app/field-lab/page.tsx` — duplicate of `/` (`FieldLandingRoute`)
- `app/surface-lab/page.tsx` — surface-lab inventory page
- `app/_components/RouteStatusSurface.tsx` — error/404 surface primitive
- `app/shell/bind-shell-state-classes.ts` — body class binder
- `app/shell/bind-dom-state-observers.ts` — `[data-observe]` IO binder

Server actions:
- `app/actions/graph.ts` — `getGraphRagQuery(input)` server action

Route handlers (network boundary):
- `app/api/wiki/_lib.ts` — slug + graph_release_id helpers, `EngineApiError` mapper
- `app/api/wiki/pages/[...slug]/route.ts` — GET wiki page
- `app/api/wiki/backlinks/[...slug]/route.ts` — GET backlinks
- `app/api/wiki/context/[...slug]/route.ts` — GET context
- `app/api/wiki/page-bundle/[...slug]/route.ts` — GET bundle
- `app/api/wiki/graph/route.ts` — GET wiki graph
- `app/api/wiki/search/route.ts` — GET search
- `app/api/entities/_lib.ts` — POST handler factory + 64KB body cap
- `app/api/entities/match/route.ts`, `.../overlay/route.ts`, `.../detail/route.ts` — POST
- `app/api/graph/attach-points/route.ts` — POST (Zod, octet-stream response)
- `app/api/evidence/chat/route.ts` + `stream.ts` — POST UI message stream (RAG)
- `app/graph-bundles/[checksum]/[asset]/route.ts` — GET/HEAD parquet/json with Range

Library:
- `lib/db/index.ts` — single Drizzle/postgres-js client, lazy Proxy, dev HMR singleton
- `lib/db/schema.ts` — `solemd.graph_runs` only
- `lib/density.ts`, `lib/helpers.ts`, `lib/mantine-theme.ts`
- `lib/motion.ts`, `lib/motion3d.ts`, `lib/gsap.ts`, `lib/pastel-tokens.ts`

Config: `next.config.ts` (security headers, dual webpack/turbopack alias),
`drizzle.config.ts` (postgres dialect, throws on missing `DATABASE_URL`).

---

## Critical issues

### C1. No authentication or authorization on any route (network boundary)
Every route handler and the server action are reachable unauthenticated. They
all proxy a backend "engine" / search service or directly serve filesystem
artifacts. There is no per-route auth gate, no session check, and no
`middleware.ts` in scope.

- `app/api/evidence/chat/route.ts:8` — POST RAG chat (LLM-backed, expensive)
- `app/api/entities/{match,overlay,detail}/route.ts` — POST entity ops
- `app/api/wiki/{search,graph,pages,backlinks,context,page-bundle}/...` — all GETs
- `app/api/graph/attach-points/route.ts:15` — POST blob fetcher
- `app/actions/graph.ts:14` — server action `getGraphRagQuery`
- `app/graph-bundles/[checksum]/[asset]/route.ts:150` — public file streaming
  (the per-checksum URL space is large but checksums are not unguessable
  capabilities and `bundleChecksum` leaks via any wiki/graph response).

If the product is intentionally public read-only this needs to be stated; even
then, `evidence/chat` (LLM) and POST endpoints absolutely need at least a rate
limiter + bot gate. There is no gate of any kind.

### C2. No rate limiting on expensive POST endpoints
`/api/evidence/chat` triggers RAG + LLM generation per request and accepts
batches up to k=50, rerank_topn=200 (`stream.ts:31-33`). No throttle, IP
bucket, or per-session cap. A single client can drain compute and budget. Same
applies to `/api/entities/*` and `/api/graph/attach-points`. Body-size caps
exist (entities 64KB, attach-points implicit Zod array max 1000) but request
rate is unbounded.

### C3. `Content-Security-Policy` and `Strict-Transport-Security` are not set
`next.config.ts:26-44` sets X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control. Missing for
production:
- `Content-Security-Policy` (or `Content-Security-Policy-Report-Only`)
- `Strict-Transport-Security`
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` (DuckDB-WASM
  threading benefits from COOP+COEP if used)

There is also `dangerouslySetInnerHTML` in `app/layout.tsx:56-60`. The
content is a static literal with no interpolation so it is XSS-safe today,
but a CSP with `'unsafe-inline'` would be required to keep this script
working — that needs a deliberate decision (script nonce, hash, or move into
`<Script strategy="beforeInteractive" />`).

### C4. CSRF: state-changing endpoints rely on nothing
All POST routes are CORS-default and accept JSON without an Origin / Sec-Fetch
check or CSRF token. Combined with missing auth (C1), this is academic, but
once any session cookie ships the same handlers become CSRF-targets. There is
no `Origin` allowlist, no `SameSite` cookie strategy declared in this slice,
and no CORS configuration in `next.config.ts` — Next defaults rely on
same-origin only via the browser's preflight on non-simple requests.

### C5. Lab routes shipped with no environment gate
`/smoke`, `/loading-preview`, `/ambient-field-lab`, `/field-lab`,
`/surface-lab` are all built into the prod bundle. They are functional debug
surfaces (e.g. `loading-preview` exposes internal `GraphBundleLoadProgress`
stages and toggles). At minimum they should be:
- gated behind `process.env.NODE_ENV !== 'production'` with `notFound()`, or
- moved to a route group + `not-found.tsx` shadow, or
- stripped at build via `generateStaticParams` returning none.

`field-lab` is verbatim duplicate of the home page (`app/page.tsx` and
`app/field-lab/page.tsx` are identical) — this leaks parallel surface URLs
with no purpose. `ambient-field-lab` only redirects to `/field-lab` so the
chain is `/ambient-field-lab → /field-lab → (same as /)`.

---

## Major issues

### M1. `bind-dom-state-observers.ts` only sees nodes present at first paint
`app/shell/bind-dom-state-observers.ts:24` calls
`document.querySelectorAll("[data-observe]")` exactly once during the
provider effect. Any `[data-observe]` element added later (route navigation,
client-only components mounted after providers) is never observed. For a
client-side router that swaps subtrees, this silently breaks. Either:
- attach a `MutationObserver` for the `[data-observe]` attribute, or
- do per-component registration via a shared store / context.

### M2. `bind-shell-state-classes.ts` runs scroll/resize listeners with no rAF throttle on the hot path
`syncScrollState` runs synchronously inside the scroll listener at
`bind-shell-state-classes.ts:91-96` and writes 5+ class toggles per scroll
event. Only `syncChromePill` is rAF-batched. On long pages with the WebGL
graph behind, this contends with paint. Wrap `syncScrollState` in the same
rAF guard or compute changes off the listener.

### M3. Dev/prod parity hazard: `lib/db/index.ts` mutates `globalThis`
`lib/db/index.ts:11-32` keeps Drizzle pool on `globalThis.__solemdGraphDb__`
to survive Next dev HMR. The `max: 10, idle_timeout: 20` settings are not
production-tuned (no SSL, no statement timeout, no application_name). If this
client is reused in prod, set:
- `ssl` per env
- `statement_timeout`, `idle_in_transaction_session_timeout`
- distinct `application_name`
- pool size aligned with serverless vs node runtime

Also: route handlers in this slice never call `db` directly; only
`fetchActiveGraphBundle` does (out of slice). The Proxy is fine, but document
that the only consumer is server-side bundle resolution.

### M4. `app/graph-bundles/[checksum]/[asset]/route.ts` does no checksum/asset validation in the handler
The route trusts `resolvePublishedGraphBundleAsset` (out of slice) to reject
path traversal. The handler passes raw `checksum` and `asset` strings from URL
params straight to the resolver and then to `createReadStream`. Need to
verify that resolver:
- normalizes and rejects `..`, absolute paths, NUL bytes
- restricts asset name to a known suffix set (`.json`, `.parquet`)
- returns null for unknown checksums

The `Cache-Control: public, max-age=31536000, immutable` (line 73) is correct
for content-addressed assets, but combined with no auth (C1) anyone with the
checksum can pull entire bundles forever. If bundles ever contain
non-public data, the immutable public cache is wrong.

### M5. Error responses leak `error.message` from arbitrary backends
- `app/api/wiki/_lib.ts:60-65` — falls through to `error.message` for any
  non-EngineApiError exception with status 500.
- `app/api/graph/attach-points/route.ts:65-69` — same pattern.
- `app/api/evidence/chat/route.ts:31-41` — surfaces `error.message` as a 400.

Postgres / drizzle errors, fetch DNS errors, and stack-trace-bearing strings
can leak schema names, hostnames, and query fragments to the client. Replace
with a fixed message + server-side log + `request_id` correlation.

### M6. Server action returns ad-hoc envelope; route handlers return another
`app/actions/graph.ts:18-27` returns `{ ok, data | error }`. Wiki routes
return `{ error, error_code, request_id, retry_after }`. Entities routes
return `toGraphEntityErrorResponse(error)` (different shape, `errorCode`
camelCase + `status` field). Three different error envelopes for one app.
Centralize via a single `ErrorResponse` type in `app/api/_lib/` (does not
exist yet — `_lib` files live per-feature).

### M7. JSON parsing is duplicated across handlers
Five separate POST handlers each do their own `await request.json() / catch /
respond 400` (`attach-points/route.ts:18-27`, `evidence/chat/route.ts:8-20`,
plus the shared `entities/_lib.ts:30-46`). Lift a single
`parseJsonBody(request, schema)` helper in `app/api/_lib/`. The entities
helper already exists — the others should reuse it (and gain its 64KB cap).

### M8. `attach-points` has no body-size cap before parse
`app/api/graph/attach-points/route.ts:18` calls `request.json()` directly. A
client posting a multi-MB JSON body forces full-buffer parse before the Zod
limit (`graph_paper_refs.max(1000)`) catches it. Mirror the
`ENTITY_ROUTE_MAX_BODY_BYTES` content-length pre-check.

### M9. `evidence/chat` extracts `@[NN]` corpus IDs with no upper bound
`stream.ts:38-51` parses every `@\[(\d+)\]` mention in user text into
`citedCorpusIds` and forwards them to `searchGraphEvidence`. There is no cap
on count or value range. A user can paste tens of thousands of mentions and
push them through to the engine. Cap to e.g. 50 unique IDs and validate
non-negative bounds.

### M10. Wiki GETs do not validate `graph_release_id` shape
`app/api/wiki/_lib.ts:31-42` only requires non-empty. The id flows into
backend calls verbatim. If the backend trusts the shape (e.g. for cache
keys), an attacker can pollute caches with arbitrary strings or path-like
values. Add a UUID / `^[a-z0-9-]{8,64}$` regex check.

### M11. `app/page.tsx` and `app/graph/page.tsx` await `connection()` then
fetch the bundle serially (`page.tsx:6-8`, `graph/page.tsx:6-8`). Today
that's one fetch so there's no waterfall, but if a second resource is added
the pattern invites serial awaits. Note for /clean: prefer `Promise.all` once
a second source lands.

### M12. `not-found.tsx` does a top-level `fetch("/animations/_assets/...")`
into a module-scope `cached` promise (`not-found.tsx:14-25`). Module-scope
caches in client components are per-bundle, not per-user, so this is fine,
but the cache lives forever and never refreshes. Acceptable for a static
asset, but document it; otherwise a future asset rev gets pinned.

---

## Minor issues

### m1. `app/loading.tsx` is `"use client"` but only renders a styled div
`app/loading.tsx:1-10` does not need the client boundary. Drop `"use client"`
to keep this static.

### m2. `app/error.tsx` must be a client component (Next contract) — that's correct, no change.

### m3. Inline `<script>` in `app/layout.tsx:56-60`
Duplicates work `ColorSchemeScript` already does for Mantine. The intent
("toggle .dark before paint") could be folded into a Mantine
`forceColorScheme` setup or moved to a colocated `theme-fouc.ts` module
loaded via `<Script strategy="beforeInteractive" />` so a future CSP can
nonce it without inline-script exemptions.

### m4. `app/providers.tsx` mounts two effects that bind/unbind on every render-cycle of providers
The two effect deps arrays are empty so the bindings only run once — fine.
But `DarkClassSync` overlaps with the inline script in `layout.tsx`: both
toggle `.dark` on `<html>`. Pick one (Mantine source-of-truth or inline) and
delete the other.

### m5. `app/ambient-field-lab/page.tsx` is a one-line redirect
A `next.config.ts` `redirects()` entry is faster than rendering a server
component just to call `redirect()`. Move it.

### m6. `app/field-lab/page.tsx` duplicates `app/page.tsx` exactly
Either alias via redirect or delete one. As-is, two URLs render the same
landing route, splitting analytics and SEO.

### m7. `app/api/wiki/backlinks/[...slug]/route.ts` does not import the shared
`WikiSlugRouteContext` type and re-declares it inline (lines 5-9). Use the
shared type for parity with the other wiki routes.

### m8. `app/api/wiki/search/route.ts` clamps `limit` (1..100) but silently
coerces NaN to 20. Distinguish "missing" from "invalid" — for invalid, a
400 is more honest than a silent default.

### m9. `evidence/chat/stream.ts` regex `AT_MENTION_PATTERN` is module-scope
and uses the `g` flag. `matchAll` is safe with global flag (no `lastIndex`
state), so this is fine — but flag the pattern for future maintainers.

### m10. `lib/density.ts` exports two parallel const records (`*_BASE_PX`
and the densityPx-scaled mirror) for every group. That is six near-duplicate
objects (~190 lines). A single `densityScale(BASE)` helper that returns the
scaled record would halve the surface and remove the "did you remember to
add it to both?" footgun.

### m11. `lib/helpers.ts:1-9` `formatBytes` rounds at 1 decimal for
KB and above with no thousands grouping; `formatNumber` exists right below.
Fine, but unify to one number formatter that knows units.

### m12. `lib/db/schema.ts` only declares `graph_runs`. Drizzle config points
at this file (`drizzle.config.ts:11`). If this is the source of truth for
migrations, the rest of the `solemd.*` schema is unmanaged from this app —
intentional? Document.

### m13. `lib/gsap.ts` "cache" is a no-op
`getGsap()` returns the same default-imported singleton on every call; the
`cached` variable adds a branch but no value (`lib/gsap.ts:18-23`). Either
delete the indirection or actually do plugin registration once.

### m14. `lib/motion3d.ts` is well-documented but currently exports four
constants used by code outside this slice — no issue, just noting it's
consumed externally.

---

## Production readiness

Blockers before a public production deploy:

1. **Auth model** — decide and implement public-vs-authed for every route
   handler and server action. Today every endpoint is open. (C1)
2. **Rate limiting** — add at minimum:
   - Per-IP token bucket on `/api/evidence/chat` (LLM cost) and
     `/api/entities/*` (engine cost).
   - Per-IP cap on `/api/graph/attach-points` (large blob fetcher).
   - Bucket on `/api/wiki/search` (cheap but easily DoS-amplified).
   (C2)
3. **CSP + HSTS + COOP/COEP** — set in `next.config.ts headers()` with a
   nonce strategy that lets the FOUC inline script keep working, OR remove
   the inline script. (C3)
4. **Lab route gating** — `/smoke`, `/loading-preview`, `/surface-lab`,
   `/field-lab`, `/ambient-field-lab` should not exist in prod. Wrap with
   `if (process.env.NODE_ENV === 'production') notFound()` or build-time
   strip. (C5)
5. **Error envelope normalization** — single `ErrorResponse` type, single
   `toErrorResponse(error)` helper, never echo raw `error.message`. (M5,
   M6)
6. **Body-size caps everywhere** — apply the entities `_lib` 64KB pre-check
   to `attach-points` and `evidence/chat`. (M8)
7. **`graph_release_id` validation** — UUID/regex check at every entry point
   that takes one. (M10)
8. **Postgres pool tuning** — review `lib/db/index.ts` for SSL,
   `statement_timeout`, `application_name`, and pool size for the prod
   deployment shape (serverless vs node). (M3)
9. **Logging / request correlation** — no logger is wired in this slice. At
   minimum, log every 4xx/5xx with `request_id`, route, and bounded
   payload metadata. None of the handlers emit any audit log.
10. **Observability** — add a request-id header on every response (the wiki
    error mapper already references it but never sets one on success
    responses).
11. **CORS** — if the API will be called from non-Next clients, declare
    explicit allowlists; otherwise rely on same-origin and document that
    constraint.
12. **Bundle integrity** — confirm `resolvePublishedGraphBundleAsset`
    rejects `..` and absolute paths before treating
    `app/graph-bundles/[checksum]/[asset]/route.ts` as production-ready.
    (M4)

---

## Reuse / consolidation opportunities

- **One `parseJsonBody(request, schema, opts)` helper** in `app/api/_lib/` to
  replace the three duplicated try/catch/400 blocks (entities `_lib`,
  attach-points, evidence/chat). Already partially done in entities `_lib.ts`
  — promote it.
- **One `toErrorResponse(error)`** mapping `EngineApiError`,
  `GraphEntityError`, Zod errors, generic Error to one stable
  `{ error_code, message, request_id, retry_after, status }` shape. Today
  three handlers each do their own.
- **One slug parser** — `WikiSlugRouteContext` is partially shared in
  `_lib.ts` but `backlinks/[...slug]/route.ts` re-declares the shape (m7).
- **One body-cap constant** at the api root, not under entities only.
- **One density-scaling helper** instead of paired BASE/scaled records
  (m10). Replace six pairs with one `densityScale<T>(base: T): T`.
- **One color-scheme bootstrap** — `ColorSchemeScript`, the inline FOUC
  script, and `DarkClassSync` overlap. Pick one.
- **One redirect strategy** — `app/ambient-field-lab/page.tsx` belongs in
  `next.config.ts redirects()`.
- **`field-lab` and `/`** render the exact same component — pick one URL.

---

## What's solid

- `next.config.ts` security headers (the four it sets) are correct, and
  `poweredByHeader: false`, `reactStrictMode: true`, `cacheComponents: true`
  are good defaults.
- `lib/db/index.ts` lazy-Proxy + HMR singleton pattern is the right shape;
  prevents pool blow-up on dev recompiles.
- `app/graph-bundles/[checksum]/[asset]/route.ts` correctly:
  - implements ETag + If-None-Match → 304
  - implements Range / 206 + 416 with proper `Content-Range`
  - sets immutable cache for content-addressed assets
  - separates GET and HEAD (HEAD doesn't stream the body)
- `app/api/entities/_lib.ts` is a thin, well-shaped adapter:
  pre-check `Content-Length`, second-check actual UTF-8 byte length, then
  parse. The 413 path before JSON.parse is the right ordering.
- `app/api/evidence/chat/stream.ts` uses Zod with bounded ranges
  (`k.min(1).max(50)`, `rerank_topn.max(200)`), and the schema is module-scope
  (the perf test on lines 99-121 actually guards regression).
- Server action `getGraphRagQuery` returns a discriminated union — good
  client ergonomics.
- `request.signal` is correctly forwarded to backend calls in entities and
  attach-points and evidence/chat — propagates client cancel to upstream.
- `connection()` is correctly called on dynamic pages so they render at
  request time rather than being statically pre-rendered.
- Drizzle config throws loudly on missing `DATABASE_URL` instead of falling
  back to a default.

---

## Recommended priority (top 5)

1. **Decide and implement the auth model** for every API route + server
   action, then gate. Without this nothing else in this list matters. (C1)
2. **Rate-limit `/api/evidence/chat` and `/api/entities/*` and
   `/api/graph/attach-points`.** Wire a single middleware (Upstash, Vercel
   KV, or Postgres token bucket). (C2)
3. **Strip lab/preview routes from prod builds.** `/smoke`,
   `/loading-preview`, `/surface-lab`, `/ambient-field-lab`, and the
   duplicate `/field-lab`. Add a build-time guard. (C5, m5, m6)
4. **Centralize JSON body parsing + error envelope** under
   `app/api/_lib/`. Stop echoing `error.message` to clients; emit
   `request_id` and log server-side. (M5, M6, M7, M8)
5. **Add CSP + HSTS** to `next.config.ts headers()` and remove or nonce the
   inline `<script>` in `app/layout.tsx`. (C3, m3)
