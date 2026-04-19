# Maze Asset Pipeline

Use this reference when a task touches point-source generation, bitmap sampling,
model conversion, asset loading, or how those sources should become SoleMD
runtime infrastructure.

## Registry Shape

Maze splits source selection from controller behavior:

- source registry / asset loading:
  - procedural generation plus bitmap/model asset URLs
- controller registry:
  - which scene-controller class owns a slug

This split is important:

- geometry sourcing and scene choreography are not the same concern

## Source Families

Maze uses four source families.

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

### 3. Bitmap To Points

Used by:

- `pcb`
- `logo` (present in registry, not active on the live homepage)

Bitmap sampling contract:

- image drawn onto a canvas
- Y is flipped before sampling
- threshold test on the red channel
- grid jitter applied per accepted pixel
- two points emitted per selected pixel per layer
- two extra bounding-box anchor points appended before centering
- geometry centered after conversion

Parity-sensitive defaults in the helper:

- `colorTreshold = 200`
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

Focused model stats live in:

- `references/maze-model-point-source-inspection.md`
- `data/research/mazehq-homepage/2026-04-18/derived/model-inspection.md`

## Shared Attribute Injection

Every generated geometry goes through `jo.addParams(...)`.

That helper injects:

- `aIndex`
- `aAlpha`
- `aSelection`
- `aMove`
- `aSpeed`
- `aRandomness`
- stream-specific attributes

The stream-specific attributes are not pure noise. They are seeded from four
semantic bucket profiles:

- `urgentFix`
- `patchInSLA`
- `ignore`
- `notExploitable`

Those buckets drive:

- alpha ranges
- stream frequency
- funnel thickness
- funnel narrowing
- funnel start shift
- funnel end shift

This matters because the stream is not just “random particles in a tube.” It is
using authored category families to make lanes feel intentionally different.

## Dormant Helper You Should Not Accidentally Promote

The bundle contains a volumetric interior-sampling helper:

- `fillWithPoints()`

It is not used by the live asset pipeline. A 1:1 rebuild should not introduce
voxel/interior filling unless SoleMD intentionally diverges from Maze parity.

## Count-Factor Quirk

`countFactor` is not a clean “multiply by N” contract.

Observed behavior:

- fractional factors behave stochastically
- integer factors greater than `1` undershoot by one duplicate because of the
  loop condition

Example:

- `cubes` declares `countFactor: 5`
- the live converter emits `4` points per source vertex, not `5`

Treat this as a parity-sensitive bug. If SoleMD fixes it, record the fix as an
intentional divergence.

## Current SoleMD Translation

The current repo already contains the right architectural seed:

- `apps/web/features/ambient-field/asset/point-source-registry.ts`

Why it matters:

- it already encodes the correct Maze-style source families
- it already mirrors the shared attribute vocabulary
- it already carries the crucial point counts:
  - blob `16384`
  - stream `15000 / 10000`
  - bitmap-space PCB layering

Current problem:

- the live renderer still does not consume that registry
- `FieldScene.tsx` still renders from synthetic shared buffers

Treat the registry as the future `AssetRegistry` / `PointSourceAdapter` layer,
not as dead exploratory code.

## Recommended SoleMD Asset Architecture

Build toward this contract:

```text
AssetRegistry
  ->
PointSourceAdapter
    - procedural sphere
    - procedural stream seed
    - bitmap to points
    - model vertices to points
    - release-scoped graph-derived ambient assets
  ->
SharedAttributeInjector
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
- decide explicitly whether SoleMD preserves or cleans up Maze quirks at the
  adapter boundary:
  - bbox anchor points before centering
  - node-transform omission
  - integer `countFactor` undershoot
  - bitmap threshold behavior on transparent assets

## Anti-Patterns

Do not approve implementations that:

- reuse one universal random point field for all scene slugs
- treat stream as a recolored blob
- render `.glb` scene assets as meshes when parity calls for points
- hardcode slug-specific geometry generation inside surface adapters
- bypass the shared attribute injector
