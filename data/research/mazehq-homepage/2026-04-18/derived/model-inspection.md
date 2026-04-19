# MazeHQ Homepage Model Inspection

This file converts the archived `.glb` assets under `../models/` into searchable
text so future parity work can retrieve actual mesh metadata without reopening
the binaries by hand.

Source command:

```bash
npx --yes @gltf-transform/cli inspect \
  data/research/mazehq-homepage/2026-04-18/models/<asset>.glb
```

Inspection note:

- `renderVertexCount` is the cost of rendering the asset as triangles
- `uploadVertexCount` is the closer parity value for Maze's point-cloud path,
  because the runtime reads raw `POSITION` accessors and converts those
  vertices into particles instead of rendering the mesh directly
- normals, UVs, materials, and extensions remain useful for provenance, but
  Maze's particle conversion path does not depend on them

## Snapshot Summary

| asset | rootName | bboxMin | bboxMax | uploadVertexCount | renderVertexCount | meshName | attributes | materials | textures | animations |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| `Cubes.glb` | `Cube` | `-1, -1, -4` | `4, 4, 1` | 3,888 | 18,432 | `Cube.001` | `NORMAL`, `POSITION`, `TEXCOORD_0` | `Material.001` | none | none |
| `Net.glb` | `Node_0` | `-7.28696, -7.20751, -7.40821` | `7.32392, 7.20751, 7.40821` | 45,768 | 63,894 | `Mesh_106` | `NORMAL`, `POSITION` | none | none | none |
| `Shield.glb` | `Boolean` | `-0.54005, -0.72058, -0.08349` | `0.48017, 0.71647, 0.10948` | 15,597 | 36,948 | `Boolean` | `NORMAL`, `POSITION` | none | none | none |
| `Users.glb` | `user01_3` | `-1.12603, -0.52474, -1.14537` | `1.64772, 0.75455, 1.16529` | 8,152 | 39,549 | `user01_3` | `NORMAL`, `POSITION` | none | none | none |
| `World.glb` | `world_map_sphere` | `-3.86135, -3.87987, -3.90304` | `3.86135, 3.86964, 3.90265` | 23,446 | 65,664 | `world_map_sphere` | `NORMAL`, `POSITION`, `TEXCOORD_0` | `world_map_sphere` | none | none |

## Per-Asset Details

### `Cubes.glb`

- generator: `Khronos glTF Blender I/O v4.4.56`
- extensionsUsed: `KHR_materials_specular`
- sceneName: `Scene`
- rootName: `Cube`
- bboxMin: `-1, -1, -4`
- bboxMax: `4, 4, 1`
- renderVertexCount: `18,432`
- uploadVertexCount: `3,888`
- uploadNaiveVertexCount: `3,888`
- meshName: `Cube.001`
- mode: `TRIANGLES`
- glPrimitives: `6,144`
- vertices: `3,888`
- indices: `u16`
- attributes: `NORMAL:f32`, `POSITION:f32`, `TEXCOORD_0:f32`
- meshSize: `161.28 KB`
- materials: `Material.001`
- textures: none
- animations: none

Parity interpretation:

- carries material metadata and UVs, but Maze's point conversion only needs the
  `POSITION` accessor
- the wide `x/y` span and deeper negative `z` span make this a good reminder
  that source-space normalization must happen in the adapter, not in asset
  authoring assumptions

### `Net.glb`

- generator: `Khronos glTF Blender I/O v4.4.56`
- extensionsUsed: none
- sceneName: `Scene`
- rootName: `Node_0`
- bboxMin: `-7.28696, -7.20751, -7.40821`
- bboxMax: `7.32392, 7.20751, 7.40821`
- renderVertexCount: `63,894`
- uploadVertexCount: `45,768`
- uploadNaiveVertexCount: `45,768`
- meshName: `Mesh_106`
- mode: `TRIANGLES`
- glPrimitives: `21,298`
- vertices: `45,768`
- indices: `u16`
- attributes: `NORMAL:f32`, `POSITION:f32`
- meshSize: `1.23 MB`
- materials: none
- textures: none
- animations: none

Parity interpretation:

- this is the heaviest uploaded point source in the archived model set
- if we recreate Maze-like model scenes, `45,768` is the relevant raw seed
  count before any runtime jitter, thinning, or selection logic

### `Shield.glb`

- generator: `Khronos glTF Blender I/O v4.4.56`
- extensionsUsed: none
- sceneName: `Scene`
- rootName: `Boolean`
- bboxMin: `-0.54005, -0.72058, -0.08349`
- bboxMax: `0.48017, 0.71647, 0.10948`
- renderVertexCount: `36,948`
- uploadVertexCount: `15,597`
- uploadNaiveVertexCount: `15,597`
- meshName: `Boolean`
- mode: `TRIANGLES`
- glPrimitives: `12,316`
- vertices: `15,597`
- indices: `u16`
- attributes: `NORMAL:f32`, `POSITION:f32`
- meshSize: `448.22 KB`
- materials: none
- textures: none
- animations: none

Parity interpretation:

- very compact bounds compared with `Net.glb` and `World.glb`
- adapter code should treat size normalization as data-driven per asset, not as
  one global scale that assumes all model sources occupy similar coordinate
  ranges

### `Users.glb`

- generator: `Khronos glTF Blender I/O v4.4.56`
- extensionsUsed: none
- sceneName: `Scene`
- rootName: `user01_3`
- bboxMin: `-1.12603, -0.52474, -1.14537`
- bboxMax: `1.64772, 0.75455, 1.16529`
- renderVertexCount: `39,549`
- uploadVertexCount: `8,152`
- uploadNaiveVertexCount: `8,152`
- meshName: `user01_3`
- mode: `TRIANGLES`
- glPrimitives: `13,183`
- vertices: `8,152`
- indices: `u16`
- attributes: `NORMAL:f32`, `POSITION:f32`
- meshSize: `274.75 KB`
- materials: none
- textures: none
- animations: none

Parity interpretation:

- the rendered triangle count is high relative to the uploaded unique vertices,
  which is exactly why `renderVertexCount` would overstate the particle budget
  if we used mesh-render assumptions instead of point-cloud conversion rules

### `World.glb`

- generator: `Khronos glTF Blender I/O v4.4.56`
- extensionsUsed: none
- sceneName: `Scene`
- rootName: `world_map_sphere`
- bboxMin: `-3.86135, -3.87987, -3.90304`
- bboxMax: `3.86135, 3.86964, 3.90265`
- renderVertexCount: `65,664`
- uploadVertexCount: `23,446`
- uploadNaiveVertexCount: `23,446`
- meshName: `world_map_sphere`
- mode: `TRIANGLES`
- glPrimitives: `21,888`
- vertices: `23,446`
- indices: `u16`
- attributes: `NORMAL:f32`, `POSITION:f32`, `TEXCOORD_0:f32`
- meshSize: `881.6 KB`
- materials: `world_map_sphere`
- textures: none
- animations: none

Parity interpretation:

- this asset behaves like a textured mesh source in authoring terms, but Maze
  still treats it as a point reservoir by harvesting raw positions
- `uploadVertexCount: 23,446` is the number to use for any 1:1 point-seed
  parity experiment

## Cross-Asset Findings

- every archived model is a single-scene, single-mesh, static asset
- none of the five models ships with textures or animations
- only `Cubes.glb` and `World.glb` retain material records and `TEXCOORD_0`
- all five use `u16` index buffers in the archived snapshot
- model coordinate ranges vary materially across assets, so normalization and
  centering belong in the point-source adapter layer
- for Maze parity, the main reusable extraction fields are:
  - `rootName`
  - `bboxMin`
  - `bboxMax`
  - `uploadVertexCount`
  - `meshName`
  - `attributes`

## Rebuild Guidance

- use `uploadVertexCount`, not `renderVertexCount`, when sizing point-cloud
  sources from these binaries
- read raw `POSITION` accessors and discard mesh-only concerns unless the scene
  deliberately wants material- or UV-driven sampling later
- keep these derived stats in doc-search so future module work can answer
  questions like `how many points does World.glb contribute` without reopening
  binary assets
