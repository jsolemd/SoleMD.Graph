# 2026-04-08 SoleMD.Graph Graph Quality Ledger

## Scope

- Graph shell maintainability and orchestration
- Graph build/publish/verify contract hardening
- Graph action/detail boundary cleanup
- Prompt/editor modularization
- Selection and scope-state centralization
- Frontend latency and DuckDB runtime bootstrap optimization
- Live overlay/runtime materialization for dynamic graph extension
- Source-agnostic graph interaction runtime codification
- Repo-level quality gate and CI
- Non-RAG graph runtime and quality improvements only

## Ranked Themes

1. Shell orchestration is too centralized in `features/graph/components/shell/DashboardShellClient.tsx`.
2. Graph build/publish verification is not enforced tightly enough in `engine/app/graph/`.
3. The graph action/detail surface contains placeholder or dead paths centered on `app/actions/graph.ts`.
4. Bundle and graph-run contracts need stronger tests across engine and frontend boundaries.
5. The DuckDB query runtime is paying startup cost too early instead of promoting into local temp tables only when the interactive path needs them.

## Active Batches

### Batch 1

- Inspect worktree and concurrent edits
- Evaluate `DashboardShell.tsx` and `DashboardShellClient.tsx`
- Launch subagents for shell refactor, graph build boundary hardening, and detail-boundary analysis

### Batch 2

- Remove or shrink dead remote-detail surfaces
- Integrate subagent changes
- Run targeted frontend and engine verification

### Batch 3

- Modularize prompt and editor surfaces into controller/view layers
- Centralize selection/scope query state across graph explore panels
- Add a canonical repo quality gate and matching CI workflow

### Batch 7

- Verify the dataset-vs-interactive DuckDB split against a reliable foreground browser trace
- Decide whether an idle-time prewarm of `base_points_query_runtime` after first paint improves perceived latency
- Continue collapsing any remaining one-off selection/scope checks onto the shared resolver

### Batch 8

- Fix visible-Chrome DuckDB worker bootstrap so runtime testing is reliable in foreground DevTools
- Replace hot-path overlay filter/index work with materialized overlay runtime tables and active lookup state
- Keep point-only overlay updates off `universe_links`
- Codify live-overlay runtime rules in the canonical frontend/runtime docs

### Batch 9

- Reduce repeated bundle-asset probe cost on the immutable `/api/graph-bundles/**` path
- Stop no-overlay startup from materializing overlay runtime tables or active index remaps
- Move the render-critical base canvas bootstrap off remote `read_parquet(...)` views
- Keep idle interactive-query promotion from re-pointing the live canvas after first paint
- Re-measure visible-Chrome startup/network behavior after the transport/bootstrap changes

### Batch 10

- Codify one source-agnostic graph interaction runtime for prompt, manuscript, search, and selection surfaces
- Add canonical runtime types for intent, resolution, annotation, projection, and interaction tracing
- Make the interaction-runtime doc a required architecture reference for future graph-aware work
- Define the next adoption targets before adding PromptBox-specific hover/projection behavior

## Findings

- `features/graph/components/shell/DashboardShell.tsx` currently has no local diff and is a thin dynamic wrapper.
- `features/graph/components/shell/DashboardShellClient.tsx` has active external edits and appears to have dropped the dataset warmup path while adding dynamic imports.
- `app/actions/graph.ts` has one dependent: `features/graph/lib/detail-service.ts`.
- `features/graph/components/panels/DetailPanel.tsx` and `features/graph/components/panels/detail/use-detail-data.ts` currently use only local DuckDB-backed detail, not remote graph detail.
- `base_points_web` is a valid canonical query surface immediately after session bootstrap; the regression was that session info/table/search paths were still forcing `ensurePrimaryQueryTables()` before dataset reads.
- The clean split is two-phase: canonical attached bundle views for startup, then one shared promotion into `base_points_query_runtime` when selection/current-scope-heavy interaction begins.
- The remaining hot overlay bottleneck is not connection churn. It is repeated `overlay_point_ids -> active_points_web` union/index work paid on reads instead of once per overlay revision.
- Visible Chrome exposed a DuckDB worker bootstrap bug in dev where `importScripts('/_next/static/...')` failed from the blob worker because the worker asset URL was not normalized to the app origin.
- The repo already points agents and reader-path docs at `graph-interaction.md`; the missing piece was the canonical doc content and type contract behind those references.
- The clean structural boundary is not “PromptBox integration.” It is a source-agnostic `ReferenceIntent -> ReferenceResolution -> GraphAnnotationSet -> GraphProjectionRequest -> GraphProjectionResult -> GraphInteractionTrace` runtime that PromptBox, manuscript mode, and future interaction surfaces all consume.

## Completed Batches

### Batch 1

- Inspected worktree and concurrent edits
- Confirmed `DashboardShell.tsx` is a thin dynamic entrypoint and left it that way
- Split shell orchestration into:
  - `features/graph/components/shell/use-dashboard-shell-controller.ts`
  - `features/graph/components/shell/DashboardShellViewport.tsx`
  - thin `features/graph/components/shell/DashboardShellClient.tsx`

### Batch 2

- Removed the dead remote graph-detail/action path
- Simplified `app/actions/graph.ts` to the live graph RAG action boundary
- Simplified detail panel helpers/sections to the local DuckDB-backed runtime
- Removed unused remote detail components and signed-asset refresh hook

### Batch 3

- Added graph build preflight gating before cleanup/build execution
- Centralized native layout backend resolution
- Added bundle manifest contract validation at export/publish boundaries
- Added targeted graph engine tests for preflight, publish, contract, and verify

### Batch 4

- Split `features/graph/components/panels/PromptBox.tsx` into a thin wrapper plus:
  - `features/graph/components/panels/prompt/use-prompt-box-controller.ts`
  - `features/graph/components/panels/prompt/PromptBoxSurface.tsx`
- Split `features/graph/components/panels/CreateEditor.tsx` into a thin wrapper plus:
  - `features/graph/components/panels/editor/use-create-editor-controller.ts`
  - `features/graph/components/panels/editor/CreateEditorSurface.tsx`
- Preserved prompt/editor behavior while removing responsibility concentration from the entry files

### Batch 5

- Added `features/graph/lib/selection-query-state.ts` as the shared source of truth for current-scope normalization and table-scope resolution
- Added `features/graph/hooks/use-selection-query-state.ts` for deferred graph selection/query state
- Rewired table and info-panel selection handling to consume the shared hook/utilities
- Added focused tests for the shared selection-state resolver

### Batch 6

- Added root `npm run quality` as the canonical repo-level quality gate
- Added `.github/workflows/quality.yml` to run the same root gate in CI
- Cleared the residual graph-engine Ruff debt in:
  - `engine/app/graph/build.py`
  - `engine/app/graph/layout.py`
  - `engine/app/graph/export_bundle.py`
- Removed the remaining frontend lint warning in `features/graph/components/chrome/Wordmark.tsx`

### Batch 7

- Added `docs/map/frontend-performance.md` as the canonical frontend latency/runtime contract
- Linked `AGENTS.md` and `CLAUDE.md` to the canonical frontend performance requirements
- Kept dataset-scoped table/info/search reads on canonical attached bundle views so first paint does not block on local temp-table build
- Kept the one-time `base_points_query_runtime` promotion behind the shared interactive query surface for scoped/selection-heavy reads
- Tightened the session/query contract with regression tests so dataset reads no longer call `ensurePrimaryQueryTables()` while scoped reads still do

### Batch 8

- Normalized DuckDB-Wasm worker/module URLs against `window.location.href` so the visible Chrome dev runtime can instantiate DuckDB reliably
- Replaced hot overlay filter/index read work with materialized DuckDB-local overlay runtime tables plus active index lookup rebuilt once per overlay revision
- Kept `overlay_point_ids_by_producer` as the overlay source of truth and made `overlay_point_ids` a derived view instead of delete/reinsert state
- Stopped point-only overlay updates from eagerly attaching `universe_links`
- Raised the narrow row-attachment batch contract to 5,000 refs per request and kept batching on the one canonical browser attachment path
- Added regression tests for DuckDB connection asset normalization, active runtime table materialization, overlay session refresh behavior, remote attachment batching, and attachment request validation

### Batch 9

- Added a checksum-keyed cached bundle asset catalog so repeated immutable asset probes reuse one graph-run lookup, one root/directory resolution, and one stat pass per bundle
- Rewired `/api/graph-bundles/[checksum]/[asset]` to serve from the cached asset descriptor path instead of re-querying the database and filesystem on every `HEAD`/`GET`
- Changed no-overlay DuckDB bootstrap so `active_*` views stay as base aliases until an actual overlay/runtime refresh occurs
- Materialized the base canvas/bootstrap point table and base clusters into local DuckDB runtime tables before mounting Cosmograph, which cut the visible-Chrome `base_points.parquet` `HEAD` burst substantially on a fresh production load
- Kept the later shared `base_points_query_runtime` promotion query-only so the graph canvas does not rebuild onto a second local table during idle prewarm
- Added regression coverage for cached asset resolution and the no-overlay active-view bootstrap contract

### Batch 10

- Added `features/graph/types/interaction-runtime.ts` as the canonical source-agnostic contract home for graph-aware interaction
- Exported the new runtime types through `features/graph/types/index.ts`, keeping the existing graph type barrel as the single import surface
- Added `docs/map/graph-interaction.md` to define the structural contract stack, producer rules, observability split, manuscript fingerprint model, and next adoption targets
- Recorded the next convergence targets around prompt/RAG sync, DuckDB availability/attachment, overlay mutation, and interaction timing before further PromptBox UX expansion

## Blockers

- No blocking correctness issues remain.
- The only residual verification noise is a pre-existing React `act(...)` console warning in `features/graph/components/shell/__tests__/DashboardShellClient.test.tsx`; it does not fail tests or the quality gate.
- The visible Chrome debugger is reachable, but foreground-dependent perf audits still need a reliable run before treating Lighthouse output as authoritative.

## Follow-On Work

- If desired, make the dynamic shell test warning-free by wrapping the `next/dynamic` loadable updates in explicit test `act(...)` handling.
- Re-evaluate whether any future remote detail surface should be reintroduced only after an actual engine endpoint exists.
## Commits

- `283361e` Improve graph shell quality and runtime latency
- `2ac1bc9` Codify graph interaction runtime contracts

## Next Recommended Passes

1. Capture a clean foreground Chrome trace and compare first interaction latency before/after the dataset-vs-interactive DuckDB split.
2. Evaluate an idle-time post-paint prewarm of `base_points_query_runtime` only if the trace shows remaining first-interaction jank.
3. Continue replacing local trim/scope checks with the shared selection-query resolver where any duplication still exists.
4. If desired, remove the remaining `DashboardShellClient` test console warning with an explicit async-load test harness.
5. Design the next overlay transport step for million-point live extension around backend-ranked membership/cohort payloads instead of row-hydration attachment.
6. Revisit whether the remaining repeated `HEAD` requests can be eliminated entirely by registering hot bundle parquet assets under stable local DuckDB file handles instead of HTTP-backed `read_parquet(...)` views.
7. Converge `rag-graph-sync`, `use-rag-query`, DuckDB availability/attachment, and overlay mutation onto the new interaction-runtime contracts before adding PromptBox hover, `@` mention projection, or manuscript fingerprint features.
8. Add internal `GraphInteractionTrace` timing to the canonical browser-side interaction path, then use those timings to set overlay/prompt latency budgets before browser E2E work.
