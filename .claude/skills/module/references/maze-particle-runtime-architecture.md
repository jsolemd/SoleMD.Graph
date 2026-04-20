# Maze Particle Runtime Architecture

This reference captures the particle-system and scene-runtime findings recovered
from the live Maze homepage, its shipped `scripts.pretty.js`, `styles.css`,
supporting bitmap assets, and downloaded `.glb` files.

Use this as the canonical motion/runtime reference for SoleMD's Ambient Field.

Important boundary:

- reuse this document for architecture, geometry strategy, motion grammar,
  layering, and performance discipline
- do not copy Maze branding, copywriting, exact class names, or shell chrome
- keep SoleMD shell aesthetics, panels, prompt surfaces, watermark, TOC, and
  theme system

## Canonical Takeaway

Maze is not animating one generic decorative background.

The homepage runtime is a fixed graphics stage with:

- one persistent renderer, scene, camera, and animation loop
- multiple scene controllers keyed by scene slug
- source-specific point-cloud construction per scene
- a shared shader/material family layered on top of those point sources
- separate DOM and SVG overlay systems for hotspots, process markers, and
  popups
- scroll-linked scene switching, carry windows, and chapter choreography

The correct SoleMD target is:

```text
source-specific point coordinate spaces
  ->
shared point shader/material family
  ->
fixed stage scene orchestration
  ->
separate DOM/SVG overlay systems
  ->
SoleMD shell chrome
```

## Current SoleMD Translation (Round 12)

As of Round 12 (2026-04-19), the canonical SoleMD landing runtime maps this
architecture into the repo as follows. The ledger of record is
`docs/map/ambient-field-maze-baseline-ledger-round-12.md`.

Fixed stage + canvas shell:

- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldLandingPage.tsx`
- `apps/web/features/ambient-field/renderer/FieldCanvas.tsx`

Scene controllers (new in Round 12 — controller hierarchy owns the
Three.js-level runtime refs while React still owns lifecycle):

- `apps/web/features/ambient-field/controller/FieldController.ts` — abstract
  base. Owns `wrapper`, `mouseWrapper`, `model`, and `material` refs. Methods:
  - `attach(...)` — wires scene graph refs and initial state
  - `loop(dtSec)` — idle wrapper rotation only (uTime is a separate singleton,
    see Field-Loop Clock below). Rotation deltas match Maze `yr` at
    `scripts.pretty.js:43047-43049` (`0.001` / `0.002` per frame)
  - `updateScale(sceneUnits, sourceHeight, isMobile)`
  - `updateVisibility(scrollY, viewportH, layerTop, layerHeight)` — carry
    window with `entryFactor` / `exitFactor`
  - `animateIn()` / `animateOut(side, instant)` — 1.4s / 1s GSAP tweens using
    `tnEase` (see tnEase Approximation below). Matches Maze
    `scripts.pretty.js:43125-43187`
  - `toScreenPosition(...)` — ports `scripts.pretty.js:43213-43227`
  - `destroy()`
- `apps/web/features/ambient-field/controller/BlobController.ts` — subclass
  that holds the `hotspotState` container. Hotspot projection + pool still
  live in `FieldScene` today; full delegation into the controller is deferred
  to a later `/clean` pass. Source ref: `mm` at
  `scripts.pretty.js:43257-43526`.
- `apps/web/features/ambient-field/controller/StreamController.ts` — overrides
  `updateScale` with Maze's `ug` formula: desktop
  `250 * (innerW/innerH) / (1512/748)`, mobile `168`. Source ref:
  `scripts.pretty.js:49326-49345`.
- `apps/web/features/ambient-field/controller/PcbController.ts` — subclass for
  the horizon-mesh. Source ref: `_m` at `scripts.pretty.js:43615-43630`.

Renderer primitives (new in Round 12):

- `apps/web/features/ambient-field/renderer/mouse-parallax-wrapper.ts` —
  `attachMouseParallax(group, options)` attaches a mousemove listener with a
  GSAP `sine.out` tween: ±3e-4 rad/px on x, ±5e-4 rad/px on y, 1s duration.
  Returns a cleanup function. Matches Maze
  `scripts.pretty.js:43189-43196`.
- `apps/web/features/ambient-field/renderer/field-loop-clock.ts` — **singleton
  elapsed-ms clock** exporting `getAmbientFieldElapsedMs()` and
  `getAmbientFieldElapsedSeconds()`. State lives in module scope so the clock
  survives React StrictMode double-mounts and the landing warmup remount.
  Controllers do not own `uTime`; the singleton is the one writer, keeping
  shader motion continuous across component remounts.

Hotspot overlay primitives (new in Round 12, replaces the pre-R12 inline
FieldScene DOM-pool logic):

- `apps/web/features/ambient-field/overlay/AmbientFieldHotspotRing.tsx` —
  React component matching Maze's DOM hotspot. Props: `variant`
  (`'cyan' | 'red'`), `phase`
  (`'idle' | 'animating' | 'only-reds' | 'only-single' | 'hidden'`),
  `delayMs`, `durationMs`, `easing`, `seedKey` (bumping triggers a CSS-reflow
  reseed), `cardOffset`, `projection`, `onAnimationEnd`.
- `apps/web/features/ambient-field/overlay/ambient-field-hotspot-ring.css` —
  ports Maze's hotspot keyframes verbatim under an `afr-` prefix. Extracted
  source in `docs/map/ambient-field-maze-baseline-ledger-round-12.md` §13;
  Maze DOM shape at `index.html:87-149`.
- `apps/web/features/ambient-field/overlay/ambient-field-hotspot-lifecycle.ts`
  — `createHotspotLifecycleController({ count, samplePosition,
  sampleDelayMs, durationMs, maxRetries })`. Per-hotspot `animationend`
  triggers `reseed(index)` for **that hotspot only**, not a shared interval.
  The shared-timer design was the Round 11 regression and is now banned.
  `reseed(index)` bumps `seedKey` so the React component restarts its CSS
  animation. Source ref: Maze pool + `animationend` at
  `scripts.pretty.js:43421-43457`; rejection rules at
  `:43470-43499`; projection at `:43501-43524`.

Source-specific point generation, shared contracts, and scroll plumbing:

- `apps/web/features/ambient-field/asset/point-source-registry.ts`
- `apps/web/features/ambient-field/ambient-field-breakpoints.ts`
- `apps/web/features/ambient-field/renderer/field-shaders.ts`
- `apps/web/features/ambient-field/scene/visual-presets.ts`
- `apps/web/features/ambient-field/scroll/ambient-field-scroll-state.ts`
- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/ambient-field-process-geometry.ts`
- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldProcessStage.tsx`
- `apps/web/features/wiki/components/use-section-toc-state.ts`
- `apps/web/features/wiki/components/ViewportTocRail.tsx`

That is the implementation to extend moving forward. Future modules plug into
these runtime seams — the controller hierarchy, the field-loop clock, the
hotspot ring primitive, and the lifecycle controller — instead of reintroducing
page-local background animation code.

## Controller Hierarchy And R3F Boundary

Round 12 introduced a plain-TypeScript controller hierarchy that wraps
Three.js-level refs. React still owns mount/unmount, scene graph declaration,
and prop flow; controllers own imperative per-frame math that the legacy Maze
runtime expressed as class instances.

Division of responsibility:

- React / R3F owns:
  - component tree and remount lifecycle
  - scene graph declaration (groups, meshes, points)
  - hotspot component instances (`AmbientFieldHotspotRing`)
  - lifecycle controller ownership (`createHotspotLifecycleController`)
- Controllers own:
  - wrapper rotation (idle loop)
  - visibility carry windows and entry/exit factors
  - `updateScale` math
  - GSAP `animateIn` / `animateOut` tweens
  - `toScreenPosition` projection
- Field-loop clock owns:
  - `uTime` accumulation (not controllers, not React state)

A controller is attached via `attach(...)` once React has wired up the refs.
React never calls controller math from render; the per-frame loop
(`useFrame` equivalent) is the only driver. State that must survive StrictMode
double-mount (elapsed time, hotspot seeds) stays outside React state.

## tnEase Approximation

Maze defines the primary field-animation ease via GSAP Club's `CustomEase`:

```js
CustomEase.create("tnEase", "0.5, 0, 0.1, 1")
```

The Club GSAP `CustomEase` plugin is not installed in SoleMD.Graph. Round 12
approximates it with a standard cubic-bezier in every GSAP call that needs it:

```ts
const tnEase = "cubic-bezier(0.5, 0, 0.1, 1)"
```

This is a documented divergence. If strict ease parity later matters (e.g. a
matched scrub curve on a long animateOut), either install Club GSAP or swap in
a piecewise cubic that matches the CustomEase control lattice. Do not change
the bezier casually — it affects every controller tween.

## Field-Loop Clock (Singleton)

Legacy Maze derives particle time from a single `requestAnimationFrame` loop
that also owns the renderer. SoleMD's R3F runtime has many potential `useFrame`
callsites and a warmup remount pattern that can reset per-component state at
awkward moments.

`renderer/field-loop-clock.ts` solves this by holding elapsed-ms in module
scope:

- one module-level clock, started on first import
- `getAmbientFieldElapsedMs()` / `getAmbientFieldElapsedSeconds()` are pure
  readers
- StrictMode double-invocation does not reset the clock
- the landing warmup remount does not reset the clock
- controllers read, never write, this value

Why it matters:

- `uTime`-driven shader motion stays continuous across dev-mode double mount
- hotspot reseed cadence (which also runs through lifecycle controller timers)
  cannot drift out of sync with shader noise after a remount
- tests can fake the clock by replacing the module at the import boundary

Do not introduce a second clock. Do not assign `uTime` from a React ref.
Do not derive elapsed time from `performance.now()` inside controllers.

## Source Coordinate Spaces

Maze uses different source coordinate spaces depending on scene slug. That is a
core architectural rule, not an implementation detail.

### Blob and Sphere Family

Blob and related sphere scenes begin as a dense sphere point cloud:

- point count: `16384`
- source shape: unit sphere
- generation utility in shipped runtime: equivalent to `getSphere(16384, 1)`
- source coordinates are not pre-authored semantic graph coordinates
- the visible blob shape comes from shader deformation plus ambient drift, not
  from hand-authored spline animation

Operationally:

- begin with sphere coordinates
- feed them into the shared shader transform
- let FBM, radial deformation, swirl, and drift create the living blob

### Stream

The stream scene begins from a flat line of points, not from a graph cloud:

- desktop point count: `15000`
- mobile point count: `10000`
- base coordinates lie on the x-axis
- source range: `x in [-2, 2]`
- base `y = 0`
- base `z = 0`

The shader then turns that flat seed line into the visible stream by:

- pushing points forward along `x`
- wrapping them back into stream width after they move out of range
- narrowing them through a funnel shape over travel progress
- offsetting `y` and `z` using per-point randomness and funnel parameters
- rotating the whole stream for the non-desktop branch below `1024px`

The important point is that stream motion is produced from a conveyor/funnel
transform over a simple source distribution, not from manually animating
thousands of explicit path points in JavaScript.

### PCB

The PCB scene starts from bitmap space:

- source image: `pcb.png`
- lit or selected bitmap pixels are converted to point positions
- depth is mirrored into positive and negative layers so the bitmap gains
  volumetric presence

This means PCB is not another graph-like procedural cloud. It is a raster-to-
points adapter.

### Model-Backed Scenes

Model-backed scenes use mesh vertex positions as point seeds:

- `World.glb`
- `Shield.glb`
- `Cubes.glb`
- `Net.glb`
- `Users.glb`

Maze does not render those homepage assets as shaded meshes in the live runtime.
Instead it:

- loads the `.glb`
- samples or extracts mesh vertex positions
- converts the model into a point cloud
- adds jitter/randomness
- runs the same point shader/material family over the result

This is a major architectural rule:

- scene source geometry may differ
- rendering grammar stays unified as points

## Shared Attribute Family

Across scene types, Maze's point system uses one shared per-point attribute
family.

The essential attributes are:

- `aIndex`
- `aMove`
- `aSpeed`
- `aRandomness`
- `aAlpha`
- `aSelection`

Geometry also gets a `color` attribute, but the live particle shaders do not
read it. Treat `color` as injected-but-inactive for parity work unless the
shader family is deliberately changed.

Stream adds funnel-specific attributes:

- per-point stream frequency
- funnel narrowing
- funnel thickness
- funnel start shift
- funnel end shift

This means scene uniqueness comes from:

- the source coordinate space
- scene uniform values
- optional scene-specific extra attributes

It does not come from inventing a completely new material for every scene.

## Shared Vertex Transform

The particle motion grammar resolves cleanly into one shared transform pipeline:

```text
base coordinates
  ->
FBM / noise field
  ->
global amplitude deformation
  ->
ambient drift
  ->
optional stream conveyor + funnel transform
  ->
camera projection
  ->
perspective-scaled point size and alpha
```

### 1. Base Coordinates

Each scene starts with its own base coordinates:

- sphere coordinates
- flat line coordinates
- bitmap coordinates
- mesh vertex coordinates

### 2. FBM / Noise

Maze uses fractal/simplex-style noise in the vertex shader to create living
surface motion.

This noise is used to:

- break up uniformity
- generate local undulation
- vary color/noise contribution
- avoid obvious rigid rotation

### 3. Global Amplitude Deformation

The `uAmplitude * vNoise` multiply runs before the stream branch, so it is part
of the shared shader path, not a blob-only special case.

Blob-like scenes benefit from this most visibly because their source geometry is
already spherical, but the operation itself is global.

### 4. Ambient Drift

All scenes get a subtler ambient drift layer. This creates the premium feeling
that the field is always alive, even when scroll-linked transitions are not
actively changing chapters.

### 5. Optional Stream Conveyor / Funnel Transform

Only stream-like scenes apply the conveyor/funnel transform:

- advance along `x`
- wrap inside width
- compute normalized travel factor
- interpolate thickness from wide to narrow
- shift into funnel shape
- distort `y` and `z`
- rotate on mobile

### 6. Perspective Projection

Point importance is partly perspective, not just palette.

Maze makes nearer points feel more important because:

- `gl_PointSize` scales by distance
- alpha also scales by distance

That creates a strong foreground/midground/background read.

This is essential. A premium field is not one flat layer of equally weighted
points.

## Remaining Canonical Gaps

Round 12 closed the biggest controller and hotspot gaps. The current landing
runtime now matches:

- one fixed stage with a singleton elapsed-ms clock
- one shared point shader family
- source-specific point spaces for `blob`, `stream`, and `pcb`
- hybrid process chapter overlays
- shared breakpoint contract across stage and overlay shell
- manifest-authored carry windows
- a typed controller hierarchy (`FieldController` / `BlobController` /
  `StreamController` / `PcbController`) mirroring Maze's `yr` / `mm` /
  `ug` / `_m`
- a reusable hotspot ring primitive (`AmbientFieldHotspotRing`) plus a
  per-hotspot-reseed lifecycle controller
- an attachable mouse parallax wrapper that matches Maze's tween envelope

The main remaining gaps before full architectural parity are:

- preload plus eviction policy for heavier point-source families beyond the
  current memoized registry and prewarm pass
- a surface-agnostic `SceneResolver -> ResolvedFieldScene` chain so wiki and
  module surfaces author the same contract without inheriting landing names
- visibility-aware pause or demotion policy when the tab or surface is hidden
- full delegation of hotspot projection from `FieldScene` into
  `BlobController.hotspotState` (deferred to a later `/clean` pass)
- model-backed point adapters for future `World`/`Shield`/`Users`-class scenes

Those are foundation tasks, not visual polish. They should be treated as the
next architecture milestones for the ambient runtime.

## Motion Grammar

The runtime is not "constant wiggle." It follows a scene-specific motion grammar
inside one shared system.

### Blob Motion

Blob motion reads as:

- slow breathing
- subtle orbiting drift
- elastic deformation
- soft foreground/background rotation

The blob is dense, atmospheric, and world-like.

### Stream Motion

Stream motion reads as:

- directional throughput
- procedural routing
- converging or narrowing flow
- localized turbulence rather than global wobble

This is the chapter where motion starts to feel informational, not merely
ambient.

### PCB Motion

PCB motion reads as:

- calmer, more technical substrate
- structured topology
- layered depth rather than flowing cloud behavior

This is appropriate for CTA or bridge chapters.

## Foreground, Midground, Background

Maze's field feels important because depth hierarchy is real.

The field effectively contains:

- faint background dust
- readable structural points
- brighter anchor points closer to the camera

That hierarchy comes from:

- source geometry density
- distance-scaled point size
- distance-scaled alpha
- point-texture multiplication in the fragment shader
- scene-specific drift and deformation

Do not collapse this into a flat soup of identical particles.

Important material quirk:

- the live material defaults to normal blending
- additive blending only appears behind a query-string debug switch
- do not assume "glowy" parity requires additive blending by default

## Stage and Overlay Separation

The moving DOM stream markers and homepage hotspots are not the same system as
the WebGL particles.

Treat these as separate layers:

### WebGL Stage

Owns:

- point rendering
- scene transforms
- shader motion
- camera and projection

### DOM / SVG Overlay Layer

Owns:

- hotspot rings (SoleMD: `AmbientFieldHotspotRing` + `afr-hotspot*` CSS)
- popup cards
- progress rails
- moving stream markers
- chapter-specific explanatory UI

Important implication:

- do not try to fake every popup or process marker as a particle
- do not try to derive every overlay position from the exact same coordinate
  space as the particle field
- allow DOM and SVG to carry explanatory precision while WebGL carries ambient
  continuity and scene identity

## Scroll Choreography Contract

The live Maze runtime uses a persistent animation loop plus scroll-driven scene
control.

The key interaction model is:

- fixed stage persists across chapter scroll
- scene controllers remain mounted
- visibility, transforms, and chapter emphasis interpolate
- DOM overlays enter and exit on their own schedules
- carry windows keep one scene alive while the next chapter takes over

The result is a cinematic continuous scroll, not bursty chapter remounts.

For SoleMD that means:

- no remounting heavy geometry on every section boundary
- no abrupt preset swaps on `onEnter`
- no React state update on every frame
- scroll should resolve into mutable runtime state and uniforms

## Shader And Material Quirks

These details are easy to miss but matter for rebuild-grade parity:

- `uScreen` is provisioned on the material but unused by the live particle
  shaders
- the fragment shader is only `vec4(vColor, vAlpha) * pointTexture`
- the blue color channel mixes with `uBnoise - uGcolor`, not
  `uBnoise - uBcolor`
- `gl_PointSize` calls `clamp(...)`, but the return value is discarded

Preserve these only when strict parity matters. If SoleMD intentionally fixes
them, do it as a documented divergence rather than by accident.

## Mobile Contract

Maze remains legible on mobile because the runtime is adapted, not merely
shrunk.

Maze-side findings to preserve:

- stream density is reduced from `15000` to `10000`
- blob/sphere density stays `16384` in this snapshot
- stream orientation is rotated for the non-desktop branch below `1024px`
- overlay density is lower
- chapter UI remains separate from particle stage
- scene readability is preserved by motion simplification, not only by scaling

Round 12 adds a matching set of SoleMD runtime rules (expanded in
`maze-mobile-performance-contract.md`):

- DPR is capped at 2 and passed to the shader as
  `uPixelRatio = min(devicePixelRatio, 2)` so `gl_PointSize` and `vAlpha`
  do not blow up on HiDPI phones
- `attachMouseParallax` is not wired on mobile — pointer parallax is a
  desktop-only affordance and the `mouseWrapper` group stays at identity
  rotation below `1024px`
- `useFrame` must not call `setState` or otherwise schedule a React render
  per frame. Controllers mutate Three.js refs and material uniforms
  directly; React state changes are reserved for discrete phase/chapter
  transitions and hotspot reseed events
- `StreamController.updateScale` uses Maze's mobile-only constant `168`
  rather than the aspect-driven desktop formula

Do not simply squeeze the desktop layout into a smaller viewport.

## Implementation Rules For SoleMD

When building or reviewing the SoleMD Ambient Field runtime, apply these rules:

1. Use source-specific point pipelines.
   - Blob/sphere scenes from sphere coordinates.
   - Stream scenes from flat-line coordinates with funnel attributes.
   - PCB scenes from bitmap-to-points.
   - Model scenes from mesh vertices-to-points.

2. Use one shared shader/material family across scenes whenever possible.

3. Keep overlays separate from WebGL particles. Hotspot overlay work uses
   `AmbientFieldHotspotRing` + `createHotspotLifecycleController`, not
   bespoke DOM pools.

4. Preserve depth hierarchy.

5. Drive scroll through a stage controller, not section-remount logic.

6. Keep SoleMD shell components and tokens as the product chrome.

7. Treat this runtime as canonical infrastructure for homepage and modules, not
   as one page-specific animation.

8. Route per-frame time through `field-loop-clock`. Route controller tween
   eases through the `tnEase` cubic-bezier constant.

## Anti-Patterns

Do not approve implementations that:

- reuse one synthetic random point cloud for every scene slug
- treat stream as a recolored blob
- render model scenes as meshes when the runtime should stay point-based
- rebuild the prompt bar, TOC, watermark, or panels locally
- update React state every animation frame
- remount geometry on chapter boundaries
- conflate DOM markers/popups with particle coordinates
- flatten all points into one visual depth plane
- introduce a second elapsed-time clock instead of reading
  `field-loop-clock`
- drive hotspot reseed from a shared interval timer — reseed is per-hotspot
  on `animationend` (Round 11 regression)
- assign `uTime` from React state or a ref synced via `setState`

## Translation To SoleMD

The SoleMD near-clone target should be:

- Maze-grade point-source architecture
- Maze-grade stage persistence
- Maze-grade chapter carry and smoothness
- Maze-grade hybrid overlay layering
- SoleMD shell components
- SoleMD brand colors and theme tokens

That is the canonical basis for:

- landing page
- module zero
- inline learning modules
- expanded module surfaces
- future graph bridges

## Source Citations

All line references are to the prettified Maze bundle unless noted.

- Stage runtime `Os` / `xi`: `scripts.pretty.js:49427-49587`
- Base controller `yr`: `scripts.pretty.js:43013-43254`
  - idle loop deltas (0.001 / 0.002): `:43047-43049`
  - `animateIn` / `animateOut`: `:43125-43187`
  - mouse parallax: `:43189-43196`
  - `toScreenPosition`: `:43213-43227`
- Blob controller `mm`: `scripts.pretty.js:43257-43526`
  - hotspot pool + `animationend`: `:43421-43457`
  - hotspot rejection rules: `:43470-43499`
  - hotspot projection: `:43501-43524`
- Stream controller `ug`: `scripts.pretty.js:49326-49345`
- PCB controller `_m`: `scripts.pretty.js:43615-43630`
- Hotspot DOM: `index.html:87-149`
- Hotspot CSS: `docs/map/ambient-field-maze-baseline-ledger-round-12.md` §13
- Canonical Round 12 ledger:
  `docs/map/ambient-field-maze-baseline-ledger-round-12.md` — Source Ground
  Truth, Foundation Primitives, and Phase Log.
