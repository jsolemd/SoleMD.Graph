# Audit B6 — Base controller + concrete controllers (`Ei` / `yr` / `mm` / `ug` / `_m` + inactive subclasses)

**Auditor**: agent-8 (Phase 3)
**Priority**: P1
**Date**: 2026-04-19
**Maze lines audited**: [35565, 35617] (`Ll` + `Ei`); [43013, 43256] (`yr`); [43257, 43526] (`mm`); [43527, 43528] (`gm`); [43529, 43580] (`xm`); [43581, 43614] (`ym`); [43615, 43632] (`_m`); [43633, 43654] (`bm`); [43655, 43703] (`Sm`); [49326, 49346] (`ug`)
**SoleMD files audited**:
- `apps/web/features/ambient-field/controller/FieldController.ts` (base)
- `apps/web/features/ambient-field/controller/BlobController.ts`
- `apps/web/features/ambient-field/controller/StreamController.ts`
- `apps/web/features/ambient-field/controller/PcbController.ts`

## Summary

Maze ships a three-layer class tree: `Ll` (event emitter, 25 lines) →
`Ei` (abstract DOM-anchored controller, 25 lines) → `yr` (Maze particle base,
~240 lines) → eight concrete controllers (`mm`, `gm`, `xm`, `ym`, `_m`, `bm`,
`Sm`, `ug`). SoleMD compresses this to two layers: a single abstract
`FieldController` that fuses Maze's `Ei` + `yr` responsibilities, plus three
concrete subclasses (`BlobController`, `StreamController`, `PcbController`).
The four non-homepage concrete subclasses (`gm`, `xm`, `ym`, `bm`, `Sm`) are
sanctioned omissions per SKILL.md § "Homepage Section Inventory" (only
`section-welcome`, `section-graph`, `section-cta` declare `data-gfx`).

The lifecycle model has diverged on purpose. SoleMD replaces Maze's
`animateIn/Out` Promise-returning tweens with GSAP `to()` calls into the
uniform bag plus ScrollTrigger-scrubbed timelines built in each subclass's
`bindScroll()`. The base `loop()` is effectively dormant — per-frame work is
routed through a new `tick(FrameContext)` method that FieldScene calls
instead. Rotation, position, and material refresh, which Maze splits into
`updatePosition`/`updateRotation`/`updateMaterial`, are collapsed into
`tick()`. The `Ll` event emitter has no SoleMD equivalent; React composition
and controller disposers cover the same lifecycle need.

The single largest true-drift risk is **`yr.updatePosition`** (Maze
`scripts.pretty.js:43092–43111`), which computes `y`/`height`/`x`/`width`
from `getBoundingClientRect()` on `view` and `endTrigger`, and feeds them
back into `updateVisibility`. SoleMD's `updateVisibility` takes `scrollY`,
`viewportH`, `layerTop`, `layerHeight` as parameters and is never called by
the per-frame `tick` path — it has no active caller in production. That
means the entry/exit factor carry window written into `FieldController`
(`:226–245`) is effectively dead code on `main`. BlobController drives
visibility exclusively through the ScrollTrigger timeline it builds in
`bindScroll()`.

The second significant parity concern is the **mobile branch**:
`yi.desktop` is read at Maze `scripts.pretty.js:43083` (scale factor),
`43103` (position preset), `43123` (`uIsMobile` uniform), `43235`
(`setInitialParameters` position seed), and `49342` (stream scale
constant). SoleMD reads `isMobile` from `FrameContext` inside every
subclass `tick()`, preserves the `sceneScaleMobile ?? sceneScale` gate,
and preserves `StreamController`'s Maze-faithful `168` mobile constant.
Partial parity — the preset/position mobile fork is preserved; the base
controller does not fork `attachMouseParallax` (handled at surface level
per `maze-particle-runtime-architecture.md` § Mobile Contract).

## Parity overview — base layer (`Ei` + `yr` → `FieldController`)

| Behavior | Maze class | Maze line | SoleMD location | Ownership | State |
|---|---|---|---|---|---|
| Event-emitter base (`on`/`off`/`trigger`) | `Ll` | 35565–35590 | not implemented | delegated to React | sanctioned omission |
| DOM `view` anchor + UUID | `Ei` | 35593–35599 | `FieldController.ts:140` (`view`) | absorbed into `yr` merge | parity (no UUID — not needed) |
| Abstract `init()` / `onState()` stubs | `Ei` | 35600–35607 | not implemented | delegated to React | sanctioned omission |
| Constructor: wrapper/mouseWrapper/model build | `yr` | 43027–43030 | `FieldController.ts:157–164` (`attach()`) | React-owned scene graph | drift (inversion of control) |
| `setInitialParameters()` (seed uniforms from `cs`) | `yr` | 43230–43253 | `FieldController.ts:170–201` (`createLayerUniforms`) | parity | parity |
| Idle `loop()` (rotation + uTime) | `yr` | 43047–43049 | `FieldController.ts:210–213` (`loop`) + subclass `tick()` | drift | parity-with-variance |
| `updateVisibility(scrollY, viewportH)` | `yr` | 43057–43067 | `FieldController.ts:226–245` | drift — not called from tick | **Must-fix (dead code)** |
| `updateScale()` | `yr` | 43068–43091 | `FieldController.ts:216–224` (+ subclass override) | parity | parity |
| `updatePosition(scrollY, mouseX)` | `yr` | 43092–43111 | folded into subclass `tick()` | drift | missing as a named hook |
| `updateRotation()` | `yr` | 43112–43116 | folded into subclass `tick()` | drift | missing as a named hook |
| `updateMaterial()` | `yr` | 43117–43124 | folded into subclass `tick()` | drift | missing as a named hook |
| `animateIn()` Promise-returning timeline | `yr` | 43125–43155 | `FieldController.ts:247–268` (`animateIn`) | drift (no Promise return, no rotate sweep) | partial parity |
| `animateOut(side, instant)` Promise-returning | `yr` | 43156–43188 | `FieldController.ts:270–293` | drift (no rotate sweep, no visible-flip on complete) | partial parity |
| `onMouseMove(e, t)` | `yr` | 43189–43197 | `FieldController.ts:296–299` (`attachMouseParallaxTo`) + `mouse-parallax-wrapper.ts` | parity (native listener instead of prop flow) | parity |
| `toScreenPosition(vec3)` | `yr` | 43213–43228 | `FieldController.ts:311–328` | drift (different reduction order) | **Must-fix** |
| `bindScroll()` stub | `yr` | 43229 | `FieldController.ts:301–309` | parity | parity |
| `destroy()` teardown | `yr` | 43198–43212 | `FieldController.ts:336–346` | drift (no scene-graph traversal/dispose) | Should-fix |

## Parity overview — concrete controllers

| Maze class | Maze lines | SoleMD counterpart | State |
|---|---|---|---|
| `mm` (blob) | 43257–43526 | `BlobController.ts` | drift — see drift items |
| `ug` (stream) | 49326–49346 | `StreamController.ts` | parity |
| `_m` (pcb) | 43615–43632 | `PcbController.ts` | parity |
| `gm` (stub cube) | 43527 | not implemented | sanctioned omission |
| `xm` (floor/graph-asset) | 43529–43579 | not implemented | sanctioned omission |
| `ym` (hotspot-popup) | 43581–43613 | not implemented | sanctioned omission |
| `bm` (users/quote) | 43633–43653 | not implemented | sanctioned omission |
| `Sm` (procedural stars/roller) | 43655–43703 | not implemented | sanctioned omission |

(Note: the catalog calls `xm` "graph", `ym` "hotspot-popup", `bm` "user". The
Maze `jx` registry at `:49347–49357` actually binds them as
`floor: xm, graph: ym, quote: bm, roller: Sm, cube: gm`. The registry-slug
mismatch is documented here for the Phase 4 synth agent; it does not
affect parity because none of these anchors exist on the live homepage.)

## Drift items

### D1. `updateVisibility` exists on `FieldController` but has no active caller

- **Maze reference**: `scripts.pretty.js:43057–43067` — called from
  `xi.render()` loop per frame with the current `scrollY` + viewport height.
  Drives `animateIn`/`animateOut` via entry/exit factor carry window.
- **SoleMD location**: `FieldController.ts:226–245` defines the method, but
  the per-frame path in `FieldScene` now drives each subclass's `tick()` only;
  `updateVisibility` is not wired. `BlobController.bindScroll()` builds a
  full ScrollTrigger timeline that makes the base carry-window math
  redundant on the landing surface.
- **Verification (C9)**: Re-read `FieldController.ts:226–245` — confirmed
  the method exists and reads `this.params.entryFactor` / `exitFactor`.
  Confirmed it is not called from `tick()` (inherited default is a no-op)
  nor from any subclass `tick()` (`BlobController.ts:321–409`,
  `StreamController.ts:34–123`, `PcbController.ts:29–113` — none invokes
  `updateVisibility`).
- **Severity**: **Must-fix (dead code)**
- **Proposed fix**: Either (a) delete `updateVisibility` + `entryFactor`
  / `exitFactor` from `FieldController` and document the ScrollTrigger
  timeline as the canonical carry window, **or** (b) retain it as an
  explicit fallback for surfaces that cannot use ScrollTrigger (reduced
  motion, non-browser, future wiki inline modules) and wire it from
  `FieldScene`'s per-frame path. Option (a) is preferred — SoleMD has
  already committed to `bindScroll` as the visibility authority for every
  concrete subclass.

### D2. Lifecycle: `updatePosition` / `updateRotation` / `updateMaterial` are not named hooks

- **Maze reference**: `yr.updatePosition` (`:43092–43111`),
  `yr.updateRotation` (`:43112–43116`), `yr.updateMaterial` (`:43117–43123`)
  are three distinct lifecycle entry points that `xi.render()` can call
  independently. `updatePosition` also writes the wrapper's mouse-parallax
  offset (`t * (s / window.innerWidth - 0.5)`) which is distinct from the
  GSAP-tweened mouse parallax in `onMouseMove`.
- **SoleMD location**: folded into subclass `tick()` — position into
  `BlobController.ts:391–403`, `StreamController.ts:108–118`,
  `PcbController.ts:99–105`; rotation into the same blocks; material into
  each subclass's uniform writes at the top of `tick()`.
- **Verification (C9)**: Grepped `FieldController.ts`/`BlobController.ts`/
  `StreamController.ts`/`PcbController.ts` for `updatePosition`,
  `updateRotation`, `updateMaterial` — zero hits. Inlining is intentional.
- **Severity**: Should-fix (architectural naming, not functional)
- **Proposed fix**: Document in the build spec that SoleMD flattens Maze's
  three `update*` hooks into a single `tick(FrameContext)` seam. If future
  surfaces need to override only one (e.g., a surface that wants the
  default position but a custom rotation), split `tick()` into
  `tickPosition` / `tickRotation` / `tickMaterial` default methods that
  the base `tick()` composes, preserving the override point. Do not
  restore the exact Maze names — `tick()` is a legitimate naming win over
  Maze's three-call-per-frame pattern.

### D3. `toScreenPosition` uses a different reduction order

- **Maze reference**: `scripts.pretty.js:43213–43227`. Sequence:
  `vec.add(model.position) → vec.add(wrapper.position) → vec.multiply(wrapper.scale) → vec.applyEuler(model.rotation) → vec.applyEuler(wrapper.rotation) → vec.applyEuler(mouseWrapper.rotation) → vec.project(camera)`.
- **SoleMD location**: `FieldController.ts:311–328`. Uses
  `model.localToWorld(scratch) → scratch.project(camera)`.
- **Verification (C9)**: Re-read both. They are **not equivalent** — Maze's
  hand-rolled sequence bakes in wrapper scale/rotation + mouseWrapper
  rotation in a specific order; `localToWorld` walks the `scene.matrixWorld`
  which composes in the standard THREE scene-graph order. For the homepage
  blob the scene graph is `wrapper → mouseWrapper → model`, so
  `model.localToWorld` composes `model.matrix * mouseWrapper.matrix *
  wrapper.matrix * sceneRoot.matrix` in world-space order, which does
  match Maze's sequence up to matrix-vs-TRS precision. The remaining
  risk is that Maze also divides by `us` (`widthHalf / us`, `heightHalf / us`,
  where `us = min(devicePixelRatio, 2)`) while SoleMD divides by the raw
  viewport dims. This affects DOM-projected hotspot positions on HiDPI.
- **Severity**: **Must-fix** on HiDPI phones/laptops (`us > 1`).
- **Proposed fix**: Either divide SoleMD's x/y results by `uPixelRatio`
  when projecting for DOM overlays, or snap Maze's behavior by reading
  `renderer.getPixelRatio()` from `FrameContext` and dividing explicitly.
  Verify against the hotspot projection at `BlobController.ts:146–172`
  (`projectBlobHotspotCandidate`) which does not divide by pixel ratio
  today — same bug, but scoped to `BlobController`.

### D4. `animateIn` / `animateOut` do not match Maze's uAlpha/fromTo pattern or rotation sweep

- **Maze reference**: `yr.animateIn` (`:43125–43155`) tweens
  `uAlpha → 1`, `uDepth: params.uDepthOut → params.uDepth` (`fromTo`),
  `uAmplitude: params.uAmplitudeOut → params.uAmplitude` (`fromTo`),
  and **if `params.rotateAnimation`** adds
  `wrapper.rotation.y: 0 → +=PI`. Returns a `Promise` that resolves on
  `onComplete`. Duration 1.4 s, ease `Tn` (CustomEase `"0.5,0,0.1,1"`).
  `animateOut(side, instant)` mirrors it with
  `uAlpha → 0`, `uDepth → uDepthOut`, `uAmplitude → uAmplitudeOut`, an
  optional `wrapper.rotation.y: +=PI * sideSign`, and flips
  `wrapper.visible = false` on complete.
- **SoleMD location**: `FieldController.ts:247–293`. Uses
  `gsap.to()` only (no `fromTo`), skips the `params.rotateAnimation`
  branch entirely, returns `void` (no Promise), and never toggles
  `wrapper.visible`. Duration and ease match (1.4 s in /
  1.0 s out, cubic-bezier `tnEase` approximation).
- **Verification (C9)**: Re-read `FieldController.ts:247–293`. Confirmed
  no `fromTo`, no rotate sweep, no Promise, no `wrapper.visible` flip.
  The `alphaOut` / `depthOut` / `amplitudeOut` preset fields are consumed
  on the `to` target value, so the out-direction is preserved; however,
  the `in` direction does **not** seed from the out values, so the first
  `animateIn` after mount will tween from whatever value the uniform
  currently holds, not from the out baseline. This is visible in
  BlobController's `introCompleted` logic, which is a separate (and
  working) intro path that masks the issue on the homepage.
- **Severity**: Should-fix (base method is correct for subclasses that
  override; partial parity for any future subclass that relies on the
  base)
- **Proposed fix**: Restore `fromTo` so `animateIn` seeds from
  `params.alphaOut`/`depthOut`/`amplitudeOut`. Add an optional
  `params.rotateAnimation` gate and the rotation sweep. Return a
  `Promise<void>` that resolves on the last tween's complete so surface
  adapters can sequence on it. Keep the no-op stub on `FieldController`
  if no subclass ever reads the Promise; but document the contract.

### D5. `destroy()` does not traverse + dispose the scene graph

- **Maze reference**: `yr.destroy` (`:43198–43212`) traverses `model`,
  calls `geometry.dispose()` + `material.dispose()` on every `ui`
  (`THREE.Points` or mesh), removes `wrapper` from its parent, and nulls
  every ref.
- **SoleMD location**: `FieldController.ts:336–346` kills the three
  base-controller GSAP tweens, disposes the mouse parallax listener, and
  disposes the scroll listener. The scene graph is deliberately owned by
  R3F; React unmounts the JSX tree and R3F disposes geometry/material
  through `dispose={null}`-aware reconciliation.
- **Verification (C9)**: Re-read. Confirmed no traverse/dispose call.
- **Severity**: Sanctioned deviation — React owns scene-graph lifecycle.
- **Proposed fix**: None. Document in the build spec that GPU-resource
  disposal is R3F's responsibility (`FieldScene.tsx` + JSX mount/unmount),
  not the controller's. The controller is responsible for killing
  scheduled motion only.

### D6. BlobController absorbs the entire hotspot pool that Maze splits across `mm.addHotspots` / `updateHotspots` / `setRandomHotspotPosition`

- **Maze reference**: `mm.addHotspots` (`:43421–43458`), `removeHotspots`
  (`:43460–43468`), `setRandomHotspotPosition` (`:43470–43499`),
  `updateHotspots` (`:43501–43525`). Pool is **three.js mesh + DOM
  element pair** — invisible `Wh(1,16,16)` sphere attached to
  `wrapper.add(mesh)`, with position driven from a random vertex of
  `model.geometry.position` and then projected through `toScreenPosition`
  for DOM transform.
- **SoleMD location**: hotspot runtime split across
  `BlobController.ts:130–172` (`projectBlobHotspotCandidate`),
  `:174–211` (`selectBlobHotspotCandidate`),
  `:266–275` (`onHotspotAnimationEnd`),
  `:655–870` (`projectHotspots`), with DOM writes in
  `writeHotspotDom` (`:286–313`). Uses a pure-CPU projection (no
  `Wh(1,16,16)` sphere meshes) and maintains a 40-slot runtime array
  (`hotspotRuntime[]`) with per-hotspot phase keys (`card` / `dot` /
  `hidden`) + card-mode grace window for off-screen cases.
- **Verification (C9)**: Re-read all referenced ranges. Confirmed
  SoleMD's behavior is **functionally richer** than Maze (card mode,
  grace window, explicit `has-only-reds` / `has-only-single` stage
  gates, per-slot `cycleDurationMs`). The architecture is different;
  the observable behavior is a superset.
- **Severity**: Sanctioned deviation (richer behavior, same grammar)
- **Proposed fix**: None. Document that SoleMD eliminates the mesh-proxy
  pattern in favor of direct candidate-index projection, citing
  `maze-particle-runtime-architecture.md` § "Stage and Overlay
  Separation" as the governing rule: DOM owns overlay meaning, WebGL
  owns particle density. The mesh-per-hotspot indirection was a Maze
  implementation detail, not a grammar rule.

### D7. BlobController uses `uColorNoise` rainbow cycle that Maze does not have

- **Maze reference**: `mm.bindScroll` does not tween color uniforms.
  Color variance comes from `aMove` + shader noise.
- **SoleMD location**: `BlobController.ts:419–436` (`startColorCycle`)
  tweens `uColorNoise` through `LANDING_RAINBOW_RGB` with `repeat: -1`,
  ease `none`. Reduced-motion path skips it.
- **Verification (C9)**: Re-read. Confirmed.
- **Severity**: Sanctioned divergence (SoleMD aesthetic, not Maze
  parity). Call out explicitly so Phase 4 synth does not flag it as a
  parity miss.
- **Proposed fix**: None. Document as SoleMD-specific color grammar per
  `CLAUDE.md` § "feedback_preserve_reusable_mechanisms" + the
  `LANDING_RAINBOW_RGB` palette ownership in `scene/accent-palette`.

### D8. StreamController drops Maze's `uWave` uniform tween

- **Maze reference**: `ug` (stream) inherits from `yr`; Maze's
  `xm.bindScroll` at `:43571–43577` tweens `uWave: 1 → 0.2` with
  `power3.in`. The catalog attributes the stream rail to `ug`, but the
  `uWave` uniform actually lives on `xm` (floor/graph asset), not
  `ug`. In the live homepage, `ug` is a pure particle stream with **no**
  `uWave` tween; the SoleMD shader family does not declare `uWave`.
- **SoleMD location**: `StreamController.ts:128–164`. Tweens
  `wrapper.position.z: -500 → 0` with `scrub: true` — parity with Maze
  `ug`. No `uWave` tween — parity.
- **Verification (C9)**: Re-read Maze `:49326–49346` (`ug`). Confirmed
  `ug` has no `uWave` reference. The SKILL.md reference to "Maze also
  tweens a uWave uniform that the SoleMD shader doesn't have" in
  `StreamController.ts:127` is technically incorrect — `uWave` is on
  `xm`, not `ug`. **False positive averted** — this is parity, not drift.
- **Severity**: Doc-only (correct the `StreamController.ts:126–127`
  comment to clarify `uWave` belongs to `xm`, not `ug`).

### D9. Idle loop rotation constants diverge from Maze

- **Maze reference**: `yr.loop` (`:43047–43049`) increments
  `wrapper.rotation.y += 0.001` **and** `material.uniforms.uTime.value
  += 0.002` per frame — fixed per-frame deltas, no dt scaling.
- **SoleMD location**: `FieldController.ts:210–213` increments
  `wrapper.rotation.y += rotationVelocity[1] * dtSec` — dt-scaled.
  Subclass `tick()` paths set rotation directly from
  `elapsedSec * rotationVelocity[1] * motionScale` (e.g.
  `BlobController.ts:405`, `StreamController.ts:106`,
  `PcbController.ts:95`), which is the same quantity expressed
  differently.
- **Verification (C9)**: Re-read. At 60 fps, Maze's
  `+= 0.001` per frame equals `0.06 rad/s`. Confirmed in recent commit
  `f296c0c` ("align blob idle rotation to Maze 0.12 → 0.06 rad/sec").
  `uTime` no longer lives in controllers at all — it reads from the
  singleton `field-loop-clock`, multiplied by `getTimeFactor(id)`.
- **Severity**: Parity (numerically equivalent, framerate-independent
  form is a sanctioned improvement)
- **Proposed fix**: None.

### D10. `setInitialParameters` no-op on SoleMD

- **Maze reference**: `yr.setInitialParameters` (`:43230–43253`) sets
  `uAlpha = 0`, `uTime = 0`, then seeds `model.rotation` from
  `cs[slug].rotation`, `wrapper.position.z` from `cs[slug].position.z`,
  and `uDepth`/`uSize`/`uFrequency`/`uAmplitude` from preset.
- **SoleMD location**: `FieldController.createLayerUniforms` at
  `:170–201` writes seed values once on attach. The scene-graph
  `wrapper.position.z` seed is set inside
  `BlobController.ts:391–395` on first tick. There is no
  `setInitialParameters` method.
- **Verification (C9)**: Grepped — no `setInitialParameters` symbol in
  SoleMD. Seeds are distributed across `createLayerUniforms` + subclass
  `tick()` first-frame branches.
- **Severity**: Should-fix (architectural naming, not functional)
- **Proposed fix**: Document the distributed-seed pattern. If a future
  subclass needs to seed more than the current 22 uniforms, consider
  extracting a `seedInitialState()` hook.

## Mobile branching parity

**Verdict**: partial parity.

| Maze fork | Maze line | SoleMD location | State |
|---|---|---|---|
| `scaleFactor` vs `scaleFactorMobile` | 43083 | `FieldController.ts:220` (`sceneScaleMobile ?? sceneScale`) | parity |
| `position` vs `positionMobile` | 43103, 43235 | `visual-presets.ts` per-item (not in controller) | parity |
| `uIsMobile` uniform write | 43123 | `BlobController.ts:363`, `StreamController.ts:79`, `PcbController.ts:74` | parity |
| Mobile particle count (stream 15k → 10k) | 42907 | `point-source-registry.ts` (asset layer, not controller) | parity |
| Stream mobile scale `168` constant | 49342 | `StreamController.ts:16` | parity |
| Mouse parallax skipped on mobile | 43190 (via `params.mousemove`) | surface-level (`attachMouseParallax` not called below 1024px) | parity |
| `us = min(dpr, 2)` affecting `uPixelRatio` + `toScreenPosition` reduction | 43121–43122, 43223–43224 | `uPixelRatio` wired; `toScreenPosition` does not divide by pixel ratio | **Must-fix** (see D3) |

## Sanctioned deviations

1. **`Ll` event emitter replaced by React composition** — SKILL.md §
   "Canonical Layer Ownership" § "3. Scene-controller layer". React owns
   lifecycle + subscription; controllers expose imperative methods, not
   event streams. Count: 1.
2. **`Ei` constructor absorbed into `yr` → `FieldController` merge** —
   SKILL.md § "Controller Hierarchy And R3F Boundary" lines 139–167.
   SoleMD's two-layer tree is the R3F-native equivalent of Maze's
   three-layer tree. Count: 1.
3. **Five concrete controllers omitted** (`gm`, `xm`, `ym`, `bm`, `Sm`)
   — SKILL.md § "Homepage Section Inventory" lines 273–283. Only
   `blob` / `stream` / `pcb` declare `data-gfx` on the homepage. These
   are sanctioned non-requirements for the SoleMD landing surface.
   Count: 5.
4. **`destroy()` does not traverse scene graph** — R3F owns GPU
   resource lifecycle (see D5). Count: 1.
5. **`BlobController` uses direct candidate-index projection instead
   of per-hotspot `Wh(1,16,16)` mesh proxy** — SKILL.md § "Stage and
   Overlay Separation". Count: 1 (supersedes Maze's `addHotspots`
   internals; DOM overlay grammar is parity, mesh-proxy mechanism is
   not). Count: 1.
6. **`BlobController` rainbow color cycle (`startColorCycle`)** —
   SoleMD-specific aesthetic; documented in D7. Count: 1.
7. **`field-loop-clock` singleton drives `uTime` instead of per-frame
   `+= 0.002`** — SKILL.md § "Field-Loop Clock (Singleton)" lines
   187–212. Count: 1.
8. **Catalog slug mismatch vs `jx` registry** (`xm` ↔ graph/floor,
   `ym` ↔ hotspot-popup/graph, `bm` ↔ user/quote) — documented above in
   § "Parity overview — concrete controllers". Not a controller defect;
   a catalog inaccuracy for Phase 4 synth. Count: 0 (sanctioned, but no
   SoleMD-side action).

**Total sanctioned deviations**: 7 structural + 5 omitted concrete
controllers = **12 sanctioned items**.

## Lifecycle hooks in Maze `yr`/`Ei` missing from SoleMD `FieldController`

Verified by re-reading both files:

| Hook | Maze source | SoleMD status |
|---|---|---|
| `on` / `off` / `trigger` (`Ll` event emitter) | 35569–35586 | **missing** — sanctioned (delegated to React) |
| `init()` | 35607 | **missing** — sanctioned (React lifecycle) |
| `onState()` | 35600 | **missing** — sanctioned (not used by `yr` subclasses on homepage) |
| `setInitialParameters()` | 43230 | **missing** — distributed across `createLayerUniforms` + first-tick seeds (D10) |
| `updatePosition(scrollY, mouseX)` | 43092 | **missing as a named hook** — folded into subclass `tick()` (D2) |
| `updateRotation()` | 43112 | **missing as a named hook** — folded into subclass `tick()` (D2) |
| `updateMaterial()` | 43117 | **missing as a named hook** — folded into subclass `tick()` (D2) |
| `getObject()` | 43051 | **missing** — React accesses `wrapper` ref directly |
| `getMaterial()` | 43054 | **missing** — React accesses `material` ref directly |
| `unbindScroll()` | 43416 (on `mm`) | **missing as a named hook** — rolled into `destroy()` + `scrollDisposer` (parity) |

Count: 10 Maze hooks without a named SoleMD equivalent. All 10 are
either sanctioned omissions (7) or renames/folds (3: D2-inlined trio).
No Must-fix here.

## Drift count by severity per concrete controller

| Controller | Must-fix | Should-fix | Nice-to-have / Doc-only | Sanctioned |
|---|---|---|---|---|
| **Base `FieldController` (`Ei` + `yr` merge)** | 2 (D1 updateVisibility dead code, D3 toScreenPosition HiDPI) | 3 (D2 lifecycle naming, D4 animateIn/Out, D10 setInitialParameters) | 0 | 2 (D5 destroy, Ll/Ei absorbed) |
| **`BlobController` (`mm`)** | 1 (shares D3 via hotspot projection) | 0 | 0 | 2 (D6 pool architecture, D7 rainbow cycle) |
| **`StreamController` (`ug`)** | 0 | 0 | 1 (D8 comment accuracy) | 0 |
| **`PcbController` (`_m`)** | 0 | 0 | 0 | 0 |
| **Inactive subclasses (`gm`/`xm`/`ym`/`bm`/`Sm`)** | 0 | 0 | 0 | 5 (all omitted) |

**Totals**: 3 Must-fix (2 on base, 1 shared by Blob via projection path),
3 Should-fix, 1 Doc-only, 12 sanctioned deviations.

## Top regression risk

**D1 (`updateVisibility` dead code) + D3 (`toScreenPosition` HiDPI
divergence) combined.**

D1 means any surface that mounts `FieldController` without calling
`bindScroll()` will have a controller that never fires its
entry/exit animations — the base-class carry window is not reachable
from `tick()`. The landing homepage hides this because
`BlobController.bindScroll()` supplies a full ScrollTrigger timeline.
Any future module surface that wants just the carry-window without a
full chapter timeline (e.g., a wiki-inline scene that only needs to
fade in when visible) will silently stay invisible. This is the
highest-risk drift because the failure is silent — no error, no
warning, just an unlit stage.

D3 compounds D1 on HiDPI devices: if a future surface wires the
base `toScreenPosition` for a DOM overlay, positions will be off by a
factor of `devicePixelRatio` on retina displays and common Android
phones (DPR 2.5–3). The hotspot projection in `BlobController` has
the same bug but is masked because the blob hotspot pool uses
`projectBlobHotspotCandidate` directly, not via the base method.

**Recommended Phase 4 synth action**: specify in the build spec that
(a) every future `FieldController` subclass must either override
`bindScroll()` with a chapter timeline **or** explicitly call
`updateVisibility()` from its `tick()`; (b) `toScreenPosition` must
divide by the active pixel ratio when the output feeds DOM transform
(matching Maze's `us` division at `:43223–43224`). Both are one-line
fixes but must be called out before the first non-landing surface
consumes the base class.
