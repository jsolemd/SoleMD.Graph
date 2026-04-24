# Audit: web-field-runtime

Slice scope: `apps/web/features/field/{controller,scene,stage,scroll,renderer,asset,overlay}/` plus `field-breakpoints.ts` and `index.ts`. 43 source files, 6,364 LOC including tests; ~5,200 LOC source-only. Native WebGL particle field substrate that drives landing storytelling (replaces SVG/visx for chapter content) and is intended to be shared with wiki module shells and expanded module views.

## Slice inventory

| Layer | Files | Notable LOC |
|---|---|---|
| controller/ | `FieldController.ts` (472), `BlobController.ts` (650), `StreamController.ts` (126), `ObjectFormationController.ts` (154), `blob-hotspot-runtime.ts` (169) | abstract + 3 concrete + hotspot helpers |
| scene/ | `visual-presets.ts` (335), `accent-palette.ts` (49) | static preset table + bucket palette |
| stage/ | `FixedStageManager.tsx` (148) | controller-readiness gate + scroll binder bootstrap |
| scroll/ | `field-scroll-state.ts` (242), `field-scene-store.tsx` (64), `field-scroll-driver.ts` (59), `field-chapter-timeline.ts` (80), `scene-selectors.ts` (42), 7 chapter-adapters (~470), 2 chapters (`landing-blob-chapter.ts` 417, `landing-stream-chapter.ts` 111) | manifest→ScrollTrigger binder + per-chapter sample resolvers |
| renderer/ | `FieldScene.tsx` (413), `FieldCanvas.tsx` (95), `field-shaders.ts` (389), `field-loop-clock.ts` (96), `field-point-texture.ts` (25), `mouse-parallax-wrapper.ts` (57), `use-adaptive-frameloop.ts` (51), `FrameloopInvalidator.tsx` (30) | R3F canvas + shaders + adaptive frameloop + module-scope clock/bus |
| asset/ | `field-attribute-baker.ts` (207), `field-geometry.ts` (243), `point-source-registry.ts` (412), `image-point-source.ts` (104), `model-point-source.ts` (61), `point-source-types.ts` (46) | bake pipeline + cached `FieldPointSource` registry |
| overlay/ | `field-anchor-projector.ts` (185), `field-hotspot-lifecycle.ts` (104), `FieldHotspotRing.tsx` (45), `field-hotspot-ring.css` | shared screen-projection + hotspot DOM primitive |
| top-level | `index.ts` (145, public surface), `field-breakpoints.ts` (1) | barrel export |

Counts: critical 3, major 8, minor 9, reuse 4, solid 6.

---

## Critical issues

### C1. WebGL resources are never disposed on unmount — leaks ShaderMaterial, BufferGeometry, Texture, controller GSAP timelines

`renderer/FieldScene.tsx:259-265` only calls `controller.destroy()` (which kills GSAP tweens). There is no `material.dispose()`, no `geometry.dispose()`, no `pointTexture.dispose()`, no `gl.dispose()`. The `<bufferGeometry>` JSX at `FieldScene.tsx:88-102` builds a fresh `BufferGeometry` with 12 typed-array attributes per layer (≈16k vertices for blob, 15k for stream) on every mount, and the underlying GPU buffers stay resident for the life of the WebGL context after unmount. The texture cache at `field-point-texture.ts:9` is module-scope and never invalidated either.

Impact: every Next.js navigation that mounts/unmounts the landing keeps the prior set of GPU buffers + materials live. With React StrictMode double-mount in dev, every mount allocates a second material + 3 layer geometries before the first set is garbage-collectible. In prod this still leaks across SPA navigations between landing and wiki/module surfaces that mount/unmount FieldCanvas independently.

Fix: thread an explicit dispose pass through `FieldScene` cleanup that walks `wrapper`/`mouseWrapper`/`model` (Group.traverse → mesh.geometry.dispose() + mesh.material.dispose()) for each layer; dispose the cached point texture only when no consumer holds a ref (or accept the per-process texture leak, but document it). `R3F` itself does NOT auto-dispose JSX-mounted geometry/material on Canvas unmount when the same Canvas remounts in StrictMode — that is a deliberate behavior of `react-three/fiber`, not a guarantee.

### C2. Compounding `useEffect` without dep arrays force `attachController` every render

`renderer/FieldScene.tsx:267-277` has three `useEffect` blocks **with no dependency array** that each call `attachController(...)`. Every React render — including frame-driven `useFrame` scheduling, scene-store notifications inside subscribers, and PerformanceMonitor density updates — re-runs `controller.attach({...})` and overwrites `controller.material/wrapper/...` references. The controllers tolerate it because the underlying refs are stable, but every commit also re-invokes the registration `useEffect` at `:279-304` which iterates 3 controllers, checks ready set, and rebuilds the ready guard. Same for the registration block.

This is a /clean violation (zero redundant work). Add deps `[blobController]`, `[streamController]`, `[objectFormationController]`, and gate registration on a ref-completeness signal rather than re-running every commit. The same pattern is used in `:267`, `:271`, `:275` and `:279` — four uncontrolled effects.

### C3. `pickBucketIndex` allocates and reduces on every particle on every prewarm

`asset/field-attribute-baker.ts:91-105` calls `buckets.reduce(...)` inside `pickBucketIndex`, which runs once per particle inside the hot bake loop at `:149-175`. For the blob (16384 points) that is 16384 × O(buckets) reduce calls allocating no objects but doing redundant arithmetic; for stream + objectFormation it adds ~17k more per prewarm. The `total` is invariant per call to `bakeFieldAttributes`. Hoist the reduce out of the loop or take the bucket weights and cumulative array as input to the loop. This is a one-line `/clean` violation — but bake is on the critical path of `FixedStageManager` readiness gate and must run on first paint.

---

## Major issues

### M1. `FieldScene` duplicates the per-layer `tick` + uniforms scaffold three times

`renderer/FieldScene.tsx:180-243` instantiates 3 `useMemo` controllers + 3 `useRef` uniform packs + 3 `useRef` handle bundles + 3 `attachController` effects + 3 ready-detect blocks + 3 conditional layer mounts at `:388-411`. The structure is mechanically identical and parameterized only by id/preset/source. The whole 230-line scaffold should reduce to one `FIELD_STAGE_ITEM_IDS.map(...)` over a controller factory registry. Today, adding a fourth layer (or letting wiki module shells reuse the runtime) means copy-pasting the 75-LOC block. This is the Maze module-in-module reuse contract the slice was built for; it can't satisfy it in current shape.

### M2. Three controllers re-implement the same `tick` skeleton

`BlobController.tick` (`controller/BlobController.ts:164-367`), `StreamController.tick` (`StreamController.ts:30-125`), and `ObjectFormationController.tick` (`ObjectFormationController.ts:28-113`) each independently:
1. Destructure FrameContext, compute motionScale + driftBlend + timeFactor + sceneScale + sourceHeight + sceneUnits + baseScale (6 lines repeated verbatim except blob doesn't use shaderAlpha).
2. Write uTime, uTimeFactor, uPixelRatio, uIsMobile, uScale, uSize, uSpeed (7 uniform writes; identical except size/alpha mobile).
3. Drift-blend uniforms via `+= (target - current) * driftBlend`.
4. Apply wrapper position/scale/rotation drift-blend.

The base class `loop()` at `FieldController.ts:267-270` is dead — three subclasses bypass it. Centralize the per-frame uniform/wrapper tween into a `FieldController.applyBaselineTick(context, chapterState)` and let subclasses override only chapter-specific overrides (focus members, hotspot state, scroll-z). 600-LOC budget on `BlobController.ts` (650 LOC) is already over.

### M3. `BlobController.projectHotspots` runs per frame without any visibility short-circuit

`renderer/FieldScene.tsx:374-383` calls `blobController.projectHotspots` every `useFrame` tick whenever `activeIdSet.has("blob")`. The function at `BlobController.ts:429-649` clears 40 frame slots, possibly runs `selectBlobHotspotCandidate` (rejection-sampling up to 80 attempts × `projectPointSourceVertex` per slot), and `writeHotspotDom` walks the DOM pool every frame. The early bailout at `:459-472` does cull when blob visibility ≤ 0.01 OR hotspots inactive — but `writeHotspotDom` still runs from inside the bailout. So even when hotspots are hidden, the function (1) loops 40 slots to clear frames, (2) calls `writeHotspotDom` which loops `refs.length` and writes inline styles. That means the landing pays a 40+40-iteration loop + DOM style mutation 60 times per second in every chapter where the blob is visible but `hotspotState.opacity === 0` (which is most of the page).

Fix: have `writeHotspotDom` short-circuit when nothing changed (compare frame visibility + position to last write); skip the call entirely when visibility was 0 last frame and is 0 now.

### M4. `renderer/field-loop-clock.ts` defines a subscriber bus but is not used

The file documents a "single RAF subscriber bus … fans out to priority-ordered consumers" with named bands (10/20/30/40/50/60/70/80) at `:8-16`. `subscribe`/`unsubscribe`/`tick` are exported but neither `FieldScene` nor any controller in the slice subscribes — `FieldScene.tsx:385` only calls `fieldLoopClock.tick(delta)` once per frame to advance the clock. The bus is dead code. Either wire controllers/overlays through it (the comment says they should), or delete the bus and keep only `getFieldElapsedSeconds`. The `try/catch` per subscriber at `:74-80` is overhead for zero subscribers today.

### M5. Mouse parallax has no touch/pointer fallback — landing is static on mobile pointer

`renderer/mouse-parallax-wrapper.ts:37-51` listens only to `mousemove`. On mobile/touch (where the field substrate also runs) there is no parallax — the wrapper rotation stays at zero. The slice doc explicitly calls out "responsive parity (touch + mobile field interaction)" as a /clean requirement. Either intentionally noop on touch (current behavior, undocumented), or use `pointermove` and treat hover-capable taps as parallax inputs. Document the choice; right now the no-touch parallax is silently invisible.

### M6. `FixedStageManager` swallows readiness rejection without retry

`stage/FixedStageManager.tsx:112-115` logs `[FixedStageManager] readiness gate rejected` and never recovers — `setReady(false)` stays. `prewarmFieldPointSources` runs synchronously inside `Promise.resolve(...)`, so any `bakeFieldAttributes` throw (e.g. missing position attribute, see `:118-122`) is wrapped into a rejected promise that the stage can never re-attempt. Add an error state on the context and surface it to consumers; the landing currently just stays invisible.

### M7. `point-source-registry` cache is unbounded

`asset/point-source-registry.ts:54-97` caches one `FieldPointSource` per (mobile|desktop, density rounded to 0.01, id). With density adapting between 0.72-1.0 in 0.06 / 0.12 increments via PerformanceMonitor (`renderer/FieldCanvas.tsx:79-82`), the cache can fill with 6-8 density tiers × 2 viewports × 3 ids = up to 48 entries. Each entry holds ≈12 Float32Arrays of 16k-16k points. At 16384 × (3+3+3+1+1+1+1+1+1+1+1+1+3=21 floats) that is ≈1.4MB/entry for the blob alone, ≈6MB total per density tier across 3 layers. Worst case 48MB resident, never freed — the registry has `clear()` but nothing calls it.

Fix: LRU with a small cap (4-6 entries) keyed by viewport + density bucket, or evict entries not matching the current `(isMobile, density)` after a debounce.

### M8. `field-scroll-state.ts` allocates and notifies on every onUpdate

`scroll/field-scroll-state.ts:155-172` calls `recomputeStageItems` inside every ScrollTrigger `onUpdate`, which loops manifest entries and writes to `sceneState.items`, then calls `sceneStore.notify()` which fans out to every chapter-adapter subscriber (each one calls `master.progress(progress).pause()` on a GSAP timeline). On a 7-chapter manifest with ScrollTrigger firing at scroll-frame rate, that's 7+ timelines re-progressed per frame even when their progress hasn't changed. `getFieldChapterProgressBucket` exists at `scene-selectors.ts:36-42` for exactly this reason but isn't consulted in the binder hot path. Either gate notify on bucket transitions or memoize per-adapter to compare progress before re-driving the timeline.

---

## Minor issues

### m1. FieldController's `loop()` method is dead but advertised
`FieldController.ts:267-270` exists but no caller invokes it (per the comment at `:283-289` itself). Remove. Keeping dead inheritance hooks confuses module-shell authors who think they should override `loop`.

### m2. `ensureGsapScrollTriggerRegistered` defined inside FieldController.ts
`FieldController.ts:12-21` declares a global registration helper at the top of a class file. Belongs in `scroll/ensure-gsap-scroll-trigger-registered.ts` (mirror of `ensure-gsap-motion-path-registered.ts:1-11`).

### m3. `attachMouseParallax` not wired to any controller in this slice
The export exists and `FieldController.attachMouseParallaxTo` exists (`FieldController.ts:392-396`) but no concrete controller (Blob/Stream/ObjectFormation) calls it. Either delete the indirection or restore the wiring; the dead path is misleading.

### m4. `field-loop-clock.tick` swallows subscriber errors silently to console
`field-loop-clock.ts:74-80` writes to `console.error` but provides no observability hook. If subscribers break, the page silently keeps animating with one consumer dead. Add a `__fieldLoopClockHealth` debug API (matches /phone graphDebug pattern from memory) so dev can diagnose.

### m5. `field-anchor-projector` mutates input vector when scratch omitted
`overlay/field-anchor-projector.ts:51-52` documents the side effect ("Mutates `worldVector`…") but most callers in the slice pass `vector = this.hotspotVector` which is a long-lived scratch. Defensive callers (e.g. `BlobController.toScreenPosition` via `FieldController.ts:413-433`) DO pass a scratch — but the public projector signature defaults to mutation. Consider always copying internally; the scratch arg can stay as an opt-in to avoid an allocation on the hot path, but the default should be safe.

### m6. Color buffer derived even though shader doesn't read it
`asset/point-source-registry.ts:153-164` derives a per-particle CPU `color: Float32Array` for every source (16k floats × 3 = 48k floats = 192KB per blob). Comment at `:31-34` says "the shader itself no longer reads the `color` attribute" — only `getPointColorCss` (`blob-hotspot-runtime.ts:86-110`) needs it. The bake produces 192KB of unused memory per source for non-blob layers. Skip color derivation for stream/objectFormation; only blob hotspot reads call `getPointColorCss`.

### m7. `FrameloopInvalidator` listens to scroll on the global window
`renderer/FrameloopInvalidator.tsx:20-26` adds a `scroll` listener with `kick = invalidate` for demand-frameloop mode. Every scroll event fires invalidate; this is correct for parallax but means under reduced-motion + onscreen, every wheel tick re-renders R3F. `useAdaptiveFrameloop` already returns "always" when not reduced-motion + onscreen, so the invalidator should be inert there — but the listener is still attached when `active` is true (reduced-motion or off-screen). Acceptable; document the cost, or throttle with rAF.

### m8. `field-shaders.ts` constant-bounded loop has minor branching cost
`field-shaders.ts:333-337` loops `for (mi = 0; mi < 8; mi++)` and conditionally sets `isFocusMember = true`. Without `break` the GLSL compiler may emit 8 iterations always. Consider a manually-unrolled comparison chain or short-circuit via clamp(uFocusMemberCount, 0, 8). Minor — runs per vertex but only inside the focus path which is gated by `uFocusActive > 0.001`.

### m9. `index.ts` re-exports `routes/` and `surfaces/` symbols outside the audited scope
`index.ts:141-145` re-exports from `./surfaces/FieldLandingPage` and `./surfaces/FieldLandingPage/FieldHotspotPool`. Those live outside the audited slice but the barrel pulls them in. Splitting `index.ts` into `field-runtime.ts` (controllers + renderer + asset + overlay + scroll) and `field-surfaces.ts` (landing) lets wiki module shells import only the runtime without dragging the landing surface tree.

---

## Reuse / consolidation opportunities

### R1. One layer factory replaces three useMemo blocks
Build a `createFieldLayer({ id, ControllerClass, preset, pointSources, ... })` helper that returns `{ controller, uniformsRef, handles, attachEffect, readyEffect, jsx }`. `FieldScene` becomes a `FIELD_STAGE_ITEM_IDS.map(createFieldLayer)`. Resolves M1, M2 inheritance gap, and makes module-shell reuse trivial.

### R2. `field-loop-clock` priority bus → controller dispatch
If we keep the bus, route `controller.tick(FrameContext)` calls through it (priority 20, per the comment) instead of `useFrame`. `useFrame` then becomes a single subscriber that advances the clock and fans out, and overlays / projection / chrome consumers can subscribe at their documented priorities without `useFrame` per consumer. This is the design the file already documents — execute it or delete the bus (M4).

### R3. Drift-blend helper in `@/lib/motion3d` already imported
All three controllers import `lerpFactor`/`DECAY` from `@/lib/motion3d` and write `uniform.value += (target - uniform.value) * driftBlend` for ~10 uniforms each. A `driftBlendUniform(uniform, target, blend)` helper would cut ~30 lines from each controller and centralize the math. Same for vector blend on `Vector3.position` triplets.

### R4. `getPointColorCss` is the sole color-buffer reader
Move `deriveColorBuffer` (`point-source-registry.ts:153-164`) out of bake-time and turn it into a per-call lookup inside `getPointColorCss` that reads `aBucket[candidateIndex]` and indexes `BUCKET_INDEX_TO_COLOR`. Eliminates ~192KB/source × 3 sources of unused CPU memory (m6) and removes the buffer entirely from the `FieldPointSourceBuffers` shape.

---

## What's solid

- **S1.** `field-anchor-projector.ts` is a clean adapter — physical/CSS pixel contract is documented at the top, `respectLocalFrontFace` justifies its perf trade-off, and Blob/runtime/overlay all delegate. This is the canonical native pipeline pattern the slice should follow elsewhere.
- **S2.** `useAdaptiveFrameloop` correctly switches to demand mode on tab hide / off-screen / reduced-motion via IntersectionObserver + visibilitychange. Cleanups disconnect the observer and remove the listener.
- **S3.** `field-shaders.ts` GLSL is well-commented (Maze parity callouts, focus-member sentinel rationale, light-mode gamma remap). The `discard` for sub-threshold fragments at `:381-385` is a real fill-rate win.
- **S4.** `FieldGeometry` factories (sphere/stream/fromTexture/fromVertices) are pure functions parameterized by an injected `random()` — testable, deterministic, no hidden state.
- **S5.** `field-chapter-timeline.createFieldChapterTimeline` is a clean pure resolver: chapter state is reproducible from scroll progress + manifest, no per-frame allocation in the sample path (just `{ ...seed }` once).
- **S6.** Controller readiness gate in `FixedStageManager` (Promise.all of `whenReady` + prewarm) is a correct race-condition fix — bindings only attach after every controller has its ShaderMaterial.

---

## Recommended priority (top 5)

1. **C1 — WebGL dispose pass on `FieldScene` unmount.** Highest blast radius: every navigation between landing and other surfaces leaks the entire field GPU footprint. Single PR scoped to `FieldScene.tsx:259-265` cleanup + traverse-and-dispose helper.
2. **C2 — Add deps to `attachController` + register effects.** Stops 4 effects firing per render. Trivial fix; high frequency. Pair with a render-count perf test for the FieldScene to catch regressions.
3. **M3 — Short-circuit `projectHotspots` + `writeHotspotDom` when state hasn't changed.** Removes a 60-Hz 40-iteration loop + DOM style mutation cost from every chapter where the blob is visible but hotspots are off. Highest steady-state perf win.
4. **M1 + M2 — Collapse `FieldScene` triplication and the three `tick` skeletons into a layer factory + `applyBaselineTick`.** Resolves the 600-LOC ceiling miss on `BlobController.ts`, makes wiki/module-shell reuse possible (the explicit mandate), and eliminates the dead `loop()` hook (m1).
5. **M7 — Bound the `point-source-registry` cache.** Worst-case ~48MB resident because density-tier × viewport × id permutations accumulate across the session. LRU at 6 entries fixes it without changing the resolve API.
