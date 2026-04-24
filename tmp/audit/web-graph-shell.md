# Audit: web-graph-shell

Slice covers Next 16 client shell, Zustand stores, dock layout math, panel/prompt/editor surfaces, entity hover/highlight runtime, Cosmograph adapter boundary, and Tiptap adapter for the SoleMD.Graph dashboard. Both `/clean` and `/audit` lenses applied.

## Slice inventory

- `apps/web/features/graph/config.ts` (76 LOC) — pure types only.
- `apps/web/features/graph/index.ts` (4 LOC) — public API; exposes `DashboardShell` + `GraphErrorBoundary`.
- `stores/` — 1 graph store, 1 dashboard composite store, 8 slices, 1 wiki-route mirror, full `__tests__/` parity (8 tests including selector-isolation).
- `hooks/` — 6 cross-surface hooks (graph bundle, warmup, mode controller, drag-resize, selection-query-state, typewriter); 3 of 6 have tests.
- `tiptap/` — single barrel that ring-fences `@tiptap/*` imports.
- `components/`
  - `shell/` (15 files) — `DashboardShell` lazy-loads `DashboardShellClient` via `next/dynamic` (`ssr: false`); ResponsiveBoundary, mobile/desktop split, loading constellations.
  - `chrome/` — ChromeBar (522 LOC, biggest file in slice), ModeToggleBar, TimelineBar, brand wordmark.
  - `canvas/` — `GraphCanvas` (memoized, dynamic-loads `cosmograph/GraphRenderer`) + `CosmographWidgetBoundary` error boundary.
  - `panels/` — `PanelShell/`, `PromptBox`, `DetailPanel`, `CreateEditor`, `editor/`, `prompt/` (15 files), `detail/` helpers, `PanelChrome`.
  - `entities/` — DOM highlight runtime, `EntityHoverCardProvider`, hover card, overlay sync hooks (3), match metrics ring buffer.
  - `explore/` — Filters/Config/Points/Canvas controls; `info/`, `info-panel/`, `query-panel/`, `data-table/`, `points/` subtrees.
  - `overlay/` — `FloatingHoverCard`.
- File-size discipline: largest file `chrome/ChromeBar.tsx` at 522 LOC; nothing exceeds the 600-LOC ceiling.

Approx 175 source + 30 test files in scope.

## Critical issues

None. No `dangerouslySetInnerHTML`, no direct `@cosmograph/react` imports outside the adapter, no unsanitized external HTML in the Tiptap pipeline (StarterKit + Markdown only; reference-mention and entity-highlight extensions emit text + Decoration attrs, not HTML), no plain-text entity payloads concatenated into innerHTML.

## Major issues

1. **Module-level side-effect import in `stores/index.ts:11`** — `import './wiki-route-mirror'` runs at first import time. `wiki-route-mirror.ts:22-26` reads `useWikiStore.getState()` and calls `useDashboardStore.setState()` synchronously, then subscribes for life. There is no unsubscribe path (the `useWikiStore.subscribe` return value is dropped at line 24). This is acceptable in production, but in tests / Fast Refresh it leaks a subscription per HMR cycle and silently couples two feature trees. Track the unsubscribe and expose a teardown for test reset.

2. **Render-time mutation in `hooks/use-graph-bundle.ts:36-43`** — the bundle session ref is reassigned during render based on prop comparison. Works today because there's only one consumer, but this is the pattern React 19 strict-mode double-invokes; if a parent re-renders mid-load, `sessionBundleRef.current` flips before the in-flight effect cleanup runs, and the cleanup will race against a new `loadGraphBundle` for the same checksum. Move the comparison into a `useMemo`/effect or use `useSyncExternalStore`.

3. **Render-time ref write in `panels/editor/use-create-editor-controller.ts:383`** — `editorRef.current = editor` happens during render, after the `useEditor` hook returns. With React 19's render-may-be-discarded model this can cache a Tiptap editor instance from a discarded render attempt. Move to a `useLayoutEffect` keyed on `editor`.

4. **`hooks/use-drag-resize.ts:1-50` is mouse-only.** No `pointerdown`/`pointermove`/`pointerup`, no `setPointerCapture`, no `touchAction: 'none'` styling. This breaks resize on touch devices — direct violation of the responsive-parity rule for the data-table grip and any consumer. Convert to PointerEvents and gate the listeners on `pointerType !== 'mouse' || isPrimary`.

5. **PanelShell desktop resize handles `panels/PanelShell/PanelShell.tsx:378-401` are pure DOM `onMouseDown` divs** with no keyboard alternative, no aria role/label, and no touch target sizing (2-4 px wide). Desktop-only, but even on desktop the lack of aria + keyboard sizing breaks WCAG and parity with the +/-/0 keybindings the same component already exposes for content scale.

6. **ChromeBar `chrome/ChromeBar.tsx` (522 LOC)** is dangerously close to the 600-LOC ceiling and concentrates panel registry, menu state machine, camera/export/selection actions, and pill rendering in one file. Recommend extracting `useChromeMenus`, the panel registry, and per-pill render groups to bring this back under 350 LOC.

7. **`use-dashboard-shell-controller.ts:112-114`** resets `graphPaintReady` to false whenever `canvas?.overlayRevision` changes. Overlay revisions bump on every entity selection/RAG response — this re-shows the loading curtain mid-session. Verify this is intentional; if not, key only on `bundle.bundleChecksum`.

8. **`stores/dashboard-store.ts:274-284` layout cache is a module-level singleton.** It's invalidated by reference equality on `openPanels`/`floatingObstacles`/`panelPositions`. Fine for one store instance, but in tests where each test re-creates `useDashboardStore` the cache will return stale results from a previous test's shape. Tests using `computeDockedLayout` should reset the cache, or move the cache into store state.

## Minor issues

1. `use-prompt-box-controller.ts:134` — `useMemo` deps disable the lint and intentionally re-pick examples on mode change. Consider an explicit `useEffect` + `useState` so future readers don't think the deps array is a bug.
2. `use-prompt-box-controller.ts:290-296` and `301` — bare `setTimeout(..., 100)` for editor focus after pill click / mode change. Magic numbers, not motion-system constants.
3. `EntityHoverCardProvider.tsx:42-44` — `detailCacheRef` is per-provider instance and never evicts; long sessions accumulate cached entity-detail promises. Add LRU or TTL eviction (the DOM highlight runtime already has a sweep; reuse pattern).
4. `use-dom-entity-highlights.ts:34-50` — module-scoped `setInterval` sweep is started by any first consumer and only torn down when the cache empties. If cache empties between component lifecycles the timer churns. Acceptable, but cleaner to scope the sweep to the hook lifecycle.
5. `use-dom-entity-highlights.ts:230-238` — error from `fetchGraphEntityMatches` is swallowed with no observability. At minimum gate behind `process.env.NODE_ENV !== 'production'` and emit a debug log.
6. `panels/PanelShell/PanelShell.tsx:230-240` — ResizeObserver/RAF cleanup is correct, but `setPanelBottomY(side, 0)` runs in cleanup AND in the early-return branches of the effect, which can cause flicker if mobile flips between docked/undocked rapidly.
7. `use-rag-query.ts:189-196` `onError` handler swallows the error after surfacing the message, but does not log. Worth a single `console.warn` in non-prod for support.
8. `use-graph-bundle.ts:165-177` — `error: error instanceof Error ? error : new Error('Failed to load graph bundle')` — generic fallback message loses the original `unknown` payload. Stringify it into the new Error.
9. `entity-match-metrics.ts:69-76` — global debug handle is fine but `(globalThis as Record<string, unknown>)` is repeated; lift to a typed helper in `lib/`.
10. `use-shell-variant.ts:39-40` — when `width === 0` and SSR, fallback uses `MOBILE_SHELL_MAX_WIDTH + 1`, biasing initial render to desktop. On a real mobile device this means a one-frame desktop layout flash before the first effect runs. Use a CSS media-query class on `<html>` set in `layout.tsx` instead.
11. `wiki-route-mirror.ts` — no test file; the cross-store sync is load-bearing for dock width and untested.
12. `useDragResize` lacks tests.
13. `GraphCanvas.tsx:8-20` — `dynamic(() => import('@/features/graph/cosmograph/GraphRenderer'))` is correct; consider adding `ssr: false` explicitly even though it's the default for the loader returning a client module — defends against future Next changes.
14. `MobileShell.tsx:80-90` — `openPanelIds` is a fresh array each render and is in the `useEffect` deps; the effect runs every render even when no panels changed. Memoize with `useMemo` keyed on `openPanels`.
15. `panels/PanelShell/PanelShell.tsx:251-255` — width tween threshold `WIDTH_SNAP_THRESHOLD = 80` is a magic constant; live alongside other motion tokens in `lib/motion.ts`.
16. `EntityHoverCardProvider.tsx:130` — `document.addEventListener("click", handler, true)` uses capture phase; documented intent but no e2e test for the touch + outside-click flow.

## Reuse / consolidation opportunities

1. **Pointer-vs-mouse gating** appears at least 3 times: `use-dom-entity-highlights.ts:373/380/395-407`, `EntityHoverCardProvider.tsx`, prompt drag. Extract a `usePointerType()` hook (already partially in shell skill references).
2. **`debounce + abortController` pattern** in `use-dom-entity-highlights.ts` and `use-create-editor-controller.ts` (debouncedSync) and `use-rag-query.ts` (request id ref). Introduce a `useAbortableDebounced` primitive in `hooks/`.
3. **`document.removeEventListener` cleanup with stored ref** — `use-drag-resize.ts:40-47` and `EntityHoverCardProvider.tsx:130-132` both keep listener refs for cleanup. Standardize on a `useDocumentEventListener` hook.
4. **`if (state.x === next) return state` no-op pattern** — every Zustand setter in `panel-slice.ts`, `graph-store.ts` reimplements equality. Wrap in a small `setIfChanged(set, key)` helper to halve the slice LOC.
5. **`document.documentElement.style.setProperty(...)` for mode tokens** in `ModeColorSync.tsx`; the same pattern exists for theme tokens elsewhere (per CLAUDE.md). Centralize a `useCssVarSync(name, value)` hook.
6. **Mobile vs desktop `if (shellVariant === 'mobile') openOnlyPanel(...) else openPanel(...)`** repeated in `DashboardShellViewport.tsx:99-104` and `use-prompt-box-controller.ts:194-200`. Add a `panelOpenStrategy(shellVariant)` selector or a `openPanelForVariant` action on the panel slice.
7. **PubTator URL builder** in `EntityHoverCard.tsx:35-53` is local; if the same logic exists for Detail panel or Wiki, lift to `lib/pubtator-url.ts`.

## What's solid

- Adapter boundaries are clean: `tiptap/index.ts` is the only Tiptap import surface; no `@cosmograph/react` or `@tiptap/*` direct imports anywhere in the slice. `/clean` adapter rule satisfied.
- `next/dynamic` with `ssr:false` is used at every client-only boundary (`DashboardShell`, `GraphCanvas`, `MobileShell.PromptBox`).
- No `dangerouslySetInnerHTML` anywhere in the slice; the only `innerHTML` references are in test fixtures.
- Zustand store discipline: aggressive no-op equality in `graph-store.ts`, `panel-slice.ts`. `useShallow` is used at every multi-field selector site (`use-dashboard-shell-controller.ts`, `use-rag-query.ts`).
- Selectors like `selectBottomClearance`, `selectDockedBottomClearance`, `computeDockedLayout` are pure functions on `DashboardState` — easy to test, no React leakage. Layout cache invalidation via reference equality is the right Zustand idiom.
- Error boundaries exist at two levels: `GraphErrorBoundary` (slice public API) handles WebGL failures explicitly with a brand-aware fallback; `CosmographWidgetBoundary` handles DuckDB-WASM races with a retry button.
- `EntityHoverCardProvider` correctly handles abort/sequencing via `sequenceRef`, separates pinned (touch) from hover (mouse) flows, and has outside-click dismissal in capture phase.
- DOM-highlight runtime in `use-dom-entity-highlights.ts` is one of the more mature pieces in the slice: TreeWalker-based extraction skips already-marked content, MutationObserver disconnect/reconnect prevents observer→re-annotate loops, fingerprint short-circuit skips no-op work, and module-scoped LRU has explicit TTL + sweep.
- Prompt box controller composes ~15 sub-hooks/refs cleanly at 417 LOC, well under ceiling, with refs used to break stale-closure cycles in the chat transport.
- Test coverage on stores is excellent: 8 store test files including a selector-isolation suite that guards against accidental over-subscription.
- `entity-match-metrics.ts` exposes a typed metrics ring + dev-only `globalThis.__entityMatchMetrics` handle — observability win.

## Recommended priority (top 5)

1. **Convert `use-drag-resize.ts` to PointerEvents** with `setPointerCapture` + `touchAction: 'none'`. Mobile-parity rule is non-negotiable; this hook breaks data-table resizing on touch today.
2. **Make `wiki-route-mirror.ts` teardown-aware** and add a `__tests__/wiki-route-mirror.test.ts`. Module-level subscriptions without unsubscribe leak across HMR and tests, and this one bridges two stores in load-bearing geometry math.
3. **Fix render-time ref writes** in `use-graph-bundle.ts:36-43` and `use-create-editor-controller.ts:383`. Move both to `useLayoutEffect`/`useMemo` to avoid React 19 discarded-render hazards.
4. **Decompose `chrome/ChromeBar.tsx`** (522 LOC) into a `useChromeMenus` hook, a `panel-registry.ts` constants module, and per-pill subcomponents. It is the single biggest 600-LOC-ceiling risk in the slice and the most-edited surface.
5. **Audit `use-dashboard-shell-controller.ts:112-114`** — `setGraphPaintReady(false)` on every `canvas?.overlayRevision` flip likely re-shows the loading overlay every overlay change. Verify against the runtime; if unintended, drop `canvas?.overlayRevision` from the deps array.
