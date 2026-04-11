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

### Batch 18

- Freed `@` for persisted reference mentions by moving evidence assist onto the explicit `/evidence` trigger in `features/graph/components/panels/prompt/evidence-assist.ts`
- Added `features/graph/components/panels/prompt/text-context-window.ts` and `prompt-scope-request.ts` so sentence-window extraction and selection-scope resolution stay canonical across evidence assist, prompt submit, and future mention/entity workflows
- Added `features/graph/components/panels/prompt/use-reference-mention-source.ts` so prompt-side `@` suggestions resolve through the existing graph evidence adapter with support intent instead of adding a second editor-local lookup path
- Added `features/graph/components/panels/editor/reference-mention-extension.ts` so persisted references now ride a native Tiptap mention extension behind the adapter boundary and serialize plain text as `@[corpusId]` for ask-mode request handling
- Added `features/graph/components/panels/editor/entity-highlight-extension.ts` as the transient decoration/plugin seam for future prompt-entity highlighting without storing those annotations in document content
- Added `features/graph/components/panels/editor/EditorOverlaySurface.tsx` so prompt menus, reference suggestions, and future entity hover cards share one external editor overlay root instead of accumulating UI inside `EditorContent`
- Rewired `use-create-editor-controller.ts`, `CreateEditorSurface.tsx`, `PromptBoxSurface.tsx`, and `use-prompt-box-controller.ts` so the editor remains a thin host while PromptBox owns provider registration and mention-source wiring
- Added focused frontend regressions in:
  - `features/graph/components/panels/prompt/__tests__/use-reference-mention-source.test.ts`
  - `features/graph/components/panels/prompt/__tests__/text-context-window.test.ts`
  - refreshed prompt/editor surface tests for the widened editor contract
- Verified this slice with focused Jest, `npm run lint`, `npm run typecheck`, and `npm run build`
- Browser note: a stale chunk/runtime mismatch on the old `3000` process surfaced during reload; restarting the `3000` dev server cleared that mismatch, but the Chrome DevTools visible transport dropped immediately after the restart, so final live `@` interaction smoke still needs one clean foreground browser session

### Batch 19

- Added a dedicated canonical entity API boundary under `engine/app/api/entities.py` with reusable service/repository modules in `engine/app/entities/**` so live entity matching and hover detail no longer need to piggyback on the evidence search surface
- Implemented exact text-window entity matching against `solemd.entity_aliases` plus canonical hover detail from `solemd.entities`, with runtime concept namespace/id normalization shared through `engine/app/rag/entity_runtime_keys.py`
- Added frontend entity transport in `app/actions/entity.ts`, `lib/engine/entities.ts`, `features/graph/lib/entity-service.ts`, and `features/graph/types/entity-service.ts` so entity match/detail requests have one stable adapter surface
- Wired `features/graph/components/panels/editor/use-editor-entity-runtime.ts` into `use-create-editor-controller.ts` so entity matching, caching, and hover detail stay local to the editor runtime instead of rerendering PromptBox shell state
- Kept transient entity highlighting in `entity-highlight-extension.ts` and hover rendering in `EditorOverlaySurface.tsx`, with detail fetched separately so decoration payloads carry identity and ranges only
- Added focused regression coverage in `engine/test/test_entity_service.py`, `engine/test/test_entity_api.py`, and `features/graph/components/panels/editor/__tests__/use-editor-entity-runtime.test.ts`
- Verified this slice with focused Jest, engine pytest, `npm run typecheck`, `npm run lint`, and `npm run build`
- Browser note: the visible Chrome MCP health check passed, but the foreground DevTools transport still closed on live tool calls this pass, so the final interactive browser smoke remains pending even though `http://localhost:3000` is serving and the production build is green

### Batch 20

- Extracted the canonical text-window match/detail cache into `features/graph/components/entities/use-entity-text-runtime.ts` plus `entity-text-runtime.ts`, leaving `features/graph/components/panels/editor/use-editor-entity-runtime.ts` as a thin editor adapter over shared entity runtime contracts
- Pulled the reusable hover-card model and surface into `features/graph/components/entities/entity-hover-card.ts` and `EntityHoverCard.tsx` so hover detail is no longer coupled to the editor subtree
- Replaced the old entity server-action path with explicit Next route handlers in `app/api/entities/match/route.ts` and `app/api/entities/detail/route.ts`, then removed `app/actions/entity.ts`; client entity requests now travel through `features/graph/lib/entity-service.ts` as ordinary HTTP calls instead of hidden `POST /` form actions
- Fixed `lib/engine/entities.ts` detail mapping to match the real FastAPI alias payload shape so hover-card aliases will deserialize correctly once the engine is available
- Hardened `use-entity-text-runtime.ts` so failed match/detail requests delete stale cache entries and degrade quietly instead of surfacing uncaught promise errors during prompt typing
- Tightened `features/graph/hooks/use-graph-bundle.ts` so same-checksum rerenders reuse the active DuckDB session and only invalidate the previous session when the bundle checksum actually changes
- Added focused regression coverage in `features/graph/components/entities/__tests__/use-entity-text-runtime.test.ts`, `features/graph/components/entities/__tests__/EntityHoverCard.test.tsx`, and `features/graph/hooks/__tests__/use-graph-bundle.test.ts`
- Verified this slice with focused Jest, engine pytest, `npm run typecheck`, `npm run lint`, and `npm run build`
- Browser note: after the bundle-hook fix, a hard reload on `http://localhost:3000` dropped the duplicate DuckDB bootstrap in dev from two worker/wasm/parquet-extension/base-parquet fetches to one each; with the engine down, prompt typing no longer throws uncaught entity-match promise errors, though the visible-browser text-injection path still needs a cleaner manual smoke before claiming live entity highlighting end to end

### Batch 21

- Restored the canonical upstream entity-ref adapter path by making `features/graph/components/panels/editor/use-editor-entity-runtime.ts` emit deduplicated canonical entity refs alongside transient highlights and hover state
- Threaded `onEntityRefsChange` through `features/graph/components/panels/editor/use-create-editor-controller.ts`, `features/graph/components/panels/CreateEditor.tsx`, and `features/graph/components/panels/prompt/PromptBoxSurface.tsx` so the editor subtree stays the only place that understands TipTap text-window entity matching
- Centralized lightweight overlay ref typing and keying in `features/graph/types/entity-service.ts` and `features/graph/lib/entity-overlay-refs.ts`, then reused that helper in `use-entity-overlay-sync.ts` and `use-prompt-box-controller.ts` to avoid prompt-shell-local dedupe/key logic drift
- Re-codified the contract in `docs/map/frontend-performance.md`: prompt surfaces may pass entity-ref callbacks through, but they must not derive overlay refs locally or bypass the shared entity overlay/native selection runtime
- Added focused regressions in `features/graph/components/panels/editor/__tests__/use-editor-entity-runtime.test.ts`, `features/graph/components/panels/editor/__tests__/CreateEditor.test.tsx`, and `features/graph/components/panels/prompt/__tests__/PromptBoxSurface.test.tsx`

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

### Batch 22

- Re-reviewed the typed-entity overlay architecture after the reverted-editor concern and confirmed the canonical upstream path is restored: `useEditorEntityRuntime` derives canonical entity refs from entity matches, `use-create-editor-controller.ts` emits them via `onEntityRefsChange`, `PromptBoxSurface.tsx` threads that callback into `CreateEditor`, and `use-prompt-box-controller.ts` remains the sole owner of entity-overlay sync plus native Cosmograph selection
- Kept entity-ref identity centralized in `features/graph/lib/entity-overlay-refs.ts` so the editor runtime, prompt controller, and entity overlay hook share one dedupe/key/equality contract instead of recomputing that logic in multiple places
- Refreshed focused regressions in `features/graph/components/panels/editor/__tests__/use-editor-entity-runtime.test.ts`, `features/graph/components/panels/editor/__tests__/CreateEditor.test.tsx`, `features/graph/components/panels/prompt/__tests__/PromptBoxSurface.test.tsx`, and `features/graph/components/panels/prompt/__tests__/use-prompt-box-controller.test.ts`
- Verified the restored architecture with focused Jest, a scoped lint pass on the touched files, and `npm run build`; repo-wide `npm run lint` still flags pre-existing `.tmp/` smoke artifacts outside this change set, while `npm run lint -- --ignore-pattern '.tmp/**'` passes

### Batch 23

- Investigated the low schizophrenia overlay count and confirmed the live `55` result is not a frontend/native-selection bug: it matches the current `solemd.paper_entity_mentions` warehouse subset exactly
- Verified the warehouse boundary in the live DB: `paper_entity_mentions` covers `469` corpus ids, while `graph_points` covers `2,452,643`; `paper_documents`/`paper_blocks`/`paper_sentences` sit on the same small warehouse subset
- Verified that broad entity coverage already exists in `pubtator.entity_annotations` (`318,061,200` rows / `13,848,062` PMIDs) and that schizophrenia (`MESH:D012559`) maps to `157,402` graph papers via `pubtator.entity_annotations -> solemd.corpus -> solemd.graph_points`
- Confirmed the architectural cause in code: `paper_entity_mentions` is produced by the RAG warehouse/BioCXML parse-and-write path (`rag_ingest/source_parsers.py`, `rag_ingest/write_repository.py`) and is therefore the wrong source for graph-scale entity overlay
- Codified the canonical rule in `docs/map/frontend-performance.md`: graph-scale entity overlay must use a dedicated projection sourced from broad PubTator coverage, while `paper_entity_mentions` remains the span-grounded RAG/wiki table

### Batch 23

- Audited the live entity-overlay count mismatch against the running warehouse and confirmed the low schizophrenia overlay count is a data-coverage issue, not a frontend/native-selection bug
- Live DB counts at inspection time:
  - `solemd.papers`: `14,060,679`
  - `solemd.graph_points`: `2,452,643` distinct papers
  - `solemd.paper_documents`: `697` papers
  - `solemd.paper_entity_mentions`: `95,494` rows across `469` papers
  - `solemd.entities` schizophrenia catalog row: `paper_count = 250,471`
  - exact schizophrenia mention coverage in `paper_entity_mentions` for `disease:D012559`: `56` papers, `55` of which are present in `graph_points`
- Verified that the live `POST /api/entities/overlay` route on `localhost:3000` returns `55` schizophrenia graph refs even with `limit: 500`, so the count is not being truncated by the frontend overlay request
- Traced the write path and confirmed `paper_entity_mentions` is populated only through warehouse ingest of parsed source groups in `engine/app/rag_ingest/warehouse_writer.py` and `write_batch_builder.py`; the current live mention rows are all `biocxml`-sourced, meaning papers without BioC/PubTator ingest contribute zero exact entity mentions
- Conclusion: typed entity overlay currently reflects exact warehouse-backed entity mentions for the small parsed-source subset, not corpus-global entity prevalence across the full graph corpus

### Batch 24

- Corrected the entity interaction contract so typed entities no longer mutate the graph automatically: `use-editor-entity-runtime.ts` now stays on highlight + hover detail only, and `use-prompt-box-controller.ts` routes graph mutation exclusively through an explicit `handleShowEntityOnGraph` action
- Reworked `features/graph/components/entities/use-entity-overlay-sync.ts` into an imperative shared overlay controller that explicit entity actions call on demand; the old typing-driven effect path was removed instead of being left alongside the new contract
- Added a dedicated `ENTITY_GRAPH_OVERLAY_PRODUCER` in `features/graph/lib/overlay-producers.ts` so explicit entity graph actions do not piggyback on the wiki producer identity
- Made the hover card actionable and interaction-safe: `use-entity-text-runtime.ts` now keeps hover detail alive across pointer travel into the overlay surface, `EntityHoverCard.tsx` renders an explicit `Show on graph` action, and the editor overlay surface forwards that action back through the shared prompt/runtime path
- Updated the canonical requirements in `docs/map/frontend-performance.md` to encode the new rule: typed entities stay local to highlight/hover detail until an explicit entity action requests graph projection, and answer responses remain the canonical Enter-driven selection path
- Updated `features/graph/components/panels/prompt/use-prompt-box-controller.ts` so ask-mode submit clears any explicit entity overlay selection before delegating to the canonical RAG response-selection path; Enter-driven graph selection remains owned by response graph signals rather than typed-entity matches
- Refreshed focused regression coverage in `features/graph/components/entities/__tests__/EntityHoverCard.test.tsx`, `features/graph/components/entities/__tests__/use-entity-text-runtime.test.ts`, `features/graph/components/panels/editor/__tests__/use-editor-entity-runtime.test.ts`, `features/graph/components/panels/editor/__tests__/CreateEditor.test.tsx`, `features/graph/components/panels/prompt/__tests__/PromptBoxSurface.test.tsx`, `features/graph/components/panels/prompt/__tests__/use-prompt-box-controller.test.ts`, and `features/graph/lib/__tests__/entity-overlay-refs.test.ts`
- Verified the pass with focused Jest, `npm run build`, scoped eslint on touched runtime files, and `npm run lint -- --ignore-pattern '.tmp/**'`

### Batch 25

- Converted the entity hover surface into a reusable floating overlay primitive in `features/graph/components/overlay/FloatingHoverCard.tsx` and kept `EntityHoverCard.tsx` focused on entity content only, so future wiki/graph hover surfaces can reuse one interactive shell instead of duplicating overlay behavior
- Re-styled the entity hover content to follow panel standards by reusing `PanelShell` typography, chrome, pill, and accent-card tokens rather than inventing a tooltip-specific visual language
- Added explicit adapter-backed actions to the hover card: `Show on graph` stays on the shared graph-selection path, while `Open wiki` now routes through the prompt controller into `setWikiOpen(true)` plus `useWikiStore().navigateToPage(...)`; the editor layer does not mutate graph/wiki state directly
- Added `features/wiki/lib/entity-wiki-route.ts` as the single frontend entity-to-wiki slug resolver so entity hover actions do not bake route formatting into panel/editor code
- Cleaned the prompt/wiki integration to match the actual shell model: wiki remains independent of `activePanel`, and hover-driven wiki navigation opens the wiki panel through the existing `wikiOpen` state instead of forcing `activePanel = "wiki"`
- Verified this pass with focused Jest (`EntityHoverCard`, `CreateEditor`, `PromptBoxSurface`, `use-prompt-box-controller`, and wiki route tests), `npm run build`, `npm run lint -- --ignore-pattern '.tmp/**'`, and a live `curl` check confirming `localhost:3000` responds with `HTTP/1.1 200 OK`

### Batch 26

- Seeded the wiki runtime from the local `wiki/` content root with a broader concept spread: disorders (`schizophrenia`, `dementia`, `delirium`, `major-depressive-disorder`, `bipolar-disorder`), medications (`clozapine`, `olanzapine`, `haloperidol`, `ketamine`, `lithium`), regions (`prefrontal-cortex`, `hippocampus`, `amygdala`), networks (`default-mode-network`, `salience-network`, `executive-control-network`), and receptors (`dopamine-d2-receptor`, `serotonin-2a-receptor`, `nmda-receptor`, `gaba-a-receptor`)
- Kept the new pages intentionally concise and grounded in representative PMIDs already present in the backend corpus so they function as seed pages for a future RAG-backed wiki pipeline rather than as a disconnected hand-authored parallel system
- Reconstructed the existing live wiki seed pages (`circadian-rhythm`, `melatonin`, `scn`, `serotonin`, and `index`) in the same content root and added cross-links from the original circadian pages into the new disorder and receptor pages so the wiki graph has immediate structural depth rather than isolated leaves
- Synced the seed corpus into `solemd.wiki_pages` with `cd engine && uv run python db/scripts/sync_wiki_pages.py --wiki-dir ../wiki`, resulting in `20` added pages, `5` updated pages, `0` deleted pages, and a live wiki inventory of `25` pages
- Verified the runtime by checking the FastAPI surface directly: `GET /api/v1/wiki/pages` now returns `25`, and `GET /api/v1/wiki/pages/entities/schizophrenia?graph_release_id=current` resolves with the expected title, tags, concept id, and PMID list
- Important operator note: in this environment `wiki/` is a symlinked content root, so the seed markdown lives behind that link rather than as ordinary tracked files inside the Graph git tree; the runtime behavior is correct, but future versioning decisions should make the content source explicit

### Batch 27

- Added explicit wiki section hubs on top of the canonical entity pages: `sections/core-biology`, `sections/disorders`, `sections/psychotropics`, `sections/brain-regions`, `sections/brain-networks`, and `sections/receptors`
- Reworked `index.md` into a true table-of-contents page that points first to section hubs, then to a compact direct-jump list, so the wiki now has a browsable high-level structure instead of a flat page inventory
- Kept canonical entity pages stable at `entities/<slug>` so the entity-hover `Open wiki` adapter and future entity-to-page contracts do not need to change; the section pages are organizational hubs, not replacements for canonical concept slugs
- Synced the new section pages with `cd engine && uv run python db/scripts/sync_wiki_pages.py --wiki-dir ../wiki`, resulting in `6` added pages and `1` updated page, and verified the live runtime now serves `31` wiki pages total
- Verified the structural pages directly through the API: `GET /api/v1/wiki/pages/sections/disorders?graph_release_id=current` resolves correctly, and `GET /api/v1/wiki/pages` now includes the `sections/*` slugs alongside the canonical entity pages

### Batch 28

- Added `engine/app/wiki/content_contract.py` as the canonical wiki page contract layer so authored/generated markdown pages resolve one shared runtime shape: `page_kind`, `section_slug`, and `graph_focus`
- Updated `engine/db/scripts/sync_wiki_pages.py` to normalize wiki frontmatter through the shared contract before sync, which gives future generators one place to target for `section`, `page_kind`, `graph_focus`, and tag normalization instead of duplicating markdown rules
- Extended the wiki runtime models and API payloads so page responses now expose the derived contract explicitly; this keeps future wiki-to-graph and wiki-to-prompt actions on typed runtime fields instead of raw markdown conventions
- Added contract regression coverage in `engine/test/test_wiki_sync.py` and `engine/test/test_wiki_api.py` for section normalization plus `cited_papers` / `entity_exact` default behavior
- Added `docs/map/wiki-generation.md` as the canonical authoring/generation spec for static wiki pages and corrected `docs/map/wiki.md` to match the live schema/runtime instead of the older `resolved_links`-column description
- Updated `docs/map/frontend-performance.md` so page-level wiki graph actions are explicitly required to consume the canonical wiki runtime contract through adapters rather than reparsing markdown in the browser


### Batch 29

- Added `engine/app/api/http.py` as the canonical FastAPI error boundary so request-path routers now share one `run_api()` translation path for `ValueError` → 400 and `LookupError` / `KeyError` / missing results → 404 instead of each endpoint hand-rolling slightly different exception handling
- Updated all four live API families (`entities`, `graph`, `evidence`, `wiki`) to use the shared router helper; routers stay thin and service/repository ownership is now more explicit
- Moved the wiki repository onto pooled request-path connections (`db.pooled()`) to match the existing entity and graph attachment hot paths and eliminate per-call connection setup from the wiki surface
- Applied `engine/db/migrations/058_add_pubtator_entity_context_lookup_index.sql` to the live dev database, adding `pubtator.idx_pt_entity_type_concept_pmid_lookup` on `(entity_type, concept_id, pmid)` for entity-context lookups
- Rejected a slower materialized-CTE rewrite for wiki entity context after measuring it live; kept the specialized count and top-paper SQL separate and instead parallelized them in `engine/app/wiki/repository.py` via a small pooled read executor so independent DB work is concurrent instead of serialized
- Live warm measurements after restart for `entities/major-depressive-disorder`:
  - FastAPI wiki shell: ~22ms (`/api/v1/wiki/pages/...`)
  - Next wiki shell route: ~135ms (`/api/wiki/pages/...`)
  - Next wiki context route: ~1.07s (`/api/wiki/context/...`)
- The context route is materially improved from the earlier ~1.57s path but still too expensive for the long-term end state; the next structural backend step is a reusable entity-to-corpus serving projection so wiki/entity overlay consumers stop recomputing large PubTator joins on demand
- Added canonical API docs in `docs/map/api.md` and updated `docs/map/map.md` + `docs/map/wiki.md` so future agents inherit the shell/context split, pooled request-path rule, shared router error contract, and “index for predicate / project for repeated scans” serving guidance

### Batch 30

- Replaced wiki-local text loading states with the shared `PanelInlineLoader` so wiki page load, wiki graph load, and entity-context pending states now use the canonical panel spinner rather than one-off `Loading...` strings
- Kept the wiki shell/context split intact: page content renders immediately, while `WikiPageHeader` now shows the shared loader inside stats/cards while backend context fills in asynchronously
- Hardened `WikiPageHeader` against partial payloads by normalizing `featured_pmids` / `paper_pmids` locally before computing evidence counts, preventing brittle `.length` access on incomplete page data
- Fixed the wiki top-paper focus behavior in `use-wiki-graph-sync.ts` by centralizing camera rules: multi-paper page activation still uses `fitViewByIndices`, while single-paper focus now uses the native `zoomToPoint` path instead of overfitting the viewport with `fitViewByIndices([index])`
- Preserved native graph-selection ownership: the wiki page action still commits overlay + selection through the existing adapter/state path; only the camera behavior changed for the single-paper case
- Refreshed focused wiki regressions in `features/wiki/hooks/__tests__/use-wiki-graph-sync.test.ts`, `features/wiki/components/__tests__/WikiGraphView.test.tsx`, and `features/wiki/components/__tests__/WikiPanel.test.tsx` to lock the multi-paper fit rule, single-paper bounded focus rule, and async wiki shell rendering contract
- Verified the pass with focused Jest (13 tests passed) and source-file eslint on the touched wiki runtime files; `npm run build` is currently blocked by an unrelated pre-existing `app/template.tsx` import of `unstable_ViewTransition` from `react`, not by the wiki changes

### Batch 31

- Removed the unsupported route-transition wrapper from `app/template.tsx`; the installed stable `react@19.2.4` runtime does not export either `ViewTransition` or `unstable_ViewTransition`, so the previous template could never compile or run correctly
- Removed the dead `experimental.viewTransition` flag from `next.config.ts` so build-time configuration now matches the actual supported frontend runtime instead of advertising a dormant canary-only feature
- Removed the unused route-transition CSS import from `app/globals.css` and deleted `app/styles/animations.css`; keeping transition CSS for a non-existent wrapper was dead surface area rather than a live feature
- Verified the cleanup with `npm run build` and targeted eslint on `next.config.ts` plus `app/globals.css`
