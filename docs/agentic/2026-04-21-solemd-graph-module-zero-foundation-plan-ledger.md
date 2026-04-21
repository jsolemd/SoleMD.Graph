# Module Zero Foundation Plan Ledger

- Date: `2026-04-21`
- Repo: `SoleMD.Graph`
- Scope: strengthen the landing-page / `Module Zero` foundation plan against
  the live branch, Maze source artifacts, and current 2025-2026 official
  guidance for Next.js App Router, React, GSAP, R3F, Motion, MDN, and WAI
- Status: `revised plan locked; no runtime code edited in this pass`

## Purpose

The existing foundation plan is directionally correct, but it mixes three
different truths:

- historical Maze parity findings
- earlier SoleMD landing-pass status claims
- the current live branch

That creates avoidable risk. The goal of this ledger is to keep the right
architectural target while correcting stale assumptions, tightening ownership
boundaries, and turning the plan into something future module work can inherit
without growing a second architecture.

## What Was Re-Audited

### Live SoleMD surfaces

- `apps/web/features/field/surfaces/FieldLandingPage/*`
- `apps/web/features/field/renderer/*`
- `apps/web/features/field/controller/*`
- `apps/web/features/field/scroll/*`
- `apps/web/features/field/stage/FixedStageManager.tsx`
- `apps/web/app/shell/*`
- `apps/web/app/providers.tsx`
- `apps/web/features/field/routes/FieldLandingRoute.tsx`
- `apps/web/next.config.ts`

### Module-contract and Maze references

- `docs/map/modules/landing.md`
- `docs/map/modules/README.md`
- `docs/map/modules/module-template.md`
- `docs/map/modules/module-terminology.md`
- `.claude/skills/module/references/module-zero-reconstruction.md`
- `.claude/skills/module/references/maze-build-spec.md`
- `.claude/skills/module/references/maze-stage-overlay-contract.md`
- `docs/agentic/maze-build-spec/audits/*`
- `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js`

### Current official guidance that materially changes the plan

- React `useSyncExternalStore`
  - https://react.dev/reference/react/useSyncExternalStore
- React `useEffectEvent`
  - https://react.dev/reference/react/useEffectEvent
- Next.js App Router lazy loading / `ssr: false`
  - https://nextjs.org/docs/app/guides/lazy-loading
- Next.js prefetching
  - https://nextjs.org/docs/app/guides/prefetching
- Next.js `optimizePackageImports`
  - https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports
- R3F scaling performance / `frameloop="demand"` / `invalidate()`
  - https://r3f.docs.pmnd.rs/advanced/scaling-performance
- GSAP `gsap.matchMedia()`
  - https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/
- MDN scroll-driven animation timelines
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines
- MDN `scrollend`
  - https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollend_event
- MDN `prefers-reduced-motion`
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- Motion `useReducedMotion`
  - https://motion.dev/docs/react-use-reduced-motion
- WAI pause/stop/hide
  - https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html

## Executive Assessment

### Keep

These are still the right foundation-level choices and should remain locked:

1. One fixed stage and one canvas per visible surface adapter.
2. Manifest-driven stage ownership.
3. Shared chapter progress as field truth.
4. Controllers mutate field state inside `tick()`.
5. DOM/SVG choreography stays separate from stage truth.
6. Landing remains blob-bookended.
7. `objectFormation` remains a future-module family, not a landing default.

### Reframe

The live branch already contains partial versions of several planned surfaces,
so the next pass must converge them rather than recreate them:

1. `useChapterAdapter` already exists, but today it only wraps chapter-local
   adapters that still install their own private `scrollTrigger` timelines.
2. `FixedStageManager` already exists and waits for point-source prewarm plus
   controller readiness, but it still needs a stronger async-resource contract
   and frame-policy integration.
3. `FieldStoryProgress` already writes root `--progress-N` vars, `--bar-width`,
   GSAP smoothing, and root `is-active`, but it still lacks the second rail,
   shared-scene subscription, full a11y contract, and listener cleanup shape.
4. `TextReveal` is already promoted out of `_smoke` and wired into Hero/CTA.
5. `bind-shell-state-classes.ts` already exists and is mounted globally.
6. `apps/web/next.config.ts` already enables `experimental.optimizePackageImports`.

### Correct

These plan items need explicit correction before implementation starts:

1. Do not "create" `useChapterAdapter`; replace the current implementation
   with a shared-scene consumer contract.
2. Do not treat `FieldStoryProgress` as greenfield; finish the port that is
   already in progress.
3. Do not drop `"use client"` from `FieldLandingRoute.tsx` while the file still
   owns `dynamic(..., { ssr: false })`. Next.js currently documents `ssr: false`
   as a Client Component-only pattern.
4. Do not treat CSS scroll timelines as the primary runtime contract. Use them
   only for isolated DOM-only shell polish behind `@supports`.
5. Do not treat `LazyMotion` as a drop-in bundle win. The savings only materialize
   if the surface migrates from `motion.*` to `m.*` (or the repo-standard
   equivalent) consistently.
6. Do not rely on `experimental.optimizePackageImports` as a correctness or
   production-contract assumption. As of `2026-03-31`, Next still documents it
   as experimental.

## Branch-Reality Delta

### Already closed or partly closed

1. Blob idle rotation parity is already corrected in
   `scene/visual-presets.ts` (`0.06`, not `0.12`).
2. Blob `uSize` is already `8`, not `10`.
3. Root-level progress vars and GSAP smoothing are already live in
   `FieldStoryProgress.tsx`.
4. `TextReveal` is already a production primitive in
   `features/animations/text-reveal/TextReveal.tsx`.
5. Shell body-class binding exists in `app/shell/bind-shell-state-classes.ts`.

### Still open in live code

1. `FieldController.toScreenPosition()` still divides by DPR after projection.
2. `FieldCanvas.tsx` still hardcodes `frameloop="always"` and still mounts
   both static `dpr={[1, 1.75]}` and `<AdaptiveDpr />`.
3. `FieldCanvas` does not currently receive `reducedMotion`.
4. `FieldStoryChapter.tsx` still uses direct `whileInView` reveals for Story 1
   and Story 3.
5. Existing chapter adapters still own private `scrollTrigger` timelines.
6. `FieldLandingPage.tsx` still mirrors `chromeSurfaceMode` into React state via
   its own scroll listener.
7. `FieldLandingShell` still gates coarse-input TOC visibility with
   `(pointer: coarse)` rather than the hybrid-safe `any-pointer` / `any-hover`
   interpretation.
8. `FieldGraphWarmupAction.tsx` still uses the deprecated reduced-motion alias
   and does not prefetch `/graph`.
9. `field-scroll-driver.ts` and several controller files still mix GSAP import
   styles.
10. Module Zero is still coupled to graph-bundle availability even though the
    field runtime itself is not; `/` and `/field-lab` fetch the active graph
    bundle up front and collapse `bundle == null` into an indefinite
    non-ready CTA state.

### Internal doc drift that must not guide implementation

1. `.claude/skills/module/references/maze-build-spec.md` has a historical
   "landed" status block that no longer fully matches the live branch.
2. `.claude/skills/module/references/maze-stage-overlay-contract.md` still
   presents Round 12 `[data-gfx]` scan language near the top.
3. `docs/map/modules/landing.md` is still the canonical example, but it does
   not yet fully match the module template fields future modules are supposed to
   inherit.

## Locked Architecture Decisions

### 1. Runtime shape

Lock:

- one runtime family per visible surface
- one fixed stage
- one canvas
- no app-global singleton canvas
- no per-section canvases
- no second "mobile architecture"

### 2. App Router boundary

Lock:

- server components own page shell, content, and data shaping
- a narrow client island owns R3F, GSAP, browser-only hooks, and warmup logic
- if `ssr: false` stays, it stays inside a Client Component wrapper

### 3. Scroll ownership

Lock:

- `field-scroll-state.ts` remains the only source of truth for chapter progress
  and stage item visibility
- chapter adapters consume shared progress
- chapter adapters do not create private runtime-linked progress truth
- controllers never read `window.scrollY` directly

### 4. Motion ownership

Lock:

- GSAP owns shared scroll intake and DOM-only chapter choreography
- Framer/Motion owns DOM affordances only
- WebGL controllers own field motion inside `tick()`
- CSS scroll timelines are progressive enhancement for shell-only visuals

### 5. State architecture

Lock:

- 60fps frame state stays out of React state
- React subscribers only consume coarse semantic snapshots
- `useSyncExternalStore` is the correct bridge for low-frequency semantic reads
- `scene-selectors.ts` becomes the stable selector surface

### 6. Reduced motion

Lock:

- one boolean preference fans out to Motion, GSAP, WebGL, and CSS
- reduced motion is phase-1 infrastructure, not polish
- reduced mode disables non-essential continuous motion, not information

### 7. Frame policy

Lock:

- the runtime must support `demand` mode
- `always` is only acceptable while the scene is intentionally alive
- `invalidate()` is mandatory when demand-mode frames depend on external
  mutations like GSAP or scroll progress

### 8. Bundle and prefetch policy

Lock:

- Module Zero renders as a valid field surface even when graph warmup or bundle
  lookup fails
- prefetch field-heavy routes intentionally, not accidentally
- large client chunks should move only behind user intent or confirmed warmup
- import-discipline matters even if bundle tooling is already enabled

## Revised Execution Plan

### Phase 0 — Contract And Status Reconciliation

Purpose: remove stale doc truth before the runtime pass begins.

1. Add a branch-verified Module Zero foundation ledger.
2. Mark historical Maze references as evidence where they are no longer live
   architecture truth.
3. Tighten the checked-in module README/template so future modules inherit the
   correct boundaries.
4. Re-label Module Zero's locked deviations as landing-scoped, not global rules.

Exit criteria:

- no future agent can mistake Round 12 `[data-gfx]` scan language for the
  current contract
- the module template requires ending pattern, reduced-motion path, and mobile path

### Phase 1 — Runtime Core

1. Fix `FieldController.toScreenPosition()` HiDPI math and add a 2x DPR test.
2. Wire `updateVisibility()` into the live tick path or remove the dead
   contract from the base class and push visibility ownership fully into
   subclasses.
3. Formalize the readiness gate as one explicit async batch:
   `Promise.all([prewarmPromise, ...controllerReadyPromises, ...assetReadyPromises])`.
4. Refactor to canonical `uTime` seconds + per-layer time factor.
5. Implement frame policy:
   - tab hidden => demand
   - reduced motion => demand
   - offscreen => demand
   - visible and active => always or demand + invalidate, whichever the final
     experiment proves stable
6. Remove the DPR conflict:
   - keep one explicit DPR policy
   - remove `<AdaptiveDpr />` if static range remains the canonical contract
7. Add explicit material cleanup / GPU resource release on destroy.
8. Move `sceneStateRef` ownership into a stable seam and add `scene-selectors.ts`
   for shared readers.
9. Convert discrete React readers like the connection overlay boundary to
   `useSyncExternalStore`-style subscriptions.

Exit criteria:

- no DPR drift
- no stale overlay projection
- no frame starvation in demand mode
- no ambiguous scene-state selector surface

### Phase 2 — Scroll And Adapter Convergence

1. Replace the current `useChapterAdapter` internals so the hook reads shared
   chapter progress and only orchestrates DOM/SVG effects.
2. Remove private `scrollTrigger` timelines from:
   - `surface-rail`
   - `story-two`
   - `sequence`
   - `mobile-carry`
3. Add proper Story 1 and Story 3 adapters so all beatful chapters share one
   chapter-adapter contract.
4. Standardize GSAP imports to named imports.
5. Move width gating to `gsap.matchMedia()`.
6. Coalesce resize-driven adapter refresh through `ResizeObserver` plus one
   deferred `ScrollTrigger.refresh()`.
7. Add route-change refresh on pathname changes.
8. Treat dynamic mobile-only adapter loading as a follow-up on the registry
   design, not a standalone `await import()` patch.

Exit criteria:

- no `scrollTrigger` ownership outside the shared driver and explicitly
  sanctioned non-landing surfaces
- no `window.innerWidth` in adapter factories

### Phase 3 — Progress, Overlay, And Accessibility

1. Finish the progress-rail port:
   - second instance for Story 3
   - shared selector intake
   - remove duplicate scroll ownership
   - add ARIA contract
2. Extract `overlay/field-anchor-projector.ts` so hotspot projection is reusable.
3. Add hotspot-card `aria-label` composition.
4. Gate every scroll-triggered reveal through the shared reduced-motion signal.
5. Add skip-to-content.
6. Gate smooth scrolling with reduced motion.
7. Change pointer heuristics to hybrid-safe input detection.
8. Add marquee pause control.
9. Add reduced-motion guards for CSS keyframes.
10. Add `touch-action: pan-y` and `overscroll-behavior: none` to the canvas host.

Exit criteria:

- one reduced-motion decision fans out everywhere
- no moving content without a pause path
- hybrid pointer devices keep desktop affordances when fine input exists

### Phase 4 — Shell, Bundle, And Route Handoff

1. Remove `chromeSurfaceMode` as a scroll-driven React state mirror.
2. First preference:
   - CSS scroll timeline for shell-only chrome
   - fallback: one shell-owned passive listener with rAF coalescing
3. Keep `FieldLandingRoute` client-owned unless the dynamic wrapper moves into
   a smaller client shim.
4. Decouple graph-bridge readiness from Module Zero core:
   - landing renders even if the active graph bundle lookup fails
   - warmup CTA exposes explicit `ready | loading | unavailable` states
   - failure to warm the graph is not failure to render the field
5. Prefetch `/graph` after graph warmup or clear user intent.
6. Audit server bundle hygiene for type-only imports and client-boundary leaks.
7. Only adopt `LazyMotion` if the surface migrates to the smaller motion
   component API consistently.
8. Treat `optimizePackageImports` as opportunistic, not as proof that import
   discipline no longer matters.

Exit criteria:

- no redundant scroll mirror state
- no accidental client-boundary widening
- graph handoff warmed intentionally

## Open Questions Resolved

1. **`FieldSectionManifest -> SceneResolver`**
   - Answer: defer the concrete resolver chain until a second surface needs it.
   - Rationale: current best practice still favors smaller client boundaries,
     fewer runtime layers, and explicit ownership. With only Module Zero live,
     a `SceneResolver` would mostly re-wrap one manifest-driven mapping and
     create indirection without a second consumer.
   - Document now:
     - `FieldSectionManifest` remains the canonical authoring input.
     - add a typed `ResolvedFieldScene` contract, stable manifest and selector
       interfaces, plus contract tests
     - define the promotion trigger: introduce `SceneResolver` only when two
       surfaces need different scene-family resolution from the same manifest
   - Defer:
     - the runtime resolver chain itself
     - any registry or plugin-style indirection
   - Risk: if deferred too long, landing-specific branching can leak across the
     runtime. Contain that by centralizing selectors and pure mapping helpers now.

2. **B3 preset parity pass**
   - Answer: do not block architecture sign-off on B3 visual parity deltas.
     Handle them in a dedicated visual-diff pass immediately after runtime
     determinism lands.
   - Rationale: until HiDPI projection, frame policy, and canonical `uTime`
     are stable, screenshot diffs are noisy and blend architecture defects with
     art-tuning differences.
   - Document now:
     - architecture sign-off is gated by runtime-contract correctness
     - visual parity sign-off is a separate acceptance track
     - every disputed preset value must be labeled either `locked deliberate`
       or `parity unresolved`
     - preset fields must be classified as one of:
       - semantic behavior
       - cosmetic tuning
       - platform policy
   - Defer:
     - final tuning of `uSize`, `*Out` semantics, and `positionMobile`
     - screenshot approval until the runtime core pass is complete
   - Risk: unresolved values can accidentally fossilize. Prevent that by
     forbidding future modules from inheriting a `parity unresolved` preset
     without an explicit override note.

3. **Stars / starfield**
   - Answer: keep stars/starfield as a sanctioned omission from the shared
     substrate contract.
   - Rationale: it is non-essential continuous background motion, and it should
     not become mandatory baseline cost or visual noise for every future module.
     If a future module needs it, it should still inherit frame-budget and
     reduced-motion rules instead of smuggling in a second ambient system.
   - Document now:
     - the substrate contract does not include stars/starfield
     - `backgroundLayer` is optional and defaults to `none`
     - revival must reuse the existing point-source, preset, and controller
       pipeline on the same renderer
   - Defer:
     - art direction, density budgets, and asset shape until a concrete module
       needs it
   - Risk: a later starfield implementation could bypass runtime budgets.
     Prevent that by treating it as an optional layer of the same runtime family,
     not as shell chrome or a second background canvas.

4. **`fromTexture` layer-0 z behavior**
   - Answer: treat the current Maze-flat first-layer behavior as the canonical
     default. Volumetric spread is explicit opt-in only.
   - Rationale: the live branch already defaults `spreadFirstLayer` to `false`
     and still appends raster extents. The remaining work is to document the
     source contract cleanly and stop future bitmap-backed modules from
     re-deciding these semantics ad hoc.
   - Document now:
     - default `depthMode` is effectively `flat-first-layer`
     - `spreadFirstLayer` remains an explicit opt-in for deliberately volumetric
       silhouettes
     - extents behavior stays explicit through `appendExtents`
     - bitmap source metadata must record channel selection, centering, scale
       basis, vertical orientation, and bounds semantics
     - future sizing logic should prefer explicit bounds metadata over treating
       appended renderable points as the long-term extents contract
     - if visual ordering depends on draw rules, prefer explicit material depth
       policy or `renderOrder` over hidden z nudges
   - Defer:
     - module-specific bitmap depth styling until the first real bitmap-backed
       module can be compared side-by-side against Maze
     - any migration away from appended extents until consumers read explicit
       bounds metadata instead of assuming appended vertices
   - Risk: if left implicit, future bitmap-backed modules will each invent
     their own z workaround and drift from one another.

5. **CSS `scrollend`**
   - Use as a finalization signal only.
   - Do not replace continuous scroll progress with `scrollend`.
   - It is baseline-newly-available from `December 2025`, so it is acceptable
     as an enhancement but not as the only path.

6. **`FieldLandingRoute` `"use client"`**
   - Keep it, or move the `dynamic(..., { ssr: false })` call into a dedicated
     client shim.
   - Do not remove `"use client"` without changing that structure.

7. **`LazyMotion`**
   - Keep as a bundle-improvement option, not a locked must-do.
   - Only pursue it alongside a real motion-surface migration.

## Verification Gates

### Static

- `npm run typecheck --workspace @solemd/web`
- `npm run lint --workspace @solemd/web`
- targeted tests plus any new runtime tests
- grep must trend to zero or to an explicit allowlist:
  - `ScrollTrigger.create` outside shared driver surfaces
  - `scrollTrigger:` inside chapter adapters once Phase 2 lands
  - `addEventListener("scroll"` inside `features/field/**` and `app/shell/**`
  - `window.innerWidth` inside adapters and field controllers
  - `AdaptiveDpr` in `FieldCanvas.tsx`
  - `useReducedMotionConfig`

### Runtime

1. No visible WebGL motion before the readiness gate resolves.
2. Hotspots align at `devicePixelRatio = 2`.
3. Story 1 and Story 3 both publish root `--progress-N` values correctly.
4. Reduced motion yields:
   - zero non-essential GSAP timelines
   - frame policy in demand mode
   - static reveal tree
5. Hidden tab and offscreen stage both suspend wasteful rendering.
6. Three navigation cycles do not retain shader/material garbage.

### Mobile

1. Canvas container respects vertical page scrolling.
2. Progress runtime does not spin on mobile.
3. Pointer detection does not hide desktop affordances on hybrid devices.
4. Marquee can be paused and respects reduced motion.

## Merge Order

1. Docs/contract reconciliation.
2. Runtime core.
3. Scene selectors + semantic subscription boundary.
4. Scroll/adapters.
5. Progress/accessibility/shell.
6. Bundle/prefetch polish.

## Final Recommendation

Do not rewrite Module Zero.

The right 2026 move is to preserve the current architectural direction and
remove ambiguity around it:

- make the client boundary smaller and explicit
- keep one scroll truth
- keep one field runtime
- split frame-state from semantic UI state
- treat CSS scroll timelines and bundle tricks as optional backends, not new
  contracts

That gives future wiki modules, learn modules, expanded module views, and graph
bridges one runtime family to inherit instead of a stack of near-duplicates.
