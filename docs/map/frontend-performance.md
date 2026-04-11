# Frontend Performance Requirements

These are canonical requirements for SoleMD.Graph frontend and graph-runtime work.
Any agent or contributor touching `features/graph/**`, shell/panel orchestration,
DuckDB-Wasm session code, or graph-loading paths must follow them.

## Core Requirements

1. Native-first runtime

- Prefer built-in platform capabilities before custom orchestration.
- Use DuckDB SQL and DuckDB-Wasm configuration directly before adding JS-side workarounds.
- Use Next.js lazy loading, route conventions, and client/server boundaries directly.
- Keep Cosmograph usage behind `features/graph/cosmograph/**` adapters.
- Initial graph camera changes must stay in the Cosmograph adapter boundary and
  must restore the native saved transform rather than introducing a parallel
  app-defined camera model.
- Keep Tiptap/ProseMirror usage behind `features/graph/tiptap/**` adapters instead of importing `@tiptap/*` directly in feature code.

2. One canonical query/state path

- Selection, current-scope, and table/info query intent must resolve through one shared layer.
- Do not rebuild selection/scope resolution independently in multiple panels.
- If a query needs scope-aware behavior, extend the shared resolver instead of adding a new local branch.
- Prompt, entity-hover, and future `@` mention interactions must resolve graph projection through one shared prompt/runtime path instead of separate PromptBox-local branches.
- Typed entities stay local to editor highlight + hover detail until an explicit entity action requests graph projection. The prompt controller owns overlay sync and native Cosmograph selection; editor/Tiptap surfaces must not call graph overlay or selection APIs directly.
- Editor entity matching must expose explicit entity actions through the `CreateEditor` adapter boundary into the shared prompt/runtime path. Prompt surfaces may pass callbacks through, but they must not derive graph refs locally or bypass the shared entity overlay/native selection runtime.
- Ask-mode Enter/submit remains the canonical response-selection path: response-linked graph selection comes from the RAG answer runtime, not from the typed-entity matcher.

3. Zero redundant DuckDB work

- Hot bundle tables used for repeated interaction must be loaded once per DuckDB session.
- First paint may start from canonical attached bundle views if eager temp-table materialization would delay render.
- When a local temp/runtime table is the right steady-state for interaction, promote into it once on the first interactive need instead of during hidden startup work.
- Hidden panels and non-visible chrome must not trigger warmup queries on first paint.
- Avoid duplicate counts, duplicate summary fetches, and repeated request-key recomputation across panels.

4. Reuse one live DuckDB session

- Reuse the session/connection for the active bundle instead of reconnecting per panel or per query.
- Preserve DuckDB-local caches and metadata for the lifetime of the active bundle session.
- Same-checksum rerenders/remounts must reuse the active bundle session. Do not invalidate or rebuild DuckDB just because a dev remount, Fast Refresh, or parent rerender recreated the same bundle prop.
- Any change that would re-open DuckDB or rebuild hot tables must be justified with measured benefit.

5. Local-first hot data

- Treat `base_points`, `base_clusters`, and other interaction-critical graph tables as hot-path assets.
- Register bundle parquet assets once per DuckDB session under stable logical file names before building canonical views.
- Materialize `base_points` and `base_clusters` into local DuckDB tables during bootstrap because first paint already depends on them.
- Prefer local temp/materialized tables for hot-path data that powers repeated faceting, table paging, search, and high-frequency interactions once the interactive path is active.
- If an interactive-only runtime table is still needed, build it from the local canonical table instead of reading parquet again.
- Prompt/entity-driven point resolution must prefer targeted browser attachment before hydrating `universe_points.parquet`; only fall back to the bundled universe table for refs that remain unresolved after the targeted attach path.
- Point-only overlay producer updates must operate against whatever universe rows are already local instead of eagerly hydrating `universe_points.parquet`.
- Point-only overlay or attachment updates must not eagerly load `universe_links`; link-bearing tables load only when a link-dependent feature explicitly needs them.
- Optional or evidence-heavy relations may stay lazy, but only if they are not on the first-paint or high-frequency path.

6. No hidden hydration/runtime penalties

- Keep `"use client"` boundaries as small as possible.
- Lazy-load heavy chrome, controls, legends, and noncritical panels.
- Do not import graph-only controls into always-visible brand/header surfaces unless they are split behind a lazy boundary.
- Avoid effect cascades that cause a second fetch/render immediately after first paint.
- Keep the editor subtree isolated from response streaming and panel chrome updates so prompt/manuscript interactions do not rerender the rich-text surface unless editor-facing props actually changed.
- Prompt/evidence stream lifecycles must treat repeated `onData`/`onFinish` payloads for the same backend response as idempotent; graph projection and overlay mutation run once per response, not once per stream callback.
- Prompt/editor interactions must be provider-based inside the editor layer: evidence assist, future `@` mentions, and transient entity annotations extend one shared prompt interaction seam instead of adding PromptBox-local trigger branches.
- Mention suggestions and transient entity highlights must stay behind the Tiptap adapter and editor interaction modules; hover cards and graph projection UI stay outside the editor subtree.
- The editor controller is a host, not the permanent home for mention matching or entity decoration logic. Future `@` references belong in Tiptap extension modules, transient entity highlights belong in decoration/plugin modules, and PromptBox consumes them through the shared prompt interaction runtime.
- Canonical entity recognition and hover detail must resolve through one shared entity runtime and one dedicated entity API boundary. Do not embed entity matching logic in PromptBox controllers, editor components, or graph panels.
- Client-side entity services must use explicit HTTP route handlers (`/api/entities/**`) instead of Next server actions so text-window matching behaves like an ordinary frontend request path, remains observable in DevTools, and does not replay hidden form-action work on every editor update.
- Entity highlights carry canonical identity plus editor ranges only. Hover cards fetch reusable entity detail from the shared entity service; do not bake wiki/detail strings into decoration payloads.
- Hover cards are interactive UI, not read-only tooltips. They must stay alive long enough for pointer travel from the highlighted span into the overlay surface, and explicit actions such as `Show on graph` must be routed back through the shared prompt/runtime entity overlay controller rather than mutating the graph from the editor layer.
- Hover cards follow one shared floating hover-card shell and panel-token styling contract. Entity/wiki-specific cards provide content only; routing actions such as `Show on graph` and `Open wiki` must flow through prompt/wiki adapters instead of coupling the editor layer directly to Cosmograph or wiki stores.
- Wiki page content stays static and evidence-grounded. Page-level graph actions must consume the canonical wiki page runtime contract (`featured_graph_refs`, `paper_graph_refs`, `graph_focus`, canonical entity identity) through wiki graph-sync / graph-selection adapters instead of reparsing markdown or inventing page-local graph heuristics in the browser.
- Wiki pages must not mutate graph overlay or selection on load. Graph activation happens only through explicit page actions such as `Show on graph`, while page-load richness comes from backend context (`total_*_paper_count`, `top_graph_papers`) rather than implicit graph side effects.
- Wiki client reads must use explicit `/api/wiki/**` route handlers plus one shared client service. Do not import `app/actions/wiki` into `"use client"` hooks, components, or stores.
- Reserve `@` for persisted reference mentions. Command-style affordances such as evidence assist must use explicit command triggers instead of competing for the mention character.
- `@` suggestion search must derive from the local sentence-window context plus the shared prompt scope resolver, then call the canonical prompt/runtime evidence adapter. Do not bolt on editor-local lexical search or a second mention-specific request path.
- Floating editor UI belongs in one external overlay surface anchored to the editor frame. Mention menus and transient entity hover cards render there, never as React subtrees inside `EditorContent`.

7. Centralize performance-sensitive contracts

- Canonical table/view names, selection-query semantics, and scope-resolution rules must live in shared modules.
- If two panels need the same derived query inputs, extract that derivation into a shared hook or library module.
- If two DuckDB consumers need the same projection, predicate, or cache key, centralize it.

8. Measure before and after

- Use Chrome DevTools MCP and/or browser-network inspection for frontend latency changes.
- For DuckDB/runtime changes, verify whether requests, `HEAD` probes, or remote Parquet reads were reduced.
- Streamed ask responses must not replay the same graph projection work when `onData`, `onFinish`, or selection-source rerenders all carry the same resolved response.
- Prefer structural fixes over debounce-only masking.

9. Performance regressions require tests

- Changes affecting shell startup, DuckDB bootstrap, selection/query orchestration, or repeated interaction latency must add or update regression tests.
- Tests should verify the canonical behavior directly:
  - hot-path tables are materialized once
  - hidden panels do not prefetch
  - selection/scope resolution stays shared
  - repeated queries use caches where intended

10. Entity runtime performance

- Entity text matching fires only on stable text-window changes. The trigger gate normalizes text via lowercase + whitespace collapse (mirroring the backend alias key normalization). Cursor-only movement within the same paragraph must NOT trigger a new match cycle.
- Every new match request must abort the previous in-flight request via `AbortController`. Only the latest request's results commit to state. Sequence numbers remain as a secondary guard against stale responses from cached promises.
- Match results carry a 60-second TTL with on-access staleness checks. Expired cache entries are evicted on next access and by a periodic background sweep. Detail results are cached for session lifetime since entity metadata rarely changes within a session.
- The four-contract API split must remain: match (hot, debounced, abortable), detail (cold, hover-triggered), search (future, prefix/fuzzy for explicit entity pickers), overlay (future, canonical ID resolution to graph points). Do not merge match and detail into a single request.
- Graph-scale entity overlay must not read from `solemd.paper_entity_mentions`. That table belongs to the RAG warehouse text-spine/BioCXML path and only covers the warehouse-ingested subset. Use a dedicated graph-scale projection sourced from broad entity coverage (`pubtator.entity_annotations` joined onto `solemd.corpus` / `solemd.graph_points`) for live graph overlay counts and point activation, while keeping `paper_entity_mentions` for span-grounded RAG/wiki detail.
- The match query path must be a single-table read from `entity_aliases` with no JOIN to `entities`. Entity type filters must use bare equality (`ea.entity_type = ANY(...)`) without `lower()` wrapping since inputs are pre-normalized by the request schema. This preserves btree index coverage.
- Runtime metrics (requests per minute, abort rate, cache hit rate, p50/p95 latency) are tracked via `window.__entityMatchMetrics` in development only. Metrics must not affect render timing or be persisted to React state.
- Fuzzy/prefix search belongs to a future dedicated search contract only. The inline match path uses exact normalized matching.
- The inline match query currently filters to `is_canonical = true` as an interim precision guardrail. PubTator synonym aliases (11.6M rows, 72% of catalog) are designed for recall-maximizing bulk NER and contain common English words ("for", "has", "both", "text") mapped to high-paper-count entities. The full synonym catalog stays in `entity_aliases` for the future `entities/search` contract. The structural end-state replaces the provenance filter with an explicit eligibility field (`highlight_eligible`) so that promoted synonyms can be opted into inline matching and ambiguous canonicals (TEXT, SET, short all-caps) can be downgraded to case-sensitive-only or disabled.
- Entity refs for overlay/selection must be normalized and deduplicated in one shared utility. Hover-card actions project canonical entity identity into explicit graph refs, and the shared entity overlay controller consumes that canonical ref list. Do not re-derive or re-key entity refs independently in multiple surfaces.

## Anti-Patterns

- Rebuilding selection or scope logic inside each panel.
- Querying hidden panels on mount “just in case”.
- Hot first-paint tables left as parquet-backed views instead of one local session table.
- Reopening DuckDB to work around invalidation or cache issues.
- Local one-off fixes that bypass `features/graph/cosmograph/**` or `features/graph/duckdb/**`.
- Local one-off fixes that bypass `features/graph/tiptap/**` and couple feature code directly to raw `@tiptap/*` imports.
- Adding a second implementation path instead of replacing the old one.
- Firing entity match requests on cursor-only moves within the same text window.
- Holding multiple in-flight entity match requests open simultaneously without aborting stale ones.
- Caching match results indefinitely without a TTL eviction policy.
- JOINing `entity_aliases` to `entities` on the hot match path.
- Wrapping indexed columns in `lower()` when inputs are already normalized by the schema.
- Using PubTator synonym aliases for inline entity highlighting without a quality gate.
- Mutating graph overlay or selection just because a typed entity was matched, before the user triggered an explicit entity action or an answer response selected papers canonically.

## Review Checklist

- Does this change reduce or eliminate repeated work?
- Is the hot path local, cached, and shared?
- Did we keep one canonical implementation?
- Did we verify the result with tests and browser/runtime inspection?
