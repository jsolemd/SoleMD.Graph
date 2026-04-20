# Image → Particle Conformation (Maze-HQ Pattern)

How to conform a particle layer to the shape of an input image, bitmap,
or 3D mesh — Maze's own technique, reproduced 1:1 in SoleMD.

This mechanism was removed from the SoleMD landing in Round 14 C9
(landing is now blob-only). The module primitives + controllers + presets
stay in the codebase for future storyboard chapters that need a
content-shaped particle field. Read this doc *before* reintroducing any
image-driven particle layer; do not roll a new subsystem.

## What it is

An ambient-field point layer whose per-particle XYZ buffer is sampled
from a source asset — a PNG, an internal bitmap, or a mesh surface — so
the particle cloud reads as *that asset's silhouette*. Every dark pixel
or surface vertex becomes a particle position; the shader then animates
noise / drift / color on top of those positions. Maze does this in three
different ways across `scripts.pretty.js`:

| Source | Maze example | SoleMD primitive |
|---|---|---|
| PNG / bitmap | PCB grid, logo wall | `createImagePointGeometry` |
| 3D mesh surface | diagrammatic model beats | `createModelPointGeometry` |
| Hand-painted bitmap | PCB trace/pad grid | `paintHorizontal` / `paintVertical` / `paintPad` in `asset/point-source-registry.ts` |

## SoleMD primitives

All three live in `apps/web/features/ambient-field/asset/` and are
re-exported from `@/features/ambient-field`:

1. **`createImagePointGeometry(input, opts)`** — `asset/image-point-source.ts`.
   Samples an image's luminance / alpha at a grid, emitting one particle
   per sample above threshold. Returns a fully baked `FieldGeometry`.
2. **`createModelPointGeometry(opts)`** — `asset/model-point-source.ts`.
   Samples points on the surface of a glTF mesh; each emitted particle
   sits on the mesh.
3. **Bitmap painters** in `asset/point-source-registry.ts`:
   - `paintHorizontal(bitmap, y, fromX, toX, thickness)`
   - `paintVertical(bitmap, x, fromY, toY, thickness)`
   - `paintPad(bitmap, centerX, centerY, radius)`

   Used by `buildPcbBitmap()` / `createPcbSource()` to hand-author a
   trace-and-pad grid before sampling.

## Maze source lines we mirror

- PCB stream-bind timeline (per-section ScrollTrigger):
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43615-43630`
- Stream `uWave` tween (which SoleMD's shader doesn't carry):
  `scripts.pretty.js:43560-43578`
- Per-layer constructor pattern (one controller per section view):
  `scripts.pretty.js:43030-43045` — each section class calls
  `setInitialParameters`, `updateScale`, `animateOut("bottom", true)`,
  and `setTimeout(bindScroll, 1)` for *exactly one* particle system.

## Wiring checklist — add a new image-particle layer to a surface

1. **Author the source asset.**
   - PNG / bitmap: place it under `public/` and reference by URL, or
     compose it inline via the bitmap painters.
   - 3D mesh: place the glTF under `public/models/` and pass its URL to
     `createModelPointGeometry`.

2. **Register the point source** in
   `apps/web/features/ambient-field/asset/point-source-registry.ts`:
   - Add a `create<Id>Source(random)` factory that calls the right
     primitive, bakes attributes via `bakeGeometryAttributes`, and
     returns an `AmbientFieldPointSource`.
   - Wire it into the `buildSource(id, ...)` dispatcher so
     `resolve({ ids: ["<id>"] })` returns it.

3. **Add a preset** in
   `apps/web/features/ambient-field/scene/visual-presets.ts`:
   - New entry in `visualPresets` with the scalar uniforms you need
     (`amplitude`, `frequency`, `size`, funnel fields if it's a stream,
     `colorBase` / `colorNoise`, etc.). Match the relevant Maze `cs.<id>`
     block in `scripts.pretty.js:42412-42543`.

4. **Instantiate the controller** in the surface's `FieldScene`
   composition. The landing surface's `FieldScene.tsx` only builds the
   blob controller; a surface that needs image-particle layers should
   create its own `FieldScene` variant (or wrap the shared one) that
   instantiates the additional controllers alongside the blob's and
   renders matching `AmbientFieldStageLayer`s.

5. **Bind scroll + visibility** on the surface's landing-page analogue:
   - Call `controller.bindScroll(anchor, endAnchor)` with the section's
     DOM anchor. Inside `bindScroll`, build the layer's own
     `gsap.timeline({ scrollTrigger: { trigger, start, end, scrub } })`.
   - Add a supplementary `ScrollTrigger.create({ trigger, onUpdate, ... })`
     in the surface's binder that writes `item.localProgress` +
     `item.visibility` into `sceneStateRef.current.items.<id>`.

## Anti-pattern to avoid

Do **not** invent a general-purpose image→particle system or a pan-
surface sampling helper. Always route new image-derived layers through
the three primitives above. The GPU-side contract (`aMove` / `aSpeed` /
`aRandomness` / `aStreamFreq` / `aFunnel*` / `aBucket` attribute
layout + the single-pair `uColorBase` / `uColorNoise` shader uniforms)
is what keeps SoleMD Maze-faithful. A parallel system drifts from Maze
within one iteration and becomes a maintenance ditch.

## Pointers

- Maze source artifact index: `maze-source-artifact-index.md` (this
  directory)
- Shader + material contract: `maze-shader-material-contract.md`
- Per-layer runtime architecture: `maze-particle-runtime-architecture.md`
- Mobile perf constraints: `maze-mobile-performance-contract.md`
- PCB + model point source inspection: `maze-model-point-source-inspection.md`
