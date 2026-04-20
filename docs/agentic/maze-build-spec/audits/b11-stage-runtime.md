# Agent 9 audit — Stage runtime (`Os` / `xi`) + starfield `hg` vs `FieldScene.tsx` + `FieldCanvas.tsx`

**Auditor**: Agent 9 (Phase 3)
**Bucket**: B11 — Stage runtime + optional starfield
**Maze lines audited**: [49359, 49588] (starfield `hg` [49359, 49425]; stage `Os`/`xi` [49427, 49588])
**SoleMD files audited**:
- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/renderer/FieldCanvas.tsx`
- `apps/web/features/ambient-field/renderer/field-loop-clock.ts`
- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldLandingPage.tsx` (adjacent resize/preload glue)
- `apps/web/features/ambient-field/asset/point-source-registry.ts` (preload / prewarm API)
**Date**: 2026-04-19

## Summary

Maze `Os`/`xi` is a page-global singleton stage: one `WebGLRenderer`, one `THREE.Scene`, one `PerspectiveCamera`, a single blocking preload promise (`ku.loadAll()`) that gates the RAF loop, and a DOM scan for `[data-gfx]` anchors that instantiates one controller per slug via the `jx` registry. SoleMD replaces this with an R3F `<Canvas>` — the renderer, scene, and camera are created by `@react-three/fiber`, resize is handled by R3F's internal `ResizeObserver`, DPR is controlled by `<AdaptiveDpr>` + `dpr={[1, 1.75]}`, and the preload chain is decomposed: point-source generation is a synchronous in-memory `prewarm()` call, the particle texture is a lazy singleton, and the RAF loop (R3F's `useFrame`) runs unconditionally whether or not point sources have been "preloaded". There is **no explicit `Promise.all` gating the first frame**. Controllers attach via React refs inside `FieldScene` rather than a DOM `querySelectorAll("[data-gfx]")` sweep. The per-frame order inside `useFrame` matches Maze's conceptual `loop → updatePosition → (updateVisibility) → render` but collapses them into a single `blobController.tick()` call with R3F owning the final `renderer.render(scene, camera)`. The starfield `hg` is **not implemented** in SoleMD — correctly sanctioned as catalog Open Question #3/#4 (a `?stars` optional feature tied to Maze debug paths, not homepage parity).

The most consequential divergence for first-paint is the **missing preload promise gate**: Maze does not start the RAF loop or the first `resize()` until `ku.loadAll()` resolves, while SoleMD's `FieldScene` renders on mount and mutates the shader material the moment the point source finishes generating (inside `useMemo`). For the current homepage (procedural blob only, zero remote assets, zero FBX models, zero bitmap loads on the active path), the two paths are behaviorally equivalent in wall-clock terms — but the contract breaks the moment any future surface adds a bitmap (`pcb`) or model (`World`/`Shield`) point source to the registry and expects asynchronous gating.

## Parity overview

| Behavior                                    | Maze line            | SoleMD location                                                              | Ownership          | State               |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- | ------------------ | ------------------- |
| Renderer construction (alpha, antialias)    | 49523–49527          | `FieldCanvas.tsx:43–47` (`gl={{ alpha: true, antialias: true, … }}`)          | stage-local        | parity              |
| `setPixelRatio(us)` (device pixel ratio)    | 49528, 49436         | `FieldCanvas.tsx:41` (`dpr={[1, 1.75]}` + `<AdaptiveDpr/>`)                   | stage-local        | sanctioned-drift    |
| `setClearColor(BG_COLOR, 0)` (transparent)  | 49530 (`16717597, 0`)| R3F default is transparent when `alpha: true`; no explicit clear color        | stage-local        | sanctioned-drift    |
| Scene construction                          | 49531 (`new Oh()`)   | R3F internal `new Scene()` (default Canvas children)                          | R3F-owned          | parity (delegated)  |
| Camera construction (persp 45°, z=400)      | 49535–49537 (`Ji(45, aspect, 80, 1e4)`, `position(0,0,400)`) | `FieldCanvas.tsx:40` (`camera={{ position:[0,0,400], fov:45, near:80, far:10000 }}`) | stage-local | parity              |
| `camera.lookAt(scene.position)` per frame   | 49575                | not explicit; R3F camera stays at identity rotation toward `-Z` (equivalent for camera at `(0,0,400)` looking at origin) | R3F-owned          | parity (delegated)  |
| `Os.setViewportHeight` (precompute `sceneUnits = 2*z*tan(fov/2)`) | 49464–49468, 49538 | **not implemented** — controllers use `viewportWidth`/`viewportHeight` + `camera.aspect` directly | stage-local        | drift (D1)          |
| Tone mapping                                | not set (three defaults) | not set (R3F defaults)                                                     | R3F-owned          | parity              |
| Resize handler (`offsetWidth` / `offsetHeight`) | 49434–49446       | R3F `Canvas` internal `ResizeObserver` on the host `<div>`                    | R3F-owned          | parity (delegated)  |
| `updateItems()` on resize (position/scale/material) | 49445, 49561–49568 | `useFrame` writes position/scale/material every frame; no separate resize-only path | stage-local   | drift (D2, benign)  |
| Preload via `Promise.all([ku.loadAll()])`   | 49472                | `prewarmAmbientFieldPointSources({ ids:['blob'] })` is synchronous; `getFieldPointTexture()` is lazy; no `Promise.all` | stage-local | **drift (D3, must-fix before adding async sources)** |
| First frame gated on preload                | 49472–49474 (`this.resize(), this.loop(), this.bind()` only after promise resolves) | no gate; `useFrame` ticks from mount | stage-local | drift (D3)          |
| DOM scan `[data-gfx]` → controller map      | 49547–49557          | no DOM scan; `FieldScene` instantiates `BlobController` via `useMemo` (single slug) | stage-local | sanctioned (see B7 audit) |
| Controller per-frame update order           | 49578–49583 (`loop() → updatePosition → updateVisibility`, then `renderer.render`) | `FieldScene.tsx:199–221` (`blobController.tick(...) → projectHotspots → fieldLoopClock.tick(dt)`; R3F autorender after) | stage-local | drift (D4, structural rename) |
| RAF driver                                  | 49458–49460 (`requestAnimationFrame(this.loop)`) | R3F `Canvas` invalidation + `useFrame` | R3F-owned          | parity (delegated)  |
| Mouse-move fan-out to items                 | 49450–49456, 49544   | not in stage; `attachMouseParallax` is opt-in per module (sanctioned by Round 13) | stage-local        | sanctioned          |
| `animateIn` / `animateOut` view fade (0.5s) | 49482–49506          | not implemented at stage level (controllers own their own intros)             | stage-local        | drift (D5)          |
| `destroy`: `renderer.dispose()` + `forceContextLoss()` + null refs | 49508–49516 | R3F owns renderer disposal on `<Canvas>` unmount; `BlobController.destroy()` in `FieldScene` cleanup | R3F-owned | parity (delegated)  |
| Optional starfield `hg` on `?stars`         | 49541 (`new hg()`)   | **not implemented**                                                           | stage-local        | **sanctioned omission (Open Q #3/#4)** |
| Starfield scroll ScrollTrigger (z −200 → 200) | 49410–49423         | n/a                                                                           | n/a                | sanctioned omission |
| Starfield `mousemove` rotation              | 49364–49380          | n/a                                                                           | n/a                | sanctioned omission |
| Starfield `uTime += 0.01` per loop          | 49383–49385          | n/a                                                                           | n/a                | sanctioned omission |

## Drift items

### D1. Missing `Os.setViewportHeight` precompute (`sceneUnits`)

- **Maze reference**: `scripts.pretty.js:49464–49468, 49538` — static `Os.sceneUnits = 2 * camera.position.z * tan(fov/2)` computed once at setup and on every resize; stored as a static class field and read by controllers.
- **SoleMD location**: no equivalent. Controllers consume `viewportWidth`, `viewportHeight`, `camera.aspect`, and `pixelRatio` directly from the `state` R3F passes into `useFrame` (`FieldScene.tsx:192–195`).
- **Drift**: Maze controllers can do NDC→world math against the precomputed `sceneUnits` without redoing the trig every frame. SoleMD controllers either (a) don't need the value for the blob-only homepage (blob scales by camera aspect) or (b) recompute on demand inside controller math. This is latent, not active, drift today.
- **Severity**: Nice-to-have (deferred) — parity-critical only once `PcbController.updateScale` and `StreamController.updateScale` are wired on the landing surface. Both subclasses already carry the Maze aspect-ratio math per `B6` controller audit; they do not yet consume a shared `sceneUnits`.
- **Proposed fix**: When stream / pcb land on the homepage, add a module-scope memo inside `FieldScene.tsx` (or a new `stage-metrics.ts` sibling) that recomputes `sceneUnits` on `state.size` change and passes it into `tick(...)`. Do not resurrect `Os.static` mutation patterns — keep the value in a ref or a context.
- **Verification**: once stream/pcb are on-screen, confirm their scale matches Maze parity per B6's audit; unit test that `sceneUnits = 2 * 400 * tan(π/8) ≈ 331.37` at `fov=45, z=400`.

### D2. `updateItems()` on resize vs. per-frame writes

- **Maze reference**: `scripts.pretty.js:49434–49446, 49561–49568` — `resize()` calls `updateItems()`, which iterates items and invokes `updatePosition`, `updateScale`, `updateMaterial`. Separately, the RAF loop invokes `loop → updatePosition → updateVisibility` per frame.
- **SoleMD location**: `FieldScene.tsx:189–227` — the `useFrame` closure reads `state.size.width/height` every frame and calls `blobController.tick(...)` unconditionally; there is no separate resize-only path.
- **Drift**: SoleMD does strictly more work per frame than Maze (scale recompute on every tick, not only on viewport change). For a 60Hz loop this is negligible for the current blob controller, but it obscures the Maze contract that certain controller writes are resize-triggered (`updateMaterial` specifically).
- **Severity**: Doc-only / benign — `BlobController.tick` is idempotent in this regime; no measurable frame cost.
- **Proposed fix**: Document in `FieldController.ts` that `tick` is expected to be called every frame and that "resize-only" writes should be gated on a viewport-size-changed check inside the controller if any subclass adds expensive resize-only work (e.g. `updateMaterial` rebuild). No stage-level change needed.
- **Verification**: grep `FieldController.tick` callers; confirm only `useFrame` drives it.

### D3. **No Promise gate between asset preload and first frame** (load-bearing for future sources)

- **Maze reference**: `scripts.pretty.js:49469–49474` —
  ```
  init() {
    super.init();
    this.setup();
    this.preload = Promise.all([ku.loadAll()]).then(() => {
      this.resize(); this.loop(); this.bind();
    });
  }
  ```
  The RAF loop (`this.loop()`), first `resize()`, and `bind()` (mousemove) all wait on `ku.loadAll()`, which is the asset registry promise fanout over all `[data-gfx]` slugs that appear in DOM (loads bitmaps via `md`, FBX via `md.load`, procedural via `jo.generate`).
- **SoleMD location**:
  - `AmbientFieldLandingPage.tsx:118–124` calls `prewarmAmbientFieldPointSources({ ids:['blob'] })` inside a client `useEffect` (fire-and-forget; the function is currently synchronous — procedural points are generated in-thread).
  - `FieldScene.tsx:121–129` calls `resolveAmbientFieldPointSources({ ids:['blob'] })` inside `useMemo` — also synchronous.
  - `useFrame` starts ticking the moment R3F mounts the canvas, independent of any point-source promise.
  - `getFieldPointTexture()` is a lazy module-scope memo; not promise-based.
- **Drift**: For the current homepage (procedural blob only, no `logo`/`pcb`/`stars`/FBX), the behaviors converge because every asset is CPU-sync or already on the network critical path owned by Next.js. But the Maze contract is **"no frame renders until every referenced asset resolves"**, and SoleMD cannot honor that once an `ids` entry becomes async (see `image-point-source.ts` — already returns a `Promise<AmbientFieldPointSource>` for image/bitmap sources; the registry has both sync and async codepaths). `FieldScene.tsx` consumes only the synchronous path.
- **Severity**: **Should-fix before stream/pcb land on-screen**. Sanctioned by `frontend-performance.md` only for the continuous `uTime` contract, not for first-paint correctness.
- **Proposed fix**: When multi-source preload is wired (Phase `image-particle-conformation.md` rollout), add a `Promise.all([pointSource.ready, texture.ready, …])` gate inside `FieldScene` that defers rendering the `<AmbientFieldStageLayer>` until the promise resolves. Keep `useFrame` running (R3F needs the mount) but short-circuit the controller `tick` while the gate is pending. Alternatively, gate at the `<Canvas>` level via a Suspense boundary — this is the React-native way and matches how R3F users already wire `<useGLTF>`-driven scenes.
- **Verification**: Add a slow-loading mock point source, confirm the blob does not flash in partially-initialized state; Lighthouse LCP unchanged for the current procedural-only path.

### D4. Per-frame update order: `tick` collapses Maze's `loop → updatePosition → updateVisibility`

- **Maze reference**: `scripts.pretty.js:49573–49584` —
  ```
  render() {
    this.camera.lookAt(this.scene.position);
    let { scrollY: t } = window, n = this.view.clientHeight;
    this.items.forEach(o => {
      o.loop();                                   // animation
      o.updatePosition(t, this.camera.aspect);    // scroll/carry
      o.updateVisibility(t, n);                   // alpha / cull
    });
    this.renderer.render(this.scene, this.camera);
  }
  ```
  Strict order: `loop` → `updatePosition` → `updateVisibility` → `render`.
- **SoleMD location**: `FieldScene.tsx:199–227` —
  ```
  blobController.tick({ camera, dtSec, elapsedSec, …, uniforms, viewportHeight, viewportWidth, … });
  blobController.projectHotspots(camera, w, h, elapsedSec, sceneState);
  fieldLoopClock.tick(delta);
  // R3F then runs renderer.render after useFrame returns.
  ```
  Inside `BlobController.tick`, the public contract fans out to controller-private methods; the R3F render step happens after all `useFrame` callbacks return (priority-ordered by R3F).
- **Drift**: The names `updatePosition` / `updateVisibility` / `loop` are subsumed inside `tick`. The order internally is still `loop-equivalent → position → visibility` per `B6` controller audit, but it is now opaque to a reader comparing line-by-line. The surrounding `projectHotspots` call is an added SoleMD step (Maze projects hotspots inside the blob controller's `loop`, not separately).
- **Severity**: Doc-only — structural rename, not behavioral drift.
- **Proposed fix**: In `FieldController.ts` doc comment, explicitly state the `tick` contract: `tick === loop + updatePosition + updateVisibility in that order`; in `BlobController.tick`, add section comments `// [1] loop (idle rotation + uTime)`, `// [2] updatePosition (scroll/carry)`, `// [3] updateVisibility (alpha/cull)`. This lets `B6` auditor verify ordering without inferring it.
- **Verification**: code-grep ordering; unit test confirms that `projectHotspots` always sees the post-`updatePosition` transform.

### D5. Stage-level `animateIn` / `animateOut` on `.view` is unimplemented

- **Maze reference**: `scripts.pretty.js:49482–49506` — `Os.animateOut` runs `items.map(t => t.animateOut('center'))` concurrently with a `Zx.to(this.view, { opacity: 0, duration: 0.5 })` fade and resolves when both finish; `animateIn` is the 0.5s reverse.
- **SoleMD location**: not implemented. The landing page shows the `<FieldCanvas>` immediately; individual controllers (`BlobController.animateIn`) own their enter tweens per B6.
- **Drift**: Only relevant for page-to-page AJAX swap (Maze's `Fs`/`by` shell — folded into B2). SoleMD uses Next.js App Router; route transitions are owned by the router, not by the stage.
- **Severity**: **Sanctioned deviation** — see catalog Open Question #8 (`Fs` AJAX parity is a sanctioned superset).
- **Proposed fix**: None required. If future surfaces need a stage-level fade-out (e.g. graph-entry handoff to `/graph`), wire it via `framer-motion` on the canvas wrapper, not inside the stage.
- **Verification**: n/a.

### D6. DOM scan for `[data-gfx]` vs. React component tree

- **Maze reference**: `scripts.pretty.js:49547–49557` — the stage does `document.querySelectorAll("[data-gfx]")`, looks up assets via `ku.get(n)`, picks a controller class from `jx[n] || jx.default`, constructs it, calls `getObject()`, and adds the result to the scene.
- **SoleMD location**: `FieldScene.tsx:114–136` — no DOM scan. `BlobController` is instantiated once via `useMemo`; the `<AmbientFieldStageLayer>` declares the `<group>` tree declaratively; refs fire `tryAttachController()` which calls `blobController.attach(...)`.
- **Drift**: Architectural. SoleMD is React-native; the `data-gfx` registry is not the idiomatic mount point.
- **Severity**: **Sanctioned deviation** — covered by the `B7` audit (controller registry). No change needed in `B11`.
- **Proposed fix**: None; see `b07-controller-registry.md`.
- **Verification**: n/a.

## Sanctioned deviations encountered

1. **Starfield `hg` is omitted** — `?stars` query param in Maze gates `new hg()` inside `Os.setup` at line 49541. Catalog Open Questions #3 and #4 explicitly recommend sanctioned omission; starfield is an optional Maze debug / marketing feature not active on the primary homepage flow. SoleMD has no `?stars` surface and none of the `hg`-specific primitives (`BgShader` material, `stars` geometry slug in `jo.generate`, mousemove-driven `points.rotation`, scroll-driven `points.position.z` −200→+200 over `document.body`). Sanctioned: catalog `§ Open Questions #3`, `#4`.

2. **R3F owns renderer/scene/camera construction** — Maze constructs `new tm({ alpha, antialias, canvas })`, `new Oh()`, `new Ji(45, …)` directly. SoleMD delegates to `@react-three/fiber`'s `<Canvas>`. `FieldCanvas.tsx:38–50` passes the same renderer and camera parameters (`alpha: true`, `antialias: true`, `fov:45, near:80, far:10000, position:[0,0,400]`) into R3F props. The renderer, scene, and camera are constructed by R3F internals, not by a custom class — but with identical parameters. Sanctioned: R3F is SoleMD's canonical Three.js adapter; re-implementing `Os` in raw three.js would violate the native-first runtime rule in `frontend-performance.md` § "Core Rules #1".

3. **Resize owned by R3F's internal `ResizeObserver`** — Maze hand-rolls a `resize` arrow function bound to window events (49434). R3F's `<Canvas>` attaches a `ResizeObserver` on the host element by default and calls `renderer.setSize` + `camera.updateProjectionMatrix` identically. Sanctioned: same rationale as #2.

4. **DPR via `dpr={[1, 1.75]}` + `<AdaptiveDpr/>`** — Maze does `setPixelRatio(us)` where `us = Math.min(devicePixelRatio, 2)`. SoleMD clamps lower (1.75 ceiling) and adapts down under load via `<PerformanceMonitor>`. The `frontend-performance.md` § "Ambient Field Runtime" contract explicitly caps DPR at 2 — SoleMD's 1.75 ceiling is stricter and aligned. Sanctioned: `frontend-performance.md` § "DPR capped at 2".

5. **`setClearColor(BG_COLOR, 0)` omitted** — Maze sets clear color `16717597` (decimal form of `0xff1e1d`, a warm red-orange) with alpha `0` so the canvas is transparent and the CSS bg shows through. SoleMD relies on R3F's default transparent clear when `alpha: true`. The clear color value doesn't render visibly because alpha is 0 in both paths. Sanctioned: canvas is transparent in both runtimes; the actual visible background is the `<div>` bg painted by the surrounding DOM.

6. **Page-global `Os.static` fields not mirrored** — Maze stores `Os.scene`, `Os.camera`, `Os.width`, `Os.height`, `Os.widthHalf`, `Os.heightHalf`, `Os.sceneUnits` as static class fields for cross-module lookup (the `Gs` debug registry consumes them). SoleMD has no debug registry and reads these through R3F's `state` in `useFrame` or through controller constructor injection. Sanctioned: page-global mutable statics are a SoleMD anti-pattern and explicitly discouraged by the SKILL's "No per-frame React updates from ambient-field" rule and by `frontend-performance.md` § "Centralize performance-sensitive contracts".

## Preload chain parity

**Parity: partial.**

| Maze step                             | Line       | SoleMD equivalent                                                                | Parity |
| ------------------------------------- | ---------- | -------------------------------------------------------------------------------- | ------ |
| `this.setup()` (renderer + camera)     | 49471      | R3F `<Canvas>` mount                                                              | yes    |
| `Promise.all([ku.loadAll()])`         | 49472      | synchronous `prewarmAmbientFieldPointSources(...)` + lazy `getFieldPointTexture()` | **no** |
| `.then(() => this.resize())`          | 49473      | R3F `ResizeObserver` runs on mount (unconditional, not awaited)                   | delegated |
| `.then(() => this.loop())`            | 49473      | R3F `useFrame` starts ticking on mount (unconditional, not awaited)               | **no** |
| `.then(() => this.bind())`            | 49473      | mousemove parallax opted into per-module, not stage-bound                         | sanctioned |

The current homepage is procedurally generated (no bitmap, no FBX, no remote asset on the blob path) so the synchronous `prewarm()` is functionally equivalent to `Promise.all([ku.loadAll()])` resolving same-tick. First-paint is correct **for the current surface only**. The Maze contract shape — "no frame until assets ready" — is not enforced. See D3 above.

## RAF loop order parity

**Parity: structural rename, no behavioral drift.**

Maze per-frame sequence (`scripts.pretty.js:49573–49584`):

```
camera.lookAt(scene.position)
foreach item in items:
    item.loop()
    item.updatePosition(scrollY, camera.aspect)
    item.updateVisibility(scrollY, viewHeight)
renderer.render(scene, camera)
```

SoleMD per-frame sequence (`FieldScene.tsx:189–227`):

```
blobController.tick({ camera, dt, elapsedSec, viewport, sceneState, uniforms, … })
  // internally: loop-equivalent → updatePosition-equivalent → updateVisibility-equivalent
blobController.projectHotspots(camera, viewportW, viewportH, elapsedSec, sceneState)
fieldLoopClock.tick(delta)
  // priority-ordered fanout: 10 scroll-driver → 20 controllers → 30 hotspot projection
  //                        → 40 overlays/landing consumers → 50 progress → 60 warmup
  //                        → 70 chrome → 80 scroll cue
[R3F autorenders scene through its camera]
```

The outer order (`loop → updatePosition → updateVisibility → render`) is preserved inside `BlobController.tick`. The render step is delegated to R3F and runs once per `useFrame` pass after all callbacks resolve. `projectHotspots` is an explicit extra step — Maze projects hotspots inside the blob controller's `loop`; SoleMD hoists it one level so the shared `fieldLoopClock` fan-out can consume the projected frames (see `AmbientFieldLandingPage.tsx:168–196`). This is architectural, not drift: the fan-out is why hotspot DOM / connection overlay / progress / warmup / cue can all advance in the same tick without spinning multiple RAFs. Sanctioned by `frontend-performance.md` § "No per-frame React updates from ambient-field".

## Open questions for build-spec synthesis

1. **When does `D3` graduate from "latent drift" to "must-fix"?** Recommendation: gate the transition on any homepage addition of a non-procedural point source (`pcb`, `logo`, any FBX). Build spec should name the Promise.all / Suspense pattern that R3F surfaces should adopt once async asset classes land.

2. **Is `Os.sceneUnits` worth mirroring proactively (D1)?** Recommendation: defer until `StreamController.updateScale` is exercised on the homepage. The math is cheap; the abstraction risk is higher than the compute win.

3. **Should the `B11` audit mandate a stage-level `animateIn`/`animateOut` for graph-entry handoff?** Recommendation: no — the graph entry is owned by `AmbientFieldGraphWarmupAction` + `router.push('/graph')` and a page-level `framer-motion` transition. The stage does not need a per-view fade at the `Os`-level.

4. **Starfield rehabilitation strategy.** If a future surface wants the starfield effect, the build spec should either (a) route it through `createModelPointGeometry`-equivalent machinery (procedural `stars` geometry is already supportable via `FieldGeometry` + `bakeFieldAttributes`), or (b) add a sibling `StarfieldController` subclass of `FieldController`. Recommendation: (a), with scroll-driven z translation ported to a new chapter event type in `createFieldChapterTimeline`.

5. **Should `FieldScene.tsx` adopt Suspense for point-source loading?** Recommendation: yes, once async sources land. This is the idiomatic R3F pattern and folds D3 into a one-line wrapper.

## Scope discoveries (Phase 1 re-slicing signal)

Bucket scope is correct. `Os`/`xi`/`hg` is one coherent subsystem in Maze and one coherent pair of files in SoleMD (`FieldCanvas.tsx` + `FieldScene.tsx`). No re-slicing needed.

## Format feedback for Phase 3

- The pilot's "Ownership" column recommendation is load-bearing here — over half the "drift" items in B11 are R3F delegations (sanctioned), not real parity gaps. Without the ownership column, a naive read of this audit could suggest `FieldScene.tsx` needs to rewrite renderer construction, which would directly violate `frontend-performance.md` § "Core Rules #1".
- Adding a **"Preload chain parity: yes/no/partial"** header field up top would have caught D3 faster. It is the single most consequential finding in B11.
- The **"RAF loop order"** diff is easier to communicate as side-by-side pseudocode blocks than as prose — kept both above.
