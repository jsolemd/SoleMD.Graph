# Round 12 Module Authoring Guide

Authoritative step-by-step guide for building a new field module
on top of the Round 12 primitives. Pair with:

- `docs/map/field-maze-baseline-ledger-round-12.md` — canonical
  Source Ground Truth + Foundation Primitives + Phase Log.
- `.claude/skills/module/references/maze-rebuild-checklist.md`
  — review gate for parity claims.
- `.claude/skills/module/references/maze-particle-runtime-architecture.md`
  — runtime overview.

**Rule of thumb**: a new module should add *data* (point source, bucket
weights, preset, chapter events, anchor DOM). It should not add *control
flow* (no new frame loop, no bespoke scroll listener, no hand-rolled
tween). Every primitive below already exists in
`apps/web/features/field/index.ts` — import from there, never
from subpaths.

---

## Authoring Sequence

### 1. Pick a point source

Four factories live in `asset/field-geometry.ts` and are re-exported
from the barrel as `FieldGeometry.sphere | stream | fromTexture |
fromVertices`. Two async wrappers exist for real-world inputs:
`createImagePointGeometry` and `createModelPointGeometry`.

| Source | When to use | Call shape |
|---|---|---|
| `FieldGeometry.sphere({ count, radius, random })` | Hero blobs, abstract cloud-body modules (paper-story intro, synthesis orb). Rejection-sampled unit-sphere surface; 16 384 default points. | Synchronous, CPU-only. |
| `FieldGeometry.stream({ count, spread, random })` | Linear flow modules (timeline, ingestion path, evidence ribbon). Seeds `x∈[−spread/2, +spread/2], y=z=0` at 15 000 desktop / 10 000 mobile default. | Synchronous, CPU-only. |
| `FieldGeometry.fromTexture(imageLike, options)` | Bitmap-shaped clouds where the silhouette matters (PCB, MRI slice, anatomical diagram, logo). Emits `layers × 2` points per passing pixel. | Synchronous, takes pre-rasterized `ImageLikeData`. |
| `createImagePointGeometry(src, options)` | Real `string | HTMLImageElement | ImageBitmap` source. Rasterizes through OffscreenCanvas → feeds `fromTexture`. | Async. |
| `FieldGeometry.fromVertices(positions, options)` | You already hold a `Float32Array` of vertices. | Synchronous. |
| `createModelPointGeometry(object3D, options)` | GLTF-like scene; walks children DFS, collects every `geometry.position`, routes through `fromVertices`. | Synchronous (GLTF loading is your concern, not the primitive's). |

Channel selection for images — `TextureGeometryOptions.channel` —
defaults to `"r"` (Maze parity); pass `"luma"` for photographic inputs
(MRI, X-ray, histology) where the red channel alone is unreliable.

Never invent a fifth factory. If the module needs something new (point
volume, signed distance field, etc.), add the factory into
`field-geometry.ts` with a test, then import through the barrel.

### 2. Declare semantic buckets

Buckets are how the shader knows which points carry *paper*, *entity*,
*relation*, or *evidence* semantics. `bakeFieldAttributes` writes the
Maze-parity attribute set plus an `aBucket` float the burst shader
reads.

Default: `SOLEMD_DEFAULT_BUCKETS` (paper 10 %, entity 12 %, relation
8 %, evidence 70 %; motion values lifted straight from Maze CVE
buckets). Use it unless you have a reason not to.

Custom bucket example (for a module where every point represents one
of four evidence tiers — RCT, systematic review, observational, expert
opinion):

```ts
import {
  bakeFieldAttributes,
  buildBucketIndex,
  type FieldSemanticBucket,
} from "@/features/field";

const EVIDENCE_TIER_BUCKETS = [
  { id: "rct", weight: 0.2, motion: { aStreamFreq: 0.1, /* … */ } },
  { id: "sr", weight: 0.1, /* … */ },
  { id: "obs", weight: 0.4, /* … */ },
  { id: "expert", weight: 0.3, /* … */ },
] as const satisfies readonly FieldSemanticBucket[];

const bucketIndex = buildBucketIndex(EVIDENCE_TIER_BUCKETS);

bakeFieldAttributes(geometry, {
  buckets: EVIDENCE_TIER_BUCKETS,
  random: Math.random,
});
```

Bucket weights can sum to anything — `pickBucketIndex` normalizes.
Motion ranges should stay roughly in the `±1.5 / ±0.6 / ±0.2 / ±0.5`
envelope of the Maze defaults or the point cloud stops feeling
coherent.

### 3. Choose a preset

Presets live in `scene/visual-presets.ts` as `visualPresets.blob |
stream | objectFormation`. Each carries both the shader uniform values and the
controller-plane fields (`sceneScale`, `rotationVelocity`,
`entryFactor`, `rotate`, …).

Three rules for presets:

1. **Reuse first.** A module styled like the landing blob should
   literally import `visualPresets.blob`. Do not copy the numbers into
   the module.
2. **Extend via spread.** A module that only differs in `sceneScale`
   should spread the base preset:
   `{ ...visualPresets.blob, sceneScale: 0.6 }`. Keep the color pair
   intact unless the module is intentionally off-palette.
3. **Author a fourth entry when it's a new slug.** Stream variants,
   radically different geometries, or mobile-only presets belong in
   `visual-presets.ts` as a fourth keyed entry (`mri`, `synthesis`, …).
   Add the slug to `FIELD_STAGE_ITEM_IDS` so it is type-safe
   everywhere.

Color pair convention (from the shader): `rColor/gColor/bColor` is the
*base* color, `rNoise/gNoise/bNoise` is the *noise peak*; the binary
lerp amplifies the delta ×4. Swapping the pair gives a monochrome
tonal field; keeping the Maze cyan→magenta pair gives the canonical
body look.

### 4. Instantiate a FieldController subclass

`FieldController` owns the `wrapper → mouseWrapper → model` hierarchy,
the shader material, and the lifecycle tweens. Subclasses override the
bits that differ per slug.

| Subclass | Purpose | Override |
|---|---|---|
| `BlobController` | Hero sphere + hotspot state container. | Hotspot DOM pool (Phase 7 primitive). |
| `StreamController` | Flow stream. | `updateScale` → `250 * (innerW/innerH) / (1512/748)` desktop, `168` mobile. |
| `ObjectFormationController` | Near-horizontal authored-shape grid. | `updateScale` for the x=-80° tilt aspect ratio. |

For a new module, either:

- Reuse one of the three if its scaling + animate-in/out shape fits, or
- Add a fourth subclass under `controller/` that extends
  `FieldController` and overrides only the methods it needs to.

Instantiate inside `FieldScene.tsx` (or a module-local stage that
mirrors FieldScene's pattern) when the stage JSX renders the layer,
then call `controller.attach({ view, wrapper, mouseWrapper, model,
material })` once refs are live.

### 5. Author chapter events

Scroll-driven choreography is **declarative**. Every module authors a
`ChapterEvent<K>[]` array — no imperative GSAP calls.

- **Keys** (`K`): union of the uniform/shader/DOM names the chapter
  scrubs (e.g. `"uAlpha" | "uAmplitude" | "wrapperScale" |
  "hotspotOpacity"`).
- **Events**: each event has an `atProgress` (0–1 within the chapter
  span), a `duration`, and one of `set` / `to` / `from` / `fromTo`
  directives.
- **Pipeline**: `createFieldChapterTimeline(events)` computes the current
  target map for a chapter progress value. Controllers read shared chapter
  progress from `field-scroll-state.ts` and smooth toward those
  targets inside `tick()` with the existing motion decay helpers.

Author the chapter alongside `scroll/chapters/*.ts` so it is reusable
and diff-able. Never inline events inside a component.

### 6. Bind through the stage manifest + shared chapter ids

Do not add controller-local scroll listeners. Add authored chapter ids in the
surface JSX, then register the controller windows through the module's stage
manifest:

```tsx
<section
  ref={sectionRef}
  id="section-synthesis"
  data-section-id="section-synthesis"
  className="relative h-[240vh]"
>
  <h2 className="sticky top-0">Synthesis</h2>
  {/* DOM text & UI live here, NOT inside the canvas */}
</section>
```

Then add a manifest row like:

```ts
{
  sectionId: "section-synthesis",
  stageItemId: "synthesis",
  endSectionId: "section-next",
  presetId: "synthesis",
}
```

`FixedStageManager` will prewarm the active point sources, wait for controller
attachment readiness, and then let `field-scroll-state.ts` produce the
shared chapter progress that your controller consumes.

### 7. (Optional) Hotspot overlays

If the module surfaces callouts or annotations on top of the point
cloud, use the existing overlay primitives:

- `FieldHotspotRing` — React component that draws the ring +
  inner dot + optional card slot, keyed by `seedKey` and `phase`
  (`"idle" | "animating" | "reds"`).
- `createHotspotLifecycleController({ count, samplePosition,
  sampleDelayMs, durationMs })` — owns the per-hotspot reseed cadence
  (Maze `animationend` parity; each hotspot resets independently).

Feed `controller.toScreenPosition(sampleVec, camera, vw, vh)` into the
ring's `projection` prop. Never project inside React render — project
inside `useFrame` and push into refs.

### 8. (Optional) Burst tint

If the module wants semantic color sweeps (paper-focus highlights, etc.):

```ts
import {
  createBurstController,
  PHASE_TO_BUCKET,
  SOLEMD_BURST_COLORS,
  FIELD_BUCKET_INDEX,
} from "@/features/field";

const burst = createBurstController({
  bucketIndex: FIELD_BUCKET_INDEX,
  semanticColorMap: SOLEMD_BURST_COLORS,
  regionScale: 1.2,
  softness: 0.2,
});

// Each frame:
burst.setActive(PHASE_TO_BUCKET[dominantPhase], phaseWeight);
burst.step(deltaMs);
burst.apply(material);
```

Burst strength is low-passed through a shared 1 s half-life scrubber
so scroll velocity never snaps the hue.

### 9. (Optional) DOM scroll adapter

Text reveals inside the module should **not** scrub. Use GSAP
`ScrollTrigger.toggleActions: "play pause resume reset"` so the copy
plays once on enter and freezes thereafter. The Round 12 ledger §16
catalogs this split: background uniforms scrub; foreground text
toggles. Mixing the two is the visible-jitter failure mode.

### 10. Verify

Before calling the module done:

1. Parity to reference — compare against the Round 12 ledger §18
   "Current field gaps" list and confirm none reappeared.
2. No `uTime` reset — unmount and remount the module; the point cloud
   must not twitch. The singleton
   `getFieldElapsedSeconds()` guarantees this as long as the
   module reads through it.
3. Smooth scroll — flick the scroll root hard; uniforms should visibly
   trail (1 s half-life) rather than snap.
4. Targeted vitest suite green: `npm test --
   <module-test>` for every new file under `asset/`, `controller/`,
   `overlay/`, `scroll/chapters/`.
5. Typecheck + lint: `npm run typecheck && npm run lint`.

---

## Worked Example 1 — Landing Blob

The canonical field module; this is what `FieldLandingPage`
mounts today. Use it as the template to copy when authoring anything
sphere-shaped.

```ts
// 1. Point source — rejection-sampled unit sphere.
const geometry = FieldGeometry.sphere({ count: 16384 });

// 2. Buckets — default paper/entity/relation/evidence split.
bakeFieldAttributes(geometry, {
  buckets: SOLEMD_DEFAULT_BUCKETS,
  random: Math.random,
});

// 3. Preset — reuse visualPresets.blob verbatim.
const preset = visualPresets.blob;

// 4. Controller — BlobController.
const controller = new BlobController({ id: "blob", preset });
// Inside FieldScene.tsx, after refs resolve:
controller.attach({ view, wrapper, mouseWrapper, model, material });

// 5. Chapter events — LANDING_BLOB_CHAPTER (pre-authored port of
//    scripts.pretty.js:43291-43414).
const scrubber = createUniformScrubber<LandingBlobChapterKey>({
  halfLifeMs: 1000,
  initial: {
    uAlpha: preset.shader.alpha,
    uAmplitude: preset.shader.amplitude,
    uDepth: preset.shader.depth,
    uFrequency: preset.shader.frequency,
    uSelection: preset.shader.selection,
    wrapperScale: 1,
    modelYShift: 0,
    hotspotOpacity: 0,
    hotspotMaxNumber: 0,
    hotspotOnlyReds: 0,
  },
});
const timeline = createFieldChapterTimeline({
  events: LANDING_BLOB_CHAPTER,
  scrubber,
});

// 6. Anchor — <section data-gfx="blob" …> inside
//    FieldLandingPage.tsx.

// 7. Hotspots — FieldHotspotRing × HOTSPOT_COUNT (~30),
//    reseeded by createHotspotLifecycleController on animationend.

// 8. Burst — createBurstController routed by PHASE_TO_BUCKET each
//    frame inside useFrame.

// 9. Text reveals — toggleActions (not scrub) on the hero headline +
//    CTA copy. See surfaces/FieldLandingPage.

// 10. Verify — 8 suites / 45 tests currently green.
```

Behavior you'll see: cyan→magenta body, idle rotation, mouse parallax,
per-frame hotspot projection, hue-sweep bursts on phase transitions,
end-of-chapter y-drift to exit the viewport.

---

## Worked Example 2 — Convergence Plane Module

Same primitives, different point source and preset. Use the
objectFormation family when a non-landing module needs a near-horizontal
bitmap plane or a future shape-formation runway.

```ts
// 1. Point source — bitmap-to-points through the async image wrapper.
const geometry = await createImagePointGeometry("/particles/object-formation.png", {
  textureScale: 0.5,
  thickness: 0,
  layers: 1,
  gridRandomness: 0,
  colorThreshold: 200,
  channel: "r",
});

// 2. Buckets — default set. The bitmap's silhouette carries the
//    semantics; buckets only color the bursts.
bakeFieldAttributes(geometry, { buckets: SOLEMD_DEFAULT_BUCKETS });

// 3. Preset — visualPresets.objectFormation. The x=-80° tilt + uFrequency 0.1 are
//    non-negotiable for the horizon look.
const preset = visualPresets.objectFormation;

// 4. Controller — ObjectFormationController (scaffolded, extends FieldController).
const controller = new ObjectFormationController({
  id: "objectFormation",
  preset,
});
controller.attach({ view, wrapper, mouseWrapper, model, material });

// 5. Chapter — author an object-formation chapter target list and read
//    it from the controller's `tick()` using shared chapter progress.
const timeline = createFieldChapterTimeline(OBJECT_FORMATION_CHAPTER);

// 6. Manifest — register the module chapter in FIELD_SECTION_MANIFEST.
// 7. Hotspots — none (the object-formation surface doesn't carry them in Maze).
// 8. Burst — optional; keep the baseline palette unless the module contract says otherwise.
// 9. Text reveals — toggleActions on the feature-copy headline.
// 10. Verify — bitmap must round-trip through OffscreenCanvas; jsdom
//     tests use the ImageLikeData shortcut so the test suite stays
//     hermetic.
```

Visible behavior: a flat grid of points lying near-horizontal; scroll
pushes it toward the camera (or pulls it toward the horizon) without
changing the point cloud's identity.

---

## Worked Example 3 — MRI Module (hypothetical)

A future SoleMD module that renders an MRI slice as a point cloud.
Illustrates how the luma channel, custom chapter keys, and
stream-family preset combine.

```ts
// 1. Point source — luma-channel bitmap sample. Photographic inputs
//    need luma, not red, or bright tissue drowns out anatomy.
const mriGeometry = await createImagePointGeometry(
  "/modules/mri/slice-42.png",
  {
    textureScale: 0.5,
    thickness: 0,
    layers: 1,
    gridRandomness: 0,
    colorThreshold: 40,       // Lower threshold — MRI is mid-tone heavy.
    channel: "luma",
  },
);

// 2. Buckets — custom anatomical tiers.
const MRI_BUCKETS = [
  { id: "tumor", weight: 0.05, motion: { aStreamFreq: 1.2, /* … */ } },
  { id: "edema", weight: 0.15, motion: { aStreamFreq: 0.4, /* … */ } },
  { id: "parenchyma", weight: 0.5, motion: { aStreamFreq: -0.2, /* … */ } },
  { id: "background", weight: 0.3, motion: { aStreamFreq: 0.0, /* … */ } },
] as const satisfies readonly FieldSemanticBucket[];

bakeFieldAttributes(mriGeometry, { buckets: MRI_BUCKETS });

// 3. Preset — extend the stream preset for its funnel attributes, but
//    flatten the rotation. Register under a new slug in
//    visual-presets.ts so it is type-safe.
const mriPreset = {
  ...visualPresets.stream,
  sceneScale: 0.6,
  sceneRotation: [0, 0, 0],
  rotate: false,
  shader: { ...visualPresets.stream.shader, amplitude: 0.04, size: 5 },
};

// 4. Controller — extend StreamController; its updateScale already
//    handles aspect-ratio scaling, which photography-sized inputs
//    benefit from.
class MriController extends StreamController {
  // Add module-specific hooks (e.g. bucket tint per slice) here.
}
const controller = new MriController({ id: "mri", preset: mriPreset });
controller.attach({ view, wrapper, mouseWrapper, model, material });

// 5. Chapter — custom keys mirroring a paperFocus-style inspection
//    sweep. Reveal the slice, isolate tumor bucket, pan the slice,
//    release.
type MriKey =
  | "uAlpha"
  | "uSelection"
  | "burstStrength"
  | "wrapperYaw"
  | "cameraDolly";

const MRI_CHAPTER: ChapterEvent<MriKey>[] = [
  { label: "fade-in", atProgress: 0, duration: 0.15,
    fromTo: { uAlpha: [0, 1] } },
  { label: "isolate-tumor", atProgress: 0.25, duration: 0.2,
    fromTo: { uSelection: [1, 0.15], burstStrength: [0, 1] } },
  { label: "pan", atProgress: 0.5, duration: 0.3,
    fromTo: { wrapperYaw: [0, Math.PI / 6], cameraDolly: [0, -20] } },
  { label: "release", atProgress: 0.85, duration: 0.15,
    fromTo: { uSelection: [0.15, 1], burstStrength: [1, 0] } },
];

const scrubber = createUniformScrubber<MriKey>({
  halfLifeMs: 1000,
  initial: {
    uAlpha: 0,
    uSelection: 1,
    burstStrength: 0,
    wrapperYaw: 0,
    cameraDolly: 0,
  },
});
const timeline = createFieldChapterTimeline({
  events: MRI_CHAPTER,
  scrubber,
});

// 6. Anchor — <section data-gfx="mri" …> inside the module surface.

// 7. Hotspots — FieldHotspotRing per annotation (e.g. tumor
//    boundary). samplePosition draws a random vertex from the tumor
//    bucket only:
const lifecycle = createHotspotLifecycleController({
  count: 4,
  samplePosition: (index, retry) => sampleBucketVertex(mriGeometry, "tumor"),
  durationMs: 2400,
});

// 8. Burst — tumor bucket tint during isolate-tumor chapter.
const burst = createBurstController({
  bucketIndex: buildBucketIndex(MRI_BUCKETS),
  semanticColorMap: { tumor: "#ff3366", edema: "#ffaa33",
    parenchyma: "#88aabb", background: "#203040" },
});

// 9. Text reveals — anatomical labels via toggleActions.

// 10. Verify — add vitest coverage for the custom chapter keys + the
//     bucket-sampler predicate; run the module's storybook-equivalent
//     with a fixed random seed so screenshot diffs stay stable.
```

Notes that generalize beyond MRI:

- When a module uses photographic inputs, default to `channel: "luma"`
  and a lower `colorThreshold`. Tune by inspection, then freeze.
- A custom bucket set is the right tool for *semantic* coloring. A
  custom preset is the right tool for *visual* tuning. Do not conflate
  them.
- Adding a new slug (`mri` above) means updating
  `FIELD_STAGE_ITEM_IDS` in `scene/visual-presets.ts` so the
  type system covers the new entry.

---

## Best Practices (tl;dr)

Essential:

- **Never re-implement the frame loop.** `FieldController.loop(dtSec)` +
  `getFieldElapsedSeconds()` are canonical. A module-local rAF
  loop creates two clocks; the module that desyncs visibly jitters.
- **Always scrub scroll-driven uniforms through `UniformScrubber`.**
  The 1 s half-life is the difference between "breathing" and
  "snapping". It is not optional even for a single uniform.
- **Text overlays live in the DOM.** Canvas-authored copy fails every
  SoleMD shell aesthetic + accessibility test.
- **Read `round-12-module-authoring.md` + Round 12 ledger first.** The
  Round 12 rebuild was the last green-field rework; the gap list in
  the ledger §18 is the regression catalog.

Strong defaults:

- Import from `@/features/field` (the barrel). Subpath imports
  are a refactor trap.
- Reuse `SOLEMD_DEFAULT_BUCKETS` + existing presets + existing chapter
  files first. Author a new one only when behavior genuinely differs.
- Cap DPR at 2 (the R3F / Three.js default). Do not raise it.
- Dispose GSAP tweens on `controller.destroy()`; React unmount handles
  the wrapper hierarchy.
- Breakpoint mobile via `sceneScaleMobile` / `alphaMobile` /
  `sizeMobile` on the preset, not via ad-hoc CSS breakpoints inside the
  module.

Anti-patterns:

- Forking `FieldScene` for a module. Add a controller subclass + a
  chapter file + an anchor. That is the whole seam.
- Resetting `uTime` to zero on warmup. The singleton clock exists to
  survive StrictMode + warmup remounts.
- Projecting 3D → screen inside React render. Project inside
  `useFrame`; push into refs; let React read refs.
- Per-point DOM overlays. Use a pooled hotspot lifecycle controller.

---

## Reference Map

| Purpose | Import from barrel |
|---|---|
| Sphere / stream / bitmap / vertex geometry | `FieldGeometry` |
| Async image | `createImagePointGeometry` |
| Async model | `createModelPointGeometry` |
| Attribute bake + buckets | `bakeFieldAttributes`, `SOLEMD_DEFAULT_BUCKETS`, `buildBucketIndex` |
| Presets | `visualPresets`, `FIELD_STAGE_ITEM_IDS` |
| Base controller | `FieldController`, `tnEase` |
| Controller subclasses | `BlobController`, `StreamController`, `ObjectFormationController` |
| Mouse parallax | `attachMouseParallax` |
| Singleton clock | `getFieldElapsedSeconds`, `getFieldElapsedMs` |
| Uniform low-pass | `createUniformScrubber` |
| Declarative chapters | `createFieldChapterTimeline` |
| Pre-authored landing chapters | `LANDING_BLOB_CHAPTER`, `LANDING_PCB_CHAPTER`, `LANDING_STREAM_CHAPTER` |
| Burst tint | `createBurstController`, `PHASE_TO_BUCKET`, `SOLEMD_BURST_COLORS`, `FIELD_BUCKET_INDEX` |
| Hotspot ring + lifecycle | `FieldHotspotRing`, `createHotspotLifecycleController` |

Every one of these is exported from `@/features/field`. If a
new module feels like it needs something that isn't in this table, the
right move is to add the primitive to the barrel (with a test) before
authoring the module.
