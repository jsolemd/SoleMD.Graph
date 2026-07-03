---
name: three.js performance
description: Instancing, draw calls, DPR, frustum/LOD, memory hygiene, profiling triad, and the rules that move the needle on million-particle graph viz
---

# three.js performance

## Instanced rendering (InstancedMesh, InstancedMesh2, BatchedMesh)

**Rule: use `InstancedBufferGeometry` + `InstancedBufferAttribute` for hundreds-to-thousands of similar geometries; reach for InstancedMesh2 (`three.ez`) once you cross into tens of thousands and need per-instance culling.**
- Each draw call has CPU-side overhead; submission is the bottleneck for graph-style scenes. Vanilla `InstancedMesh` collapses N geometries into 1 draw call but renders all instances regardless of camera visibility.
- `InstancedMesh2`: `new InstancedMesh2(geometry, material, { capacity: count })` with `perObjectFrustumCulled: true` (default) — drastically improves performance for complex geometries.
- **`BatchedMesh` per-instance opacity** landed in r182 (`batched.setOpacityAt(i, v)`); **wireframe support** landed in the same release. **`BatchedMesh.optimize()`** repacks the underlying buffers after deletions — call it on a settled scene after batch removals, not on a hot loop.

**Rule: build a dynamic BVH for spatially scattered, mostly-static instance sets.**
- Naive frustum culling is O(N) per frame; BVH makes culling and raycasting near-logarithmic.
- `myInstancedMesh.computeBVH({ margin: 0 })`. Increase `margin` to amortize re-builds when instances drift slightly.
- BVH updates are expensive — only practical for mostly-static scenarios. Don't rebuild every frame.

**Rule: use radix sort for transparent or overdraw-heavy instance sets.**
- Default sorts are O(n log n); radix is O(n) and cheap enough per-frame on hundreds of thousands.
- `mesh.sortObjects = true; mesh.customSort = createRadixSort(mesh);`
- For correct transparent sorting also typically `depthWrite: false`.

**Rule: use per-instance LOD chains (`addLOD`) and a separate Shadow LOD (`addShadowLOD`).**
- `mesh.addLOD(geo_low, mat, distance); mesh.addShadowLOD(geo_shadow, distance);`

**Rule: when you don't carry a per-geometry BVH, set `raycastOnlyFrustum = true`.** Restricts raycasting to currently-visible instances.

**Rule: update individual instance state through dedicated APIs, not whole-buffer re-uploads.**
- `setVisibilityAt(i, bool)`, `setOpacityAt(i, v)`, `instances[i].updateMatrix()` after transform changes.
- `initUniformsPerInstance({...})` + `setUniformAt(i, name, value)` for per-instance shader data.
- Forgetting `updateMatrix()` keeps the GPU at the stale transform.

## Draw call reduction

**Rule: fewer draw calls = better performance.** Merge static geometry, instance repeated geometry, cull occluded objects. Each draw call is CPU overhead; CPU submission saturates before GPU does for graph-style workloads.

**Rule: always use `BufferGeometry`.** Legacy `Geometry` is gone; built-in primitives like `BoxGeometry` *are* `BufferGeometry` now (the old `BoxBufferGeometry` alias was removed).

**Rule: avoid `LineLoop` and `TriangleFanDrawMode`.** `LineLoop` is emulated by line-strip; triangle fans are slow on modern GPUs which prefer indexed triangles or strips.

## Frustum / occlusion / LOD

**Rule: enable per-object frustum culling at the instance level — not just the mesh level — for any scene with thousands of instances.** InstancedMesh2 default `perObjectFrustumCulled: true`.

**Rule: use the `LOD` object for distant geometry; consider only updating distant objects every 2–3 frames; replace far objects with billboards.**

**Rule: keep the camera frustum as small as the scene allows.** Smaller `near`/`far` range = better depth precision and shorter shader execution.

## Materials and shader perf

**Rule: reuse materials. Don't share materials whose features force per-instance compilation** (morph targets, morph normals, skinning). `material.clone()` only when feature flags differ.

**Rule: update uniforms only when they change.** Uniform writes incur GPU sync overhead.

**Rule: prefer `MeshLambertMaterial` over `MeshPhongMaterial` for matte surfaces.** Cheaper lighting; visually equivalent for non-shiny materials.

**Rule: use `alphaTest` instead of `transparent: true` for cutout effects.** `transparent` forces back-to-front sorting and per-pixel blending; `alphaTest` allows early-Z rejection. `material.alphaTest = 0.5; material.transparent = false;`

## Textures and atlasing

**Rule: memory cost depends on dimensions, not file format.** GPU allocation is W×H×bpp regardless of source format. KTX2/Basis is the only way to *reduce GPU memory* (transcoded to native compressed formats).

**Rule: set sRGB encoding only on color, environment, and emissive maps. Leave normal/roughness/metalness/AO maps in linear space.** Color-space gamma conversion on data textures corrupts shader math.

**Rule: create a new texture rather than resizing an existing one.** Resize requires GPU reallocation which is more expensive than a fresh upload.

**Rule: ship glTF with KTX2/Basis textures and Draco / meshopt geometry compression.** Draco/meshopt can drop file size to <10% of original; KTX2 reduces GPU memory (not just bandwidth).

(See `asset-pipeline-and-tooling.md` for the full pipeline.)

## Render-loop discipline

**Rule: on-demand rendering — render only when the camera moves, an animation runs, or a value changes.** Default rAF rendering pegs the GPU at 60 Hz even for static scenes; large battery and thermal cost on mobile. The win is power, fan noise, thermal headroom, and freed CPU/GPU for other tabs — not raw FPS at the 60Hz cap.

**Rule: do as little work as possible inside the render loop. Don't allocate inside it.** GC pauses kill frame timing. Reuse `Vector3`/`Quaternion`/`Matrix4` instances via `.set()` rather than `new`.

**Rule: set `object.matrixAutoUpdate = false` for static objects; call `updateMatrix()` only when transforms actually change.** Skips per-frame matrix recomputation across the entire scene graph.

## Memory management

**Rule: dispose explicitly on permanent removal — geometries, materials, textures, render targets.** GPU resources are not GC'd. (See `render-loop-and-lifecycle.md` for the canonical disposal walker.)

**Rule: prefer `object.visible = false` over remove/re-add when the object will return.** Add/remove churn touches scene graph and matrix world; toggling `.visible` is O(1).

**Rule: use the `Layers` system for bulk visibility groups.** `object.layers.set(N); camera.layers.enable(N);`

## DPR strategy

**Rule: cap `devicePixelRatio` at 2 (sometimes 3) on high-density screens.** A 3× DPR on a 1080p phone is 9× the fragment work for marginal perceived sharpness. **Single biggest mobile lever.**
```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

## WebGL state and context configuration

**Rule: disable unused context features at renderer creation.**
```js
new WebGLRenderer({
  antialias: true,
  alpha: false,                 // skip if no transparent canvas
  stencil: false,               // skip unless using stencil ops
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
});
```
`powerPreference: 'high-performance'` is a hint; the OS/browser picks the actual GPU. Don't depend on it.

**Rule: use built-in MSAA over post-processing FXAA/SMAA where possible.** Built-in MSAA is extremely cheap on modern hardware; post-process AA causes considerable frame-rate drop with lower quality. Caveat: built-in MSAA is incompatible with WebGL1 post-processing; in WebGL2 it can coexist via multisampled render targets. If post-processing is mandatory, combine multiple passes into a single shader.

## Lights and shadows

**Rule: minimize direct lights. Toggle `light.intensity = 0` or `light.visible = false` instead of adding/removing.** Adding/removing a light forces shader recompile across affected materials.

**Rule: don't update shadow maps every frame for static scenes.**
```js
light.shadow.autoUpdate = false;
light.shadow.needsUpdate = true; // after a real change
```

**Rule: make the shadow camera frustum as tight as possible; pick the lowest shadow map resolution that still looks acceptable.** Use `CameraHelper(light.shadow.camera)` to visualize. Point lights render shadows 6× (cube map).

## Scene structure and precision

**Rule: keep the scene centered around the origin.** 32-bit float precision degrades with distance — visible jitter and shadow shimmering at large coordinates. Never translate the `Scene` object itself; it's the frame of reference.

**Rule: offset coplanar surfaces by ~0.001 to avoid Z-fighting.**

**Rule: use SI units (meters, seconds, candela/lumen/lux).** Three.js assumes 1 unit ≈ 1 meter; non-SI units interact poorly with PBR materials and physically correct lighting. For "epic scale" (space sims), use a scaling factor or a logarithmic depth buffer rather than meters.

## Profiling and measurement

**The triad: trust none alone.**
- **Stats.js** — FPS / ms / MB at all times during dev.
- **Spector.js** — per-frame WebGL command lists, draw calls, bound state. The only way to actually see GPU state thrashing — redundant program switches, repeated uniform uploads. WebGL only.
- **three.js DevTools** (mrdoob's Chrome extension) — live render stats: draw calls, triangles, memory, scene graph. Scenes/renderers must explicitly register with the extension.

**Bottleneck triage: CPU vs GPU.** Override scene material with `MeshBasicMaterial`. If frame rate jumps, you are GPU-bound (lighting/shading). If unchanged, you are CPU-bound (draw calls, geometry, JS).
```js
scene.overrideMaterial = new MeshBasicMaterial({ color: 'green' });
```

**Disable v-sync to measure true performance ceiling.** macOS Chrome:
```
open -a "Google Chrome" --args --disable-gpu-vsync
```
60 Hz cap masks real headroom and regressions.

## Caveats and modern API notes

1. `BoxBufferGeometry` was deprecated; `BoxGeometry` *is* the buffer geometry now. Old advice naming the alias is dated; the rule (use buffer geometry, never legacy `Geometry`) stands.
2. `material.skinning` / `morphTargets` flags were removed; renderer auto-detects from the mesh. Skinned/morphed meshes still force a unique shader permutation — don't share materials.
3. `renderer.gammaFactor` / `outputEncoding` removed; use `renderer.outputColorSpace = SRGBColorSpace` (default).
4. `physicallyCorrectLights` renamed; `renderer.useLegacyLights = false` is default in r155+.
5. On-demand rendering vs animated scenes: render-on-demand is for *interactive* viewers. For continuous-motion scenes (orb, particle field), run rAF every frame but *gate the heavy work* behind a `dirty` flag.
6. Built-in MSAA vs post-processing: on WebGL2 with multisampled render targets you can have both. On WebGL1 (older mobile) pick one.

## Graph-viz synthesis (millions of nodes)

For SoleMD.Graph particle/orb workloads:

- **Single rendering primitive: InstancedMesh2 with BVH and radix sort** when staying on WebGL. Vanilla `InstancedMesh` won't scale.
- **Cap DPR at 2.** Single biggest mobile lever.
- **Render-on-demand with a `dirty` flag.** For continuous orb-style motion, render every frame but ensure no JS allocation in the loop.
- **Center the graph at the origin every layout pass.** Float precision pain at million-node scale is real.
- **`alphaTest` for halo/glow sprites; `transparent: true` only for the small set of UI-overlay elements that genuinely need blending.** Sorting cost on transparent instances is what ends frame budgets.
- **Profile with all three (Stats.js, Spector.js, three.js DevTools); disable v-sync when measuring regressions.**

For ≥100k particles with per-frame physics, the right path is **TSL `instancedArray` + `compute()` on WebGPU** — see `webgpu-tsl-bridge.md` and `/webgpu/references/compute-and-gpgpu.md`.

## GPU-driven culling and LOD (r183+)

`IndirectStorageBufferAttribute` (r183) lets you drive draw counts and instance offsets from GPU data, enabling true GPU-driven culling and LOD without a CPU round-trip. Pair it with TSL compute (write the culled-count into the indirect buffer) and `dispatchIndirect`. Feature-gated — check `renderer.hasFeature('indirect-dispatch')` first; older Android Chrome lacks it. Cross-link to `/webgpu/references/buffers-textures-bindings.md` for the buffer layout contract.
