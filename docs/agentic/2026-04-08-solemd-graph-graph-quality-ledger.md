# 2026-04-08 SoleMD.Graph Graph Quality Ledger

## Scope

- Graph shell maintainability and orchestration
- Graph build/publish/verify contract hardening
- Graph action/detail boundary cleanup
- Prompt/editor modularization
- Selection and scope-state centralization
- Frontend latency and DuckDB runtime bootstrap optimization
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

- Capture a real browser bootstrap trace on `localhost:3000`
- Eliminate repeated base bundle `HEAD`/metadata churn without adding a second runtime path
- Re-codify the asset/bootstrap rule in the canonical performance doc

### Batch 8

- Remove hidden first-paint interactive-query warmup from the shell
- Re-verify browser request churn on `localhost:3000`
- Keep interactive query-runtime promotion strictly demand-driven

## Findings

- `features/graph/components/shell/DashboardShell.tsx` currently has no local diff and is a thin dynamic wrapper.
- `features/graph/components/shell/DashboardShellClient.tsx` has active external edits and appears to have dropped the dataset warmup path while adding dynamic imports.
- `app/actions/graph.ts` has one dependent: `features/graph/lib/detail-service.ts`.
- `features/graph/components/panels/DetailPanel.tsx` and `features/graph/components/panels/detail/use-detail-data.ts` currently use only local DuckDB-backed detail, not remote graph detail.
- `base_points_web` is a valid canonical query surface immediately after session bootstrap; the regression was that session info/table/search paths were still forcing `ensurePrimaryQueryTables()` before dataset reads.
- The clean split is two-phase: canonical attached bundle views for startup, then one shared promotion into `base_points_query_runtime` when selection/current-scope-heavy interaction begins.

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

- Captured a visible Chrome reload baseline on `http://localhost:3000` and confirmed repeated `HEAD` storms on `base_points.parquet`/`base_clusters.parquet` during bootstrap
- Added one canonical DuckDB bundle-file registration layer so bundle parquet assets are registered once per session under stable logical file names instead of being referenced by raw HTTP URLs in every `read_parquet(...)` view
- Restored checksum-scoped graph asset catalog caching on the bundle route so repeated `HEAD`/`GET` probes reuse one graph-run lookup and one asset stat pass
- Added regression coverage for bundle file registration and checksum-scoped asset catalog reuse

### Batch 8

- Removed the shell-level `primeInteractiveQueryTables()` idle prewarm from `use-dashboard-shell-controller.ts`
- Removed the now-dead `primeInteractiveQueryTables()` public query/session surface
- Updated `DashboardShellClient` regression coverage so first paint no longer blesses hidden interactive-runtime warmup
- Aligned the implementation with `docs/map/frontend-performance.md`: hidden shell startup must not trigger local query-runtime materialization
- Registered bundle parquet assets with stable DuckDB file handles before session view bootstrap
- Materialized `base_points` and `base_clusters` into local DuckDB tables during startup so mandatory first-paint assets stop behaving like parquet-backed views
- Changed interactive query-runtime promotion to copy from those local canonical tables instead of reading parquet again

### Batch 9

- Removed ask-mode draft mirroring from `use-prompt-box-controller.ts` so prompt typing no longer routes full markdown through top-level PromptBox React state on every keystroke
- Switched prompt submit readiness in `PromptBoxSurface.tsx` to the canonical `hasInput` contract instead of the mirrored markdown string
- Restored the ProseMirror/Tiptap content CSS contract in `app/styles/editor.css` so the editor surface preserves whitespace correctly without runtime warnings
- Added a focused prompt-shell render regression test in `features/graph/components/panels/prompt/__tests__/PromptBoxSurface.test.tsx`
- Re-verified the production app in visible Chrome on `http://localhost:3000`: cold load remained at 38 requests, the ProseMirror warning disappeared on focus, and typing enabled submit without bootstrap regressions

### Batch 10

- Added explicit idle control to `use-typewriter.ts` so placeholder timers stop when the placeholder is hidden
- Wired `use-prompt-box-controller.ts` to disable typewriter churn while the prompt has input or the prompt shell is collapsed
- Added focused regression coverage in `features/graph/hooks/__tests__/use-typewriter.test.ts`
- Added `features/graph/components/panels/prompt/__tests__/PromptBoxSurface.test.tsx` to lock submit readiness to the canonical `hasInput` signal
- Re-verified the production app in visible Chrome on `http://localhost:3000`: no console warnings on load or editor focus, computed editor whitespace is `break-spaces`, and ask submit enables on typed input

### Batch 11

- Added `features/graph/tiptap/index.ts` as the one adapter boundary for Tiptap/ProseMirror imports
- Rewired editor consumers to import Tiptap through the adapter barrel instead of raw `@tiptap/*` packages
- Memoized `features/graph/components/panels/CreateEditor.tsx` so prompt response/chrome rerenders do not rerun the editor subtree when editor-facing props are unchanged
- Added a focused render-isolation regression test in `features/graph/components/panels/editor/__tests__/CreateEditor.test.tsx`
- Codified the Tiptap adapter/isolation requirement in `docs/map/frontend-performance.md` so future prompt/manuscript work keeps one upgrade boundary and one rich-text runtime path

### Batch 12

- Removed eager optional-table loading from point-only overlay producer updates in `features/graph/duckdb/session/overlay-controller.ts`
- Kept the optimization scoped to point-only overlay mutations so prompt/RAG promotion no longer pays universe/link-table work before the graph actually needs those tables
- Added focused session coverage in `features/graph/duckdb/__tests__/session.test.ts` to lock point-only overlay updates off the optional-table path
- Codified the rule in `docs/map/frontend-performance.md`: point-only overlay and attachment paths must not eagerly load optional universe/link tables

### Batch 13

- Reordered `ensureGraphPaperRefsAvailable` in `features/graph/duckdb/session/query-controller.ts` to prefer targeted browser attachment before hydrating `universe_points.parquet`
- Kept `universe_points` as a fallback only for graph paper refs still unresolved after the targeted attach path
- Added focused query-controller coverage in `features/graph/duckdb/__tests__/query-controller.test.ts` for both the targeted-attach fast path and the bundled-universe fallback
- Verified the live PromptBox path against the running engine on `http://localhost:3000`: submit now hits real evidence, and the first graph-side follow-up stays on the narrower overlay resolution path unless unresolved refs force a universe fallback

### Batch 14

- Made ask-stream graph projection idempotent in `features/graph/components/panels/prompt/use-rag-query.ts` so duplicate `onData`/`onFinish` payloads for the same backend response no longer rerun PromptBox graph sync
- Taught `ensureGraphPaperRefsAvailable` in `features/graph/duckdb/session/query-controller.ts` to reuse already-local rows from `universe_points_web` before posting another targeted attach request
- Added focused coverage in `features/graph/components/panels/prompt/__tests__/use-rag-query.test.ts` and `features/graph/duckdb/__tests__/query-controller.test.ts` for idempotent ask sync and local-universe reuse
- Re-baselined the live app in Chrome on `http://localhost:3000`: cold reload stayed at 38 requests with no console errors, and first submit stayed off `universe_points.parquet`, leaving duplicated attach posts as the remaining hot-path waste targeted by this batch

### Batch 15

- Introduced a shared editor prompt interaction seam in `features/graph/components/panels/editor/prompt-interactions.ts` so evidence assist now rides the same provider-based menu/trigger contract that future `@` mentions and entity annotations will use
- Refactored `features/graph/components/panels/editor/use-create-editor-controller.ts` and `CreateEditorSurface.tsx` to host generic prompt interaction providers instead of hard-coding evidence-assist menu state
- Kept evidence assist as one provider in `features/graph/components/panels/prompt/evidence-assist.ts`, and routed `PromptBoxSurface.tsx` through that provider rather than a one-off editor branch
- Extended the Tiptap adapter in `features/graph/tiptap/index.ts` with suggestion and decoration exports so future mention/annotation work stays behind the adapter boundary

### Batch 15

- Stabilized `clearAnswerSelection()` in `features/graph/components/panels/prompt/use-rag-query.ts` against selection-source ownership rerenders so one streamed ask response no longer replays graph sync after it selects answer-linked points
- Added a stateful PromptBox regression in `features/graph/components/panels/prompt/__tests__/use-rag-query.test.ts` that reproduces the ownership-rerender path and locks graph sync to a single pass
- Extended the canonical frontend requirement in `docs/map/frontend-performance.md`: prompt/entity/mention graph projection must stay on one shared runtime path, and streamed ask responses must remain idempotent across `onData`, `onFinish`, and ownership rerenders
- Rebuilt and re-baselined the production app in visible Chrome on `http://localhost:3000`: the dopamine/schizophrenia prompt now produces `POST /api/evidence/chat` plus exactly one `POST /api/graph/attach-points`, with no `universe_points.parquet` hydration or duplicate attach post in the hot path

### Batch 16

- Removed the evidence-assist-only wrapper surface from `features/graph/components/panels/prompt/evidence-assist.ts` tests so trigger/default-command regression coverage now proves the shared `features/graph/components/panels/editor/prompt-interactions.ts` contract directly
- Added `features/graph/components/panels/prompt/prompt-interaction-runtime.ts` so PromptBox provider registration and request dispatch are centralized in one small runtime registry instead of `use-prompt-box-controller.ts` hard-coding a single provider path
- Tightened the provider contract in `features/graph/components/panels/editor/prompt-interactions.ts` and `use-create-editor-controller.ts` so prompt interaction menus are structurally non-empty and defensively guarded at runtime before keyboard/menu math runs
- Removed the duplicate `intent` field from `EvidenceAssistRequest` and switched `features/graph/components/panels/prompt/use-rag-query.ts` to treat `commandId` as the canonical evidence intent
- Extended the Tiptap adapter barrel in `features/graph/tiptap/index.ts` with mention, suggestion, plugin-key, transaction, view, renderer, and attribute exports so future `@` references and transient entity highlighting can stay behind the adapter boundary
- Added focused runtime coverage in `features/graph/components/panels/prompt/__tests__/prompt-interaction-runtime.test.ts` and refreshed the prompt/editor suites to lock the new registry and canonical request shape in place

### Batch 17

- Extracted the inline prompt-trigger ProseMirror plugin from `features/graph/components/panels/editor/use-create-editor-controller.ts` into `features/graph/components/panels/editor/prompt-interaction-extension.ts` so the controller keeps shrinking toward a pure editor host
- Centralized prompt interaction menu typing in the new `PromptInteractionMenuState` export so the controller, surface, and extension share one menu-state contract
- Re-verified the prompt/editor slice after extraction with focused Jest, `npm run typecheck`, `npm run lint`, `npm run build`, and a visible Chrome console pass on `http://localhost:3000` with no console errors

## Blockers

- No blocking correctness issues remain.
- The only residual verification noise is a pre-existing React `act(...)` console warning in `features/graph/components/shell/__tests__/DashboardShellClient.test.tsx`; it does not fail tests or the quality gate.
- The visible Chrome debugger is reachable, but foreground-dependent perf audits still need a reliable run before treating Lighthouse output as authoritative.

## Follow-On Work

- If desired, make the dynamic shell test warning-free by wrapping the `next/dynamic` loadable updates in explicit test `act(...)` handling.
- Re-evaluate whether any future remote detail surface should be reintroduced only after an actual engine endpoint exists.

## Commits

- None yet

## Next Recommended Passes

1. Capture a clean foreground Chrome trace and compare first interaction latency before/after the dataset-vs-interactive DuckDB split.
2. Evaluate an idle-time post-paint prewarm of `base_points_query_runtime` only if the trace shows remaining first-interaction jank.
3. Continue replacing local trim/scope checks with the shared selection-query resolver where any duplication still exists.
4. If desired, remove the remaining `DashboardShellClient` test console warning with an explicit async-load test harness.
