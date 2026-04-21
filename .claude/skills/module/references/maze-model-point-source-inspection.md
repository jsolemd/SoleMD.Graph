# Maze Model Point-Source Inspection

Use this reference when a task needs the concrete `.glb` facts behind Maze's
model-backed particle scenes: bounds, uploaded vertex counts, retained
attributes, and which parts of the asset survive the point-cloud conversion.

Companion archive artifact:

- `data/research/mazehq-homepage/2026-04-18/derived/model-inspection.md`

Source ground truth:

- Maze model-to-points converter `jo.fromVertices`:
  `scripts.pretty.js:42723-42745`
- Maze asset registry / loader entry for GLB slugs:
  `scripts.pretty.js:42941-43011`

SoleMD round-12 wrapper:

- `apps/web/features/field/asset/model-point-source.ts`
  (`createModelPointGeometry`)
- underlying buffer producer:
  `apps/web/features/field/asset/field-geometry.ts`
  (`FieldGeometry.fromVertices`)

## Why This Matters

Maze does not render these assets as meshes on the homepage runtime. It reads
their raw `POSITION` accessors, adds jitter, recenters the result, and then
passes the points into the shared particle material family.

For parity, the most important count is therefore `uploadVertexCount`, not
`renderVertexCount`.

SoleMD matches the contract with a thin walker:
`createModelPointGeometry(model, options?)` visits the `Object3D` graph
depth-first, concatenates every `geometry.getAttribute('position').array`
it finds, and hands the combined buffer to `FieldGeometry.fromVertices`.
That routine applies `countFactor` duplication and `positionRandomness`
jitter exactly as Maze does (with one intentional divergence around integer
`countFactor` — see `maze-asset-pipeline.md`).

## Archived Model Summary

| asset | runtime slug | rootName | bboxMin | bboxMax | uploadVertexCount | renderVertexCount | meshName | attributes | material state |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
| `Shield.glb` | `shield` | `Boolean` | `-0.54005, -0.72058, -0.08349` | `0.48017, 0.71647, 0.10948` | 15,597 | 36,948 | `Boolean` | `NORMAL`, `POSITION` | none |
| `Cubes.glb` | `cubes` | `Cube` | `-1, -1, -4` | `4, 4, 1` | 3,888 | 18,432 | `Cube.001` | `NORMAL`, `POSITION`, `TEXCOORD_0` | `Material.001`, `KHR_materials_specular` |
| `Net.glb` | `hex` | `Node_0` | `-7.28696, -7.20751, -7.40821` | `7.32392, 7.20751, 7.40821` | 45,768 | 63,894 | `Mesh_106` | `NORMAL`, `POSITION` | none |
| `World.glb` | `globe` | `world_map_sphere` | `-3.86135, -3.87987, -3.90304` | `3.86135, 3.86964, 3.90265` | 23,446 | 65,664 | `world_map_sphere` | `NORMAL`, `POSITION`, `TEXCOORD_0` | `world_map_sphere` |
| `Users.glb` | `users` | `user01_3` | `-1.12603, -0.52474, -1.14537` | `1.64772, 0.75455, 1.16529` | 8,152 | 39,549 | `user01_3` | `NORMAL`, `POSITION` | none |

## Point-Conversion Implications

- `Net.glb` is the heaviest archived model source at `45,768` uploaded
  vertices. If SoleMD recreates a Maze-like `hex` scene, that is the relevant
  raw point budget before runtime jitter or any intentional downsampling.
- `World.glb` carries mesh authoring features such as a named material and
  `TEXCOORD_0`, but Maze still treats it as a position reservoir. For 1:1
  parity the key number is `uploadVertexCount: 23,446`.
- `Cubes.glb` also keeps UVs and material metadata, plus
  `KHR_materials_specular`, but the particle conversion path only needs
  `POSITION`.
- `Shield.glb` has much tighter bounds than `Net.glb` or `World.glb`. Model
  normalization therefore belongs in the adapter layer, not in assumptions
  baked into one global scale.
- `Users.glb` is a good example of why `renderVertexCount` is the wrong parity
  metric. Its rendered triangle workload is `39,549`, while its uploaded unique
  vertices are only `8,152`.

## Cross-Asset Rules

- every archived model is static: no textures, no animations, one scene, one
  mesh
- all five use `u16` index buffers in the archived snapshot
- only `Cubes.glb` and `World.glb` retain `TEXCOORD_0`
- node-space dimensions vary materially across assets, so recentering and scale
  normalization should happen in the point-source adapter
- parity-sensitive extraction fields are:
  - `rootName`
  - `bboxMin`
  - `bboxMax`
  - `uploadVertexCount`
  - `meshName`
  - `attributes`

## SoleMD Guidance

- keep model-backed ambient scenes in the same point-source family as sphere,
  stream, and bitmap sources
- size model-derived point clouds from `uploadVertexCount`
- treat normals, UVs, and materials as optional future divergence hooks rather
  than part of the baseline Maze parity contract
- call `createModelPointGeometry(model, { countFactor, positionRandomness })`
  from `asset/model-point-source.ts`; then `bakeFieldAttributes` on the
  returned geometry so every model point receives the same motion + funnel +
  `aBucket` vocabulary as procedural and bitmap points
- when importing GLTFs through the standard three.js loader, the returned
  `THREE.Group` satisfies the `Object3DLike` structural type
  (`children`, `geometry.getAttribute('position')`) — do not pre-flatten
  the hierarchy
