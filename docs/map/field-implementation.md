# Field Implementation

Date: 2026-04-18
Status: canonical parity implementation plan

## Purpose

This document explains how to implement the governed field runtime described in
[`field-runtime.md`](./field-runtime.md).

This is the implementation-layer companion doc:

- `field-runtime.md` defines the product contract
- `field-implementation.md` defines the stack, dependency choices,
  renderer shape, and canonical parity roadmap

## Current Canonical Implementation Snapshot

The current homepage implementation is no longer just a prototype shell. The
canonical repo mapping is now:

- route entry:
  - `apps/web/app/page.tsx`
  - `apps/web/app/field-lab/page.tsx`
  - `apps/web/features/field/routes/FieldLandingRoute.tsx`
- fixed landing surface and stage ownership:
  - `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx`
  - `apps/web/features/field/surfaces/FieldLandingPage/field-landing-content.ts`
- persistent WebGL surface:
  - `apps/web/features/field/renderer/FieldCanvas.tsx`
  - `apps/web/features/field/renderer/FieldScene.tsx`
- stage manager and readiness gate:
  - `apps/web/features/field/stage/FixedStageManager.tsx`
- controller ownership:
  - `apps/web/features/field/controller/FieldController.ts`
  - `apps/web/features/field/controller/BlobController.ts`
  - `apps/web/features/field/controller/StreamController.ts`
  - `apps/web/features/field/controller/ObjectFormationController.ts`
- 3D motion helper constants:
  - `apps/web/lib/motion3d.ts`
- shared point shader grammar:
  - `apps/web/features/field/renderer/field-shaders.ts`
  - `apps/web/features/field/renderer/field-point-texture.ts`
- source-specific point spaces:
  - `apps/web/features/field/asset/point-source-registry.ts`
  - `blob` from sphere points
  - `stream` from line points
  - `objectFormation` from bitmap-like raster points
- scene preset and carry contract:
  - `apps/web/features/field/scene/visual-presets.ts`
  - `apps/web/features/field/scroll/field-scroll-state.ts`
- declarative chapter targets:
  - `apps/web/features/field/scroll/field-chapter-timeline.ts`
  - `apps/web/features/field/scroll/chapters/landing-blob-chapter.ts`
  - `apps/web/features/field/scroll/chapters/landing-stream-chapter.ts`
- DOM-only chapter choreography:
  - `apps/web/features/field/scroll/chapter-adapters/registry.ts`
  - `apps/web/features/field/scroll/chapter-adapters/useChapterAdapter.ts`
  - `apps/web/features/field/scroll/chapter-adapters/*.ts`
- scroll binding entry:
  - `apps/web/features/field/scroll/field-scroll-driver.ts`
- shared responsive and section-nav contract:
  - `apps/web/features/field/field-breakpoints.ts`
  - `apps/web/features/wiki/components/use-section-toc-state.ts`
  - `apps/web/features/wiki/components/ViewportTocRail.tsx`

This is the current landing runtime. Future modules may extend these seams, but
wiki modules do not yet mount this same runtime today.

## Current Particle Parity Rules

The current landing renderer now follows the archived Maze particle contract
closely enough that future module work should treat these rules as canonical:

- keep one shared point-material family across scene slugs
- derive scene identity from source coordinate spaces first:
  - `blob` from sphere points
  - `stream` from a flat x-axis line
  - `objectFormation` from bitmap space with mirrored depth
- keep the active shader path centered on:
  - FBM-driven color pulse
  - radial amplitude deformation
  - ambient drift
  - optional stream conveyor/funnel transforms
  - perspective-scaled point size and alpha
- keep geometry `color` available for parity/instrumentation, but do not rely on
  it for visible color motion; the live look should come from shader noise
- keep the point sprite treatment crisp:
  - `32x32`
  - hard bright core
  - short feather
  - no wide halo wash
- tune mobile clarity at the runtime/preset layer, not in CSS:
  - use `sceneScaleMobile`
  - use `sizeMobile`
  - use `alphaMobile`
  - keep DPR capped

This is the important product rule:

- future surfaces should extend the canonical particle/material/runtime seams
- they should not fork a second background system or post-process haze layer

Recommended naming:

- product term: `Field`
- feature package: `apps/web/features/field/`
- internal exports: `FieldCanvas`, `FieldScene`, `FieldProjectionController`,
  `FieldFallback`
- semantic layer term: `Evidence Layer`

`field-runtime` is acceptable as a descriptive phrase, but it is too generic
for the actual feature directory. `field` is the more honest name for
the base renderer, while `evidence layer` should describe the semantic overlays
and focus behaviors placed on top of it.

## Source Audit

This plan is based on three inputs:

1. direct inspection of `https://mazehq.com/` in Chrome DevTools
2. direct inspection of Maze's shipped assets:
   - `styles.css?v=1.0.47`
   - `libs.min.js?v=1.0.47`
   - `scripts.min.js?v=1.0.47`
3. official primary-source docs for:
   - React Three Fiber
   - Drei
   - Three.js

## What Maze Actually Ships

Maze is not a React or Next frontend. The shipped site behavior is closest to:

- one fixed full-viewport graphics container
- one custom Three.js scene manager
- GSAP `ScrollTrigger` for choreography
- plain DOM sections with `data-gfx` attributes
- sparse DOM hotspots and popups layered above the canvas

Direct inspection findings:

- fixed field container: `.s-gfx` with `position: fixed; inset: 0`
- one canvas mounted inside `.s-gfx`
- scene sections are declared with `data-gfx`
- the homepage currently uses at least:
  - `blob`
  - `stream`
  - `pcb`
- the shipped scene config registry includes:
  - `blob`
  - `blobProduct`
  - `sphere`
  - `pcb`
  - `stream`
  - `hex`
  - `shield`
  - `cubes`
  - `users`
  - `globe`
  - `error`
- shader uniforms visible in the shipped code include:
  - `uTime`
  - `uAlpha`
  - `uScale`
  - `uSpeed`
  - `uDepth`
  - `uAmplitude`
  - `uFrequency`
  - `uSelection`
- overlay surfaces use a recurring material treatment:
  - `background-color: rgba(242,244,245,0.04)`
  - `border-radius: .625rem`
  - `backdrop-filter: blur(.25rem)`
- base background color is `#0F1523`
- popup surfaces use `#1F2638`

Important implementation reading:

- Maze uses raw Three.js under custom abstractions, not React Three Fiber.
- Maze uses DOM overlays for hotspots and popups, not an all-canvas UI.
- Maze's visual effect comes from architecture and restraint, not from a large
  library stack.

## SoleMD First-Iteration Decision

We will recreate Maze's architecture, but we will implement it in our React/Next
stack using:

- `@react-three/fiber`
- `@react-three/drei`
- raw Three.js primitives where control matters
- GSAP `ScrollTrigger`
- regular DOM overlays

This is the right compromise for SoleMD because:

- the repo already ships R3F and drei
- we want React-native surface integration
- we want reusable surface adapters for homepage, wiki, and modules
- we still want full low-level access to shaders, `BufferGeometry`, and points
- we do not want to re-create a parallel non-React rendering island by default

Important clarification:

- Maze's shipped site is not evidence that R3F/drei are required
- we are choosing R3F/drei because they fit our React product architecture
- we are still copying Maze's composition and runtime grammar very closely

## First Principle For v1

The first build should prove SoleMD's identity-preserving ambient substrate
before it tries to prove a large visual preset library.

That means the earliest success criteria are:

- real graph-derived point positions
- stable `corpus_id` mapping through homepage and modules
- reusable scene resolution across homepage, wiki, and expanded module surfaces
- graph bridge packets that preserve release and focus context

The visual preset family still matters, but it should sit on top of this
identity-preserving substrate rather than replacing it.

## Dependency Inventory

Current app dependencies already in the repo:

```text
apps/web/package.json
  three                  ^0.183.2
  @react-three/fiber     ^9.5.0
  @react-three/drei      ^10.7.7
  gsap                   ^3.14.2
  @gsap/react            ^2.1.2
  framer-motion          ^12.23.3
  zustand                ^5.0.11
  zod                    ^4.3.6
```

Current supporting local seams:

- `apps/web/lib/motion3d.ts`
- `apps/web/features/animations/canvas/connectome-loader/ConnectomeLoader.tsx`
- `apps/web/features/graph/components/shell/loading/GraphLoadingExperience.tsx`
- `apps/web/features/animations/registry.tsx`
- `apps/web/features/wiki/components/elements/AnimationEmbed.tsx`
- `apps/web/features/wiki/module-runtime/primitives/ScrollyPin.tsx`
- `apps/web/features/wiki/components/WikiModuleContent.tsx`
- `apps/web/features/wiki/components/WikiPanel.tsx`
- `apps/web/features/wiki/module-runtime/types.ts`
- `apps/web/features/wiki/module-runtime/primitives/SceneSection.tsx`
- `apps/web/features/graph/components/entities/EntityHighlightZone.tsx`

Key local implications from the codebase scan:

- `ConnectomeLoader.tsx` is the strongest existing field-runtime precedent. It
  already uses one draw call via `<points>`, typed arrays, a cached point
  sprite `CanvasTexture`, module-level singleton state for remount continuity,
  and R3F `frameloop` control.
- `GraphLoadingExperience.tsx` is the closest existing Maze-like composition
  seam: canvas background, scrim layer, and DOM overlays above it.
- the project already has a clear R3F loading policy through the animation
  registry and templates: dynamic import with `ssr: false`, client-only scene
  mounting, and `useFrame` + refs instead of `framer-motion-3d`.
- there is no shared shader or material abstraction today. A new
  `field` package should become that authority instead of trying to
  extend a nonexistent shared renderer layer.
- the existing performance-test precedent for field-like animation already
  exists under the connectome loader tests. That should become the pattern for
  runtime budgets in the new field system.

## Why R3F + Drei Instead Of Raw Three Alone

Maze proves the architecture. It does not force us to copy its integration
strategy.

For SoleMD, R3F + drei should be the integration layer because they give us:

- React-native canvas lifecycle
- easier surface-scoped renderer instances
- built-in resize and parent sizing
- clean dynamic import boundaries for SSR
- adaptive performance helpers
- a familiar composition model for future animation work

But we should still keep the field internals close to Three:

- raw `BufferGeometry`
- raw `Points`
- raw custom shader logic
- mutation in `useFrame`
- GSAP driving uniforms and scene progress

The rule is:

- R3F for integration
- Three for the heavy lifting
- Drei for selective helpers
- GSAP for scroll choreography
- DOM for overlays

## Recommended Rendering Stack

### Core stack

```text
Next.js route/surface
    ->
client-only field surface
    ->
R3F Canvas
    ->
Three scene primitives
    ->
custom point shader + sparse helpers
```

### What uses R3F

- canvas lifecycle
- camera and viewport ownership
- render loop ownership
- per-surface mounting and cleanup
- performance controls
- thin React composition

### What uses raw Three

- `BufferGeometry`
- `Points`
- custom attributes
- custom shader material
- camera math
- projection math for overlay anchors

### What uses Drei

Use Drei selectively for helpers that reduce boilerplate without hiding the
performance model.

Good fits for v1:

- `AdaptiveDpr`
- `PerformanceMonitor`
- `Instances` or `Merged` for repeated structured motifs if needed later

Do not use Drei as an excuse to move overlay UI into the canvas by default.

Primary overlay rule:

- use regular DOM overlays above the canvas
- do not make `Html` the primary content system

`Html` may be acceptable for debugging or very sparse scene-attached labels, but
it should not become the main module card system.

For the central runtime shader itself, prefer raw `THREE.ShaderMaterial` first.
Drei helpers may reduce boilerplate, but they should not become the authority
for the long-lived runtime model.

## Official Performance Guidance We Should Follow

From the official R3F and Three.js docs:

- avoid mounting and unmounting expensive scene objects repeatedly
- share geometries and materials where possible
- use instancing when rendering many similar objects
- do not drive fast animation through React state
- mutate refs inside `useFrame`
- consider `frameloop="demand"` when scenes are not continuously animating
- use adaptive DPR and performance regression controls when needed
- prefer `BufferGeometry` and batched draws over many scene graph nodes

The implication for SoleMD:

- the field should be one or a few draw calls, not a scene graph forest
- scene changes should update uniforms and visibility, not remount whole trees
- hotspot and popup UI should remain sparse DOM
- canvas and DOM should be separate layers with explicit contracts

## Current Cleanups Landed

The current implementation now includes these Maze-derived cleanups:

- source-specific point generation instead of one synthetic cloud reused for
  every scene
- a point-source registry with cache reuse and prewarm hooks for the active
  density or mobile variant
- a shared perspective point shader with FBM, radial deformation, ambient
  drift, and stream-only conveyor/funnel math
- thinner, calmer point energy so the field reads as depth rather than white
  additive wash
- manifest-authored scene carry windows for the landing runtime instead of
  hardcoded resolver math
- one stage-owned frame clock:
  - `FieldScene.tsx` is the frame owner
  - overlay controllers receive the same frame timestamp
  - the landing process chapter no longer runs its own second RAF loop
- overlay-controller split between:
  - generic scroll controller
  - landing process-stage overlay adapter
- shared non-desktop breakpoint policy at `1024px` for the stage and landing
  overlay behavior
- a shared section-nav primitive with:
  - offset-aware scroll jumps
  - a thin viewport rail on larger layouts
  - a bottom dock fallback on narrow layouts
- process-path metrics measured once instead of rebuilt in the per-frame hot
  loop

## Remaining Full-Parity Roadmap

To bring the runtime from strong parity to full canonical parity, the next
implementation phases should be:

1. Asset preload and residency discipline.
   - extend the current point-source registry into heavier asset policy
   - preload only the needed stage family and future model-backed scenes
   - cap residency and add eviction when `.glb`-derived point sets land

2. Shared scene resolver across surfaces.
   - promote the landing scroll manifest into a true
     `FieldSectionManifest -> SceneResolver -> ResolvedFieldScene` chain
   - let homepage, wiki, and learn modules author the same contract without
     inheriting landing-specific names

3. Visibility-aware clock policy.
   - keep the stage as the single runtime clock owner
   - add pause or demand-driven demotion when the tab or surface is hidden
   - stop spending continuous frame budget where full motion is not required

4. Overlay adapter expansion.
   - add hotspot, wiki, and module overlay adapters
   - keep them all fed by the same resolved progress and frame contract

5. Future scene adapters.
   - add model-vertex point adapters for the not-yet-used Maze-style scene
     family (`World`, `Shield`, `Users`, and related shapes)

This is the correct order because it strengthens the runtime contract instead
of scattering more page-local behavior into the landing surface.

## Concrete v1 Technical Shape

```text
FieldSurface.tsx
  renders:
    <Canvas>
      <PerformanceMonitor />
      <AdaptiveDpr />
      <FieldScene />
    </Canvas>
    <OverlayLayer />

FieldScene.tsx
  owns:
    <FieldPoints />
    <FieldAccents />
    <FieldBackgroundFx />

OverlayLayer.tsx
  owns:
    paper callouts
    entity hotspots
    cluster labels
    CTA cards
```

### Scene model

Do not let branded visual presets become the semantic scene contract.

Use two layers:

```ts
type FieldSceneIntent = {
  focus?: {
    corpusIds?: number[];
    clusterIds?: string[];
    evidenceKeys?: string[];
    cohortIds?: string[];
  };
  labels?: {
    mode?: "none" | "cluster" | "paper" | "evidence";
    ids?: Array<number | string>;
    maxCount?: number;
  };
  hotspots?: {
    ids: Array<number | string>;
    kind: "paper" | "claim" | "cluster";
  };
  view?: {
    preset?: "home" | "cluster" | "selection" | "detail";
    fit?: "focus" | "bounds";
    padding?: number;
    dimStrength?: number;
  };
};

type FieldVisualPreset =
  | "home-cloud"
  | "stream-lattice"
  | "neuron-web"
  | "cluster-halo"
  | "entity-bloom"
  | "bridge-ready";
```

Section manifests should carry both:

- semantic scene intent
- branded visual preset and motion policy

### Canvas config

Recommended first-pass `Canvas` posture:

- client-only dynamic import
- orthographic camera for v1
- alpha background
- explicit DPR band
- no heavy shadows
- no post-processing in v1
- surface-scoped canvas instance

Initial default:

```tsx
<Canvas
  orthographic
  dpr={[1, 1.75]}
  gl={{
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  }}
/>
```

Notes:

- `antialias: false` is preferred for a points-first field because soft point
  sprites and motion blur the edge aliasing anyway
- orthographic is the correct default for a graph-derived 2D coordinate field,
  because it simplifies bounds fitting, overlay projection, and graph bridge
  continuity
- perspective can be introduced later for specific presets if it earns its cost

### Frame policy

Do not hard-code `frameloop="always"` as the runtime default.

Use a runtime frame policy:

```ts
type FieldFramePolicy =
  | "always"
  | "transitions"
  | "demand"
  | "suspended";
```

Recommended policy by context:

- homepage hero active: `always`
- homepage section settled: `transitions` or `demand`
- visible wiki panel: `transitions` or `demand`
- hidden or offscreen surface: `suspended`
- reduced motion: `demand`
- bridge or crossfade moments: `always`

### Performance helpers

Use Drei's helpers as guardrails, not decoration:

```tsx
<PerformanceMonitor onDecline={...} onIncline={...} />
<AdaptiveDpr />
```

Recommended use:

- lower DPR during regressions
- reduce secondary accent density under load
- disable nonessential secondary motion under load

### Field geometry

The dense field should be implemented as:

- one `BufferGeometry`
- typed arrays for position, color, size, seed, and category attributes
- one `Points` object
- one custom shader material

This is closer to Maze than a forest of meshes, and it matches Three.js best
practice for dense particle-like scenes.

The phase-1 asset itself should already be real-data-derived.

Minimum release-scoped ambient asset shape:

```ts
type AmbientAssetManifest = {
  assetSchemaVersion: 1;
  releaseId: string;
  graphBuildId: string;
  projectionId: string;
  coordinateSpace: "graph-xy-v1";
  pointCount: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  files: {
    points: string;
    labels: string;
  };
};
```

The binary point buffers can start simple:

```ts
type AmbientPointBuffers = {
  corpusIds: Uint32Array;
  positions: Float32Array;
  clusterIds: Uint16Array | Uint32Array;
  importance: Uint8Array;
  labelRank: Uint16Array;
  colorToken: Uint16Array;
  flags: Uint8Array;
};
```

`point_index` should be treated as an asset-local offset, not as the durable
identity. Durable identity remains `corpus_id` plus `releaseId`.

### Hotspots and popups

Maze's pattern is correct and we should copy it directly:

- sparse DOM hotspots
- sparse DOM popup cards
- canvas stays dense and atmospheric
- readable UI stays in DOM

That means:

- project selected field anchors to screen space
- place DOM overlays using projected coordinates
- keep the overlay node count under budget

This should be its own subsystem, not ad hoc math inside each hotspot:

```text
ResolvedFieldScene
    ->
FieldProjectionController
    ->
ProjectedAnchor[]
    ->
OverlayLayer
```

For v1, update overlay positions with CSS transforms rather than React state on
every frame.

## What We Recreate From Maze In v1

The first iteration should deliberately recreate the following Maze qualities.

### 1. Fixed or pinned field layer

The field remains visually continuous while content scrolls over it.

SoleMD version:

- full-page homepage field
- panel-pinned module field
- expanded module field using the same runtime

### 2. Section-declared scene states

Maze uses `data-gfx` on sections.

SoleMD version:

- `FieldSectionManifest`
- section-scene registry
- a resolver that maps section intent to a resolved scene

### 3. Scene preset registry

Maze ships a preset family:

- `blob`
- `stream`
- `pcb`
- `globe`
- and others

SoleMD should also start with a named preset registry.

Suggested v1 preset family:

- `home-cloud`
- `stream-lattice`
- `neuron-web`
- `cluster-halo`
- `entity-bloom`
- `bridge-ready`

These are not literal graph states. They are governed branded field modes.

### 4. Shader-driven motion

Maze drives field movement with shader uniforms like `uTime`, `uDepth`,
`uAmplitude`, and `uFrequency`.

SoleMD should do the same:

- a small uniform vocabulary
- preset-specific values
- GSAP-driven transitions between values

### 5. DOM hotspot grammar

Maze's hotspots are DOM elements with SVG rings and popup cards.

SoleMD should replicate the architecture:

- SVG ring hotspot
- card popup
- semantic click actions
- graph bridge action where useful

### 6. Shared surface material

Maze reuses a consistent translucent material for cards and containers.

SoleMD should recreate the pattern with our tokens:

- one shared overlay material recipe
- consistent radius
- consistent border treatment
- one calm motion language

## What We Change From Maze

We should deliberately diverge in the following ways.

### 1. R3F integration layer

Maze uses raw Three. We will use R3F + Drei to fit our React app.

### 2. Stronger semantic layer

Maze's field is product-atmospheric.

SoleMD's field should be:

- paper-linked
- entity-linked
- module-scene-aware
- graph-bridge-aware

### 3. Stronger validation and budgets

Maze is hand-built product frontend.

SoleMD needs:

- manifest validation
- scene budgets
- accessibility guardrails
- agentic authoring support

### 4. Parallel graph layer

Maze has one field layer.

SoleMD has:

- governed field runtime
- separate live graph workspace
- bridges between them

## CSS And Visual System Starting Recipe

Starting points taken from Maze and translated into SoleMD terms:

```text
Maze background      #0F1523
Maze text            #D6D8D8
Maze popup           #1F2638
Maze glass surface   rgba(242,244,245,0.04)
Maze radius          .625rem
```

SoleMD v1 equivalent:

- keep the dark grounded atmospheric base
- use our graph palette and mode accents instead of their cyan-magenta bias
- preserve the calm translucent card recipe
- preserve the dense-but-controlled point field
- keep typography and motion aligned with SoleMD brand tokens

The first implementation should therefore reproduce:

- fixed field
- translucent cards
- dotted/progress section cues
- hotspot rings
- sparse popups
- muted editorial text over a living dark field

## Best-Optimized v1 Implementation

### Rendering path

```text
R3F Canvas
  ->
single Points draw
  ->
optional secondary accent draw
  ->
DOM overlays
```

Do not start with:

- multiple canvases inside one surface
- postprocessing stack
- lights and shadow-heavy 3D scenes
- many independent meshes
- in-canvas UI

### Scene changes

Preferred path:

- GSAP drives section progress
- section progress updates a small scene state store
- scene controller mutates uniforms and resolved visibility
- React does not rerender on every tick

Do not:

- use React state for every frame of scroll progress
- mount/unmount large geometry trees on each section transition

Recommended store direction:

```ts
type FieldRuntimeStore = {
  getScene(): ResolvedFieldScene;
  getProgress(): number;
  setProgress(progress: number): void;
  setScene(scene: ResolvedFieldScene): void;
  subscribeScene(cb: () => void): () => void;
};
```

### Local reuse strategy

Use the repo's existing precedents deliberately:

- borrow the typed-array and cached-sprite strategy from
  `ConnectomeLoader.tsx`
- borrow the canvas-under-DOM layering strategy from
  `GraphLoadingExperience.tsx`
- borrow the client-only dynamic import policy from the animation registry
- borrow the reduced-motion pinning seam from `ScrollyPin.tsx`
- borrow module mounting from `WikiModuleContent.tsx` and shell accent behavior
  from `ModuleShell.tsx`
- keep `EntityHighlightZone.tsx` in the loop so paper/entity-linked overlays
  remain consistent with the rest of the wiki and graph surfaces

### Geometry strategy

Start with:

- `Points` for dense field
- one custom shader material
- optional thin line or trail layer only if profiling allows

For emphasis, do not try to push large selected-ID arrays through uniforms.

Use this rule:

- scene changes may update CPU-side emphasis buffers
- frame ticks should only update uniforms

For example:

```ts
const emphasis = new Float32Array(pointCount);
geometry.setAttribute("aEmphasis", new THREE.BufferAttribute(emphasis, 1));
```

When a scene changes, resolve semantic focus to point indices, update
`aEmphasis`, and mark the attribute dirty. Scroll progress should then blend
uniforms like `uDimStrength`, `uFocusMix`, `uMotionStrength`, `uPresetMix`, and
`uAlpha`.

Add later only if justified:

- instanced structured motifs
- neuron-like connective strands
- branded icon or brain glyph instancing

### Overlay strategy

Start with:

- external DOM overlay root
- projected anchors from the field runtime
- paper/entity/cluster cards
- CTA cards and section callouts

Avoid:

- one DOM node per point
- a large `Html` tree inside the R3F scene

## Recommended Package Shape

```text
apps/web/features/field/
  asset/
    loadAmbientAsset.ts
    ambientAssetTypes.ts
    validateAmbientAsset.ts
    ambientAssetCache.ts

  renderer/
    FieldCanvas.tsx
    FieldScene.tsx
    FieldPoints.tsx
    FieldAccents.tsx
    createFieldGeometry.ts
    createFieldMaterial.ts
    fieldShaders.ts
    fieldPalette.ts

  camera/
    fitBounds.ts
    fieldCameraTypes.ts
    useFieldCameraController.ts

  projection/
    projectAnchors.ts
    FieldProjectionController.ts
    projectedAnchorTypes.ts

  scene/
    fieldSceneTypes.ts
    resolveFieldScene.ts
    SceneController.ts
    scenePresets.ts
    visualPresets.ts
    transitionPresets.ts

  store/
    createFieldRuntimeStore.ts
    fieldRuntimeStoreTypes.ts

  overlays/
    OverlayLayer.tsx
    FieldHotspot.tsx
    FieldPopup.tsx
    FieldLabel.tsx
    FieldCallout.tsx

  scroll/
    SceneProgressProvider.tsx
    gsapScrollDriver.ts
    panelScrollDriver.ts

  surfaces/
    HomepageFieldSurface.tsx
    WikiInlineFieldSurface.tsx
    ExpandedModuleFieldSurface.tsx

  bridge/
    GraphBridgeController.tsx
    graphBridgeTypes.ts
    createGraphEntryPacket.ts

  fallback/
    FieldFallback.tsx
    ReducedMotionField.tsx

  authoring/
    fieldManifestSchema.ts
    validateFieldManifest.ts
```

## Canonical Parity Sequence

This is the canonical implementation order for taking the current prototype to
high-quality near-clone parity while keeping SoleMD shell aesthetics.

The sequence matters.

If we do shell polish before stage parity, or new presets before source-geometry
parity, the result will look busier without actually feeling like Maze.

### Phase 0. Freeze the prototype and isolate responsibilities

Goal:

- stop treating the current demo surface as the final architecture

Required work:

- freeze the current `visual-presets.ts` API as a renderer concern only
- identify page-local demo logic that must migrate into shared runtime layers
- stop adding new bespoke sections directly into the current landing page
- document the prototype/runtime gap clearly in the package

Exit criteria:

- there is a clear boundary between prototype glue and shared runtime ownership
- no new page-specific animation logic is introduced outside the runtime plan

### Phase 1. Build the canonical stage and asset foundation

Goal:

- reproduce Maze’s fixed-stage architecture under our React stack

Deliver:

- release-scoped ambient asset loader
- asset registry for:
  - procedural sources
  - bitmap-derived point sources
  - model-derived point sources
  - graph-derived point sources
- `FieldCanvas.tsx`
- one persistent stage manager contract
- one `Points`-based renderer path
- one shared shader material contract
- point sprite texture support
- `PerformanceMonitor` and `AdaptiveDpr`
- reduced-motion handling
- WebGL fallback DOM

Exit criteria:

- the runtime can mount one persistent stage without page-local hacks
- stage lifecycle is independent from page copy structure
- point sources are no longer limited to one synthetic universal field

### Phase 2. Build the parity lab

Goal:

- create one internal environment for tuning parity before homepage polish

Deliver:

- one dedicated internal `apps/web/app/field-lab/` route
- scene slug switching
- semantic scene switching
- asset source switching
- overlay anchor inspection
- reduced-motion testing
- low-performance testing
- manual scene scrubbing
- mobile-density toggles

Exit criteria:

- blob, stream, and object-formation scenes can be inspected independently
- point motion and overlay projection can be tuned without touching the homepage

### Phase 3. Rebuild hero/blob parity

Goal:

- match Maze’s hero-stage motion grammar closely

Deliver:

- sphere/blob source geometry
- blob scene controller
- carry-window behavior
- scrubbed amplitude/frequency/selection choreography
- projected fixed-stage hotspot grammar
- hotspot density ramp behavior

Exit criteria:

- the hero feels like one continuous carried field instead of a section-local
  effect
- hotspot layering and fade behavior read as authored, not random

### Phase 4. Rebuild stream/process parity

Goal:

- match the process chapter as a hybrid chapter, not just a new preset

Deliver:

- stream line source geometry
- stream shader mode with funnel/advection behavior
- section-local SVG rail assets
- multiple DOM marker wrappers
- popup sequencing loop
- chapter-specific scene choreography for diagram dominance and restoration
- desktop/mobile rail variants

Exit criteria:

- the process chapter feels like three synchronized layers:
  - fixed-stage WebGL stream field
  - looping DOM/SVG process markers
  - chapter-level scrub choreography

### Phase 5. Rebuild object-formation close behavior and homepage shell composition

Goal:

- finish the homepage chapter set while preserving SoleMD shell language

Deliver:

- bitmap-to-points `objectFormation` source
- cta scene controller
- progress cue system
- thinner homepage ToC treatment using standard product components
- standard prompt bar, watermark, panel surfaces, and theme behavior

Exit criteria:

- homepage uses SoleMD shell components consistently
- homepage motion reads like Maze while the chrome still reads like SoleMD

### Phase 6. Reuse the runtime in one real module

Goal:

- prove the landing page is `Module Zero`, not a one-off

Deliver:

- same manifest model
- same renderer
- same projection layer
- same overlay grammar
- panel-local scroll driver
- one inline module using the same runtime family

Exit criteria:

- the inline module does not fork renderer logic
- module parity work improves the homepage runtime rather than diverging from it

### Phase 7. Add graph bridge and semantic hardening

Goal:

- make the runtime product-real, not just visually close

Deliver:

- entity click-through
- paper click-through
- cluster click-through
- mandatory graph entry packet
- release-scoped identity mapping
- manifest validation for focus IDs and overlay requests

Exit criteria:

- the runtime can hand off into graph mode without losing semantic continuity
- every meaningful hotspot or callout has valid identity backing

### Phase 8. Performance, mobile, and quality hardening

Goal:

- finish the runtime as canonical infrastructure rather than a demo

Deliver:

- frame-policy state machine
- hidden/offscreen suspension
- reduced-motion calm mode
- mobile density policy
- regression checks for DPR, overlay counts, and point counts
- context-loss recovery
- performance test coverage for scroll and scene transitions

Exit criteria:

- desktop and mobile both feel intentional
- the runtime remains smooth under realistic homepage and module usage

### Phase 9. Expand the visual vocabulary only after parity is stable

Goal:

- extend the system without weakening the canonical base

Deliver:

- neuron-web preset
- brain/connective motif experiments
- additional branded secondary accent layers
- future model-derived point sources where justified

Exit criteria:

- new presets reuse the canonical stage, asset, controller, and overlay layers
- visual expansion does not reintroduce one-off scene logic

## Concrete Starting Point

The first iteration should aim to recreate this exact structure:

```text
one field canvas
one points-based shader field
one GSAP scene-progress driver
three to five section manifests
three to eight hotspots
three to six popup cards
one graph CTA
zero Cosmograph dependency inside the module field
```

That is the closest faithful translation of Maze's architecture into SoleMD's
stack.

Every graph bridge action should already be able to produce:

```ts
type GraphEntryPacket = {
  releaseId: string;
  graphBuildId: string;
  projectionId: string;
  sourceSurface: "homepage" | "wiki-inline" | "module-expanded";
  focus: {
    corpusIds?: number[];
    clusterIds?: string[];
    evidenceKeys?: string[];
    cohortIds?: string[];
  };
  camera: {
    centerX: number;
    centerY: number;
    zoom: number;
    bounds?: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  };
  visualContinuity: {
    colorTokenVersion: string;
    sizeRuleVersion: string;
  };
};
```

## References

Maze direct inspection:

- `https://mazehq.com/`
- `https://mazehq.com/public/theme/styles.css?v=1.0.47`
- `https://mazehq.com/public/theme/scripts.min.js?v=1.0.47`
- `https://mazehq.com/public/theme/libs.min.js?v=1.0.47`

Primary docs:

- React Three Fiber Canvas: `https://r3f.docs.pmnd.rs/api/canvas`
- React Three Fiber performance pitfalls: `https://r3f.docs.pmnd.rs/advanced/pitfalls`
- React Three Fiber scaling performance: `https://r3f.docs.pmnd.rs/advanced/scaling-performance`
- Drei `PerformanceMonitor`: `https://drei.docs.pmnd.rs/performances/performance-monitor`
- Drei `AdaptiveDpr`: `https://drei.docs.pmnd.rs/performances/adaptive-dpr`
- Drei `Instances`: `https://drei.docs.pmnd.rs/performances/instances`
- Drei `Merged`: `https://drei.docs.pmnd.rs/performances/merged`
- Drei `shaderMaterial`: `https://drei.docs.pmnd.rs/shaders/shader-material`
- Three.js `BufferGeometry`: `https://threejs.org/docs/pages/BufferGeometry.html`
- Three.js `Points`: `https://threejs.org/docs/pages/Points.html`
- Three.js optimize lots of objects: `https://threejs.org/manual/en/optimize-lots-of-objects.html`
