# Plan: Frontend Runtime

Domain: Cosmograph + DuckDB-WASM graph runtime, graph shell (Zustand stores,
dock layout, panel surfaces, chrome), WebGL field substrate (controllers,
renderer, stage, scroll, asset, overlay), landing surfaces, wiki shell + module
runtime + markdown pipeline + Pixi graph bridge, animations (Lottie, GSAP, R3F,
framer-motion, registry), and the global CSS architecture.

Consolidates critical/major/minor findings from:
`web-graph-cosmograph.md`, `web-graph-shell.md`, `web-field-runtime.md`,
`web-field-surfaces.md`, `web-wiki.md`, `web-animations.md`,
`web-styling-css.md`, cross-referenced with `_codex_cross_review.md`.

Scope calibration note: the codex cross-review downgraded two frontend
"criticals" (CSP hairpin — moved to security-planner; `recolorLottie` GC —
MAJOR perf) and upgraded two wiki majors to critical (stale-state-after-abort
in `use-wiki-page-bundle`; module-global tween registry in `graph-runtime`).
The phasing below reflects those recalibrations.

---

## 1. Headline summary

Seven classes of live hazards drive the phasing:

1. **GPU / rAF / ResizeObserver leaks across unmount.** `FieldScene.tsx`
   never disposes its ShaderMaterial/BufferGeometry/pointTexture; its four
   `useEffect`s have no dep arrays and re-run every commit.
   `mount-wiki-graph.ts` schedules rAF without holding a handle and
   observes container size without an `AbortSignal`.
2. **Correctness races on fast navigation.** `useWikiPageBundle` writes
   stale `setState` after abort. `useWikiGraphSync` commits overlay +
   selection without rollback when interrupted. Render-time ref writes in
   `use-graph-bundle.ts` and `use-create-editor-controller.ts` are React 19
   discarded-render hazards.
3. **Module-scope mutable state.** Widget dataset caches grow unboundedly
   across `bundleChecksum × layer × column × overlayRevision`.
   `point-source-registry` can retain ~48 MB of Float32 arrays.
   `graph-runtime/interactions.ts` has a module-scope tween `Map` that
   dual-mounted WikiGraph instances destroy from under each other.
   `wiki-route-mirror.ts` drops its subscribe return value.
4. **Adapter discipline bypassed.** `cosmograph/index.ts` is bypassed by
   9+ intra-slice files; `init-crossfilter-client.ts` reaches
   `@cosmograph/cosmograph/cosmograph/internal` (vendor-version bomb).
   Animation registry is `ComponentType<any>`.
5. **SQL hardening.** `currentPointScopeSql` flows raw through the store
   slot into 6+ query files; safe today only because mosaic-sql mints it.
   Needs a branded opaque type.
6. **Steady-state allocation / layout churn.** `BlobController.projectHotspots`
   writes DOM styles every frame even when invisible; `FieldStoryProgress`
   runs `getElementById` + `getBoundingClientRect` ~180×/sec; `recolorLottie`
   deep-clones 200–600 KB JSON per theme tick; `SearchToggleLottie` polls
   60 rAFs.
7. **Touch / keyboard parity.** `useDragResize` mouse-only; field parallax
   mouse-only; PanelShell resize handles have no keyboard or aria;
   `useChatThread` hijacks Space/Enter site-wide via `window.keydown`.

Effort totals (S ≤ 1 day, M = 1–3, L = 3–7, XL ≥ 1 week):
Phase A 1 XL + 3 L + 6 M + 4 S; B 2 L + 2 M + 2 S; C 2 L + 5 M + 3 S;
D 1 L + 3 M + 2 S; E 1 M + 6 S; F 2 L + 4 M.

---

## 2. Phase order

- **A — leak/race/correctness blockers (A1–A14).** Every SPA navigation
  leaks GPU; every fast slug-nav corrupts wiki state; Field attach effects
  re-run every commit; `useChatThread` hijacks keys. Nothing later is QA-
  able until these are stable.
- **B — adapter + SQL (B1–B6).** Prevent regression classes (Cosmograph
  bump breaks internal import; user-text refactor introduces DuckDB
  injection). Lands before C so extraction can cross the adapter cleanly.
- **C — perf + allocation (C1–C10).** Lottie clone churn, hotspot DOM
  writes, scroll-tick layout, unbounded caches, layer-scaffold reuse.
- **D — responsive parity (D1–D6).** Depends on A (`useChatThread`,
  PanelShell stable) and C (scroll perf must be clean before mobile QA).
- **E — CSS consolidation (E1–E7).** Low-risk, can run in parallel with D.
- **F — test coverage backfill (F1–F10).** Asserts post-fix invariants;
  depends on CI gate the db-infra-ci-planner must add.

---

## 3. Detailed work items

Each item uses: **Severity** · **Source** · **Files** · **Approach** ·
**Effort** (S ≤ 1 day / M = 1–3 / L = 3–7 / XL ≥ 1 week) · **Deps**.

---

### Phase A — leak/race/correctness blockers

**A1. `FieldScene.tsx` WebGL dispose on unmount.** CRITICAL · field-runtime C1
· `apps/web/features/field/renderer/FieldScene.tsx:259-265, 88-102` +
`field-point-texture.ts:9`. Cleanup pass walks wrapper/mouseWrapper/model
via `Group.traverse`, calls `geometry.dispose()` + `material.dispose()`
for each layer; refcount the cached point texture (R3F does NOT
auto-dispose JSX-mounted geometry/material under StrictMode). Let R3F
own the `gl` context — dispose only owned buffers/materials/textures.
Effort M. Deps: none; blocks all other Field work.

**A2. `FieldScene.tsx` attachController + register effects need dep arrays.**
CRITICAL · field-runtime C2 · `FieldScene.tsx:267-277, 279-304`. Add deps
`[blobController]`/`[streamController]`/`[objectFormationController]` to
the three attach effects; gate registration on a `useState` set once all
three `whenReady` Promises resolve. Effort S. Deps: A1.

**A3. `BlobController.projectHotspots` — per-frame DOM writes + 600-LOC
breach.** CRITICAL (perf) + MAJOR (LOC) · field-runtime M3 ·
`apps/web/features/field/controller/BlobController.ts:429-649` (650 LOC);
call site `FieldScene.tsx:374-383`. (a) Short-circuit `writeHotspotDom`
when frame visibility + position unchanged from last write (ref-cached
snapshot); (b) skip `projectHotspots` when `hotspotState.opacity === 0`
for two consecutive frames; (c) move candidate-selection + pool-write
helpers into existing `controller/blob-hotspot-runtime.ts`, taking
BlobController back under 600 LOC. Check `field-hotspot-lifecycle.ts`
for opacity-0 fade-out constraints before short-circuiting. Effort L.
Deps: A1, A2.

**A4. `useChatThread` global window keydown hijack.** CRITICAL · web-wiki
critical #1 · `features/wiki/module-runtime/interactions/ChatThread/useChatThread.ts:99-112`.
Drop `window.addEventListener("keydown", …)`; attach to rail root via
`ref` + `tabIndex={0}` pattern already in `StepThrough.tsx:53-64`.
Extract shared `useKeyboardAdvance({ next, prev, ref })` primitive;
guard must not `preventDefault` keys originating outside the ref.
Effort M. Deps: none.

**A5. Error boundary around lazy wiki module imports.** CRITICAL ·
web-wiki critical #2 · `features/wiki/components/WikiModuleContent.tsx:52-75`;
`features/wiki/entity-profiles/index.tsx:64`. Wrap lazy imports in a
`<ModuleErrorBoundary>` matching `GraphErrorBoundary`/`CosmographWidgetBoundary`
shape; fallback surfaces retry + `reportFrontendError(err, scope)` (see
observability helper below). Consolidate `ModuleLoadingSkeleton` per
web-wiki opportunity E. Effort M. Deps: none.

**A6. `mount-wiki-graph.ts` rAF + destroy race, missing `cancelAnimationFrame`.**
CRITICAL · web-wiki critical #5 + major #9 ·
`features/wiki/graph-runtime/mount-wiki-graph.ts:152-173, 195-…, 226-249`.
(a) Hold rAF handle in a ref; `cancelAnimationFrame` on destroy.
(b) Thread an `AbortSignal` through `waitForContainerSize` so
`WikiGraph.tsx:70`'s cleanup can actually abort a warming mount.
(c) Sequence `themeObserver` rebuild after the current rAF tick via
`queueMicrotask` + `!destroyed && !rebuilding` guard + `try/catch`
around `l.gfx.clear()`. Effort L. Deps: none.

**A7. `useWikiPageBundle` writes state after abort.** CRITICAL (upgraded
in cross-review §3) · web-wiki critical #4 ·
`features/wiki/hooks/use-wiki-page-bundle.ts:81-103`. Add
`if (signal?.aborted) return;` before each `setState` (lines 83, 98).
Stretch: migrate to `useSyncExternalStore` over a per-slug async
resource. Effort S. Deps: none.

**A8. `useWikiGraphSync.showPageOnGraph` commits without rollback.**
CRITICAL (upgraded) · web-wiki major #8 ·
`features/wiki/hooks/use-wiki-graph-sync.ts:163-226, 268`. Wrap
`commitWikiOverlay` (L172) + `commitSelectionState` (L206) in a
pre-commit snapshot; on `signal.aborted` after any commit, restore
snapshot. Alternative: buffer reads, commit only on full success.
Effort M. Deps: A7.

**A9. `wiki-route-mirror.ts` drops subscribe return value.** CRITICAL (HMR/
test) / MAJOR (prod) · web-graph-shell major #1 ·
`features/graph/stores/index.ts:11`, `stores/wiki-route-mirror.ts:22-26`.
Capture the unsubscribe; export `teardownWikiRouteMirror()`; move
subscription out of module scope into a `setup()` called once from
`DashboardShellClient` effect. Effort M. Deps: none.

**A10. Render-time ref writes in `use-graph-bundle.ts` + `use-create-editor-controller.ts`.**
CRITICAL (React 19 discarded-render) · web-graph-shell majors #2+#3 ·
`features/graph/hooks/use-graph-bundle.ts:36-43`;
`features/graph/components/panels/editor/use-create-editor-controller.ts:383`.
Move both ref assignments into `useLayoutEffect`/`useMemo` keyed on
real deps (bundle `checksum`, `editor` instance). For `use-graph-bundle`
consider `useSyncExternalStore` over the bundle session. Effort M.
Deps: none.

**A11. `use-points-filtered` swallows DuckDB selection-write errors.**
MAJOR · web-graph-cosmograph ·
`features/graph/cosmograph/hooks/use-points-filtered.ts:144`. Route
`.catch(() => {})` through `reportFrontendError('selectionWriteFailed', err)`;
increment `__graphDebug.selectionWriteFailures`. Do not throw — selection
desync is recoverable. Effort S. Deps: observability helper.

**A12. `SelectionToolbar` `MutationObserver` cleanup is a no-op.** MAJOR ·
web-graph-cosmograph + codex I5 ·
`features/graph/cosmograph/widgets/SelectionToolbar.tsx:80-95`. Capture
`obs` in outer scope of `discover`; return `() => obs.disconnect()`
instead of `() => {}`. Effort S. Deps: none.

**A13. `FixedStageManager` readiness rejection is terminal.** MAJOR ·
field-runtime M6 · `features/field/stage/FixedStageManager.tsx:112-115`.
Expose an error state on the context so the shell can render a retry
surface; surface `bakeFieldAttributes` errors in dev via observability.
Effort M. Deps: observability helper.

**A14. `FieldHotspotPool` registration callbacks re-fire every parent render.**
MAJOR (race surface with BlobController hotspot writes) · web-field-surfaces
M2+M7 · `surfaces/FieldLandingPage/FieldHotspotPool.tsx:72-78`;
`FieldLandingPage.tsx:166-190, 247-263`. Wrap parent handlers in
`useCallback`; per-entry ref-callback nullifies `refs[i] = null` on
unmount; extract `useLandingHotspotBridge` (per field-surfaces m10)
owning `blobControllerRef`/`connectionOverlayRef`/loop-clock
subscription/registration callbacks (also shrinks FieldLandingPage.tsx
from 426 LOC). Effort M. Deps: A1, A2.

**Phase A cross-cutting — observability helper.** Add
`apps/web/features/telemetry/frontend-error-reporter.ts` exposing
`reportFrontendError(scope, err, meta?)` + `recordFrontendMetric(name,
value, labels?)`. No-op in prod until the db-infra-ci-planner picks a
transport. Consumed by A5, A11, A13, C10, F-phase. Effort S.

---

### Phase B — adapter discipline + SQL hardening

**B1. Enforce `cosmograph/index.ts` adapter barrel.** MAJOR (vendor bomb) ·
web-graph-cosmograph major #1 + cross-review Theme C. Violators:
`GraphRenderer.tsx:4-7`, `hooks/use-graph-selection.ts:3`,
`hooks/use-points-filtered.ts:4-7`, `widgets/SelectionToolbar.tsx:11-14`,
`widgets/TimelineWidget.tsx:4`, `widgets/use-widget-selectors.ts:4`,
`widgets/FilterBarWidget.tsx:4-5`, `widgets/FilterHistogramWidget.tsx:4-5`,
`widgets/init-crossfilter-client.ts:3-5` (reaches
`@cosmograph/cosmograph/cosmograph/internal`). Extend the barrel to
re-export the raw `@cosmograph/react` symbols intra-slice files need;
rewrite the nine violators to import from the barrel; wrap the deep
internal path in `getCosmographInternalApi()` pinned in the barrel;
add ESLint `no-restricted-imports` forbidding `@cosmograph/*` outside
the barrel. Open: confirm whether a public alternative exists for the
internal path on the current pin. Effort L. Deps: none; blocks C6.

**B2. Brand `currentPointScopeSql` with opaque type.** MAJOR (DiD) ·
web-graph-cosmograph major #3 · `duckdb/sql-helpers.ts:18-24, 58-75`,
`cosmograph/lib/cosmograph-selection.ts:257-276`,
`lib/selection-query-state.ts:5-14`; callers:
`duckdb/queries/{summary.ts:108-111,facets.ts:91,histograms.ts:69-73,budget.ts:90,node-selection.ts:127-130}`,
`duckdb/overlay.ts:25-26`, `duckdb/session/overlay-controller.ts`. Define
`type SafeScopeSql = string & { readonly __safeScopeSql: unique symbol };
export function mintSafeScopeSql(raw: string): SafeScopeSql;`.
`cosmograph-selection.ts` is the sole caller after mosaic-sql
`duckDBCodeGenerator.toString(...)`. Change store slot + `normalize…`
signatures to require `SafeScopeSql`. Effort M. Deps: B1.

**B3. Consolidate SQL identifier helpers; enforce `validateTableName`.**
MAJOR (DiD) · web-graph-cosmograph major #4 ·
`duckdb/queries/{summary.ts:53,110-111; histograms.ts:100,271; budget.ts:83,89,242; facets.ts:48; search.ts:107; node-selection.ts:109,134}`;
source `duckdb/utils.ts:48-55`. Move `validateTableName`,
`resolveInfoColumn`, `resolveSearchColumn`, `getLayerTableName`,
`escapeSqlString`, `escapeSqlLiteral` into new `duckdb/sql-identifiers.ts`;
every `${identifier}` interpolation must pass through `validateTableName`;
delete duplicate escape helpers in `sql-helpers.ts:77-79` and
`queries/core.ts:33-35`. Effort M. Deps: B2.

**B4. Harden worker bootstrap JSON escape.** MINOR · web-graph-cosmograph
major #5 · `duckdb/connection.ts:110-114`. Replace
`importScripts("${mainWorkerUrl}");` with
`importScripts(${JSON.stringify(mainWorkerUrl)});`. Effort S. Deps: none.

**B5. Validate `bundleChecksum` shape in `bundle-assets.ts`.** MAJOR (DiD) ·
web-graph-cosmograph major #8 ·
`lib/bundle-assets.ts:194, 223, 247-249`. Add
`assertBundleChecksumFormat(checksum)` that checks `^[0-9a-f]{64}$`;
invoke at first touch. Strict regex at the API route boundary is a
handoff to the api/security planner (§4). Effort S. Deps: none.

**B6. Animation registry discriminated-union prop schema.** MAJOR ·
web-animations C2 · `features/animations/registry.tsx:107`;
`features/animations/manifest.ts:17`. Convert
`Record<string, ComponentType<any>>` → `Record<AnimationName,
AnimationEntry>` where `AnimationEntry` is a discriminated union over
`format` (`'lottie'|'model-viewer'|'r3f'|'svg'|'manim-video'|…`). Each
variant declares its prop shape; manifest entries extend the same
union so missing-counterpart cases fail typecheck. Effort L. Deps: B1.

---

### Phase C — performance + allocation

**C1+C2. `useRecoloredLottie` + `useLazyJson` primitives; one-time clone.**
MAJOR (recalibrated from CRITICAL) · web-animations C1, M1, R1, R2 ·
`lottie/recolor-lottie.ts:77`; consumers `lottie/LottieAccent.tsx:66`,
`LottiePulseLoader.tsx:76`, `SearchToggleLottie.tsx`, `NotoLottie.tsx`,
`icons/phase2e-heart-lottie/Phase2eHeartLottie.tsx`. New
`lottie/use-recolored-lottie.ts` owns: module-level shared `jsonCache`
(`Map<string, Promise<unknown>>`), `resolveCssColor` rAF handshake, a
recolor memo keyed on a scalar color hash (`rgbTupleKey(...)`) so the
deep clone runs once per `src` in a `WeakMap<rawData, clone>`; reduced-
motion gate; `Response.ok` + content-type checks (closes web-animations
M6 + M8). `use-lazy-json.ts` is the lower-level cancellable fetch
primitive (NotoLibrary, LottieFilesSmoke, Phase2eHeart). Recolor walker
mutates only `c.k` color triplets — animation graph shape never varies
with accent. Effort M (batched). Deps: none.

**C3. `SearchToggleLottie` — drop 60-rAF poll.** MAJOR · web-animations C3 ·
`lottie/SearchToggleLottie.tsx:67-79`. Use `lottie-react`'s `lottieRef`
callback (fires on `animationItem` ready); drop `MAX_SYNC_ATTEMPTS = 60`
and the rAF recursion; add a generation counter for re-entry. Effort S.
Deps: C2.

**C4. Bound the widget dataset caches.** MAJOR · web-graph-cosmograph
major #6 · `cosmograph/widgets/dataset-cache.ts:8-10, 12-20`. Replace
the three raw `Map`s with `createBoundedCache(32)` from
`duckdb/utils.ts:6-17`; expose `__graphDebug.widgetCacheEvictions`.
Effort S. Deps: none.

**C5. LRU the `point-source-registry` cache + drop unused color buffer.**
MAJOR (worst-case ~48 MB) · field-runtime M7 + m6 ·
`features/field/asset/point-source-registry.ts:54-97, 153-164`. LRU keyed
by `(isMobile, densityBucket, id)` cap 6 entries; remove per-particle
`color` Float32 derivation for stream/objectFormation; move
`deriveColorBuffer` into a per-call lookup inside `getPointColorCss` that
indexes `BUCKET_INDEX_TO_COLOR` from `aBucket[candidateIndex]`. Effort M.
Deps: A1.

**C6. Collapse `FieldScene` triplication into a layer factory + baseline
tick.** MAJOR · field-runtime M1+M2+R1 · `renderer/FieldScene.tsx:180-243,
267-304, 388-411`; `controller/FieldController.ts:267-270, 392-396`
(dead hooks); `controller/{BlobController.ts:164-367, StreamController.ts:30-125,
ObjectFormationController.ts:28-113}`. (a) `createFieldLayer({ id,
ControllerClass, preset, pointSources })` returns `{ controller,
uniformsRef, handles, attachEffect, readyEffect, jsx }`; `FieldScene`
becomes `FIELD_STAGE_ITEM_IDS.map(createFieldLayer)`. (b) Move the
repeated per-frame uniform + wrapper tween into
`FieldController.applyBaselineTick(ctx, chapterState)`; subclasses
override only chapter-specific overrides. (c) Delete dead `loop()` +
`attachMouseParallaxTo` indirection. Unlocks wiki/module-shell reuse
(memory `feedback_landing_native_physics`). Effort L. Deps: A1, A2, A3.

**C7. `FieldStoryProgress` — cache nodes; gate on chapter active.** MAJOR
(~180 layout reads/sec desktop) · field-surfaces M3+M4+M5 ·
`surfaces/FieldLandingPage/FieldStoryProgress.tsx:90-156, 120-125, 158,
167-172`. (a) Cache beat nodes on mount via `useRef<HTMLElement[]>`;
(b) gate `sync` on `isFieldChapterActive(chapterKey, sceneState)`;
(c) `mobileMql.addEventListener('change', …)`; (d)
`gsap.killTweensOf(root)` in cleanup. Effort M. Deps: A2.

**C8. `field-scroll-state.ts` — notify only on bucket change.** MAJOR ·
field-runtime M8 · `scroll/field-scroll-state.ts:155-172`; selector
`scroll/scene-selectors.ts:36-42`. Gate `sceneStore.notify()` on
`getFieldChapterProgressBucket(prev) !== bucket(next)` (or memoize
per-adapter before `master.progress(p).pause()`). Effort S. Deps: none.

**C9. `ConnectomeLoader` dispose typed arrays + CanvasTexture on theme
swap.** MAJOR · web-animations M5 ·
`canvas/connectome-loader/ConnectomeLoader.tsx:142-211, 101`. On theme
swap null previous `sharedSimState` typed arrays (defer one frame for
in-flight ticks); dispose `circleTextureCache` CanvasTexture via
`circleTexture.dispose()` + `gl.deleteTexture(...)` on Canvas unmount;
dev-assert single mount. Effort M. Deps: A1.

**C10. Prepared-statement telemetry + private-API fallback warn.** MAJOR ·
web-graph-cosmograph major #7 + recommended #5 · `duckdb/queries/core.ts:14-16,
117-128`; `cosmograph/GraphRenderer.tsx:38-102`. Expose
`__graphDebug.preparedStatementEvictions`, `preparedStatementHitRate`,
`applyViewportCameraFallbackCount`; dev-`console.warn` on
`applyViewportCamera` fallback so vendor breaks surface. Wire through
`recordFrontendMetric`. Effort S. Deps: Phase A observability helper.

**Secondary C-tier (S each; batch with nearest major item):**
- `widgets/init-crossfilter-client.ts` retry `[0, 150, 450]` polling →
  producer "ready" signal. (web-graph-cosmograph minor.)
- `graph-runtime/layout-cache.ts:27-33` true LRU (delete-then-set on
  hit). (web-wiki minor #19.)
- `GraphRenderer.tsx:417` `style.zIndex` mutation → CSS data-attribute
  rule. (web-graph-cosmograph minor.)
- `chrome/ChromeBar.tsx` (522 LOC) → extract `useChromeMenus`,
  `panel-registry.ts`, per-pill subcomponents. (web-graph-shell major #6.)
- `DopamineD2Binding` — consolidate Framer variant graph; stop repainting
  `<defs>` every state. (web-animations M3.)
- `ScrollMechanism.tsx` + `_templates/mechanism-scroll.tsx` → `useGSAP({ scope })`.
  (web-animations M4 / R7.)

---

### Phase D — responsive parity (touch + pointer + keyboard)

**D1. `useDragResize` → PointerEvents.** MAJOR (touch broken) ·
web-graph-shell major #4 · `features/graph/hooks/use-drag-resize.ts:1-50`.
Convert to `pointerdown`/`pointermove`/`pointerup`; `setPointerCapture`;
`touchAction: 'none'`; gate on `pointerType !== 'mouse' || isPrimary`;
extract `usePointerType()` primitive. Effort M. Deps: none.

**D2. PanelShell resize handles — aria + keyboard.** MAJOR (WCAG) ·
web-graph-shell major #5 ·
`features/graph/components/panels/PanelShell/PanelShell.tsx:378-401`. Add
`role="separator"`, `aria-orientation`, `aria-label`, `tabIndex={0}`;
arrow keys adjust width, Home/End snap to min/max, Enter cycles content-
scale (harmonize with +/-/0 binding). Hit area ≥ 12 px via transparent
outset. Effort M. Deps: D1.

**D3. Mouse parallax → pointer parallax on hover-capable touch.** MAJOR ·
field-runtime M5 · `renderer/mouse-parallax-wrapper.ts:37-51`. Listen to
`pointermove`; `pointerType === 'pen'` = parallax on tablets; coarse
touch: decide noop vs one-shot tween toward tap point; document in
`docs/map/modules/landing.md`. Effort M. Deps: A2.

**D4. `EntityHoverCardProvider` touch flow test.** MINOR · web-graph-shell
minor #16 · `components/entities/EntityHoverCardProvider.tsx:130`. Add
e2e covering capture-phase outside-click + pinned-vs-hover touch; swap
to `pointerdown` in capture if iOS Safari misses. Effort S. Deps: F.

**D5. Pointer primitive consolidation.** MINOR · web-graph-shell
opportunities #1–#3 · `components/entities/use-dom-entity-highlights.ts:373/380/395-407`;
`EntityHoverCardProvider.tsx`; `use-drag-resize.ts`. Extract
`usePointerType()`, `useAbortableDebounced({ fn, ms, deps })`,
`useDocumentEventListener({ type, handler, phase })` into
`features/graph/hooks/`; refactor 3 consumers. Effort M. Deps: D1.

**D6. `MobileShell.tsx` memoize `openPanelIds` deps.** MINOR ·
web-graph-shell minor #14 · `components/shell/MobileShell.tsx:80-90`.
`useMemo` keyed on `openPanels`. Effort S. Deps: none.

---

### Phase E — CSS consolidation

**E1. Delete `_templates/route-transition.css`.** MAJOR · styling-css #1 ·
`features/animations/_templates/route-transition.css` vs canonical
`app/styles/base.css:66-85`. Delete the template (duplicate
`solemd-fade-in/out` keyframes fight cascade). Effort S. Deps: none.

**E2. Move Mantine + Cosmograph overrides to `vendor-overrides.css`.**
MAJOR · styling-css #2, #3, opp. #1. FROM `app/styles/graph-ui.css:4-9`
(pagination), `:12-20` (SegmentedControl), `:137-148` (detail-accordion),
`:175-217` (Cosmograph filter-bars), `:265-298` (constellation keyframes).
TO `app/styles/vendor-overrides.css` for Mantine+Cosmograph; new
`features/graph/components/shell/loading-constellations.css` for the
keyframes. Graph-ui.css shrinks to `.graph-icon-btn`/`.panel-icon-btn`
+ entity pill + canvas filter (~120 LOC). Effort M. Deps: none.

**E3. Wiki callout variants + hairline sweep.** MAJOR (memory
`feedback_no_hairline_outlines`) · styling-css #6+#7+opp. #4; web-wiki
#14. Files: `app/styles/wiki-content.css:75, 111-116, 173, 192, 201, 233`;
`features/wiki/WikiPanel.tsx:358`; `module-runtime/primitives/GlossaryHover.tsx:36`;
`module-runtime/interactions/StepThrough/StepThrough.tsx:142`;
`entity-profiles/NetworkProfile.tsx:82`;
`modules/ai-for-mds/sections/foundations/{PipelineDemo.tsx:172,
HallucinationDemo.tsx:93,130}`;
`components/elements/AnimationEmbed.tsx:41,52`; `WikiBrowseSheet.tsx:66`;
`WikiLocalGraph.tsx:106`; `app/styles/tokens.css:319-329`. (a) Callouts:
replace 1px accent border with rim-light + halo + left-accent bar;
introduce `--feedback-info-*` token triple; variant titles derive from
variant accent. (b) Hairline sweep: replace `border: 1px solid var(...)`
on dark panels with rim-light + halo per memo. (c) Decide
`--graph-panel-border`: rename to `--graph-rule-color` or remove.
Effort M. Deps: none.

**E4. Close `brand-colors.ts` ↔ `tokens.css` drift.** MAJOR · styling-css
#5 + opp. #3 · `features/graph/lib/brand-colors.ts:6, 35`;
`lib/pastel-tokens.ts:17-27, 35-38, 67-69`;
`app/styles/tokens.css:5-14, 79, 282-309, 294`. Canonicalize canvas +
viewport + dark-on-color hex in `pastel-tokens.ts` as named exports
consumed by both `brand-colors.ts` and CSS fallbacks; decide whether
`themeViewportColorByScheme` (disagrees with `--background`) is
intentional or a bug. Effort M. Deps: F10 snapshot test.

**E5. De-`!important` `wiki-module-content.css`.** MAJOR · styling-css #4
· `app/styles/wiki-module-content.css` (13 `!important` in 71 LOC). Add
`data-density="wiki"` on `WikiModuleContent.tsx` root; primitives
(`SceneSection`, Mantine `Card`/`SimpleGrid`/`Stack`) switch to compact
spacing tokens via CSS attr-selector without `!important`; where not
reachable, use `compact` prop or `classNames`. Effort M. Deps: none.

**E6. Mantine theme → token vars.** MINOR · styling-css opp. #2 ·
`lib/mantine-theme.ts:28-34, 48`. Radius references `var(--radius-surface-lg)`
etc.; replace Button `transition: all 200ms ease` with explicit
`background-color, color, box-shadow`. Effort S. Deps: none.

**E7. CSS hygiene sweep.** MINOR · `app/styles/graph-ui.css:160-163`
(scope `[data-graph-canvas] canvas { filter }` to layer);
`globals.css:1-18` (6-line partial-load-order comment);
`editor.css:120-126, 222-227` (drop Tiptap scrollbar duplication;
apply `.thin-scrollbar` via `editorProps.attributes.class`); standardize
`color-mix(in oklch, …)` for perceptual categories. Effort S (batched).
Deps: E2.

---

### Phase F — test coverage backfill

**F1. Wiki hooks + store leak tests.** MAJOR · new tests at
`features/graph/stores/__tests__/wiki-route-mirror.test.ts`;
`features/wiki/hooks/__tests__/use-wiki-page-bundle.test.ts`,
`use-wiki-graph-sync.test.ts`, `use-wiki-page.test.ts`. Coverage:
subscribe/unsubscribe symmetry (A9); abort-after-state for page bundle
+ graph sync (A7, A8); rapid-slug race; error-message sanitization
(web-wiki #15). Effort M. Deps: A7, A8, A9.

**F2. `mountWikiGraph` mount/teardown + theme-race.** MAJOR · new
`features/wiki/graph-runtime/__tests__/mount-wiki-graph.test.ts`.
Coverage: destroy during `waitForContainerSize` (A6); theme observer
during tick (A6); rAF cancel; layout-cache LRU; mount P99 ≤ 180 ms
for 200 nodes. Effort M. Deps: A6.

**F3. Field-surface tests (currently zero).** MAJOR · new:
`features/field/surfaces/FieldLandingPage/__tests__/{FieldLandingPage.smoke,
FieldStoryProgress.perf, FieldHotspotPool}.test.tsx`;
`features/field/stage/__tests__/FixedStageManager.test.tsx`. Coverage:
smoke render; scroll-tick layout-read count ≤ 12/sec (C7); hotspot refs
nullified on unmount (A14); readiness error surfaces (A13). Effort L.
Deps: A13, A14, C7.

**F4. WebGL teardown regression.** MAJOR · new
`features/field/renderer/__tests__/FieldScene.dispose.test.tsx`.
Coverage: mount+unmount N cycles ⇒ N `dispose()` calls;
`pointTexture.dispose()` invoked; geometry attribute buffers null after
unmount. Effort M. Deps: A1.

**F5. Cosmograph + DuckDB regression guards.** MAJOR · new tests at
`cosmograph/widgets/__tests__/{dataset-cache.bounds, SelectionToolbar.observer-cleanup}.test.tsx`;
`cosmograph/hooks/__tests__/use-points-filtered.error-path.test.ts`;
`duckdb/__tests__/sql-identifier-brand.test.ts`. Coverage: cache bound
(C4); observer disconnect (A12); selection-write counter (A11);
`SafeScopeSql` rejects strings (B2); `validateTableName` required at
interpolation (B3). Effort M. Deps: A11, A12, B2, B3, C4.

**F6. Lottie + animations perf tests.** MAJOR · new tests at
`lottie/__tests__/{recolor-lottie.clone-count, use-recolored-lottie,
SearchToggleLottie.no-busy-loop}.test.*`;
`canvas/connectome-loader/__tests__/ConnectomeLoader.dispose.test.tsx`.
Coverage: `structuredClone` ≤ 1× per source over N accent changes (C1);
no pending rAF after unmount (C3); theme-swap typed-array dispose (C9).
Effort M. Deps: C1, C2, C3, C9.

**F7. Wiki module + entity-profile error boundary tests.** MAJOR · new
tests at
`features/wiki/components/__tests__/{WikiModuleContent.error-boundary,
WikiMarkdownRenderer, WikiPageView, WikiPanel}.test.tsx`;
`module-runtime/__tests__/registry.test.ts`. Coverage: lazy-import
rejection renders fallback (A5); `wikiUrlTransform` blocks multi-encoded
javascript/vbscript/data/file/blob/mhtml (web-wiki #6);
`preprocessWikilinks` escapes `[]()` in alias (web-wiki #7); `EMPTY_*`
const type parity (web-wiki #11). Effort L. Deps: A5.

**F8. Interaction shells coverage.** MAJOR · new tests at
`module-runtime/interactions/{StepThrough, ChatThread, ToggleCompare,
DemoStage}/__tests__/*.test.tsx`. Coverage: keyboard-advance scope-local
(A4); no `window` listener; reduced-motion parity. Effort M. Deps: A4.

**F9. Responsive + pointer tests.** MAJOR · new
`features/graph/hooks/__tests__/use-drag-resize.pointer.test.ts`;
`components/panels/PanelShell/__tests__/resize-handle.a11y.test.tsx`;
`features/field/renderer/__tests__/mouse-parallax-wrapper.pointer.test.ts`.
Coverage: synthesized touch pointer moves handle (D1); arrow + Home/End
adjust width (D2); parallax on `pointerType: 'pen'` (D3). Effort M.
Deps: D1, D2, D3.

**F10. CSS drift snapshot.** MINOR · new
`apps/web/lib/__tests__/pastel-tokens.tokens-css-parity.test.ts`.
Parses `tokens.css` at test time; asserts `brandPastelFallbackHexByKey`
matches `@theme` (E4). Effort S. Deps: E4.

---

## 4. Cross-team handoffs

### To security-planner

1. **CSP interaction with FieldScene readiness handshake.** The security
   planner is expected to add a strict Content-Security-Policy (codex
   cross-review §6 item 14). That will kill any inline `<script>` paths
   this domain currently uses for the readiness gate. To the best of
   our search, FieldScene does not inject an inline script today, but
   `next/script` usage in landing chrome must be surveyed together. If
   the CSP requires a nonce, the `next/dynamic` factories that hydrate
   `DashboardShellClient`, `FieldLandingRoute`, `GraphRenderer`, and
   `WikiModuleContent` must be audited to guarantee no
   `dangerouslySetInnerHTML`-shaped code paths exist. **Ask: please
   land CSP in "report-only" mode first so we can observe Sentry
   violations without breaking the landing substrate.**
2. **Rate limiting on `/api/evidence/chat` is out of scope here** but
   the frontend `use-rag-query.ts:189-196` silently swallows error
   strings post-surface. If rate-limit responses arrive as 429 with a
   `Retry-After` header, the frontend will need a retry-aware UX. We
   will add the `Retry-After`-aware handler only after the limiter is
   landed and emits that header.
3. **`bundleChecksum` regex validation at the server boundary.** Item
   B5 in this plan validates defensively inside
   `lib/bundle-assets.ts`, but the canonical regex-at-route belongs to
   the server/API planner. We will exchange the regex constant so the
   two live fixtures agree.
4. **`packages/graph/src/cosmograph/camera-persistence.ts:13` STORAGE_KEY
   collision** (codex I1). Cross-cutting: SoleMD.Graph and
   SoleMD.Graph-overlay stomp each other's camera state on shared
   `localhost`. Frontend fix is a one-line namespace extension; the
   package owner is the api-packages-planner (see below).

### To db-infra-ci-planner

1. **Wire Jest into CI.** Per codex cross-review Theme H (+ db-infra
   slice), `quality.yml` currently runs only `npm run quality`
   (lint + typecheck). The frontend test backfill (phase F) is
   worthless without `npm test -- --runInBand` on every PR. Requested
   additions:
   - `npm test -- --runInBand --ci --coverage=false`
   - `npm run build` (Next.js type emit + bundle check)
   - Gate deploy on both.
2. **Add a perf-regression test runner.** Items F2, F3, F4, F6 assert
   bounded frame-budget or dispose counts. These run under Jest today
   but can be slow; request a separate GitHub Actions job
   (`quality-perf.yml`) with a higher timeout, triggered on paths
   `apps/web/features/{field,wiki,graph,animations}/**`.
3. **Frontend-telemetry transport.** Phase A "observability helper"
   creates `reportFrontendError` and `recordFrontendMetric` as no-op
   stubs. To actually report in production, the db-infra planner must
   decide the transport (Langfuse, Vercel analytics, or console
   structured JSON piped to an ingestion webhook). Frontend will
   depend on that decision before F5's "counter increments" assertions
   graduate from `__graphDebug` globals to real telemetry.
4. **Bundle-size budget in CI.** Codex cross-review Gap 5 flags
   missing bundle analysis. Request a Next.js bundle analyzer
   (`@next/bundle-analyzer`) run in CI with a byte-size budget on the
   largest chunks (duckdb-wasm, cosmograph, framer-motion, gsap). Any
   C-phase change that crosses the adapter barrel risks accidentally
   bundling `@cosmograph/react` into the landing page chunk.

### To api-packages-planner

1. **`resolveClusterLabelClassName` returns CSS declaration as className.**
   `packages/graph/src/cosmograph/label-appearance.ts:29-35` returns
   `"display: none;"`. Frontend consumers pass the value as a
   `className`. Please fix in the package: return either `undefined` or
   a proper class name; frontend applies the visual via a CSS rule on
   `.cosmograph-label--hidden`. Frontend will update the consumer in
   the same PR after the package is cut.
2. **`STORAGE_KEY = "solemd:camera"` collision between graph and
   graph-overlay** (codex I1). Please make this injectable (pass the
   key from the app shell, default preserved).
3. **Engine HTTP helpers default timeout + forwarded AbortSignal.**
   `getEngineJson` needs a `timeoutMs` default and `server/wiki.ts:92-107`
   must forward the signal. Frontend already passes `AbortSignal`
   through `useWikiPageBundle` (A7), so once the package forwards it,
   fast navigation will cancel upstream too.
4. **Engine wire types escape via `server/index.ts`.** `export * from
   './rag'` leaks 17 `Engine*` interfaces. Please restrict the public
   surface to mapped DTOs only. Frontend consumes mapped DTOs today
   and will not break.
5. **Label-className regression test fixture.** Please expose a
   `packages/graph` test case that asserts `resolveClusterLabelClassName`
   never returns a CSS declaration; frontend will add a smoke test
   importing from the package boundary (F5 bundle).

---

## 5. Performance regression test list

These are the specific invariants the frontend must defend in CI after
phase F lands. Each maps to a test file listed above.

1. **WebGL dispose count.** `FieldScene.tsx` unmount invokes
   `geometry.dispose()` + `material.dispose()` for each layer; mount
   + unmount N cycles produce exactly N dispose calls. Fails on A1
   regression. (F4.)

2. **Field effect re-run count.** `attachController` + registration
   effects fire exactly once per controller per mount; zero re-runs
   on `useFrame` ticks or unrelated state changes. Asserted via
   spy on `controller.attach`. Fails on A2 regression. (F4.)

3. **Hotspot per-frame DOM writes.** `BlobController.projectHotspots`
   writes inline style to the hotspot pool 0 times per second when
   `hotspotState.opacity === 0` (steady state). Asserted via spy on
   `HTMLElement.style` setter on pool nodes. Fails on A3 regression.
   Test also asserts `writeHotspotDom` short-circuits when the
   frame snapshot matches last write. (F3.)

4. **Lottie clone count per theme tick.** Over 10 rapid accent
   changes, `structuredClone` is called at most once per Lottie
   source (the initial clone). Asserted via spy on `globalThis.structuredClone`.
   Fails on C1 regression. (F6.)

5. **`SearchToggleLottie` no pending rAF after unmount.** After
   unmount, `cancelAnimationFrame` called for every scheduled
   frame id; `__pendingAnimationFrames.size === 0`. Fails on C3
   regression. (F6.)

6. **Scroll-tick layout reads.** During a 60 fps scroll over the
   landing field, `FieldStoryProgress.sync` calls
   `Element.prototype.getBoundingClientRect` ≤ 12 times per second
   total (not per beat per tick — the cache means 0 after first
   mount). Fails on C7 regression. (F3.)

7. **Widget dataset cache bound.** `categoricalDatasetCache`,
   `numericDatasetCache`, `histogramDatasetCache` never exceed their
   `createBoundedCache(N)` cap during a 20-bundle hot-swap sequence.
   Eviction counter (`__graphDebug.widgetCacheEvictions`) increments
   on the 33rd insertion (bound = 32). Fails on C4 regression. (F5.)

8. **Point-source-registry cache size.** After cycling through 8
   density tiers and 2 viewport sizes, the registry holds at most
   6 entries; previous entries are disposed (`buffers.geometry` is
   null). Fails on C5 regression. (F4 + F3.)

9. **ScrollTrigger / RAF leak on wiki graph destroy.**
   `mountWikiGraph` unmount cancels the active rAF; `themeObserver`
   disconnects; `waitForContainerSize` ResizeObserver disconnects
   when the `AbortSignal` fires. No rAF id is pending in
   `__rafDebug.pending` after destroy. Fails on A6 regression. (F2.)

10. **SelectionToolbar MutationObserver cleanup.** `discover`
    cleanup disconnects the observer even when the native button
    never renders an id child. Asserted by mocking the vendor DOM
    to never emit an `[id]` mutation and asserting `obs.disconnect`
    is called on unmount. Fails on A12 regression. (F5.)

11. **Selection-write failure counter.** `use-points-filtered`
    selection persistence: given a simulated DuckDB write rejection,
    `__graphDebug.selectionWriteFailures` increments by 1; no throw
    reaches the render tree. Fails on A11 regression. (F5.)

12. **Prepared-statement hit rate.** Standard navigation flow
    (load bundle → select 3 nodes → toggle 2 filters) produces
    prepared-statement hit rate ≥ 0.9; eviction counter ≤ 2. Fails
    on C10 regression or on a future change to the hard-coded
    `MAX_PREPARED_STATEMENTS_PER_CONNECTION`. (F5.)

13. **SQL identifier brand enforcement.** `setCurrentPointScopeSql`
    rejects a plain `string` at typecheck (compile-time). Runtime
    assertion: `mintSafeScopeSql` is the only code path minting the
    brand. Fails on B2 regression. (F5.)

14. **Table-name interpolation guard.** A grep test asserts that no
    `duckdb/queries/**` file contains `\${[a-zA-Z]` in a SQL
    template literal unless preceded by a `validateTableName(...)`
    call in the same function. Fails on B3 regression. (F5.)

15. **Wiki page bundle abort safety.** `useWikiPageBundle` under
    repeated `act(() => setSlug(next))` of 10 slugs produces state
    that matches only the final slug — no stale backlinks/context
    from earlier slugs. Fails on A7 regression. (F1.)

16. **Wiki graph sync rollback-on-abort.** `showPageOnGraph`
    interrupted after overlay commit but before selection commit
    restores the pre-commit overlay producer. Fails on A8
    regression. (F1.)

17. **`wiki-route-mirror` unsubscribe.**
    `teardownWikiRouteMirror()` removes the subscription; a
    subsequent `useWikiStore.setState` does NOT call
    `useDashboardStore.setState`. Fails on A9 regression. (F1.)

18. **ChatThread keyboard scope.** Space/Enter pressed with focus
    OUTSIDE a `<ChatThread>` root never calls `onNext`/`onPrev` and
    never `preventDefault`s. Fails on A4 regression. (F8.)

19. **Module error boundary fallback.** Mock a rejected lazy import
    and assert the wiki panel renders the fallback + retry button
    instead of unmounting. Fails on A5 regression. (F7.)

20. **`useDragResize` pointer-event parity.** Synthesized
    `pointerdown`/`pointermove`/`pointerup` with
    `pointerType: 'touch'` moves the handle the same distance a
    mouse synthesis does. Fails on D1 regression. (F9.)

21. **ConnectomeLoader dispose.** On theme swap the previous
    `sharedSimState` is replaced and the previous typed arrays
    become unreferenced (`WeakRef.deref()` returns undefined after
    GC). `circleTexture.dispose()` invoked on Canvas unmount. Fails
    on C9 regression. (F6.)

22. **CSS drift.** `brandPastelFallbackHexByKey` parsed at test time
    equals the `@theme` block parsed from `tokens.css`. Fails on
    E4 regression. (F10.)

---

## Appendix — open questions

1. Field scene disposal: own WebGL context or let R3F own it? (A1 scope.)
2. Adapter barrel option 1 (touch 9 files) vs option 2 (re-scope comment).
3. Module error boundary retry semantics (re-trigger lazy import vs whole
   Suspense boundary). (A5.)
4. Mobile parallax — noop or tween toward tap? (D3.)
5. Animation registry discriminated-union — manifest JSON or TS module? (B6.)
6. Telemetry transport decision (db-infra-ci-planner). Until resolved,
   phases A/C counters ship behind `__graphDebug` only.

## Appendix — deferred

- `ModeToggleBar` slim (folded into ChromeBar decomposition).
- `LogomarkCompare` / `SoleMDLogo` / `Phase2eMagnetic` micro-perf
  (demo-only).
- `GOAL_DAMPING` comment formula fix (inline during C9).
- Two-scrollbar-system dedupe (revisit after E).
- `WikiBrowseSheet` `OverlaySurface` migration (future portal concern).
- `PanelEdgeToc` / `ViewportTocRail` consolidation (~780 LOC; separate
  TOC-architecture pass).
- `<model-viewer>` error boundary (pending B6 typed failure channel).
- `FieldLandingShellContent` indentation, `wiki-store.fetchGraphData`
  TOCTOU (lint/wasted-fetch; low priority).
