# Maze Asset Pipeline

Use this reference when a task touches point-source generation, bitmap sampling,
model conversion, asset loading, or how those sources should become SoleMD
runtime infrastructure.

Source ground truth:

- bitmap sampler `jo.fromTexture`: `scripts.pretty.js:42676-42722`
- model converter `jo.fromVertices`: `scripts.pretty.js:42723-42745`
- procedural generators `jo.generate`: `scripts.pretty.js:42894-42917`
- attribute baker `jo.addParams`: `scripts.pretty.js:42784-42893`
- asset registry `vd` / loader `Ws/ku`: `scripts.pretty.js:42941-43011`
- homepage `[data-gfx]` anchors: `index.html:235, 564, 1067`

SoleMD round-12 primitives:

- `apps/web/features/field/asset/field-geometry.ts`
- `apps/web/features/field/asset/field-attribute-baker.ts`
- `apps/web/features/field/asset/image-point-source.ts`
- `apps/web/features/field/asset/model-point-source.ts`
- `apps/web/features/field/asset/point-source-registry.ts`

## Registry Shape

Maze splits source selection from controller behavior:

- source registry / asset loading:
  - procedural generation plus bitmap/model asset URLs
- controller registry:
  - which scene-controller class owns a slug

This split is important:

- geometry sourcing and scene choreography are not the same concern

## Source Families

Maze uses four source families. SoleMD exposes each as a function on
`FieldGeometry` (`asset/field-geometry.ts`) returning a `THREE.BufferGeometry`
with `position` populated; callers then run `bakeFieldAttributes(geometry, …)`
to fill the shared motion + funnel + bucket attributes.

### 1. Procedural Sphere Family

Used by:

- `blob`
- `blobProduct`
- `sphere`
- `error`

Generation:

- `getSphere(16384, 1)`
- random unit-sphere rejection sampling
- points are seeded from random cube samples kept inside the unit ball, then
  normalized to radius `1`
- source coordinates are already centered

This is a random surface cloud, not an ordered icosphere or Fibonacci layout.

SoleMD wrapper: `FieldGeometry.sphere({ count, radius, random })`. Defaults
`count: 16384`, `radius: 1`, `random: Math.random`.

### 2. Procedural Stream Seed

Used by:

- `stream`

Generation:

- desktop: `15000` points
- non-desktop: `10000` points
- points seeded on a flat x-axis line
- x range is width `4`, centered on `0`
- y and z start at `0`

The funnel and conveyor shape are not authored into source coordinates. They
emerge later in shader space.

SoleMD wrapper: `FieldGeometry.stream({ count, spread, random })`. Defaults
`count: 15000`, `spread: 4`.

### 3. Bitmap To Points

Used by:

- `pcb`
- `logo` (present in registry, not active on the live homepage)

Bitmap sampling contract:

- image drawn onto a canvas
- Y is flipped before sampling (Maze: `ctx.scale(1, -1)`; SoleMD: flip during
  emission, `y = -sy + jitterY`)
- threshold test on the red channel
- grid jitter applied per accepted pixel
- two points emitted per selected pixel per layer
- two extra bounding-box anchor points appended before centering
- geometry centered after conversion

Parity-sensitive defaults in the helper:

- `colorTreshold = 200` (Maze spelling preserved in source citations only;
  SoleMD exposes the option as `colorThreshold`)
- `textureScale = 1.5` by default, overridden per slug
- `gridRandomness = 0.5` by default
- `thickness = 10` by default
- `layers = 1` by default

`pcb` then overrides toward a flatter, more technical look:

- `textureScale = 0.5`
- `gridRandomness = 0`
- `thickness = 0`

Important parity quirk:

- `layers` still defaults to `1`
- with `thickness = 0`, each accepted PCB pixel emits two coincident `z = 0`
  points rather than a visibly separated positive/negative layer
- the appended bbox anchor points still influence `.center()`
- transparent assets can collapse unexpectedly under the red-channel threshold;
  `logo.png` in this snapshot effectively degenerates to the appended bbox
  anchors if sampled through the same path

SoleMD wrapper: `FieldGeometry.fromTexture(image, options)` takes an
`ImageLikeData` (`{ width, height, data: Uint8ClampedArray | Uint8Array }`)
plus `TextureGeometryOptions`. The async entry point
`createImagePointGeometry(source, options?)` in `image-point-source.ts`
accepts `string | HTMLImageElement | ImageBitmap | ImageLikeData`, rasterizes
via `OffscreenCanvas` when available (falls back to DOM canvas), and passes
raw `ImageLikeData` straight through so jsdom tests do not need a DOM.

SoleMD-specific `channel` extension:

- `channel: 'r' | 'g' | 'b' | 'a' | 'luma'`
- `'r'` is the Maze default (identical behavior)
- `'luma'` uses BT.601 (`0.299 R + 0.587 G + 0.114 B`) and is the intended
  path for medical and diagram inputs (MRI slices, anatomical drawings,
  graph screenshots) where the red channel is not diagnostic
- `'g'`, `'b'`, `'a'` are direct channel reads exposed for completeness

### 4. Model Vertices To Points

Used by:

- `shield` -> `Shield.glb`
- `cubes` -> `Cubes.glb`
- `hex` -> `Net.glb`
- `globe` -> `World.glb`
- `users` -> `Users.glb`

Conversion contract:

- traverse mesh children
- read raw `POSITION` attributes only
- duplicate vertices according to `countFactor`
- add small position jitter
- center the resulting point cloud

Ignored at conversion time:

- indices
- normals
- UVs
- materials
- skins
- morph targets
- node transforms

Important parity quirk:

- several shipped `.glb` assets carry non-identity node rotation or scale
- Maze ignores that and re-frames the result later through scene-level params

Important implication:

- Maze does not render the homepage `.glb` files as shaded meshes
- it preserves topology silhouette through points

SoleMD wrappers:

- `FieldGeometry.fromVertices(positions, options)` consumes a raw
  `Float32Array` of XYZ triples. Options: `countFactor` (default `1`),
  `positionRandomness` (default `0.01`), `random`.
- `createModelPointGeometry(model, options?)` in `model-point-source.ts`
  walks an `Object3D`-like graph depth-first, concatenates every
  `geometry.getAttribute('position').array` it finds, and forwards the
  combined buffer to `fromVertices`. Empty graphs return an empty geometry
  rather than throwing.

Focused model stats live in:

- `references/maze-model-point-source-inspection.md`
- `data/research/mazehq-homepage/2026-04-18/derived/model-inspection.md`

## Shared Attribute Injection

Every generated geometry goes through `jo.addParams(...)` in Maze, or
`bakeFieldAttributes(geometry, options)` in SoleMD. The baker requires
`geometry.getAttribute('position')` to already exist and derives the point
count from it.

The baker writes:

- `aIndex` (sequential integer float)
- `aAlpha` (`alphaMin + random * span`, default `[0.2, 1.0]`)
- `aSelection` (`[0, 1]` uniform)
- `aMove` (vec3, each component `±moveRange`, default `±30`)
- `aSpeed` (vec3, each component `[0, 1]`)
- `aRandomness` (vec3, scaled by `{ x: 0, y: 1, z: 0.5 }` by default)
- `aStreamFreq`, `aFunnelThickness`, `aFunnelNarrow`, `aFunnelStartShift`,
  `aFunnelEndShift` (seeded from the selected bucket)
- `aBucket` (SoleMD-only, float bucket index in `SOLEMD_DEFAULT_BUCKETS`
  order, consumed by the Phase-4 burst overlay)

### SOLEMD_DEFAULT_BUCKETS

Exported from `asset/field-attribute-baker.ts`. The four buckets relabel
Maze's `urgentFix / patchInSLA / ignore / notExploitable` profiles under
SoleMD product terms without changing any motion value.

| SoleMD id | weight | aStreamFreq | aFunnelThickness | aFunnelNarrow | aFunnelStartShift | aFunnelEndShift | Maze analog |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `paper` | `0.10` | `+0.10` | `0.10` | `0.03` | `+0.42` | `+0.29` | `urgentFix` |
| `entity` | `0.12` | `−0.20` | `0.14` | `0.04` | `+0.28` | `−0.06` | `patchInSLA` |
| `relation` | `0.08` | `−1.40` | `0.18` | `0.05` | `+0.10` | `−0.29` | `ignore` |
| `evidence` | `0.70` | `+0.50` | `0.55` | `0.18` | `−0.25` | `−0.40` | `notExploitable` |

Weights sum to `1.0`, matching Maze's 10/12/8/70 split
(`scripts.pretty.js:42786-42815`). `pickBucketIndex` is a generic cumulative
draw, so custom bucket sets with non-unit total still normalize correctly.

`buildBucketIndex(buckets)` returns a `Record<string, number>` mapping id to
position; `FIELD_BUCKET_INDEX` is the memoized index for
`SOLEMD_DEFAULT_BUCKETS`. Consumers that render monochromatic burst sweeps
(e.g. `renderer/burst-controller.ts`) read `uBurstType` as the integer id
produced here.

This matters because the stream is not just "random particles in a tube." It
is using authored category families to make lanes feel intentionally
different, and SoleMD extends the same mechanism to drive burst-region color
gating on sphere and model sources.

## Dormant Helper You Should Not Accidentally Promote

The bundle contains a volumetric interior-sampling helper:

- `fillWithPoints()`

It is not used by the live asset pipeline. A 1:1 rebuild should not introduce
voxel/interior filling unless SoleMD intentionally diverges from Maze parity.

## Count-Factor Quirk

`countFactor` is not a clean "multiply by N" contract in Maze.

Observed behavior in the Maze source:

- fractional factors behave stochastically
- integer factors greater than `1` undershoot by one duplicate because of the
  loop condition

Example:

- `cubes` declares `countFactor: 5`
- the live Maze converter emits `4` points per source vertex, not `5`

SoleMD divergence (`FieldGeometry.fromVertices`): integer `countFactor`
values emit the full count (`5` on `countFactor: 5`). Fractional factors
still produce a stochastic trailing loop (`loop === wholeLoops - 1 &&
remainder > 0` → skip when `random() >= remainder`). Recorded as an
intentional fix; if Maze-exact parity is required for a replay, pass
`countFactor - 1`.

## Current SoleMD Translation

The round-12 layout:

- `asset/field-geometry.ts` — `FieldGeometry.sphere / stream / fromTexture /
  fromVertices`. Pure buffer producers, no attribute injection.
- `asset/field-attribute-baker.ts` — `SOLEMD_DEFAULT_BUCKETS`,
  `buildBucketIndex`, `bakeFieldAttributes`.
- `asset/image-point-source.ts` — async `createImagePointGeometry` wrapper
  that decodes URLs / Images / ImageBitmaps into `ImageLikeData` and forwards
  to `FieldGeometry.fromTexture`.
- `asset/model-point-source.ts` — `createModelPointGeometry` walking an
  `Object3D` graph and forwarding concatenated POSITION attributes to
  `FieldGeometry.fromVertices`.
- `asset/point-source-registry.ts` — thin consumer that picks one of the
  source families, runs the baker, and exposes cached typed-array buffers
  to `FieldScene.tsx`.

Why it matters:

- source families, attribute vocabulary, and point counts (blob `16384`,
  stream `15000 / 10000`, bitmap-space PCB layering) match Maze 1:1
- consumers no longer encode generation logic inline; new modules import
  `FieldGeometry` + `bakeFieldAttributes` and hand back cached buffers

## Recommended SoleMD Asset Architecture

Build toward this contract:

```text
AssetRegistry
  ->
PointSourceAdapter
    - procedural sphere            (FieldGeometry.sphere)
    - procedural stream seed       (FieldGeometry.stream)
    - bitmap to points             (FieldGeometry.fromTexture /
                                    createImagePointGeometry)
    - model vertices to points     (FieldGeometry.fromVertices /
                                    createModelPointGeometry)
    - release-scoped graph-derived ambient assets (future)
  ->
SharedAttributeInjector (bakeFieldAttributes)
  ->
Cached BufferGeometry / typed arrays
  ->
Shared particle material family
```

Cache keys should include:

- scene slug
- breakpoint family
- release id where relevant
- optional density profile

## Rules For Future Work

- extend the shared point-source pipeline rather than encoding new source logic
  inside `FieldScene.tsx`
- keep model scenes point-based unless the product target explicitly changes
- keep bitmap and model conversion reusable across landing pages and modules
- prefer stable cached typed arrays over rebuilding buffers on every chapter
- make graph-derived ambient assets another point-source adapter, not a parallel
  renderer
- prefer `channel: 'luma'` for medical imagery and diagrams; only fall back to
  raw channel reads when a specific biomarker is encoded in that channel
- decide explicitly whether SoleMD preserves or cleans up Maze quirks at the
  adapter boundary:
  - bbox anchor points before centering
  - node-transform omission
  - integer `countFactor` undershoot (already diverged — see above)
  - bitmap threshold behavior on transparent assets

## Anti-Patterns

Do not approve implementations that:

- reuse one universal random point field for all scene slugs
- treat stream as a recolored blob
- render `.glb` scene assets as meshes when parity calls for points
- hardcode slug-specific geometry generation inside surface adapters
- bypass the shared attribute injector (skipping `aBucket` silently breaks
  the burst overlay on every consumer)
