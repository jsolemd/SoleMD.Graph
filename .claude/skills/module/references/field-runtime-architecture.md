# Field Runtime Architecture

The unified architecture, shader/material contract, and asset pipeline for
SoleMD.Graph's field substrate. This is the runtime any field, orb, particle,
or scroll-driven module sits on.

For raw three.js authoring contracts (render loop, dispose, instancing, color
management, postprocessing) read `/threejs`. For raw WebGPU + WGSL + compute
kernels read `/webgpu`. Module-specific contracts here override generic advice
when they conflict.

## Canonical Shape

Field substrate is a fixed graphics stage with:

- one persistent renderer, scene, camera, and animation loop per surface
- multiple scene controllers keyed by stage-item slug
- source-specific point-cloud construction per scene
- a shared shader/material family layered on top of those point sources
- separate DOM and SVG overlay systems for hotspots, process markers, popups
- scroll-linked scene switching, carry windows, and chapter choreography

Target shape:

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

## Live Code Map

Fixed stage + canvas shell:

- `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx`
- `apps/web/features/field/renderer/FieldCanvas.tsx`
- `apps/web/features/field/stage/FixedStageManager.tsx`

Scene controllers (plain TypeScript wrappers around three.js refs; React still
owns mount/unmount and scene graph declaration):

- `controller/FieldController.ts` — abstract base. Owns `wrapper`,
  `mouseWrapper`, `model`, and `material` refs. Methods: `attach(...)`,
  `loop(dtSec)` (idle wrapper rotation only — `uTime` belongs to the
  field-loop clock singleton), `updateScale(...)`, `updateVisibility(...)`,
  `animateIn()` / `animateOut(side, instant)` (1.4 s / 1 s GSAP tweens with
  `tnEase`), `toScreenPosition(...)`, `destroy()`
- `controller/BlobController.ts` — sphere-source subclass. Holds
  `hotspotState`. Drives rainbow color motion through `LANDING_RAINBOW_RGB`
- `controller/StreamController.ts` — flat-line + funnel subclass.
  `updateScale` overrides to desktop `250 * (innerW/innerH) / (1512/748)`,
  mobile fixed `168`
- `controller/ObjectFormationController.ts` — flat authored-shape subclass

Renderer primitives:

- `renderer/field-shaders.ts` — vertex + fragment shaders with the shipped
  `uColorBase` / `uColorNoise` vec3 pair
- `renderer/FieldScene.tsx` — R3F stage consumer; owns the per-layer
  `wrapper → mouseWrapper → model` hierarchy
- `renderer/field-loop-clock.ts` — singleton `uTime` source
  (`getFieldElapsedMs`, `getFieldElapsedSeconds`)
- `renderer/field-vertex-motion.glsl.ts` — current motion grammar
  (FBM noise + radial deformation + ambient drift + optional stream funnel)
- `renderer/field-particle-state-texture.ts` — float-texture-based particle
  state buffer for stateful per-particle motion
- `renderer/use-adaptive-frameloop.ts` + `renderer/FrameloopInvalidator.tsx`
  — frame policy seam (always / transitions / demand / suspended)
- `renderer/mouse-parallax-wrapper.ts` — `attachMouseParallax(group)` opt-in
- `renderer/burst-controller.ts` — `createBurstController`

Asset + geometry:

- `asset/field-geometry.ts` — `FieldGeometry.sphere/stream/fromTexture/fromVertices`
- `asset/field-attribute-baker.ts` — `bakeFieldAttributes` +
  `SOLEMD_DEFAULT_BUCKETS`
- `asset/image-point-source.ts` — `createImagePointGeometry` (async; URL /
  `HTMLImageElement` / `ImageBitmap` / `ImageLikeData`)
- `asset/model-point-source.ts` — `createModelPointGeometry` (walks
  `Object3D`)
- `asset/point-source-registry.ts` — thin consumer of the above plus the
  homepage `blob/stream/objectFormation` entries

Overlay:

- `overlay/FieldHotspotRing.tsx` + `overlay/field-hotspot-ring.css` — DOM
  hotspot primitive
- `overlay/field-hotspot-lifecycle.ts` — `createHotspotLifecycleController`
  (per-hotspot `animationend` reseed; never a shared timer)

Scroll:

- `scroll/field-chapter-timeline.ts` — declarative chapter events
  (`atProgress` + `duration` + `set/to/from/fromTo`)
- `scroll/chapters/landing-blob-chapter.ts` — landing blob target state
- `scroll/chapters/landing-stream-chapter.ts` — stream overlap state
- `scroll/field-scroll-state.ts` — shared chapter-progress producer + per-
  controller visibility aggregation from the authored manifest
- `scroll/field-scroll-driver.ts` — ScrollTrigger intake layer

Scene/config:

- `scene/visual-presets.ts` — blob/stream/objectFormation presets
- `scene/burst-config.ts` — `SOLEMD_BURST_COLORS` + `PHASE_TO_BUCKET`

## Source Coordinate Spaces

Different stage-item slugs use different source coordinate spaces. This is a
core architectural rule, not an implementation detail.

### Sphere family (`blob`, `blobProduct`, `sphere`, `error`)

- point count `16384`, source shape unit sphere
- random unit-sphere rejection sampling, normalized to radius 1
- visible blob shape comes from shader deformation + ambient drift
- `FieldGeometry.sphere({ count, radius, random })`

### Stream

- desktop `15000` points, mobile `10000`
- flat x-axis line, range `x ∈ [-2, 2]`, `y = 0`, `z = 0`
- conveyor / funnel shape emerges in shader space
- `FieldGeometry.stream({ count, spread, random })`

### Bitmap-to-points (`pcb`, `objectFormation`-class, `logo`)

- image rasterized to canvas, Y flipped before sampling (SoleMD: flip during
  emission, `y = -sy + jitterY`)
- threshold test on selected channel
- two points emitted per accepted pixel per layer
- two extra bounding-box anchors appended before centering
- geometry centered after conversion

Defaults:

- `colorThreshold = 200`
- `textureScale = 1.5`
- `gridRandomness = 0.5`
- `thickness = 10`
- `layers = 1`

`channel` extension: `'r' | 'g' | 'b' | 'a' | 'luma'`. Default `'r'`. Use
`'luma'` (BT.601) for medical imagery, MRI, anatomical drawings, and graph
screenshots where the red channel alone is unreliable.

### Model vertices to points

`createModelPointGeometry(object3D, options?)` walks an `Object3D`-like graph
depth-first, concatenates every `geometry.getAttribute('position').array` it
finds, and forwards the combined buffer to `FieldGeometry.fromVertices`.

Conversion is point-only by design:

- traverse mesh children
- read raw POSITION attributes only
- duplicate vertices according to `countFactor`
- add small position jitter
- center the result

Indices, normals, UVs, materials, skins, morph targets, and node transforms
are intentionally ignored. Empty graphs return an empty geometry (do not
throw).

`countFactor` SoleMD divergence: integer `countFactor` values emit the full
count (5 on `countFactor: 5`). Fractional values still produce a stochastic
trailing loop. If exact count parity with a legacy reference is required,
pass `countFactor - 1`.

## Shared Attribute Family

`bakeFieldAttributes(geometry, options)` writes every motion + funnel +
bucket attribute the shader expects. `geometry.getAttribute('position')`
must already exist — the baker derives the point count from it.

Attributes the shader actually reads:

- `aIndex`, `aMove`, `aSpeed`, `aRandomness`, `aAlpha`, `aSelection`
- stream-specific: `aStreamFreq`, `aFunnelNarrow`, `aFunnelThickness`,
  `aFunnelStartShift`, `aFunnelEndShift`
- `aBucket` (float, bucket index in `SOLEMD_DEFAULT_BUCKETS` order; consumed
  CPU-side today, kept for future shader branching)

Geometry also carries `color`, but the live particle shaders do not read it.
Treat `color` as injected-but-inactive unless the shader family is
intentionally rewritten.

### `SOLEMD_DEFAULT_BUCKETS`

| id | weight | aStreamFreq | aFunnelThickness | aFunnelNarrow | aFunnelStartShift | aFunnelEndShift |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `paper` | 0.10 | +0.10 | 0.10 | 0.03 | +0.42 | +0.29 |
| `entity` | 0.12 | -0.20 | 0.14 | 0.04 | +0.28 | -0.06 |
| `relation` | 0.08 | -1.40 | 0.18 | 0.05 | +0.10 | -0.29 |
| `evidence` | 0.70 | +0.50 | 0.55 | 0.18 | -0.25 | -0.40 |

Weights sum to 1. `pickBucketIndex` is a generic cumulative draw, so custom
bucket sets with non-unit total still normalize correctly.

`buildBucketIndex(buckets)` returns `Record<string, number>` mapping id to
position. `FIELD_BUCKET_INDEX` is the memoized index for default buckets.
Burst overlays read `uBurstType` as the integer id produced here.

## Shared Material Family

All scenes converge on one shared particle material:

```text
geometry source
  ->
bakeFieldAttributes(...)
  ->
field-shaders.ts material factory
  ->
new THREE.Points(...)
```

Material defaults:

- `transparent = true`
- `depthTest = false`
- normal blending by default
- additive blending only behind a debug switch (`?field-blending=additive`
  via `resolveFieldBlending()`)

Do not assume "premium glow" means additive blending by default.

## Uniform Family

Shared:

- `uPixelRatio`, `uIsMobile`, `uScreen`, `uAlpha`, `uTime`, `uScale`, `uSize`,
  `uSpeed`, `pointTexture`, `uDepth`, `uAmplitude`, `uFrequency`, `uStream`,
  `uSelection`
- color pair: `uColorBase: vec3`, `uColorNoise: vec3`. `BlobController`
  drives rainbow motion by tweening `uColorNoise` through
  `LANDING_RAINBOW_RGB`. Stream and pcb keep a static cyan→magenta pair.

Stream-only:

- `uWidth`, `uHeight`, `uFunnelStart`, `uFunnelEnd`, `uFunnelThick`,
  `uFunnelNarrow`, `uFunnelStartShift`, `uFunnelEndShift`, `uFunnelDistortion`

Quirks worth knowing:

- `uScreen` is provisioned but unused by the inline particle shaders
- the live shader does not read geometry `color`; SoleMD still writes it for
  the legacy hotspot color sampler

## Shared Vertex Transform

```text
position
  ->
vNoise = fbm(position * (uFrequency + aStreamFreq * uStream))
  ->
vColor = uColorBase + clamp(vNoise, 0, 1) * 4.0 * (uColorNoise - uColorBase)
  ->
displaced = position
  ->
displaced *= (1.0 + uAmplitude * vNoise)
  ->
displaced += uScale * uDepth * aMove * aSpeed * snoise_1_2(aIndex, uTime * uSpeed)
  ->
if uStream > 0:
  conveyor advance along x
  wrap x into stream width
  funnel thickness + y shift
  z cosine warp
  90-degree rotation when uIsMobile
  ->
modelView / projection
  ->
distance-based point size
  ->
distance-based alpha + selection cut
```

The amplitude multiply is global, not blob-only. Sphere scenes reveal it
most clearly because their source geometry is already spherical.

### Point Size and Alpha

- `gl_PointSize = uSize * 100.0 / vDistance * uPixelRatio`
- `vAlpha = uAlpha * aAlpha * (300.0 / vDistance)`
- points with `aSelection > uSelection` are hidden by zeroing alpha

Perspective importance is core to the look — a premium field is not one flat
layer of equally weighted points.

### Fragment Path

```glsl
gl_FragColor = vec4(vColor, vAlpha);
gl_FragColor *= texture2D(pointTexture, gl_PointCoord);
// SoleMD: discard samples with color.a <= 0.01 to cut fill-rate
```

There is no extra lighting model. The look comes from source coordinates,
noise/deformation, point-sprite texture, distance-scaled size/alpha, and
controller-driven `uColorNoise` motion on the blob layer.

## Stream Branch Constants

Material defaults for `stream`:

- `uStream = 1`
- `uWidth = 2`, `uHeight = 0.4`
- `uFunnelStart = -0.18`, `uFunnelEnd = 0.3`
- `uFunnelThick = 0`, `uFunnelNarrow = 0`
- `uFunnelStartShift = 0`, `uFunnelEndShift = 0`
- `uFunnelDistortion = 1`

Preset-level stream:

- `uDepth = 0.69`, `uAmplitude = 0.05`, `uFrequency = 1.7`, `uSize = 10`

Mobile rotation: 90-degree XY rotation whenever `uIsMobile` is true
(every non-desktop width below `1024px`).

## Field-Loop Clock Singleton

`renderer/field-loop-clock.ts` holds elapsed-ms in module scope:

- one module-level clock; the epoch is set lazily by the first
  `getFieldElapsedMs()` / `getFieldElapsedSeconds()` call
- FieldScene defers that first read (and `fieldLoopClock.tick`) until
  `stageReady` — the canvas mounts at route level before the landing chunk
  loads, and starting the clock in that window would silently consume
  BlobController's 1.4 s sphere-formation intro before the first visible tick
- `getFieldElapsedMs()` / `getFieldElapsedSeconds()` are pure readers after
  the epoch is set
- StrictMode double-invocation does not reset the clock
- the landing warmup remount does not reset the clock
- controllers read, never write, this value

Why it matters:

- `uTime`-driven shader motion stays continuous across dev-mode double mount
- elapsed time starts at ~0 on the first stage-ready frame, so the intro and
  the absolute wrapper rotation play from their authored beginning regardless
  of how long the chunk load took
- hotspot reseed cadence (also routed through lifecycle controller timers)
  cannot drift out of sync with shader noise after a remount
- tests can fake the clock by replacing the module at the import boundary

First-paint gate (companion rule): `FieldStageLayer` hides each layer wrapper
once in its wrapper callback ref; only a controller tick (which owns
`wrapper.visible` from `itemState.visibility` after attach) may reveal a layer.
Frames rendered before `stageReady` therefore paint nothing instead of the raw,
unscaled full-alpha point cloud. Do not use a persistent React
`visible={false}` prop for this gate, because that reasserts visibility
ownership on later re-renders.

Do not introduce a second clock. Do not assign `uTime` from a React ref. Do
not derive elapsed time from `performance.now()` inside controllers.

## tnEase Approximation

Maze-style chapters define their primary ease via GSAP Club's `CustomEase`
(`"0.5, 0, 0.1, 1"`). Club GSAP is not installed in SoleMD.Graph. SoleMD
approximates it with a cubic-bezier in every GSAP call:

```ts
const tnEase = "cubic-bezier(0.5, 0, 0.1, 1)"
```

This is a documented divergence. Do not change it casually — it affects
every controller tween. If strict ease parity later matters (e.g. a long
animateOut scrub curve), either install Club GSAP or swap in a piecewise
cubic that matches the CustomEase control lattice.

## Recommended Asset Architecture

```text
AssetRegistry
  ->
PointSourceAdapter
    - procedural sphere            (FieldGeometry.sphere)
    - procedural stream seed       (FieldGeometry.stream)
    - bitmap to points             (FieldGeometry.fromTexture / createImagePointGeometry)
    - model vertices to points     (FieldGeometry.fromVertices / createModelPointGeometry)
    - release-scoped graph-derived ambient assets (future)
  ->
SharedAttributeInjector (bakeFieldAttributes)
  ->
Cached BufferGeometry / typed arrays
  ->
Shared particle material family
```

Cache keys include scene slug, breakpoint family, release id where relevant,
optional density profile.

## Motion Grammar

The runtime is not constant wiggle. It follows a slug-specific motion
grammar inside one shared system.

- **Blob / sphere**: slow breathing, subtle orbiting drift, elastic
  deformation, soft foreground/background rotation. Dense, atmospheric,
  world-like.
- **Stream**: directional throughput, procedural routing, converging or
  narrowing flow, localized turbulence rather than global wobble. Reads as
  informational, not merely ambient.
- **Bitmap / object-formation**: calmer, more technical substrate;
  structured topology; layered depth rather than flowing cloud behavior.
  Appropriate for CTA, bridge, or evidence chapters.

## Foreground / Midground / Background

Field depth hierarchy is real — faint background dust, readable structural
points, brighter anchor points closer to the camera. That hierarchy comes
from source geometry density, distance-scaled point size, distance-scaled
alpha, point-texture multiplication, and slug-specific drift/deformation.
Do not collapse this into a flat soup of identical particles.

## Stage and Overlay Separation

WebGL stage owns:

- point rendering, scene transforms, shader motion, camera and projection

DOM / SVG overlay layer owns:

- hotspot rings (`FieldHotspotRing` + `afr-hotspot*` CSS)
- popup cards, progress rails
- moving stream markers, chapter-specific explanatory UI

Implications:

- do not fake every popup or process marker as a particle
- do not derive every overlay position from the exact particle coordinate
  space
- DOM and SVG carry explanatory precision; WebGL carries ambient continuity
  and scene identity

## Scroll Choreography

The runtime uses a persistent animation loop plus scroll-driven scene
control:

- fixed stage persists across chapter scroll
- scene controllers remain mounted
- visibility, transforms, and chapter emphasis interpolate
- DOM overlays enter and exit on their own schedules
- carry windows keep one scene alive while the next chapter takes over

For SoleMD that means no remounting heavy geometry on section boundaries,
no abrupt preset swaps on `onEnter`, no React state update on every frame.
Scroll resolves into mutable runtime state and uniforms.

## Implementation Rules

1. Use source-specific point pipelines; do not reuse one synthetic random
   point cloud across slugs.
2. Use one shared shader/material family across scenes whenever possible.
3. Keep overlays separate from WebGL particles. Hotspot work uses
   `FieldHotspotRing` + `createHotspotLifecycleController`, not bespoke DOM
   pools.
4. Preserve depth hierarchy.
5. Drive scroll through a stage controller, not section-remount logic.
6. Keep SoleMD shell components and tokens as the product chrome.
7. Treat this runtime as canonical infrastructure for homepage and modules,
   not a page-specific animation.
8. Route per-frame time through `field-loop-clock`. Route controller tween
   eases through the `tnEase` cubic-bezier constant.
9. Prefer `channel: 'luma'` for medical imagery and diagrams; only fall
   back to raw channel reads when a specific biomarker is encoded in that
   channel.
10. Extend the shared point-source pipeline rather than encoding new source
    logic inside `FieldScene.tsx` or surface-local code.

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
- pass ShaderMaterial uniforms through the R3F `uniforms` prop — R3F ≥ 9.6
  applyProps clones every uniform record ("stable target reference"), which
  silently severs controller `.value` writes from the GPU. Construct the
  material with the shared LayerUniforms bag via `args` (constructor
  adoption) as `FieldStageLayer` does
- drive hotspot reseed from a shared interval timer (reseed is per-hotspot
  on `animationend`)
- assign `uTime` from React state or a ref synced via `setState`
- bypass the shared attribute injector — skipping `aBucket` silently breaks
  the burst overlay on every consumer
- reintroduce retired pulse-era or burst-overlay uniform families
  (`uPulseRate`, `uPulseStrength`, `uBucketAccents[]`, `uBurstType`,
  `uBurstStrength`, `uBurstColor`, `uBurstRegionScale`, `uBurstSoftness`).
  The shipped `uColorBase` / `uColorNoise` pair is the live contract
- introduce voxel/interior `fillWithPoints()` filling unless the surface
  intentionally diverges from canonical parity
