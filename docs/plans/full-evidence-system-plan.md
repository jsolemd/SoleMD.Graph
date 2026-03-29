# SoleMD.Graph Evidence and RAG Plan

Status: Canonical plan  
Updated: 2026-03-29  
Project: `SoleMD.Graph`  
Scope: canonical evidence substrate, engine API, frontend integration, retrieval baseline, future evidence warehouse, and future Qdrant retrieval plane  
Supersedes: duplicate implementation-spec draft now archived at `docs/archive/plans/full-evidence-system-schema-and-api-spec.md`

## Why This Rewrite Exists

The prior evidence documents were directionally strong but too split, too
spec-heavy relative to the live code, and too willing to let preview-era
`paper_chunks` thinking leak into the canonical design.

The repo truth on 2026-03-28 is:

- the graph runtime is now explicitly `base -> universe -> overlay -> active -> evidence`
- PostgreSQL is the canonical live substrate for the graph and evidence spine
- `engine/app/rag` is effectively empty
- `engine/app/main.py` is still only a health endpoint
- `app/actions/graph.ts` is still returning typed stubs for graph detail and RAG
- `features/graph/lib/detail-service.ts` already defines the frontend-facing typed
  shapes the future engine will need to satisfy

This plan is therefore not just an aspirational architecture note. It is the
program plan that should drive the next implementation passes.

The immediate implementation posture also matters:

- the live graph rebuild against `solemd_graph` is still running
- no heavy database work should start right now
- no RAG migrations should be applied yet
- no backfills, chunk builds, embedding jobs, or large scans should start yet

The right move now is to lock the contracts, own the backend boundary, and build
the cheap engine-side retrieval baseline on the current tables.

## Implementation Tracker

Current implementation tracker for the first evidence vertical slice:

- [x] canonical evidence plan consolidated into one active document
- [x] scale target and hierarchical retrieval posture documented
- [x] FastAPI versus Supabase posture documented
- [x] graph-signal contract direction documented
- [x] `engine/app/rag/` package scaffold landed
- [x] canonical FastAPI evidence search endpoint landed
- [x] baseline retrieval over current tables landed
- [x] graph-signal projection landed
- [x] Next.js engine adapter landed
- [x] Ask -> evidence -> graph-lighting baseline landed for already-active papers
- [x] DuckDB universe point-id resolution helper landed for overlay promotion
- [x] Ask -> evidence -> overlay activation loop landed for non-active universe papers
- [x] namespaced overlay ownership landed for concurrent overlay producers
- [x] answer surface finalized without obscuring the graph
- [x] `@`-triggered support/refute interaction finalized for composition mode
- [x] shared engine-to-graph RAG adapter landed for server action and route reuse
- [x] Ask-mode `Vercel AI SDK` streaming landed on top of the canonical evidence contract
- [x] typed engine error envelope landed across server action and streaming route
- [x] DuckDB/Cosmograph runtime hard constraint documented for future RAG work

Implementation rule:

- update this checklist and the milestone notes as scope is uncovered during implementation

Current milestone note:

- the backend baseline now lands a canonical `POST /api/v1/evidence/search`
  path, typed evidence bundles, typed graph signals, unit tests, and a thin
  Next.js server adapter
- the graph integration path is now explicitly two-stage:
  resolve returned `paper_id` values against the active canvas first for
  immediate highlighting, then promote non-active evidence papers into the
  overlay/active canvas path through DuckDB instead of treating them as
  highlight-only misses
- the DuckDB side now carries both the universe point-id resolver and explicit
  producer-owned overlay membership, so manual overlay expansion, Ask mode,
  and future `@support` / `@refute` evidence overlays can coexist without
  clobbering one another
- overlay ownership is now a DuckDB session concern rather than a React ref
  concern:
  producer-backed memberships materialize into the existing overlay union table
  so the active canvas and renderer stay unchanged while feature ownership
  becomes explicit
- the old prompt-level read/modify/write overlay reconcile path is gone:
  Ask and compose flows now write only their own named overlay producer and
  clear only that producer on replacement, failure, or reset
- the prompt now uses a docked evidence tray above the composer instead of
  expanding the prompt card downward, so answers and evidence stay visible while
  the graph remains in view
- create mode now has an `@`-triggered evidence assist command path that
  extracts the current drafting context, sends explicit `support` / `refute` /
  `both` intent through the existing evidence contract, and reuses the same
  graph-lighting and overlay activation path as Ask mode
- the Ask path now uses a dedicated `Vercel AI SDK` route handler that streams
  assistant text to the docked response tray while still delivering the
  canonical structured evidence payload as a typed data part; graph-lighting
  and overlay activation continue to run from the same `GraphRagQueryResponsePayload`
  contract instead of a parallel UI-only shape
- the streaming route and one-shot server action path now share the same typed
  engine error envelope, so rate limits, auth failures, and engine errors can
  propagate through the frontend contract without ad hoc string handling
- the one-shot detail-service path now throws a typed request error wrapper
  instead of swallowing engine failures behind ad hoc casts, so both prompt
  modes can react to structured backend failures consistently
- compose-mode evidence assist intentionally stays on the simpler one-shot path
  for now so support/refute drafting remains cheap and deterministic while the
  deeper evidence warehouse is still pending
- the next milestone starts with runtime-contract hygiene before more feature
  surface:
  finish the remaining query-layer cleanup so non-canvas lookups consistently
  use `current_points_web` / `current_paper_points_web`, remove stale
  chunk-era naming where it still leaks through graph query modules, and keep
  render/query/evidence responsibilities explicit before broadening the Ask and
  composition UX further

## Locked Decisions

1. PostgreSQL remains the canonical source of truth for paper, evidence, and warehouse state.
2. The graph bundle remains lean. Rich evidence is served by the engine, not embedded into the default browser bundle.
3. `pubtator.*` remains an upstream source substrate. It is not replaced by the future evidence warehouse.
4. `solemd.paper_references` and `solemd.paper_assets` are evolved, not casually replaced.
5. The canonical evidence model is a span spine:
   - document
   - section
   - block
   - sentence
   - citation mention
   - bibliography entry
   - entity mention
   - relation mention
   - asset
6. `paper_chunks` are derived retrieval products, not the evidence spine.
7. The engine API is the canonical evidence contract. The frontend should not assemble evidence semantics from raw tables.
8. Drizzle is not required for the target architecture. The canonical plan should not depend on it.
9. FastAPI is the backend evidence boundary. Pydantic request and response models are the canonical typed contract.
10. Route Handlers and Server Actions are not interchangeable:
    - Server Actions are for UI-driven mutations or controlled server-side actions
    - Route Handlers are for HTTP endpoints
    - neither should become the canonical evidence business-logic layer
11. Next.js Server Components should call the engine server-to-server for evidence reads when possible. Do not insert an extra same-app HTTP hop unless the browser truly needs one.
12. Future sentence and block serving should target Qdrant once the warehouse exists and retrieval volume justifies it.
13. Bounded paper-level and warehouse-local validation can continue to use PostgreSQL and pgvector.
14. There is no backwards-compatibility requirement for preview-era `chunk_text` contracts.
15. Full-text parsing must use structural signals from `s2orc_v2` and BioCXML. Do not use regex as the parser.
16. The stack must support:
    - a paper catalog that can grow past `200M+` articles
    - a full-text evidence warehouse that can support at least `14M+` chunked articles
17. Launch-scale retrieval must be hierarchical. Do not assume one global sentence ANN index over the entire corpus is the default serving path.
18. Supabase is not the canonical evidence backend. If it is used later, it should complement the stack with managed infrastructure capabilities, not replace PostgreSQL plus FastAPI evidence orchestration.
19. Supabase Edge Functions are not the primary runtime for evidence retrieval, parsing, or warehouse orchestration.
20. The browser graph runtime stays DuckDB-first and corpus-only:
    `current_points_canvas_web` is render-only, while `current_points_web` and
    `current_paper_points_web` are the query/detail aliases.
21. `pointIncludeColumns` stays empty on the live graph page.
    RAG work must not widen point payloads for convenience.
22. Browser DuckDB is a local graph-state engine, not a second evidence service.
    Release-scoped evidence retrieval and rich payloads stay behind FastAPI.
23. Graph-side RAG integration resolves engine-returned ids through canonical
    DuckDB aliases and producer-owned overlay membership. It must not depend on
    older broad union views or rebuild graph state in JS.
24. The DuckDB registration layer may evolve between narrow local tables and
    narrow local views with strict canonical columns, but consumers must depend
    only on the stable alias contract above.

## Scale Target

The scale target is now explicit:

- `200M+` article-level records at full launch
- `14M+` full-text articles chunked and citable in the evidence system

This changes several earlier assumptions.

The graph runtime can still begin from a curated mapped subset, but the evidence
stack must be designed for a much larger retrieval surface than the current
graph build.

### What this means operationally

1. The paper catalog and the evidence warehouse are different scale domains.
2. The system must support exact citation and evidence inspection without assuming
   every sentence is a first-pass global ANN object.
3. Canonical truth and serving indexes must stay decoupled.
4. The launch target is beyond "single-node first" retrieval thinking, even if
   current development still runs locally.

### Required serving posture

Use a hierarchical retrieval funnel:

1. paper-level recall across the global paper catalog
2. evidence-level recall within a bounded candidate set
3. sentence resolution and exact citation grounding inside the bounded set
4. reranking and bundle assembly after grounding

That implies the default retrieval unit at launch scale should be:

- paper for global recall
- block or chunk for first-pass evidence recall
- sentence for grounding, citation, and display

Sentence remains canonical for exact evidence, but it does not need to be the
default first-pass ANN unit across the entire launch-scale corpus.

## Current Repo Truth

### Canonical graph/runtime posture

The live graph design is already clear in `docs/design/living-graph.md`:

- `base_points` is the opening scaffold
- `universe_points` is the mapped remainder
- `overlay_points` is the promoted subset
- `active_points` is the live browser-facing dense union
- `evidence_api` is the heavy retrieval path

That split is correct and should remain.

### Hard constraint for all future RAG work

All future evidence, AI, and RAG work must preserve the hardened browser/runtime
contract:

- the render path is `current_points_canvas_web` and the dense active link/canvas
  aliases only
- the DuckDB query path is `current_points_web` and `current_paper_points_web`
  for search, filters, tables, info widgets, and bundle-local point resolution
- `pointIncludeColumns` stays empty on the live graph page; rich metadata is not
  mirrored back into Cosmograph point payloads for convenience
- heavy detail, release-scoped evidence retrieval, and answer grounding stay in
  the FastAPI evidence boundary rather than becoming a second frontend SQL layer
- DuckDB local SQL is for bundle-local resolution, scope, and overlay activation,
  not a substitute evidence backend
- the implementation under those aliases may use narrow local tables or narrow
  local views when needed for stable row/filter behavior, but the alias contract
  stays canonical
- the graph runtime remains corpus/paper-only; chunk-capable evidence may exist
  API-side, but it must not reintroduce chunk assumptions into the live graph
  runtime

### Current canonical PostgreSQL substrate

These current tables already exist and are the baseline evidence substrate:

- `solemd.corpus`
- `solemd.papers`
- `solemd.citations`
- `solemd.paper_references`
- `solemd.paper_assets`
- `pubtator.entity_annotations`
- `pubtator.relations`

These graph-facing tables are useful for grounding but are not the warehouse:

- `solemd.graph_runs`
- `solemd.graph_points`
- `solemd.graph_clusters`
- `solemd.graph_base_features`

### Current code reality

Relevant live code surfaces:

- `engine/app/main.py` has only the health endpoint
- `engine/app/graph/export.py` still declares bundle evidence artifacts that exceed what the current bundle actually exports
- `engine/app/db.py` already provides the shared PostgreSQL connection boundary
- `engine/app/graph/export_bundle.py` still exports placeholder document and chunk-adjacent fields for the graph bundle
- `app/actions/graph.ts` is still stubbed for graph detail, neighborhoods, and RAG
- `features/graph/lib/detail-service.ts` already defines the frontend contracts that a real evidence API must satisfy
- `features/graph/components/panels/PromptBox.tsx` already asks for generated answers
- `features/graph/duckdb/session.ts` already provides `getPaperNodesByPaperIds(...)` for paper-id to point-index resolution
- `lib/db/index.ts` and `lib/db/schema.ts` show the current frontend use of Drizzle for graph metadata reads, but that is current scaffolding rather than a target architectural dependency

The architecture work therefore needs to close a real gap between the docs and
the implementation surface, not just refine an already-existing API.

### Observed raw-file findings

Small direct probes of the local bulk assets confirm several design-critical facts.

From sampled `s2orc_v2` rows:

- `body.text` and `bibliography.text` are present
- `body.annotations` includes `section_header`, `paragraph`, `bib_ref`, and sometimes `sentence`
- each annotation kind is itself a JSON-encoded string and requires a second decode step
- `sentence` is absent in some rows, so deterministic sentence fallback remains necessary

From sampled BioCXML members:

- passages have explicit `offset`
- passages carry `section_type` and `type`
- front matter contains identifiers and license metadata in `<infon>` tags
- inline `<annotation>` tags carry exact mention offsets

Implication:

- `s2orc_v2` remains the likely primary text spine
- BioCXML is strong enough to justify a parallel annotation and caption enrichment track

## Evidence Artifact Reconciliation

The current bundle contract in `engine/app/graph/export.py` and
`features/graph/types/bundle.ts` still declares evidence artifacts that are not
implemented as durable canonical bundle exports.

Treat that artifact list as transitional.

Recommended disposition:

- `universe_links`
  - stays browser-local / bundle-facing
- `citation_neighborhood`
  - moves to engine API
- `pubtator_annotations`
  - moves to engine API
- `pubtator_relations`
  - moves to engine API
- `paper_assets`
  - moves to engine API
- `full_text`
  - moves to engine API
- `rag_chunks`
  - moves to engine API and later gives way to warehouse-backed evidence endpoints

Rules:

- remove phantom evidence artifacts from the canonical bundle contract once engine endpoints replace them
- do not let the bundle contract imply that rich evidence lives in Parquet by default

## Architecture Boundary

### One canonical evidence boundary

The evidence system should have one clear boundary:

- Next.js owns UI composition, auth/session integration, and graph/app delivery
- FastAPI owns evidence retrieval, evidence assembly, and retrieval orchestration
- PostgreSQL owns canonical truth
- Qdrant later owns high-scale sentence and block retrieval serving

That means the evidence contract is owned by the engine, not by Drizzle models,
not by ad hoc frontend joins, and not by bundle placeholder fields.

### What stays in Next.js

Next.js 16 should own:

- Server Component page composition
- graph bundle discovery and metadata reads
- app shell, panel, and streaming UI
- auth/session handling once auth is enabled
- server-to-server calls to the engine
- optional same-origin BFF endpoints only when the browser needs an HTTP surface

Preferred posture:

- keep database access in Next.js as thin as possible
- prefer engine-backed reads for evidence and retrieval semantics
- use direct SQL only for small app-local metadata reads if they still need to stay in the web app

The current repo uses Drizzle today, but the target architecture does not need it.

If local web-app SQL remains necessary for a small metadata surface such as:

- `solemd.graph_runs`
- bundle metadata
- minimal administrative reads

then the web app can use either:

- the existing Drizzle layer temporarily
- or a thinner direct `postgres` client layer later

Drizzle is not the right long-term layer for:

- evidence retrieval orchestration
- query parsing
- citation-context ranking
- multi-channel fusion
- PostgreSQL plus Qdrant coordination
- warehouse-aware span assembly
- evidence-native response contracts

### Supabase posture

Supabase is not the target replacement for the evidence backend.

For this project, Supabase Data API and PostgREST are schema-facing API layers.
The SoleMD evidence backend still needs custom retrieval semantics, citation
grounding, typed bundle assembly, answer synthesis, and later PostgreSQL plus
Qdrant orchestration.

Use this posture:

- keep canonical evidence reads and writes in FastAPI over direct PostgreSQL connections
- treat Supabase as optional managed infrastructure only if the project later wants:
  - managed Auth
  - managed Storage
  - managed Realtime
  - hosted PostgreSQL operations
- do not make Supabase REST or GraphQL the primary evidence contract
- do not make Supabase Edge Functions the core retrieval, parsing, or warehouse runtime

If Supabase is adopted later, it should be in a complementary role, not as a
substitute for the engine API.

### What stays in FastAPI

FastAPI should own:

- `/api/v1/evidence/...` endpoints
- request validation
- response validation and serialization
- retrieval orchestration across current PostgreSQL tables
- later orchestration across PostgreSQL plus Qdrant
- signed asset URL logic if asset delivery becomes engine-mediated
- retrieval diagnostics, version stamps, and tracing
- worker-triggering or parse/index orchestration endpoints when those land

FastAPI should be structured as a real application, not a single-file app:

- `engine/app/main.py` becomes app assembly
- `engine/app/api/` owns routers
- `engine/app/rag/` owns evidence retrieval logic

### Server Actions versus Route Handlers

The current frontend already uses Server Actions in `app/actions/graph.ts`.
That remains reasonable, but only as a thin UI adapter.

Use Server Actions for:

- controlled UI-originated operations
- user-initiated search submissions
- graph panel requests that are naturally initiated from the UI
- future write and cite actions

Use Route Handlers for:

- browser-facing HTTP endpoints
- streaming responses that need an HTTP boundary
- public or external clients
- same-origin access from client components when a browser fetch is required

Do not use either of them as the place where retrieval logic lives.
They should delegate to a typed engine client or to the FastAPI API directly.

### Typed contract strategy

The contract should be owned once and generated outward:

1. Pydantic models define the canonical request and response schemas.
2. FastAPI exposes OpenAPI for the versioned evidence endpoints.
3. TypeScript types are generated from OpenAPI for the Next.js app.
4. The frontend uses a thin typed engine client, not hand-maintained duplicate DTOs.

Rules:

- no dual hand-written Python and TypeScript evidence schemas
- no frontend-only reinterpretation of response meaning
- every evidence response carries retrieval version metadata and timing
- every paper or evidence item can carry display-policy metadata

### Type migration strategy

`features/graph/lib/detail-service.ts` is the current de facto frontend payload
surface and should be treated as a migration constraint.

Recommended sequence:

1. define Pydantic models that initially match the current TypeScript payload
   shapes closely enough to avoid gratuitous frontend churn
2. generate TypeScript client and types from FastAPI OpenAPI
3. add a build-time structural equivalence check between generated engine types
   and the current frontend expectations
4. migrate consumers from hand-written engine-facing interfaces to generated types
5. delete superseded hand-written engine-facing interfaces later

Important distinction:

- engine-facing payload interfaces in `detail-service.ts` are part of the migration surface
- DuckDB-local browser-runtime types remain a separate concern

## API Contract

### Versioning

Use a versioned engine API from day one:

- `/api/v1/evidence/search`
- `/api/v1/evidence/papers/{corpus_id}`
- `/api/v1/evidence/papers/{corpus_id}/references`
- `/api/v1/evidence/papers/{corpus_id}/assets`
- `/api/v1/evidence/blocks/{block_id}`
- `/api/v1/evidence/sentences/{sentence_id}`
- `/api/v1/evidence/cite`

Do not publish unversioned evidence endpoints.

### Canonical request and response models

The engine should define these first-class models immediately:

- `PaperRetrievalQuery`
- `RagSearchRequest`
- `RagSearchResponse`
- `PaperEvidenceHit`
- `CitationContextHit`
- `EntityMatchedPaperHit`
- `RetrievalChannelResult`
- `EvidenceBundle`

Recommended response rules:

- `RagSearchResponse` returns bundles, not raw rows
- `RetrievalChannelResult` exposes channel diagnostics for debug and testing
- `EvidenceBundle` always includes paper grounding, not detached text
- future sentence and block results fit under the same bundle contract
- graph overlay hints are a response add-on, not a separate opaque side channel

### Error contract

The current stub pattern in `app/actions/graph.ts` is temporary and not
type-safe enough for the real system.

Define a canonical engine error envelope:

- `EngineErrorResponse`
  - `request_id`
  - `error_code`
  - `error_message`
  - `retry_after_seconds`
  - `details`

Recommended status conventions:

- `400` invalid request
- `401` unauthenticated
- `403` unauthorized
- `404` entity not found
- `409` incompatible graph release or stale request context
- `429` rate limited
- `500` internal engine failure
- `503` dependency unavailable

Frontend rule:

- Server Actions and engine clients should return a typed success-or-error result
- do not cast error payloads into success shapes
- the error path must remain testable without a live engine

### Display-policy contract

Every paper or evidence response should allow a normalized `display` object:

- `display_policy`
- `display_policy_reason`
- `access_status`
- `license`
- `disclaimer`

This is required even before the formal rights/compliance workstream lands.

### Graph integration contract

The evidence API should be able to return lightweight graph hints:

- highlighted `corpus_id`s
- optional evidence ids once evidence nodes exist
- optional citation edges
- optional cluster ids

The graph runtime still owns spatial state.
The engine returns evidence semantics, not canvas instructions.

Graph-side evidence resolution must follow the runtime split:

- active point lookup resolves through `current_paper_points_web`
- overlay promotion writes through producer-owned DuckDB overlay membership
- non-canvas graph widgets stay on `current_points_web` or
  `current_paper_points_web`, never `*_canvas_web`
- rich evidence context, citation neighborhoods, and answer grounding still come
  from FastAPI, not widened point payloads or ad hoc frontend SQL

### Synthesis and streaming

Retrieval and synthesis are distinct stages, but the Ask workflow needs both.

The current frontend already expects a completed answer shape:

- `generateAnswer?: boolean` exists in `detail-service.ts`
- `answer` and `answer_model` already exist in the RAG response payload

Recommended posture:

- keep retrieval in `engine/app/rag/`
- add `engine/app/rag/answer.py` for answer synthesis orchestration
- include answer fields in `RagSearchResponse`
- support both:
  - non-streaming responses for the baseline
  - streaming responses for the interactive Ask path

Preferred UI layer:

- use `Vercel AI SDK` in Next.js if the app keeps an AI-native streaming UX
- keep evidence retrieval and grounding in FastAPI

Transport rule:

- browser streaming may use a same-origin Next.js Route Handler proxy when needed
- server-to-server retrieval remains direct to the engine

### Auth and service identity

The evidence API should not remain implicitly trusted.

Recommended posture:

- local development:
  - simple shared engine token is sufficient
- production:
  - Next.js-authenticated requests should present explicit service or user identity to the engine
- server-to-server:
  - use a dedicated service credential between Next.js and FastAPI

Contract rule:

- every engine request carries a stable request id
- authenticated identity and authorization context are enforced in middleware, not improvised in handlers

## Frontend Integration Plan

### Current frontend posture

The frontend already assumes typed detail and RAG payloads in
`features/graph/lib/detail-service.ts`, and it currently reaches them through
stubbed Server Actions in `app/actions/graph.ts`.

That is the seam to use.

### Integration target

The integration path should be:

1. add a typed engine client in Next.js server code
2. have `app/actions/graph.ts` call that client
3. keep `features/graph/lib/detail-service.ts` as the client-facing interface
4. replace preview placeholder assumptions with evidence-native payloads

This preserves the current UI composition while moving the evidence semantics to
the correct backend boundary.

### Next implementation slice

The next implementation slice should be one boundary-respecting vertical path:

`query -> retrieval channels -> fused evidence bundles -> graph signals -> UI`

This is the right next step because it proves:

- the engine can own evidence semantics
- the graph can react to retrieval without learning retrieval internals
- the frontend can stay thin while still feeling deeply integrated
- later warehouse and Qdrant changes can land behind the same response contract

Do not treat graph-lighting as a separate bolt-on after retrieval.
It is part of the same evidence interaction contract, but it must remain
logically distinct from rendering state.

Implementation constraint for this slice:

- the engine may return graph semantics only
- Next.js may stream AI interaction only
- DuckDB may resolve ids and manage overlay/selection only
- Cosmograph may render the dense active canvas only

If a step needs rich paper detail, citation payloads, or release-aware evidence
semantics, it belongs on the backend contract rather than in hydrated point
metadata or ad hoc frontend SQL.

### Response surface requirement

The answer surface cannot be designed as if the graph disappears during retrieval.

Requirements:

- the graph remains visible while the user reads the answer and evidence
- the answer surface is anchored to the prompt or a nearby docked panel, not a
  full-screen modal takeover
- evidence cards and graph-lighting should be inspectable together
- answer streaming should not break graph interaction or hide the active canvas
- the interactive response surface should be owned by `Vercel AI SDK` in Next.js,
  not improvised directly inside the database or retrieval layer

The initial implementation may keep the current prompt-attached result tray, but
the contract should leave room for a richer docked evidence rail later.

### Composition support and refute requirement

The prompt/editor should gain a deliberate `@`-triggered evidence-assist path.

Target behavior:

- when the user types `@`, the client inspects the current drafting context
- the engine receives the last few sentences or current paragraph, not just the
  raw token after `@`
- the engine can return supporting studies, refuting studies, or both
- the graph can light up the resulting evidence set while the user keeps writing

Design rules:

- this is not generic mention autocomplete
- support and refute are evidence intents, not renderer behaviors
- the retrieval path should be reusable by Ask and Create/Write modes
- the intent contract should be explicit in the API, not inferred from ad hoc UI strings
- `Vercel AI SDK` should own the streamed interaction and composition UX
- the engine should expose typed evidence retrieval tools/endpoints that the AI
  layer calls

### Graph highlight integration

The engine should return graph grounding in terms of stable paper identifiers,
not browser-specific point indices.

The frontend graph path should be:

1. engine response returns `corpus_id` or stable paper ids
2. the browser runtime resolves those ids through DuckDB against the canonical
   active/query aliases, not through JS-hydrated point payloads
3. active hits provide point indices for immediate graph-lighting
4. non-active hits must flow through the overlay activation seam so they become active canvas points instead of remaining passive evidence rows
5. the UI should not reintroduce a client-side highlighted-index mirror; overlay promotion and DuckDB-native scope resolution are the native path for bringing new evidence into view

This preserves separation of concerns:

- engine owns evidence semantics
- DuckDB session owns bundle-local id resolution and overlay promotion
- Zustand and Cosmograph own selection intent and rendering once the relevant points are active

The engine response should therefore include typed graph signals, not just a
flat list of highlighted ids.

Important current constraint:

- `getPaperNodesByPaperIds(...)` resolves against `current_paper_points_web`, not the full universe
- evidence-driven overlay activation therefore also needs a universe-resolution helper that can map returned `paper_id` values to universe point ids before calling `setOverlayPointIds(...)`
- this is a frontend graph-integration task, not a reason to distort the engine response contract

Recommended near-term signal families:

- `entity_match`
- `semantic_neighbor`
- `citation_neighbor`
- `answer_support`

Each signal should carry:

- stable `corpus_id`
- channel or reason
- score
- rank
- optional explanation metadata

Rules:

- the engine does not emit canvas-specific indices
- the graph client does not reconstruct retrieval meaning from raw tables
- graph highlighting remains derivable from the evidence response, but not
  entangled with renderer-specific state
- new retrieval channels can be added without changing the graph state model
- until overlay sources are namespaced, the Ask flow should reconcile only its
  own last-query overlay subset instead of blindly replacing all overlay
  membership or letting RAG overlay ids accumulate indefinitely

### Role of local SQL after evidence APIs land

Do not grow a second evidence access layer in Next.js.
Once evidence APIs exist, evidence flows through the engine.

Allowed role for local SQL:

- graph-local DuckDB resolution against bundle-backed aliases
- filter/timeline/search/table aggregation over `current_points_web`
- active/universe point resolution and overlay membership management

Disallowed role for local SQL:

- canonical evidence retrieval
- release resolution
- citation-context assembly
- answer grounding that bypasses the engine contract

If the web app still needs a tiny metadata-only SQL surface, that can remain as:

- temporary Drizzle usage
- or a thinner direct SQL client

But the target plan should not require Drizzle.

## Immediate Retrieval Baseline

### Goal

Ship a real engine-side evidence baseline now, using current tables only and no
heavy live-data work.

This baseline should support:

- query to candidate papers
- optional entity filter
- optional relation filter
- optional citation-context boost
- response as evidence bundles

### Indexing strategy for the baseline

This is design work now, not a live migration order.

The baseline path must assume indexed lookup strategies for:

- title and abstract full-text search
- fuzzy or prefix title lookup
- entity filtering on `pubtator.entity_annotations`
- relation filtering on `pubtator.relations`
- citation expansion on `solemd.citations`

Operational note:

- any live index creation should wait until the graph rebuild finishes
- when index work begins, use non-blocking operational patterns where appropriate

### Current-table retrieval channels

The baseline should use only existing tables:

1. paper retrieval from `solemd.papers`
2. citation-context retrieval and boost from `solemd.citations`
3. entity-aware paper filtering from `pubtator.entity_annotations`
4. relation-aware paper filtering or boost from `pubtator.relations`
5. bibliography expansion from `solemd.paper_references`
6. asset lookup from `solemd.paper_assets`

### Baseline ranking flow

Recommended first-pass flow:

1. normalize the free-text query
2. derive optional entity and relation filters
3. retrieve candidate papers from `solemd.papers`
4. apply entity and relation filters if present
5. score citation-context matches from `solemd.citations.contexts`
6. optionally use citation intents as a boost feature
7. assemble final evidence bundles with references and assets
8. return graph highlight ids from the top paper bundles

### Baseline graph interaction contract

The baseline should already support graph-aware interaction, even before the
warehouse exists.

That means the first real response should return:

- evidence bundles for display and inspection
- graph-signal candidates for canvas highlighting
- per-paper reasons explaining why each paper should light up

The first graph-signal sources should be:

- direct entity overlap with the query
- semantic paper similarity
- citation-context support
- final supporting-paper rank

This gives the graph a principled semantic role without forcing the frontend to
reverse-engineer retrieval logic.

### Why this baseline matters

This gives a real evidence loop before the warehouse exists:

- the Ask path can return explainable paper bundles
- the graph can highlight grounded papers
- retrieval and response contracts can be tested
- the future warehouse can replace the retrieval channels without changing the
  public bundle shape

### Baseline response shape

The baseline `EvidenceBundle` should include:

- paper identity and bibliographic metadata
- why the paper matched
- paper-level retrieval score and rank features
- top citation-context hits
- matching entities and relations
- bibliography expansion
- asset references
- display metadata

Do not return bundle-export preview text as if it were evidence.

The top-level response should also include a graph-facing signal collection that
can evolve independently of the evidence bundle internals.

## Engine Package Shape

Build the initial engine surface around a real `engine/app/rag/` package:

- `engine/app/rag/__init__.py`
- `engine/app/rag/types.py`
- `engine/app/rag/models.py`
- `engine/app/rag/schemas.py`
- `engine/app/rag/queries.py`
- `engine/app/rag/repository.py`
- `engine/app/rag/ranking.py`
- `engine/app/rag/bundle.py`
- `engine/app/rag/service.py`
- `engine/app/rag/answer.py`
- `engine/app/rag/tests/`

Add the API layer explicitly:

- `engine/app/api/__init__.py`
- `engine/app/api/rag.py`

Suggested module roles:

- `types.py`: enums, literals, shared aliases
- `models.py`: internal domain models used by the service layer
- `schemas.py`: Pydantic API request and response models
- `queries.py`: SQL text and row-shape comments
- `repository.py`: database read methods only
- `ranking.py`: pure ranking and fusion functions
- `bundle.py`: evidence assembly from row groups to response bundles
- `service.py`: orchestration entrypoint for search and detail reads
- `answer.py`: answer synthesis and streaming orchestration over retrieved evidence
- `api/rag.py`: FastAPI router and endpoint wiring

Rules:

- repository code does not know about HTTP
- API code does not know SQL
- ranking logic is pure and unit-testable
- bundle assembly is deterministic and testable from fixtures

## Evidence Warehouse Target

### Canonical rule

The future warehouse is a span spine first and a retrieval index second.

That means the canonical tables are:

- `paper_documents`
- `paper_document_sources`
- `paper_sections`
- `paper_blocks`
- `paper_sentences`
- `paper_reference_entries`
- `paper_citation_mentions`
- `paper_entity_mentions`
- `paper_relation_mentions`
- `paper_assets`
- `paper_chunk_versions`
- `paper_chunks`
- `paper_chunk_members`

### Reconciliation with current physical tables

The logical model must reconcile with current live tables:

- `solemd.paper_references` remains the physical bibliography-entry substrate and
  evolves toward the logical `paper_reference_entries` contract
- `solemd.paper_assets` remains the physical asset substrate and evolves toward
  the richer asset contract
- `pubtator.entity_annotations` and `pubtator.relations` remain upstream source
  tables, not warehouse replacements

### Non-negotiable modeling rules

1. `paper_document_sources` is mandatory. Source provenance is not optional.
2. Citation edge metadata, bibliography entries, and in-text citation mentions are distinct objects.
3. Exact mention-grounded relations and paper-level PubTator relations are distinct objects.
4. Every span-bearing object carries provenance and alignment status.
5. Chunks are derived products that can always be traced back to canonical spans.

## Structural Parsing Plan

### Source precedence

Preferred canonical text source:

1. `s2orc_v2`
2. BioCXML when `s2orc_v2` is missing or materially weaker
3. abstract-only fallback

Preferred annotation source:

1. BioCXML exact-offset annotations
2. aligned source-native annotations from `s2orc_v2` where applicable
3. projected PubTator abstract-only matches when exact alignment is possible

### `s2orc_v2` parse rules

The parser must use the source structure directly:

- decode nested annotation JSON first
- walk body annotations in source order
- treat `section_header`, `paragraph`, `sentence`, and `bib_ref` as structural signals
- build section hierarchy from section-header metadata and numbering
- build blocks from paragraph annotations
- accept source-native sentence spans when present
- only fall back to deterministic sentence segmentation inside known block boundaries

Observed nuance from sampled local rows:

- annotation groups such as `section_header`, `paragraph`, and `bib_ref` arrive as JSON-encoded strings
- the parser must therefore decode the row, then decode each annotation group

Do not:

- regex section detection
- regex citation extraction
- split the whole document into sentences without block boundaries
- parse chunks first and backfill structure later

### BioCXML parse rules

The BioCXML path must preserve structural semantics:

- parse passages as structured units
- preserve passage type and infons
- preserve figure captions and table captions as first-class blocks
- preserve table payloads as structured assets
- treat inline annotations as the strongest entity-span source

Do not assume relation tags are uniformly present or equally dense across all
BioCXML documents.

### Parallel S2 and BioCXML enrichment posture

BioCXML should not be treated as a strictly serial post-processing stage that
waits for every S2 text decision to be complete.

Preferred posture:

- `s2orc_v2` drives canonical text parsing
- BioCXML runs as a parallel annotation and asset enrichment track
- reconciliation happens in the alignment layer through provenance and confidence

This matches the observed source strengths:

- `s2orc_v2` is strong on structural full text and bibliography linkage
- BioCXML is strong on exact entity offsets, passage metadata, and caption/table surface

### Alignment rules

Canonical text choice and canonical annotation choice are separate decisions.

Every imported span-bearing object should carry:

- `span_origin`
- `alignment_status`
- `alignment_confidence`
- source-local offsets when exact canonical alignment fails

Allowed outcomes:

- aligned exactly
- aligned with bounded confidence
- source-local only

Never fabricate false exact spans to satisfy schema cleanliness.

## Retrieval Plane Strategy

### Near term

The current-table baseline stays entirely in PostgreSQL.

That is enough for:

- paper-level retrieval
- citation-context enrichment
- entity and relation filtering
- bibliography and asset bundle assembly

### Future

Once the warehouse exists, sentence and block serving should move toward Qdrant.

Planned Qdrant collections:

- `evidence_blocks`
- `evidence_sentences`
- later `evidence_captions`

Qdrant payloads should stay lightweight and denormalized enough for filtering:

- `corpus_id`
- `paper_id`
- `section_canonical`
- `block_kind`
- `year`
- `has_citation`
- `entity_concept_ids`
- `relation_keys`
- `display_policy`

PostgreSQL remains canonical for:

- text truth
- provenance
- asset metadata
- display policy
- retrieval version state
- backfills and audit

### Launch-scale indexing strategy

To support `14M+` full-text articles and a `200M+` paper catalog, the retrieval
plane should be staged as follows:

1. global paper recall index across the full paper catalog
2. global block or chunk recall index across the full-text subset
3. sentence lookup and grounding in canonical PostgreSQL after the first-pass
   recall step

This avoids the worst scaling trap:

- indexing every sentence as a first-pass ANN object before the system needs it

### Canonical storage implications

The warehouse design should assume partitioned high-volume tables from the
beginning for:

- `paper_blocks`
- `paper_sentences`
- `paper_citation_mentions`
- `paper_entity_mentions`
- `paper_relation_mentions`
- `paper_chunks`
- `paper_chunk_members`

Partitioning details can be finalized later, but the schema should not assume a
single small-table posture.

## Workstream Dependencies

Use this dependency graph explicitly:

- Workstream A -> Workstream B
- Workstream A -> Workstream C
- Workstream A -> type generation and client migration
- Workstream D -> Workstream E
- Workstream D -> Workstream F
- Workstream E -> Workstream F
- Workstream B -> Workstream C

Interpretation:

- engine contracts come first
- baseline retrieval can ship before the warehouse
- frontend integration depends on engine contracts and the baseline
- parsing and Qdrant work depend on warehouse structure being real
- chunk and sentence serving work cannot float free of the warehouse spine

## Workstreams

### Workstream A: Engine baseline and contracts

Deliverables:

- `engine/app/rag/` package scaffold
- canonical Pydantic request and response models
- versioned FastAPI evidence router
- typed Next.js engine client plan
- type migration plan from current hand-written frontend payload interfaces to generated types
- canonical error envelope
- unit tests for ranking and bundle assembly
- development environment contract for engine URL, credentials, and local startup

### Workstream B: Current-table retrieval baseline

Deliverables:

- paper retrieval repository methods
- citation-context repository methods
- entity and relation filter methods
- bibliography and asset expansion methods
- `rag.service.search(...)` baseline
- indexing design for title, abstract, entity, relation, and citation lookup
- non-streaming answer synthesis baseline when `generate_answer = true`

### Workstream C: Frontend and graph integration

Deliverables:

- replace stubbed `app/actions/graph.ts` with engine-backed calls
- align `detail-service.ts` payloads to the engine contract
- add graph highlight hints to evidence responses
- resolve returned paper ids through DuckDB against the active canvas first
- add the universe-resolution path needed to promote non-active evidence papers into overlay/active canvas state
- keep evidence-driven graph sync on DuckDB alias resolution and overlay producer state, not a JS highlighted-index mirror
- preserve or replace the current detail-service cache intentionally
- wire completed answers first, then streaming answers

### Workstream D: Evidence warehouse migrations

Deliverables:

- migration plan for the span spine
- reconciliation plan for `paper_references` and `paper_assets`
- source provenance tables

### Workstream E: Structural parsing and ingest

Deliverables:

- `s2orc_v2` structural parser
- BioCXML overlay parser
- alignment layer
- abstract-only fallback path

Prerequisite:

- warehouse spine tables from Workstream D must exist before this becomes more than parser prototyping

### Workstream F: Derived retrieval products and Qdrant

Deliverables:

- chunk versioning
- chunk derivation
- sentence and block retrieval read models
- Qdrant sync contracts
- retrieval evaluation harness

Prerequisites:

- Workstream D warehouse tables
- Workstream E parsed and aligned canonical spans

## Observability

The evidence stack needs observability from the first real API pass.

Minimum contract:

- structured logs with request ids
- latency metrics for retrieval and answer synthesis
- retrieval version stamping in responses
- engine-side tracing hooks for search, bundle assembly, and answer generation

The initial pass does not need a large observability rollout, but it does need
stable identifiers and structured instrumentation.

## Development Environment

The plan should assume a documented local engine environment.

Minimum expected configuration:

- `ENGINE_URL`
- `ENGINE_API_KEY` or equivalent dev credential
- local FastAPI run command
- local PostgreSQL connection contract
- later Qdrant connection contract

This should remain lightweight, but the engine cannot stay implicit.

## Immediate Deliverables While The Graph Rebuild Runs

Do now:

1. finalize this plan and retire the duplicate spec doc
2. create the `engine/app/rag/` scaffold
3. define the canonical evidence request and response schemas
4. define the graph-signal response contract alongside the evidence bundle contract
5. define the answer-surface contract that preserves graph visibility
6. define the `@`-triggered support/refute interaction contract in docs before UI implementation
7. implement light repository helpers over current tables only
8. implement the baseline ranking and bundle assembly logic
9. wire graph-signal projection from the baseline retrieval outputs
10. add pure unit tests with fixtures and mocked rows
11. define the Next.js to engine client boundary
12. define the warehouse tables and parse stages in docs only

Do not do yet:

- live warehouse migrations
- full-text backfills
- chunk generation jobs
- embedding jobs
- large index builds
- large joins and scans on the live database

Allowed now:

- targeted `LIMIT` reads
- schema inspection
- doc and contract work
- unit tests with fixtures

## Build Order

### Phase 0: Contract-first baseline

1. ship the engine package scaffold
2. ship `rag.service.search(...)` over current tables
3. ship typed evidence bundles and typed graph signals
4. wire Next.js server-side adapters to the engine
5. resolve returned paper ids through DuckDB against the active canvas
6. promote non-active evidence papers through the overlay path so they can become active canvas points
7. prove the end-to-end Ask -> evidence -> graph-lighting and overlay-activation loop
8. define the stable answer surface for Ask mode
9. define the reusable support/refute interaction path for `@` in composition mode

### Phase 1: Warehouse spine

1. add warehouse migrations after the graph rebuild is done
2. build `paper_documents` through `paper_sentences`
3. add citation, bibliography, entity, relation, and asset enrichment

### Phase 2: Derived retrieval products

1. add `paper_chunk_versions`
2. add `paper_chunks`
3. add `paper_chunk_members`
4. build retrieval evaluation on sentence, block, and chunk outputs

### Phase 3: Production retrieval plane

1. add Qdrant sync state
2. stand up `evidence_blocks`
3. stand up `evidence_sentences`
4. compare against PostgreSQL baseline
5. switch serving only after evaluation justifies it

## Definition Of Done For The Current Pass

This pass is done when:

- the evidence plan is canonical and no longer split across duplicate active docs
- the engine-side package shape is locked
- the API boundary is explicit
- Drizzle versus FastAPI responsibilities are explicit
- the current-table retrieval baseline is fully specified
- the future warehouse is defined as a span spine with derived chunks
- the parsing plan is explicitly structural and non-regex
- the work can proceed without starting heavy live database work

## Sources

### Local repo references

- `docs/design/living-graph.md`
- `docs/map/database.md`
- `docs/map/data.md`
- `docs/map/architecture.md`
- `engine/app/db.py`
- `engine/app/main.py`
- `engine/app/graph/export_bundle.py`
- `app/actions/graph.ts`
- `features/graph/lib/detail-service.ts`
- `lib/db/index.ts`
- `lib/db/schema.ts`

### External guidance consulted

- Next.js guidance on Server Actions, Route Handlers, and backend-for-frontend patterns
- FastAPI guidance on APIRouter structure and response-model validation
- Pydantic guidance on schema generation and typed validation
- Supabase guidance on Data APIs, direct Postgres connections, and platform architecture
- DuckDB guidance on querying Parquet directly, projection/filter pushdown, and
  choosing views versus loaded tables
- Cosmograph guidance on `pointIndexBy`, `pointIncludeColumns`, dense indexed
  point tables, and local database update callbacks
- Qdrant guidance on hybrid search and reranking for future sentence and block serving
