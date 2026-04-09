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
