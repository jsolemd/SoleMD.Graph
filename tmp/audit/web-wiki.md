# Audit: web-wiki

Slice scope: `apps/web/features/wiki/` — wiki shell, panel, page view, markdown
pipeline, graph runtime bridge, module runtime, registered modules.

## Slice inventory

- **Shell + panel**: `WikiPanel.tsx` (380 LOC), `WikiPageView.tsx` (236),
  `WikiNavigation.tsx` (191), `WikiPageHeader.tsx` (272), `WikiBrowseSheet.tsx`
  (124).
- **Markdown pipeline**: `lib/markdown-pipeline.tsx` (189), `lib/remark-*` (4
  remark plugins, ~75-105 LOC each), `components/WikiMarkdownRenderer.tsx` (113),
  `components/elements/{WikiLink,PaperCitation,Callout,EntityMention,
  AnimationEmbed,AnimationLottiePlayer,AnimationModelViewer}.tsx` (~30-125 LOC
  each).
- **Graph runtime bridge** (`graph-runtime/`): `mount-wiki-graph.ts` (249),
  `interactions.ts` (454), `render-scene.ts` (285), `theme.ts` (178),
  `label-visibility.ts` (171), `simulation-controls.ts`, `build-simulation.ts`
  (76), `fit-view.ts`, `layout-cache.ts` (38), `index.ts` barrel.
- **Wiki graph hosts**: `WikiGraph.tsx` (98), `WikiLocalGraph.tsx` (117),
  `WikiGraphView.tsx` (91), `WikiGraphLegend.tsx` (174).
- **Hooks**: `use-wiki-graph-sync.ts` (280), `use-wiki-page-bundle.ts` (113),
  `use-wiki-page.ts` (57), `use-wiki-page-context.ts`, `use-wiki-backlinks.ts`.
- **Store**: `stores/wiki-store.ts` (195) — Zustand store: route history, graph
  data cache, panel pop-out flags, highlight groups, search query.
- **TOC**: `PanelEdgeToc.tsx` (415), `use-section-toc-state.ts` (235),
  `ViewportTocRail.tsx` (371). Two distinct TOC implementations.
- **Module runtime** (`module-runtime/`): registry, tokens/accent, glossary,
  motion presets, asset paths, types; primitives (`SceneSection`, `ProseBlock`,
  `AnimationStage`, `ModelViewerStage`, `ManimPlayer`, `ChatBubble`,
  `RevealCard`, `ScrollyPin`, `GlossaryHover`, `CitationFootnote`,
  `ObjectiveList`); shells (`ModuleShell`, `ModuleHeader`, `ModuleFooter`);
  sections (`KeyFactsSection`, `MechanismSection`, `BeforeAfterSection`,
  `DefinitionStackSection`, `ResourcesSection`, `CaseVignetteSection`);
  interactions (`StepThrough` 246, `ChatThread` 195, `ToggleCompare` 109,
  `DemoStage` 99).
- **Modules**: `modules/ai-for-mds/` only — `manifest.ts` (81), `page.tsx` (13),
  `content.tsx` (94), `register.ts` (8), `data/*` (8 files), and the
  `sections/foundations/` bespoke section with 7 demo components (116-203 LOC).
- **Tests**: 21 test files across components, lib, graph-runtime, hooks, store.
- **Module manifest centralization**: `register-all.ts` is a one-liner registering
  only `ai-for-mds`. Module discovery is purely import-side-effect.

## Critical issues

### 1. Global `window` keydown hijack in `useChatThread`
`module-runtime/interactions/ChatThread/useChatThread.ts:99-112` registers a
`window.addEventListener("keydown", …)` that captures Space and Enter
**globally** whenever any `<ChatThread>` is mounted, not just when focused. With
multiple `ChatThread` mounts on a page (or even one mount + an unrelated
focusable area), pressing Space/Enter advances every chat thread that exists
and silently `preventDefault()`s the keystroke for the rest of the page (page
scroll, button activation outside the listed tags, etc.). The "not on
INPUT/TEXTAREA/BUTTON/SELECT" guard misses contenteditable, links, and Mantine
overlays. Pattern should be a focus-scoped key handler on the rail root, not a
window listener.

### 2. No error boundary around dynamically-loaded modules
`components/WikiModuleContent.tsx:52-75` wraps the lazy module in `<Suspense>`
but no `ErrorBoundary`. If `register.ts`'s `import("./page")` rejects (network
hiccup, stale chunk, runtime throw), React's lazy throws the rejection into
the parent boundary — there is no parent boundary in the wiki tree. The whole
wiki panel will crash and unmount, taking the dashboard panel with it. Same gap
in `entity-profiles/index.tsx:64`. Wiki page fetches surface their errors
through `useWikiPageBundle` but module render errors do not.

### 3. Module-global tween registry trampled across graph instances
`graph-runtime/interactions.ts:27` declares `const tweens = new Map(...)` at
module scope, and `clearTweens()` (line 44) is called from each
`wireNodeInteractions` cleanup (line 452). If the user opens both the docked
graph and the global-graph overlay (both render `<WikiGraphView>` →
`<WikiGraph>` → `mountWikiGraph`), the second mount's hover tweens will
overwrite the first's because the keys are not scoped per scene, and tearing
down one wipes the other's running tweens. `WikiPanel.tsx:158-166` explicitly
acknowledges shared-Pixi-state bugs ("dual-instance Pixi texture issue") but
the tween registry is the same class of leak and is not addressed. Move
`tweens` into a per-scene `Map` returned by `wireNodeInteractions`.

### 4. `use-wiki-page-bundle` writes state after abort
`hooks/use-wiki-page-bundle.ts:81-103` checks the `signal` only at network
boundaries. The interleaved `setState` calls (lines 83, 98) are not gated on
the controller's aborted state. When `slug` changes mid-flight, the in-flight
backlinks/context promise resolves, the second `setState((s) => …)` updates
state for the **new** slug with stale `backlinks` and `context`. This is
exactly the React stale-closure pattern that causes wrong content to appear in
the panel during fast navigation. Add an `if (signal?.aborted) return;` guard
before each `setState`.

### 5. `mountWikiGraph` does not abort `waitForContainerSize`
`graph-runtime/mount-wiki-graph.ts:226-249` returns a Promise that observes the
container indefinitely until it gets a non-zero size. If the host effect
unmounts before the container is sized, the `ResizeObserver` continues
observing forever (no `AbortSignal`, no external disconnect path, the resolver
never fires `destroy` because the handle is never returned to the caller). The
host's `if (cancelled) handle.destroy()` (`WikiGraph.tsx:70`) only runs after
the promise resolves — which never happens for an unmounted detached node. Leak
on rapid panel close/open while the graph is still warming up.

## Major issues

### 6. `wikiUrlTransform` partial sanitizer
`components/WikiMarkdownRenderer.tsx:37-43` does the right thing for the four
known custom schemes but the fallback only blocks `javascript:`, `vbscript:`,
`data:` after a single `decodeURIComponent` pass. Multiple-encoding bypasses
(`%2522`, double-encoded), unknown dangerous schemes (`file:`, `blob:`,
`mhtml:`), and whitespace-prefixed schemes (`\tjavascript:`) slip through. Use
the `react-markdown` default `urlTransform` (`defaultUrlTransform`) for the
fallback path instead of reimplementing it half-way, then layer wiki-specific
allowlist on top.

### 7. `preprocessWikilinks` can inject markdown via the alias
`lib/remark-wikilinks.ts:31-40` interpolates the alias directly into a markdown
link: `[${displayText}](wiki:${resolvedSlug})`. If wiki content contains
`[[Page|](evil:`, the alias closes the bracket and opens a new URL. Since the
content comes from a controlled CMS this is low-likelihood, but the assumption
is undocumented, and the fix is trivial: escape `]`, `[`, `(` in
`displayText` before interpolation, or build the link via AST instead of string
substitution.

### 8. Race in `use-wiki-graph-sync` overlay commit
`hooks/use-wiki-graph-sync.ts:163-226` checks `controller.signal.aborted` after
each `await` and returns early — but the side effects from earlier
`commitWikiOverlay` (line 172) and `commitSelectionState` (line 206) are not
rolled back when a later step bails. Result: the overlay producer + selection
remain on a stale slug's points. The cleanup effect (line 268) runs only when
`currentSlug` changes via React, not when `showPageOnGraph` is interrupted by
its own abort. Wrap commits in a "rollback on abort" pattern, or commit only
after all reads succeed.

### 9. `mount-wiki-graph` rAF loop and ResizeObserver theme race
`graph-runtime/mount-wiki-graph.ts:152-173`:
- The `animate` rAF loop only stops on the `destroyed` flag, but new `rAF`
  calls are still scheduled inside `animate` after `destroy()` runs if the call
  is mid-flight (the next requestAnimationFrame is queued after the
  `scene.app.renderer.render(...)`). Hold the `rAF` handle and
  `cancelAnimationFrame` it on destroy.
- `themeObserver` (line 195) calls `buildRenderData(scene, nodes, links, …)`
  on `class` mutations of `<html>`. The closure captures the original `nodes`
  array. If theme toggles fire during a simulation tick, the in-progress
  `Graphics` from the previous render are destroyed (`buildRenderData` clears
  via `gfx.destroy()` line 109) while the rAF loop is mid-`updatePositions` →
  TypeError on `l.gfx.clear()`. Wrap in `try/catch` or sequence rebuild after
  rAF.

### 10. Test coverage gaps on critical components and hooks
No tests cover any of: `mountWikiGraph`, `theme`, `build-simulation`,
`use-wiki-page`, `use-wiki-page-bundle`, `WikiMarkdownRenderer`, `WikiPageView`,
`WikiPanel`, `WikiModuleContent`, `remark-entity-mentions`,
`remark-animation-refs`, `module-runtime/registry`, and every interaction shell
(`StepThrough`, `ChatThread`, `ToggleCompare`, `DemoStage`). Tests exist but
cluster around the leaf utilities (`fit-view`, `label-visibility`,
`remark-callouts`, `remark-pmid-citations`, `remark-wikilinks`, `wiki-store`).
Integration paths (mount-teardown, abort behavior, race conditions) are
unverified. No mount/teardown performance regression test for
`mountWikiGraph` despite `frontend-performance.md` being canonical.

### 11. `WikiPageView` empty constants type-mismatch with renderer
`WikiPageView.tsx:35-38` declares
`EMPTY_LINKED_ENTITIES: Record<string, { entity_type: string; concept_id: string }>`
(non-null `concept_id`), but `WikiMarkdownRenderer.tsx:24` and the pipeline
consume `Record<string, { entity_type: string; concept_id: string | null }>`.
Right now the structural narrow accidentally still types-out, but any
consumer that asserts on `concept_id == null` for the empty-fallback path
will get nonsense. Align the types.

### 12. Module load failures lack observability
`use-wiki-page-bundle.ts:67,74` use `console.warn` for backlinks/context
errors. No telemetry channel. Module dynamic-import failures (issue 2) have
no logging at all. Markdown pipeline errors throw silently (no try/catch
inside `WikiMarkdownRenderer`). Any production issue with module loading
will be invisible. Wire to whatever frontend telemetry exists (or document
that none does).

### 13. `setBrowseOpen(false)` does not call `onClick` outside-handler safely
`WikiBrowseSheet.tsx:59-63`: clicking the inner card calls
`stopPropagation()`, but the outer scrim swallows the click via the parent
div's `onClick`. The card sometimes wraps interactive children that Mantine
portals (Tooltip dropdowns, Select option lists) — those portal children land
**outside** the card and **inside** the scrim, so opening any portal-based
descendant in the future will close the sheet. Use `OverlaySurface` /
`OverlayCard` like `WikiPanel.tsx:302-341` does (consistent abstraction).

## Minor issues

### 14. Hairline outlines (memory: `feedback_no_hairline_outlines.md`)
- `WikiPanel.tsx:358` — `border: "1px solid var(--border-default)"` on the
  fullscreen animation overlay.
- `module-runtime/primitives/GlossaryHover.tsx:36` — `border: "1px solid
  var(--border)"`.
- `module-runtime/interactions/StepThrough/StepThrough.tsx:142` — `border: "2px
  solid ${moduleAccentCssVar}"` (acceptable for a *pulse ring* — debatable).
- `entity-profiles/NetworkProfile.tsx:82`, `foundations/PipelineDemo.tsx:172`,
  `foundations/HallucinationDemo.tsx:93,130` — `border: "1px solid …"`.
- `components/elements/AnimationEmbed.tsx:41,52` — `border
  border-[var(--border-subtle)]`.
- `WikiBrowseSheet.tsx:66` — `border-b border-[var(--border-default)]`.
- `WikiLocalGraph.tsx:106` — `rounded-xl border` (default 1px).
Per memory, dark-panel elevation should rely on rim-light + halo + offset, not
hairlines.

### 15. `EntityWikiPage` error message exposes raw fetch error
`use-wiki-page.ts:42`, `use-wiki-page-bundle.ts:88`: `err.message` is rendered
directly. Backend or fetch errors can leak internals (e.g. `TypeError:
NetworkError when attempting to fetch resource. (https://internal/api/...)`).
Use a generic user-facing message and log details to telemetry.

### 16. `AnimationLottiePlayer` no `Response.ok` check
`components/elements/AnimationLottiePlayer.tsx:14-27`: a 404 returning HTML or
a JSON parse error silently sets data to `{}`, which `lottie-react` may render
as a blank canvas. No timeout. No content-type guard.

### 17. `PanelEdgeToc` synthesizes a `mousedown` to hand off resize
`components/PanelEdgeToc.tsx:195-203` dispatches a `MouseEvent("mousedown")` on
the panel's resize handle. This works but couples to React's synthetic event
system in a fragile way: any future refactor of `useFloatingPanel` to listen
on `pointerdown` will silently break gesture handoff. Promote a programmatic
resize entry-point on the panel API instead of synthesizing native events.

### 18. `MutationObserver` on full subtree in `WikiPageView`
`WikiPageView.tsx:85-101` observes `headingSourceRef` with
`{childList: true, subtree: true}`. Every wiki page mutation re-runs
`entriesFromHeadings` — which re-queries the DOM. For long entity pages with
many entity-mention re-renders, this is one observer + one O(N) DOM scan per
batch. Throttle via `requestIdleCallback` or `requestAnimationFrame`; or
diff before `setHeadingEntries`.

### 19. `layout-cache` LRU isn't actually LRU
`graph-runtime/layout-cache.ts:27-33`: when `setCachedPositions` overwrites an
existing key, the existing entry isn't moved to the end — `Map` ordering keeps
insertion position. Result: the eviction policy is "first inserted out" not
"least recently used". Re-mounting the same signature 5 times then a new one
evicts a still-active layout. Re-insert (delete-then-set) on hit/update.

### 20. `WikiGraph.tsx` ignores `highlightNodeIds` in mount-effect deps
`components/WikiGraph.tsx:82-83` disables `react-hooks/exhaustive-deps` and
relies on a separate `useEffect` to apply highlights — but the initial mount
calls `mountWikiGraph(..., highlightNodeIds)` with the value at first render
only. If the effect re-runs (graphData changes), the new mount uses **stale**
`highlightNodeIds` because it was captured during the previous render. Read
from a ref, or pass via the second effect always (skip the prop on mount).

### 21. `wiki-store.fetchGraphData` has a TOCTOU
`stores/wiki-store.ts:130-146`: checks `state.graphLoading` then `set({
graphLoading: true })`. Two concurrent calls (e.g. mount + visibility change
firing simultaneously) can both see `loading=false`, both set `loading=true`,
both fire the network request. Not catastrophic (last-writer wins on the data)
but wastes a fetch. Wrap in a `let inflight: Promise | null` outside the store.

### 22. `Callout` component uses CSS-class concatenation with a remark-supplied
`type`
`components/elements/Callout.tsx:26`: `className={\`wiki-callout
wiki-callout--${type}\`}`. The `\w+` regex in `remark-callouts.ts:15`
constrains `type` to word chars, but if that regex is ever loosened the
className becomes injectable. Defensive: clamp via an allowlist
(`CALLOUT_ICONS` already enumerates the known types).

### 23. `WikiPanel` `globalGraphOpen` Escape handler stops propagation
`WikiPanel.tsx:182, 195` calls `e.stopPropagation()` on the document-level
keydown. If the parent dashboard listens for Escape (likely), wiki swallows it.
Check the propagation chain in `features/graph/`.

### 24. `WikiPanel.handleClose` `useWikiStore.getState().reset()` bypasses
selectors
`WikiPanel.tsx:168-171` reads from the store imperatively inside a callback,
which is fine for `reset` — but the comment "graphData is intentionally
preserved across resets" (`wiki-store.ts:193`) means the next mount retains a
graph from the previous bundle if `graphReleaseId` happens to match. Document
the bundle invalidation contract or include a release-id check.

### 25. `setSelectedPointCount`/`setActiveSelectionSourceId` re-subscribed on
every store-change
`use-wiki-graph-sync.ts:49-59`: pulled via three separate `useDashboardStore`
subscriptions that re-render this hook on every dashboard state change.
Combine into one selector with `shallow` equality.

### 26. `use-section-toc-state` uses `requestAnimationFrame` for setup but no
guard against double-setup on rapid resize
`use-section-toc-state.ts:171-179`: `setupRaf` is reassigned without
cancelling the previous, then assigned again in the resize handler. Multiple
resizes in one frame schedule multiple `setupObserver` runs. Safe but wasteful.

## Reuse / consolidation opportunities

### A. Two TOC implementations
`PanelEdgeToc.tsx` (415 LOC) and `ViewportTocRail.tsx` (371 LOC) both render
edge TOCs from headings/sections. Confirm whether one can be deleted, or
extract the shared logic (`entriesFromHeadings`, color sequence, scroll
tracking) into one shared module.

### B. `useChatThread` keyboard handler should be the `StepThrough` keyboard
pattern
`StepThrough.tsx:53-64` keys off the rail root via `onKeyDown` + `tabIndex`.
`ChatThread` does the same job via `window.addEventListener` (issue 1). Share
a `useKeyboardAdvance({ next, prev, scope })` hook scoped to a ref.

### C. AnimationEmbed manifest dispatch duplicates registry pattern
`components/elements/AnimationEmbed.tsx:82-114`: switching on
`refData.format` could move into `@/features/animations/registry` so the
wiki adapter just calls `getAnimationComponent(name)`. Keeps the wiki slice
free of animation-format knowledge.

### D. Module registry hardcodes one module
`modules/register-all.ts` is a 1-line file. Either delete it (inline into
`WikiModuleContent`) or convert to a manifest-driven discovery
(`import.meta.glob` style) so adding a module doesn't require editing two
files. Same shape as the `module/SKILL` doc-noted "module manifest" idea.

### E. Three identical "shared loading skeleton" helpers
`ModuleLoadingSkeleton` in `WikiModuleContent.tsx:26-35` is bespoke. The wiki
slice already has `PanelInlineLoader` and `Skeleton` directly — pick one and
share.

### F. `EMPTY_*` constants duplicated
`WikiPageView.tsx:33-39` and `WikiMarkdownRenderer.tsx:53-57` redefine the
same `EMPTY_LINKED_ENTITIES`/`EMPTY_BODY_ENTITY_MATCHES` constants — and at
different types (issue 11). Centralize in `lib/markdown-pipeline.tsx` or a
neighbouring `lib/wiki-empties.ts`.

### G. `mountWikiGraph` and Graph host components duplicate intents construction
`WikiGraph.tsx`, `WikiLocalGraph.tsx`, and `WikiGraphView.tsx` each
`useMemo({ onOpenPage, ... })`. A `useWikiGraphIntents()` hook would
centralize the contract and remove the deps-array bug (issue 20).

## What's solid

- **Adapter discipline**: zero direct `cosmograph` or `duckdb` imports inside
  the wiki slice. Graph reads go through `@solemd/graph` query bundles. Pixi
  is encapsulated inside `graph-runtime/`.
- **No `dangerouslySetInnerHTML`, no `eval`, no `Function()`** anywhere in
  the slice — markdown rendering goes through `react-markdown` with custom
  components and an explicit `urlTransform`.
- **Markdown plugin separation is clean**: each remark plugin is small and
  focused; `visit-text.ts` is a thoughtful CJS/Jest-friendly substitute for
  `unist-util-visit`.
- **Layout cache and palette caching** show real attention to mount cost
  (`layout-cache.ts`, `theme.ts:invalidatePalette`).
- **Pan-latch + tap-vs-pan disambiguation** in
  `graph-runtime/interactions.ts` is mature and reuses the shared
  `pointer-gesture` primitives.
- **Concurrent fetch path** in `use-wiki-page-bundle.ts` resolves page early
  while backlinks/context fill in — good UX pattern (modulo the abort race).
- **600-LOC limit respected**: largest file is `interactions.ts` at 454 —
  comfortably under the budget. Several files (`PanelEdgeToc.tsx` 415,
  `WikiPanel.tsx` 380, `ViewportTocRail.tsx` 371) are approaching it; watch
  on next change.
- **Tests exist for the right units**: the markdown plugins and graph-runtime
  primitives have direct tests.
- **Route history with forward/back** in `wiki-store.ts` is correctly modeled
  (slice + index, not double-list).

## Recommended priority (top 5)

1. **Fix the global window keydown in `useChatThread`** (issue 1). High user
   impact — silently breaks Space/Enter site-wide whenever a wiki module page
   with a `<ChatThread>` is open, including the only registered module
   (`ai-for-mds`).
2. **Wrap dynamic module loading in an ErrorBoundary** (issue 2). One bad
   chunk fetch crashes the entire wiki panel and bubbles to the dashboard.
3. **Per-scene tween registry in `graph-runtime/interactions.ts`** (issue 3).
   Two-graph open paths (overlay + docked) are first-class flows in
   `WikiPanel.tsx`; the current code corrupts hover state silently.
4. **Abort-aware `setState` in `use-wiki-page-bundle` + abort guards in
   `use-wiki-graph-sync`** (issues 4 + 8). Stale-content flicker and orphaned
   overlay producers during fast page navigation.
5. **Rebuild data race in `mount-wiki-graph` theme observer** (issue 9). Theme
   toggle while the simulation is ticking is a real user flow and will throw.
   Pair with proper `cancelAnimationFrame` on destroy.

Then sweep:
- Hairline-border audit (issue 14) per memory.
- Test coverage backfill on `mountWikiGraph`, `useWikiPageBundle`,
  `WikiModuleContent` (issue 10) — at minimum mount/teardown and abort tests.
- Consolidate `PanelEdgeToc` / `ViewportTocRail` (opp. A) when next touched.
