# Module Authoring Guide

Step-by-step guide for building a new field module on top of the shared
field-substrate primitives. Pair with `field-runtime-architecture.md`,
`runtime-contracts-by-subsystem.md`, and the SKILL.md non-negotiables.

**Rule of thumb**: a new module should add *data* (point source, bucket
weights, preset, chapter events, anchor DOM). It should not add *control
flow* (no new frame loop, no bespoke scroll listener, no hand-rolled tween).
Every primitive below already exists in `apps/web/features/field/index.ts`
— import from there, never from subpaths.

---

## Authoring Sequence

### 1. Pick a point source

Four factories live in `asset/field-geometry.ts`, re-exported from the
barrel as `FieldGeometry.sphere | stream | fromTexture | fromVertices`. Two
async wrappers exist for real-world inputs: `createImagePointGeometry` and
`createModelPointGeometry`.

| Source | When to use | Call shape |
|---|---|---|
| `FieldGeometry.sphere({ count, radius, random })` | Hero blobs, abstract cloud-body modules. Rejection-sampled unit-sphere surface; 16 384 default points. | Synchronous |
| `FieldGeometry.stream({ count, spread, random })` | Linear flow modules (timeline, ingestion path, evidence ribbon). Seeds `x∈[−spread/2, +spread/2], y=z=0` at 15 000 desktop / 10 000 mobile default. | Synchronous |
| `FieldGeometry.fromTexture(imageLike, options)` | Bitmap-shaped clouds where silhouette matters (PCB, MRI slice, anatomical diagram, logo). Emits `layers × 2` points per passing pixel. | Synchronous; takes pre-rasterized `ImageLikeData` |
| `createImagePointGeometry(src, options)` | Real `string \| HTMLImageElement \| ImageBitmap` source. Rasterizes through OffscreenCanvas → feeds `fromTexture`. | Async |
| `FieldGeometry.fromVertices(positions, options)` | You already hold a `Float32Array` of vertices. | Synchronous |
| `createModelPointGeometry(object3D, options)` | GLTF-like scene; walks children DFS, collects every `geometry.position`, routes through `fromVertices`. | Synchronous (GLTF loading is your concern, not the primitive's) |

`TextureGeometryOptions.channel` defaults to `"r"`; pass `"luma"` for
photographic inputs (MRI, X-ray, histology) where the red channel alone is
unreliable.

Never invent a fifth factory. If the module needs something new (point
volume, signed distance field, etc.), add the factory into
`field-geometry.ts` with a test, then import through the barrel.

### 2. Declare semantic buckets

Buckets are how the shader knows which points carry *paper*, *entity*,
*relation*, or *evidence* semantics. `bakeFieldAttributes` writes the
shared attribute set plus an `aBucket` float the burst shader reads.

Default: `SOLEMD_DEFAULT_BUCKETS` (paper 10%, entity 12%, relation 8%,
evidence 70%). Use it unless you have a reason not to.

Custom bucket example (a module where every point represents one of four
evidence tiers — RCT, systematic review, observational, expert opinion):

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

Bucket weights can sum to anything — `pickBucketIndex` normalizes. Motion
ranges should stay roughly in the `±1.5 / ±0.6 / ±0.2 / ±0.5` envelope of
the defaults or the point cloud stops feeling coherent.

### 3. Choose a preset

Presets live in `scene/visual-presets.ts` as `visualPresets.blob | stream |
objectFormation`. Each carries both shader uniform values and controller-
plane fields (`sceneScale`, `rotationVelocity`, `entryFactor`, `rotate`, …).

Three rules:

1. **Reuse first.** A module styled like the landing blob should literally
   import `visualPresets.blob`. Do not copy the numbers into the module.
2. **Extend via spread.** A module that only differs in `sceneScale` should
   spread the base preset: `{ ...visualPresets.blob, sceneScale: 0.6 }`.
   Keep the color pair intact unless intentionally off-palette.
3. **Author a fourth entry when it's a new slug.** Stream variants,
   radically different geometries, or mobile-only presets belong in
   `visual-presets.ts` as a fourth keyed entry (`mri`, `synthesis`, …).
   Add the slug to `FIELD_STAGE_ITEM_IDS` so it is type-safe everywhere.

Color pair convention (from the shader): `uColorBase` is the *base* color,
`uColorNoise` is the *noise peak*; the binary lerp amplifies the delta ×4.
Swapping the pair gives a monochrome tonal field; keeping the cyan→magenta
pair gives the canonical body look.

### 4. Instantiate a `FieldController` subclass

`FieldController` owns the `wrapper → mouseWrapper → model` hierarchy, the
shader material, and the lifecycle tweens. Subclasses override the bits
that differ per slug.

| Subclass | Purpose | Override |
|---|---|---|
| `BlobController` | Hero sphere + hotspot state container. | Hotspot DOM pool delegation. |
| `StreamController` | Flow stream. | `updateScale` → `250 * (innerW/innerH) / (1512/748)` desktop, `168` mobile. |
| `ObjectFormationController` | Near-horizontal authored-shape grid. | `updateScale` for the x=−80° tilt aspect ratio. |

Either reuse one of the three if its scaling + animate-in/out shape fits,
or add a fourth subclass under `controller/` that extends `FieldController`
and overrides only the methods it needs to.

Instantiate inside `FieldScene.tsx` (or a module-local stage that mirrors
the same pattern) when the stage JSX renders the layer, then call
`controller.attach({ view, wrapper, mouseWrapper, model, material })` once
refs are live.

### 5. Author chapter events

Scroll-driven choreography is **declarative**. Every module authors a
`ChapterEvent<K>[]` array — no imperative GSAP calls.

- **Keys** (`K`): union of the uniform/shader/DOM names the chapter scrubs
  (e.g. `"uAlpha" | "uAmplitude" | "wrapperScale" | "hotspotOpacity"`).
- **Events**: each has `atProgress` (0–1 within the chapter span),
  `duration`, and one of `set` / `to` / `from` / `fromTo`.
- **Pipeline**: `createFieldChapterTimeline(events)` computes the current
  target map for a chapter progress value. Controllers read shared chapter
  progress from `field-scroll-state.ts` and smooth toward those targets
  inside `tick()` with the existing motion decay helpers.

Author the chapter alongside `scroll/chapters/*.ts` so it is reusable and
diff-able. Never inline events inside a component.

### 6. Bind through the stage manifest + shared chapter ids

Do not add controller-local scroll listeners. Add authored chapter ids in
the surface JSX, then register the controller windows through the module's
stage manifest:

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

Then add a manifest row:

```ts
{
  sectionId: "section-synthesis",
  stageItemId: "synthesis",
  endSectionId: "section-next",
  presetId: "synthesis",
}
```

`FixedStageManager` will prewarm the active point sources, wait for
controller attachment readiness, and then let `field-scroll-state.ts`
produce the shared chapter progress that your controller consumes.

### 7. (Optional) Hotspot overlays

If the module surfaces callouts on top of the point cloud, use the
existing overlay primitives:

- `FieldHotspotRing` — React component that draws the ring + inner dot +
  optional card slot, keyed by `seedKey` and `phase`.
- `createHotspotLifecycleController({ count, samplePosition,
  sampleDelayMs, durationMs })` — owns per-hotspot reseed cadence
  (`animationend`-driven; each hotspot resets independently).

Feed `controller.toScreenPosition(sampleVec, camera, vw, vh)` into the
ring's `projection` prop. Never project inside React render — project
inside `useFrame` and push into refs.

### 8. (Optional) Burst tint

Semantic color sweeps:

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

Burst strength is low-passed through a shared 1 s half-life scrubber so
scroll velocity never snaps the hue.

### 9. (Optional) DOM scroll adapter

Text reveals inside the module should **not** scrub. Use GSAP
`ScrollTrigger.toggleActions: "play pause resume reset"` so the copy plays
once on enter and freezes thereafter. Mixing scrub + toggle is the visible-
jitter failure mode.

### 10. Verify

Before calling the module done:

1. No `uTime` reset — unmount and remount the module; the point cloud must
   not twitch. The singleton `getFieldElapsedSeconds()` guarantees this as
   long as the module reads through it.
2. Smooth scroll — flick the scroll root hard; uniforms should visibly
   trail (1 s half-life) rather than snap.
3. Targeted vitest suite green: `npm test -- <module-test>` for every new
   file under `asset/`, `controller/`, `overlay/`, `scroll/chapters/`.
4. Typecheck + lint: `npm run typecheck && npm run lint`.

---

## Worked Example 1 — Landing Blob

The canonical field module; this is what `FieldLandingPage` mounts today.
Use it as the template for any sphere-shaped module.

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

// 5. Chapter events — LANDING_BLOB_CHAPTER (pre-authored target list).
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

// 6. Anchor — <section data-gfx="blob" …> inside FieldLandingPage.tsx.

// 7. Hotspots — FieldHotspotRing × HOTSPOT_COUNT (~30),
//    reseeded by createHotspotLifecycleController on animationend.

// 8. Burst — createBurstController routed by PHASE_TO_BUCKET each
//    frame inside useFrame.

// 9. Text reveals — toggleActions on the hero headline + CTA copy.
```

Behavior: cyan→magenta body, idle rotation, mouse parallax (when desktop-
gated and opted in), per-frame hotspot projection, hue-sweep bursts on
phase transitions, end-of-chapter y-drift to exit the viewport.

---

## Worked Example 2 — Object-Formation Module

Same primitives, different point source and preset. Use the
objectFormation family when a non-landing module needs a near-horizontal
bitmap plane or a future shape-formation runway.

```ts
// 1. Point source — bitmap-to-points through the async image wrapper.
const geometry = await createImagePointGeometry(
  "/particles/object-formation.png",
  {
    textureScale: 0.5,
    thickness: 0,
    layers: 1,
    gridRandomness: 0,
    colorThreshold: 200,
    channel: "r",
  },
);

// 2. Buckets — default set. The bitmap's silhouette carries semantics;
//    buckets only color the bursts.
bakeFieldAttributes(geometry, { buckets: SOLEMD_DEFAULT_BUCKETS });

// 3. Preset — visualPresets.objectFormation. The x=-80° tilt + uFrequency 0.1
//    are non-negotiable for the horizon look.
const preset = visualPresets.objectFormation;

// 4. Controller — ObjectFormationController extends FieldController.
const controller = new ObjectFormationController({
  id: "objectFormation",
  preset,
});
controller.attach({ view, wrapper, mouseWrapper, model, material });

// 5. Chapter — author an object-formation chapter target list and read
//    it from the controller's `tick()` using shared chapter progress.
const timeline = createFieldChapterTimeline(OBJECT_FORMATION_CHAPTER);

// 6. Manifest — register the module chapter in FIELD_SECTION_MANIFEST.
// 7. Hotspots — none (object-formation surface doesn't carry them today).
// 8. Burst — optional; keep baseline palette unless module contract says otherwise.
// 9. Text reveals — toggleActions on the feature-copy headline.
```

Visible behavior: a flat grid of points lying near-horizontal; scroll
pushes it toward the camera (or pulls it toward the horizon) without
changing the point cloud's identity.

Notes that generalize:

- When a module uses photographic inputs (MRI, X-ray, histology, brain
  diagrams), default to `channel: "luma"` and a lower `colorThreshold`
  (~40 for MRI vs default 200 for line art). Tune by inspection, freeze.
- A custom bucket set is the right tool for *semantic* coloring. A custom
  preset is the right tool for *visual* tuning. Do not conflate them.
- Adding a new slug means updating `FIELD_STAGE_ITEM_IDS` in
  `scene/visual-presets.ts` so the type system covers the new entry.
- For a module that wants stream-family aspect-aware scaling but
  flattened rotation (e.g. an MRI slice), spread `visualPresets.stream`
  and override `sceneRotation: [0, 0, 0]` and `rotate: false`.

---

## Best Practices

Essential:

- **Never re-implement the frame loop.** `FieldController.loop(dtSec)` +
  `getFieldElapsedSeconds()` are canonical. A module-local rAF loop creates
  two clocks; the module that desyncs visibly jitters.
- **Always scrub scroll-driven uniforms through `UniformScrubber`.** The
  1 s half-life is the difference between "breathing" and "snapping". Not
  optional even for a single uniform.
- **Text overlays live in the DOM.** Canvas-authored copy fails every
  SoleMD shell aesthetic + accessibility test.

Strong defaults:

- Import from `@/features/field` (the barrel). Subpath imports are a
  refactor trap.
- Reuse `SOLEMD_DEFAULT_BUCKETS` + existing presets + existing chapter
  files first. Author a new one only when behavior genuinely differs.
- Cap DPR at 2 (R3F / three.js default). Do not raise it.
- Dispose GSAP tweens on `controller.destroy()`; React unmount handles
  the wrapper hierarchy.
- Breakpoint mobile via `sceneScaleMobile` / `alphaMobile` / `sizeMobile`
  on the preset, not via ad-hoc CSS breakpoints inside the module.

Anti-patterns:

- Forking `FieldScene` for a module. Add a controller subclass + a
  chapter file + an anchor. That is the whole seam.
- Resetting `uTime` to zero on warmup. The singleton clock exists to
  survive StrictMode + warmup remounts.
- Projecting 3D → screen inside React render. Project inside `useFrame`;
  push into refs; let React read refs.
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
| Pre-authored landing chapters | `LANDING_BLOB_CHAPTER`, `LANDING_STREAM_CHAPTER` |
| Burst tint | `createBurstController`, `PHASE_TO_BUCKET`, `SOLEMD_BURST_COLORS`, `FIELD_BUCKET_INDEX` |
| Hotspot ring + lifecycle | `FieldHotspotRing`, `createHotspotLifecycleController` |

If a new module feels like it needs something that isn't in this table,
the right move is to add the primitive to the barrel (with a test) before
authoring the module.
