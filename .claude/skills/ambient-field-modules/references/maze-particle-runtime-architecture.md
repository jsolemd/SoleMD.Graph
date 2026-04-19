# Maze Particle Runtime Architecture

This reference captures the particle-system and scene-runtime findings recovered
from the live Maze homepage, its shipped `scripts.min.js`, `styles.css`,
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

## Current SoleMD Translation

As of `2026-04-18`, the canonical SoleMD landing runtime maps this architecture
into the repo as follows:

- fixed stage shell:
  - `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldLandingPage.tsx`
- shared canvas and frame-budget surface:
  - `apps/web/features/ambient-field/renderer/FieldCanvas.tsx`
- source-specific point generation:
  - `apps/web/features/ambient-field/asset/point-source-registry.ts`
- shared responsive contract:
  - `apps/web/features/ambient-field/ambient-field-breakpoints.ts`
- shared shader/material family:
  - `apps/web/features/ambient-field/renderer/field-shaders.ts`
- scene transform and uniform presets:
  - `apps/web/features/ambient-field/scene/visual-presets.ts`
- scroll-derived scene carry and overlap:
  - `apps/web/features/ambient-field/scroll/ambient-field-scroll-state.ts`
- landing process chapter geometry:
  - `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/ambient-field-process-geometry.ts`
- landing process DOM/SVG overlay:
  - `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldProcessStage.tsx`
- shared section navigation adapter with narrow dock fallback:
  - `apps/web/features/wiki/components/use-section-toc-state.ts`
  - `apps/web/features/wiki/components/ViewportTocRail.tsx`

That is the implementation to extend moving forward. Future modules should plug
into these runtime seams instead of reintroducing page-local background
animation code.

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

The current landing implementation now matches the most important Maze-derived
rules:

- one fixed stage
- one shared point shader family
- source-specific point spaces for `blob`, `stream`, and `pcb`
- hybrid process chapter overlays
- shared breakpoint contract across stage and overlay shell
- a single stage-owned frame clock feeding both WebGL and overlay choreography
- manifest-authored carry windows for the shipped landing surface
- separated landing overlay adapter ownership instead of one page-global driver

The main remaining gaps before full architectural parity are:

- preload plus eviction policy for heavier point-source families beyond the
  current memoized registry and prewarm pass
- a surface-agnostic `SceneResolver -> ResolvedFieldScene` chain so wiki and
  module surfaces author the same contract without inheriting landing names
- visibility-aware pause or demotion policy when the tab or surface is hidden
- more overlay adapters beyond the landing process chapter, including future
  hotspot, wiki, and module-specific controllers
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
- do not assume “glowy” parity requires additive blending by default

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

- hotspot rings
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

Mobile-specific findings to preserve:

- stream density is reduced from `15000` to `10000`
- blob/sphere density stays `16384` in this snapshot
- stream orientation is rotated for the non-desktop branch below `1024px`
- overlay density is lower
- chapter UI remains separate from particle stage
- scene readability is preserved by motion simplification, not only by scaling

Do not simply squeeze the desktop layout into a smaller viewport.

## Implementation Rules For SoleMD

When building or reviewing the SoleMD Ambient Field runtime, apply these rules:

1. Use source-specific point pipelines.
   - Blob/sphere scenes from sphere coordinates.
   - Stream scenes from flat-line coordinates with funnel attributes.
   - PCB scenes from bitmap-to-points.
   - Model scenes from mesh vertices-to-points.

2. Use one shared shader/material family across scenes whenever possible.

3. Keep overlays separate from WebGL particles.

4. Preserve depth hierarchy.

5. Drive scroll through a stage controller, not section-remount logic.

6. Keep SoleMD shell components and tokens as the product chrome.

7. Treat this runtime as canonical infrastructure for homepage and modules, not
   as one page-specific animation.

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
