---
name: threejs
description: Three.js + R3F + drei + TSL/NodeMaterial canon for SoleMD.Graph. Read before authoring any three.js scene, render loop, shader, postprocessing pipeline, or asset loader. Use when working in features/{orb,field,wiki/module-runtime,animations}/. Make sure to use this skill whenever the user mentions three.js, threejs, r3f, react-three-fiber, drei, WebGLRenderer, WebGPURenderer, NodeMaterial, ShaderMaterial, TSL, Fn(), positionNode, colorNode, instanceIndex, storage(), GLTFLoader, DRACOLoader, KTX2Loader, MeshoptDecoder, EffectComposer, RenderPipeline, OutputPass, OrbitControls, AnimationMixer, dispose, Stats, Spector, Needle Inspector, AdditiveBlending, AgX, KTX2, Basis, InstancedMesh, BatchedMesh, InstancedMesh2, Timer, HDRLoader, ThreeElements, or CanvasProps. Do NOT use for raw WebGPU + WGSL + compute (use /webgpu), SoleMD-specific orb/field particle contracts (use /module), visual styling (use /aesthetic), animation craft (use /animation-authoring), or browser graph runtime (use /cosmograph).
allowed-tools: Read Glob Grep Bash mcp__context7__resolve-library-id mcp__context7__query-docs
paths: "apps/web/features/{orb,field,wiki/module-runtime,animations}/**/*.{ts,tsx,glsl}"
metadata:
  short-description: three.js + R3F + drei + TSL canon
---

# three.js authoring canon

The bottom-of-stack reference for any three.js work in SoleMD.Graph. This skill
is generic three.js + R3F canon. Module-specific runtime contracts (orb particle
runtime, field substrate, scene-manifest integration) stay in `/module`. When
those two skills disagree, `/module` wins for SoleMD-specific decisions; this
skill wins for generic three.js correctness.

## Status (May 2026)

- **three.js stable**: r184 (released 2026-04-16). r185 in flight.
- **Operational ceiling for this project**: r183 (`<0.184`). The
  `pmndrs/postprocessing` v6 line peer-deps three to `<0.184`; v7-beta extends
  the ceiling but is still beta. Do not bump past r184 without first upgrading
  postprocessing.
- **Project pin**: `three >=0.169.0 <1.0.0` in `apps/web/package.json`. Treat
  the operational ceiling above as a stricter constraint.
- **WebGPURenderer**: production-ready since r171 (Sept 2025). WebGL2 fallback
  is automatic via `renderer.init()`.
- **R3F**: v9.5+ stable (project is on v9.5.0). v10 is alpha — don't ship.
- **drei**: v10.7.7+ stable (project pin). v11 alpha exists; ignore.
- **pmndrs/postprocessing**: v6.39.1 stable. v7-beta available.
- **TSL** is the canonical cross-platform shading path. Since r184 it compiles
  to both WGSL (WebGPU) and GLSL ES 3.0 (WebGL2) from the same authoring code.
- **NodeMaterial compatibility layer for WebGLRenderer** landed in r178
  (June 2025). `MeshStandardNodeMaterial` etc. now run on **both** renderers.

## Read order

1. This file — decision rules, when-to-read-what gates.
2. The relevant reference for the surface you're changing (table below).
3. `references/sources.md` if you need to cite or follow upstream canon.

## Reference index

| Surface you're changing | Read first |
|---|---|
| Render loop, rAF, on-demand rendering, dispose, R3F mount/unmount, R3F v9 specifics | `references/render-loop-and-lifecycle.md` |
| Instancing, draw calls, DPR, frustum/LOD, CPU-vs-GPU triage, indirect dispatch | `references/performance.md` |
| BufferGeometry, ShaderMaterial flags, onBeforeCompile, NodeMaterial slots, Points/Sprites, color management, GPU picking | `references/materials-and-shaders.md` |
| EffectComposer, pmndrs/postprocessing, AgX/Neutral/ACES, PMREM/IBL, MSAA/SMAA/TAA, bloom, Float16 rendering | `references/postprocessing-and-fidelity.md` |
| glTF/GLB shipping, Draco vs Meshopt, KTX2/Basis, transcoder wiring, debug extensions, Next.js bundling, loader cancellation | `references/asset-pipeline-and-tooling.md` |
| TSL nodes, `Fn()`, `colorNode`/`positionNode`, `storage().element(instanceIndex)`, compute via three.js, MRT, subgroup ops, RenderPipeline, WebGL→WebGPU migration playbook | `references/webgpu-tsl-bridge.md` |

## Top-of-mind decision rules

These collapse the references' rules into the calls you make most often.

**Renderer init**
```js
new WebGLRenderer({
  antialias: true,
  alpha: false,           // skip unless transparent canvas is a hard requirement
  stencil: false,         // skip unless stencil ops are in use
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // never above 2
renderer.outputColorSpace = THREE.SRGBColorSpace;             // default; do not unset
// Tone mapping is contextual — see rule below.
```

**Tone mapping (contextual, not a single default)**
- **AgX** (`THREE.AgXToneMapping`) for orb/glow/emissive/particle surfaces. Hue
  stability under extreme luminance is exactly what these scenes need.
- **Neutral** (`THREE.NeutralToneMapping`, r166+) for UI-adjacent flat surfaces
  where glow shouldn't shift hue. Best when 3D sits next to chrome.
- **ACES** (`THREE.ACESFilmicToneMapping`) is falling out of fashion. Pick AgX
  or Neutral first; reach for ACES only when matching an existing cinematic
  look that an art director set.

**Choosing a primitive**
- One geometry, ≤ ~10k copies → `InstancedMesh`.
- Multiple geometries, one material → `BatchedMesh`.
- ≥ ~10k particles or per-instance frustum culling required → `three.ez/InstancedMesh2`.
- Pure point cloud, ≥ 50k → `Points` + `PointsMaterial` (or `PointsNodeMaterial` on the WebGPU path).
- ≥ 100k particles with per-frame physics → TSL `instancedArray` + `compute()` + `PointsNodeMaterial` or `SpriteNodeMaterial` (read `webgpu-tsl-bridge.md` and `/webgpu/references/compute-and-gpgpu.md`).

**Render loop**
- One `renderer.render` call site, in one rAF.
- Mostly-static scene → on-demand rendering: render only on `controls.change`, layout commit, hover/select state, `ResizeObserver` tick.
- Continuously animated scene (orb, particle field) → run rAF every frame, but **gate** the render and the heavy compute behind a `dirty` flag and an `IntersectionObserver` on the canvas.
- Cap `dt` at ~0.1 s to absorb tab-blur catch-up; clamp before integrating.
- Drive deltas through a single `THREE.Timer` (`Clock` is deprecated as of r182).

**Materials authoring**
- Default path going forward: `*NodeMaterial` (`MeshStandardNodeMaterial`, `PointsNodeMaterial`, `SpriteNodeMaterial`). TSL compiles to both WebGL2 (GLSL ES 3.0) and WebGPU (WGSL) — same authoring code runs on either backend.
- Since r178, NodeMaterial classes import equally well from `three` (WebGL path) and `three/webgpu` (WebGPU path). The choice between renderers is now driven by feature need (compute, MRT, subgroups) — not by authoring style.
- Reach for `onBeforeCompile` only when extending an existing built-in material in WebGL-only code; always pair with `customProgramCacheKey`.
- Raw `ShaderMaterial`/`RawShaderMaterial` only when both NodeMaterial and chunk injection won't do.

**Color management (post-r152, mandatory)**
- `texture.colorSpace = SRGBColorSpace` for color/albedo/emissive/env.
- Leave normal/roughness/metalness/AO/depth/displacement at default `LinearSRGBColorSpace`.
- HDR/EXR loaded via `HDRLoader` (renamed from `RGBELoader` in r179) is linear → leave default.
- Tone mapping lives on the renderer, on the final `OutputPass`/`ToneMappingEffect`, or on the WebGPU `RenderPipeline`'s `outputColorTransform` — never two of them at once.

**Postprocessing**
- WebGL: one effect → stock `EffectComposer` is fine. Two or more → `pmndrs/postprocessing` (effect merging into one fullscreen pass).
- Always `HalfFloatType` composer target if any HDR effect is in the chain.
- `OutputPass` (or `ToneMappingEffect`) is **last**, always.
- WebGPU: use `RenderPipeline` (renamed from `PostProcessing` in r183). Set `outputColorTransform = true` to auto-apply tone mapping + sRGB conversion in the pipeline; manual tone-mapping-node placement is no longer required.
- For our orb / additive particle fields: AgX tone mapping, SMAA last, **never TAA** (ghosts on motion).

**Dispose hygiene**
- Every `Geometry`, `Material`, `Texture`, `RenderTarget`, and `WebGLRenderer`/`WebGPURenderer` must be disposed on permanent removal.
- React unmount = dispose path; idempotent (StrictMode double-mounts in dev).
- `renderer.info.memory.geometries` and `.textures` must return to baseline across mount/unmount cycles.

**Asset pipeline**
- GLB only. FBX/OBJ are import formats, never shipped.
- Run every GLB through: `dedup → prune → instance → weld → simplify → resample → quantize|meshopt → KTX2 → (draco optional)`.
- Prefer Meshopt over Draco for graph-viz (~5× faster decode, streams, no main-thread block).
- KTX2 textures with UASTC for normal/data, ETC1S for color/albedo. Author mips explicitly.
- Always `ktx2.detectSupport(renderer)`; otherwise transcoder picks RGBA fallback and erases the win.
- Cancel in-flight loads on route transition with `loader.abort()` (r179+).

**Common-mistake checklist (before commit)**
- [ ] No `new THREE.Vector3()` allocations inside `useFrame` / rAF callback (hoist to module scope or refs).
- [ ] DPR capped at 2.
- [ ] `ResizeObserver` (not `window.resize`) drives canvas size.
- [ ] `renderer.info.memory` returns to baseline after unmount.
- [ ] Camera `near`/`far` span ≤ ~10⁴; otherwise z-fighting at midrange (consider reversed depth buffer in r179+).
- [ ] `customProgramCacheKey` set whenever `onBeforeCompile` is used.
- [ ] After moving instanced/particle clusters, `geometry.computeBoundingSphere()` recomputed.
- [ ] Postprocess composer has a final `OutputPass` (or `ToneMappingEffect`).
- [ ] Next.js: `dynamic(import('./Scene'), { ssr: false })` around any `Canvas`.
- [ ] Color textures (albedo/emissive/env, including `TextureLoader().load(...)` results consumed by raw `ShaderMaterial`) get `texture.colorSpace = SRGBColorSpace` explicitly. R3F v9 also removed the v8 auto-conversion of JSX texture props, so the rule is now uniform across imperative and declarative paths.

## SoleMD.Graph-specific bridges

These are the recurring cross-skill wires. Don't restate them; link them.

- Field substrate (homepage / wiki / module surfaces) — `/module`
  references, especially `/module/references/field-runtime-architecture.md`
  (the merged particle-runtime, shader-material, asset-pipeline contracts)
  and `/module/references/mobile-performance-contract.md`. The field
  substrate uses three.js; this skill covers its substrate.
- **Orb runtime (`apps/web/features/orb/`) — raw WebGPU + WGSL today, NOT
  three.js.** Read `/module/references/orb-particle-target.md` for the 1M-
  particle contract (idle-skip, 16 MB writeBuffer gating, hash-random
  sphere seed, 21-bit pick index) and `/webgpu` for any kernel/bind-group
  work. This file's recipes (renderer config, tone mapping, EffectComposer,
  RenderPipeline) do not apply to the orb canvas as currently shipped.
  The TSL migration path is documented in
  `/threejs/references/webgpu-tsl-bridge.md` but the migration has not
  landed.
- Raw WebGPU details (WGSL, compute kernels, buffer/binding model, browser
  reality) — `/webgpu`. TSL is the authoring layer; the platform underneath
  is `/webgpu`'s territory.
- Engineering discipline lens (native solutions, adapter patterns, perf tests) —
  `/clean`. Run after non-trivial three.js changes.

## When to consult upstream

`references/sources.md` lists the canonical upstream authorities for every topic
the references draw from (discoverthreejs.com tips, agargaro/instanced-mesh,
Nik Lever's TSL series, pmndrs/postprocessing, three.js docs, Needle Inspector).
Treat threejsresources.com itself as a curation index — its substantive content
lives at the linked sources.
