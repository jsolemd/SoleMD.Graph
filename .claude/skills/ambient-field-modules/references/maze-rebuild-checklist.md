# Maze Rebuild Checklist

Use this checklist before approving a landing page or module that claims
Maze-grade parity. Round 12 (`docs/map/ambient-field-maze-baseline-ledger-round-12.md`)
landed the foundation primitives this list points at — items annotated
**DONE** are satisfied by the primitive named in the same bullet. Items
marked **OPEN** still need the call site or coverage described.

## Source Geometry

- DONE — Each scene uses the correct source family.
  - Sphere/blob: `FieldGeometry.sphere(...)` (rejection-sampled unit-sphere
    surface, 16384-point default) — `asset/field-geometry.ts`.
  - Stream: `FieldGeometry.stream(...)` (flat `x∈[−2,2], y=z=0` seed at
    15000/10000 desktop/mobile) — same file.
  - PCB / bitmap: `FieldGeometry.fromTexture(...)` plus the async wrapper
    `createImagePointGeometry(src, options?)` — `asset/image-point-source.ts`.
  - Model: `FieldGeometry.fromVertices(...)` plus `createModelPointGeometry(model, options?)`
    that walks an Object3D-like graph — `asset/model-point-source.ts`.
- DONE — Live renderer consumes the shared pipeline. `point-source-registry.ts`
  is now a thin consumer of `FieldGeometry` + `bakeFieldAttributes`; no
  module instantiates a synthetic fallback field.
- DONE — Point counts and breakpoint budgets are explicit.
  `DEFAULT_SPHERE_COUNT = 16384`, `DEFAULT_STREAM_COUNT = 15000` and the
  mobile branch live as named constants in `asset/field-geometry.ts`.

## Shader And Material

- DONE — One shared particle material family across slugs. Vertex/fragment
  source exported as `FIELD_VERTEX_SHADER` / `FIELD_FRAGMENT_SHADER`
  (`renderer/field-shaders.ts`); per-slug variation is uniform-only via
  `visualPresets.blob | stream | pcb` (`scene/visual-presets.ts`).
- DONE — `aIndex`, `aMove`, `aSpeed`, `aRandomness`, `aAlpha`, `aSelection`,
  `aStreamFreq`, `aFunnelNarrow`, `aFunnelThickness`, `aFunnelStartShift`,
  `aFunnelEndShift` (and SoleMD's added `aBucket`) are all baked by
  `bakeFieldAttributes` (`asset/field-attribute-baker.ts`) and bound on
  every stage layer in `FieldScene.tsx`.
- DONE — Transform order matches the contract: per-point zip via
  `snoise_1_2(aIndex, uTime * uSpeed)` after global breathing
  `displaced *= 1 + (uAmplitude * vNoise)`, then stream funnel block,
  then `modelViewMatrix` projection.
- DONE — Point size and alpha are distance-weighted: `gl_PointSize =
  uSize * (100 / vDistance) * uPixelRatio` and `vAlpha = uAlpha *
  aAlpha * (300 / vDistance)`.
- DONE — Sprite texture stays in the fragment path:
  `gl_FragColor = vec4(vColor, vAlpha) * texture2D(pointTexture, gl_PointCoord)`.
  Sprite asset path resolved in `FieldScene.tsx`.

## Stage And Controllers

- DONE — One persistent stage owner per surface. `FieldScene` mounts a
  single `<Canvas>` with a single `PerspectiveCamera`; per-anchor layers
  attach refs into `FieldController` subclasses rather than spinning up
  per-section canvases.
- DONE — Scene ownership is controller-per-anchor. `FieldController`
  (base) + `BlobController` / `StreamController` / `PcbController` each
  bind to one `[data-gfx]` anchor and own that layer's wrapper /
  mouseWrapper / model / material attachment.
- DONE — Carry windows + overlap supported. `FieldController.updateVisibility(...)`
  reads `entryFactor` / `exitFactor` from the preset (defaults 0.5/0.5;
  stream tightens to 0.7/0.3) and triggers `animateIn` / `animateOut`
  on transitions.
- DONE — Sticky chapter behavior is controller math, not a second pinned
  canvas. Scroll progress feeds `createFieldChapterTimeline(...)` whose
  events scrub `wrapperScale`, `modelYShift`, etc. through
  `UniformScrubber` (1 s half-life). The wrapper / model transforms are
  applied each frame on the same scene.

## Overlays

- DONE — Readable popups, labels, and progress UI live in the DOM, not
  the canvas. `AmbientFieldHotspotRing` is a React component
  (`overlay/AmbientFieldHotspotRing.tsx`); progress + chapter copy use
  Mantine/Tailwind primitives at the page level.
- DONE — Overlay projection is centralized via
  `FieldController.toScreenPosition(target, camera, vw, vh)`; consumers
  feed the resulting `{ x, y, z }` straight into
  `AmbientFieldHotspotRing.projection`.
- OPEN (per-module) — Stream chapter still needs a per-module DOM/SVG
  marker system when a non-landing surface adopts `StreamController`;
  the primitive layer is ready (controller + overlay), the marker DOM
  is module-owned and is not in the shared barrel.
- DONE — Pool size and visible density are separate. `BlobHotspotState`
  carries `{ opacity, maxNumber, onlyReds, interval }` independently;
  `createHotspotLifecycleController({ count, ... })` owns pool size,
  while the chapter's `hotspotMaxNumber` controls visible count.

## Mobile And Performance

- DONE — Mobile is breakpoint-driven, not assumed.
  `AmbientFieldVisualPresetConfig.sceneScaleMobile` /
  `AmbientFieldShaderPreset.sizeMobile` / `alphaMobile` capture the
  mobile-specific values; `FieldController.updateScale(..., isMobile)`
  routes the right value.
- OPEN — Phone-only overlay tweaks vs. broader non-desktop particle
  behavior: no separate phone-vs-tablet split today. If a module needs
  it, document the breakpoint contract in the module file rather than
  branching inside primitives.
- DONE — DPR is capped. Bootstrap uses Maze's
  `Math.min(2, devicePixelRatio || 1)` (Three.js default also caps at 2;
  `FieldScene` does not raise it).
- OPEN — Resize debounce: relies on R3F's built-in `<Canvas>` resize
  observer. If a surface sees mobile viewport-bar churn, add an
  explicit debounce at the surface level — the primitives stay
  unaware.
- DONE — One RAF owner. The shared singleton clock
  (`renderer/field-loop-clock.ts`) drives `getAmbientFieldElapsedSeconds()`;
  R3F's `useFrame` is the single rAF loop the scene rides on.
- DONE — Visibility/suspension policy. `FieldController.updateVisibility`
  toggles `animateIn`/`animateOut`; off-screen layers idle out
  uniforms. R3F unmount disposes via `controller.destroy()`.
- DONE — Unused scene assets are deferred. `point-source-registry`
  resolves on demand; `prewarmAmbientFieldPointSources(...)` is opt-in,
  not eagerly called.
- DONE — Geometry / materials / renderer disposed on teardown.
  `FieldController.destroy()` kills GSAP tweens on the material
  uniforms; React unmount cleans the wrapper hierarchy.

## SoleMD Product Fit

- DONE — Surface keeps SoleMD shell aesthetics (no Maze chrome copied).
  Verified by reading `surfaces/AmbientFieldLandingPage` — Mantine 8 +
  Tailwind 4 + brand tokens, not Maze HTML.
- DONE — Modules extend the shared runtime. Round 12 expressly forbids
  a homepage-only fork: every primitive lives under
  `apps/web/features/ambient-field/` and re-exports through
  `index.ts`.
- DONE — Authoring goes through semantic manifests. Chapters are
  declarative `ChapterEvent[]` arrays (`scroll/chapters/*.ts`); buckets
  are `FieldSemanticBucket[]` records; presets are
  `AmbientFieldVisualPresetConfig` records.
- OPEN (per-module) — Graph bridge behavior. When a module wires into
  Cosmograph or DuckDB-WASM, document the bridge inside the module's
  README and route through `packages/graph` rather than re-implementing
  inside `ambient-field`.

## Red Flags

Reject or rework the change if it:

- Uses one universal random point field for every scene
  → instead pick the right `FieldGeometry.*` factory per slug.
- Treats stream as a recolored blob
  → `StreamController.updateScale(...)` and the stream funnel
    attributes are non-negotiable for parity.
- Renders model scenes as meshes when parity calls for points
  → use `createModelPointGeometry(model, { countFactor })`.
- Remounts heavy geometry on section boundaries
  → bind the controller once; scrub uniforms via
    `createFieldChapterTimeline` + `UniformScrubber`.
- Drives explanatory UI from per-point DOM nodes
  → use a single overlay pool via `createHotspotLifecycleController`.
- Hides mobile divergence in ad hoc CSS instead of documenting the
  breakpoint contract on the preset.
- Introduces page-local choreography that should live in the shared
  runtime (e.g. forking `FieldScene` instead of authoring a
  `FieldController` subclass + chapter file).
- Re-implements the frame loop. Use `FieldController.loop(dtSec)` plus
  `getAmbientFieldElapsedSeconds()`. Resetting `uTime` per remount is
  the canonical regression — the singleton clock exists to prevent it.
- Scrubs scroll uniforms without going through `UniformScrubber`. Snap
  transitions are the visible failure mode.
