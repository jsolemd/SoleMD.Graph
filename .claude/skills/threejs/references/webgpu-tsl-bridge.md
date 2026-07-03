---
name: three.js WebGPU + TSL bridge
description: WebGPURenderer, NodeMaterial, TSL nodes/Fn/Loop/If/Switch/toVar, compute via three.js, MRT, subgroup ops, vertex pulling, RenderPipeline, WebGL→WebGPU migration playbook. The three.js side of the WebGPU bridge — for raw WebGPU/WGSL/compute fundamentals, read /webgpu.
---

# WebGPU + TSL bridge (three.js side)

For the platform underneath — raw WebGPU API, WGSL language, buffer/binding model,
compute fundamentals, browser reality, profiling — read `/webgpu`. This file covers
the three.js authoring layer that compiles to that platform.

## Status (May 2026)

WebGPU is a fully-supported codepath; **WebGLRenderer is no longer feature-frozen**
for new node features. As of r178 (June 2025), three.js ships a NodeMaterial
**compatibility layer for WebGLRenderer** — `MeshBasicNodeMaterial`,
`MeshStandardNodeMaterial`, `PointsNodeMaterial`, etc. now run on **both**
renderers. The choice between WebGL and WebGPU is now driven by feature need
(compute, MRT, subgroups, indirect dispatch) — not by authoring style.

```js
import { WebGPURenderer } from 'three/webgpu';
import { WebGPU } from 'three/addons/capabilities/WebGPU.js';
```

There are now **three import roots**, not two:

- `three` — the WebGL build, plus the NodeMaterial compatibility layer (since r178).
- `three/webgpu` — `WebGPURenderer`, `RenderPipeline`, the WebGPU-specific surface.
- `three/tsl` — TSL primitives (`Fn`, `If`, `Loop`, `uniform`, `storage`, ...).
- Plus `three/addons/tsl/display/*` — postprocessing pass functions
  (`bloom()`, `gaussianBlur()`, `fxaa()`, `dof()`, `ao()`, `motionBlur()`).

`MeshBasicNodeMaterial` and `MeshStandardNodeMaterial` import equally well from
`three` (WebGL path) or `three/webgpu` (WebGPU path). Mixing import roots used to
silently drop nodes; that's a less acute footgun now that the WebGL build owns
the compatibility layer, but staying within one root per file is still the safe
discipline.

## Async init is mandatory (WebGPU)

```js
const renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
await renderer.init();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(width, height);
```

For a graph-viz app where the shell may render placeholder UI before the runtime is ready, gate scene attachment behind awaited `init()` and treat the renderer as a deferred resource.

`compileAsync()` is now truly non-blocking as of r184 — use it to pre-warm
material programs without stalling the render thread.

## Fallback to WebGL

Two mechanisms:
1. **Constructor opt-in:** `new WebGPURenderer({ forceWebGL: true })` — useful for A/B comparison or when a known driver bug is in play.
2. **Capability gate:** check `WebGPU.isAvailable()` at boot; either call `init()` (which itself attempts a WebGL2 fallback) or branch to a separate `WebGLRenderer`.

**The central reason TSL is the right authoring layer:** TSL/NodeMaterial work on both renderers. Since r184 TSL compiles to WGSL on the WebGPU path and to GLSL ES 3.0 on the WebGL2 path. You write the material once and the same node graph runs on either backend.

## When to actually adopt WebGPU

Adopt now if any of:
- You need compute shaders (no equivalent in WebGL).
- You need >1M instances and per-frame CPU is being burned in JS attribute updates.
- You want MRT-based G-buffer-style postprocessing without the EffectComposer ping-pong tax.
- You want subgroup ops (`subgroupBallot`, `subgroupAdd`, `subgroupMin`, ...).
- You need indirect dispatch (GPU-driven culling/LOD via `IndirectStorageBufferAttribute`).

Stay on WebGL only when you have a hard requirement for WebGL-only browsers/embedded webviews. TSL gives you cross-backend authoring regardless.

## TSL imports

```js
import {
  Fn, If, Loop, Switch, Case, select, Break, Continue,
  uniform, attribute, varying, vertexStage, toVar, Const,
  storage, instancedArray, texture, textureLoad, textureStore,
  vec2, vec3, vec4, float, int, color,
  positionGeometry, positionLocal, normalLocal, uv, instanceIndex,
  time, deltaTime,
  mix, smoothstep, length, normalize, dot, cross,
  mrt, output, normalView, emissive, depth,
} from 'three/tsl';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
// Note: as of r178 you can also import the *NodeMaterial classes from 'three' directly
// for the WebGL path. Keep imports consistent within a file.
```

## Node materials and slots

`NodeMaterial` exposes named slots:

| Slot | Meaning |
|---|---|
| `colorNode` | base color (replaces diffuse) |
| `positionNode` | overrides `positionLocal` for vertex placement |
| `normalNode` | overrides shading normal |
| `emissiveNode`, `roughnessNode`, `metalnessNode` | PBR inputs |
| `opacityNode`, `alphaTestNode` | transparency |
| `fragmentNode` | replaces the **entire** fragment stage (escape hatch — discards lighting) |
| `vertexNode` | replaces the **entire** vertex stage |
| `outputNode` | post-shading transform of final color |
| `mrtNode` | MRT outputs for postprocessing |
| `sizeNode` | per-particle size for `PointsNodeMaterial` |

Setting `fragmentNode` discards lighting; reach for it only when you need full control. Otherwise drive `colorNode`, `roughnessNode`, etc., and let the lighting model run.

**Material types**: `MeshStandardMaterial` → `MeshStandardNodeMaterial`, `PointsMaterial` → `PointsNodeMaterial`, `SpriteMaterial` → `SpriteNodeMaterial`, `MeshBasicMaterial` → `MeshBasicNodeMaterial`.

## Node taxonomy (load-bearing names)

- Position: `positionGeometry`, `positionLocal`, `positionWorld`, `positionView`.
- Normal: `normalGeometry`, `normalLocal`, `normalWorld` (use this for lighting), `normalView`.
- UV: `uv()` primary, `uv(1)` secondary set.
- Per-vertex/instance: `vertexColor`, `vertexIndex`, `instanceIndex`.
- Camera: `cameraPosition`, `cameraNear`, `cameraFar`, `cameraViewMatrix`, `cameraProjectionMatrix`.
- Screen-space: `screenUV`, `screenCoordinate`, `screenSize`, `depth`.

## Slot assignment, not string injection

```js
material.colorNode = texture(map, uv()).mul(myUniform);
material.positionNode = positions.element(instanceIndex); // for compute-driven points
material.emissiveNode = fresnel().mul(color(0x00ffff));
material.sizeNode = float(3.0);
material.needsUpdate = true; // required after swapping a *Node
```

## `Fn` — the function primitive

```js
const spherize = Fn(([pos, normalIn, radius, delta]) => {
  const sphereN  = pos.normalize();
  const spherePos = sphereN.mul(radius);
  return {
    position: mix(pos, spherePos, delta),
    normal:   mix(normalIn, sphereN, delta),
  };
});
```

Two senior rules:
1. Use `Fn` for any expression that appears more than once or is logically a unit. The node graph deduplicates, but `Fn` makes it readable and forces a single stack frame.
2. Use `toVar()` on intermediate vector results referenced multiple times. Without it, TSL inlines and the WGSL/GLSL output recomputes the expression — measurable perf cost.

## Conditionals and loops

- **`select(cond, a, b)`** — branchless, like GLSL `mix` for booleans, use in hot paths.
- **`If(cond, fn).ElseIf(cond2, fn2).Else(fn3)`** — generates real branches; use when the false branch is expensive.
- **`Switch(value).Case(0, fn0).Case(1, fn1).Default(fnD)`** — recent TSL addition. No fallthrough. Refactor multi-case logic into `If/ElseIf` if you need shared bodies.

```js
Loop({ start: int(0), end: numBoids, type: 'int' }, ({ i }) => {
  const other = positionStorage.element(i);
  const offset = other.sub(myPos);
  const dist = length(offset);
  If(dist.lessThan(neighbourDistance).and(dist.greaterThan(0)), () => {
    sep.subAssign(offset.div(dist.mul(dist)));
    count.addAssign(1);
  });
});
```

`Loop` accepts plain count, struct config, or nested `Loop(M, N, ({i, j}) => ...)`. `Break()` and `Continue()` are available.

**Compile speed**: r184 brings a ~3× speedup in the TSL→WGSL/GLSL compiler. You should not see multi-second compile pauses on warm reload anymore; if you do, profile the subgraph for redundant `Fn` invocations.

## Uniforms

```js
const intensity = uniform(0.5);
material.colorNode = baseColor.mul(intensity);
intensity.value = 0.8; // updates immediately
```

## Vertex pulling pattern (graph-viz relevant)

The pattern that scales to millions of nodes/edges without per-frame `BufferAttribute.needsUpdate = true`:

```js
// Storage buffer holds positions, written by compute or seeded once.
const positionStorage = storage(new BufferAttribute(positionsArray, 4), 'vec4', N);

const material = new MeshBasicNodeMaterial();
material.positionNode = Fn(() => {
  const p = positionStorage.element(instanceIndex);
  return positionGeometry.add(p.xyz);
})();
```

The position never round-trips through the JS heap. CPU work scales with topology mutations, not with frame count.

## Compute shaders via three.js

Compute is the headline reason to adopt WebGPU. The TSL pattern: a compute shader is `Fn(...)().compute(count)`.

### Minimum compute kernel

```js
import { Fn, instanceIndex, storage, vec3 } from 'three/tsl';

const positions = storage(new BufferAttribute(new Float32Array(N*4), 4), 'vec4', N);

const updatePositions = Fn(() => {
  const i = instanceIndex;
  const p = positions.element(i);
  p.xyz.assign(p.xyz.add(vec3(0, 0.01, 0)));
})().compute(N);          // dispatches ceil(N/64) workgroups by default

// in render loop:
await renderer.computeAsync(updatePositions);
renderer.render(scene, camera);
```

`compute(count, workgroupSize=[64])` dispatches enough workgroups to cover `count`. For 2D/3D dispatches use `workgroupId`, `localId`, `globalId`, `numWorkgroups`.

### Multi-buffer simulation (boids / force-directed graph layout)

```js
const positionStorage = storage(posAttr, 'vec3', N);
const velocityStorage = storage(velAttr, 'vec3', N);

const stepLayout = Fn(() => {
  const i = instanceIndex;
  const myPos = positionStorage.element(i).toVar();
  const myVel = velocityStorage.element(i).toVar();
  const force = vec3(0).toVar();

  Loop({ start: int(0), end: int(N), type: 'int' }, ({ j }) => {
    If(j.equal(i), () => Continue());
    const other = positionStorage.element(j);
    const d = other.sub(myPos);
    const dist2 = max(dot(d, d), float(0.0001));
    force.subAssign(d.div(dist2));   // repulsion
  });

  myVel.assign(myVel.add(force.mul(deltaTime)).mul(0.95)); // damping
  myPos.assign(myPos.add(myVel.mul(deltaTime)));
  positionStorage.element(i).assign(myPos);
  velocityStorage.element(i).assign(myVel);
})().compute(N);
```

Realistic ceiling: O(N²) brute force is fine up to ~5–10k nodes; beyond that you need spatial hashing (also possible in TSL — use storage buffers for cell heads/links). See `/webgpu/references/compute-and-gpgpu.md` for the spatial-hash and Barnes-Hut patterns at million-node scale.

### Vertex animation baking

Pattern transferable to graph-viz "morphing layouts": pre-compute every animation frame's vertex offsets into a Float32Array packed as `frame * vertexCount + vertexID`, upload once as a storage texture, sample with two reads + interpolation:

```js
material.positionNode = Fn(() => {
  const frame = time.mul(fps).floor();
  const next  = frame.add(1).mod(numFrames);
  const t     = time.mul(fps).fract();
  const a = textureLoad(animTex, ivec2(vertexIndex, frame));
  const b = textureLoad(animTex, ivec2(vertexIndex, next));
  return mix(a.xyz, b.xyz, t);
})();
```

Per-instance phase falls out for free if you offset `time` by `instanceIndex * phase`.

## Subgroup ops via TSL

Until r178 the rule was "drop to ShaderMaterial for subgroup ops". That's wrong now. TSL exposes the canonical subgroup primitives:

- `subgroupBallot`, `subgroupAdd`, `subgroupMin`, `subgroupMax`, `subgroupShuffle`.

Reach for the TSL path first. Drop to raw WGSL only when TSL doesn't yet expose the specific op you need. See `/webgpu/references/wgsl.md` for subgroup feature gating, and check `renderer.hasFeature('subgroups')` before depending on them — not all targets advertise the feature.

## MRT (multiple render targets) via TSL

MRT is first-class on WebGPU. Bind multiple render targets to TSL slots in a single forward pass — basis for cheap deferred-style postprocessing without ping-pong:

```js
import { mrt, output, normalView, emissive, depth, pass } from 'three/tsl';

const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({
  output,                  // base color
  normal: normalView,      // view-space normals
  emissive,                // emissive contribution
  // depth is implicit on the pass; access via scenePass.getDepthNode()
}));

// downstream effects can sample any slot:
const ao = scenePass.getTextureNode('normal').xyz;        // read normals
const bloomSrc = scenePass.getTextureNode('emissive');    // read emissive only
```

Each render-target slot binds to a TSL node by name. This collapses what would have been three forward passes (color, normal, emissive) into one — the MRT-aware equivalent of pmndrs/postprocessing's effect merging.

## GPU picking via TSL

Render an ID-encoded pass to an offscreen target, read back the pixel at the cursor. The orb's `orb-webgpu-picking.ts` uses this pattern at million-particle scale:

- Encode 21-bit pick index into RGB channels (matches the orb runtime; supports 2M particles inside one canvas).
- Render with a `MeshBasicNodeMaterial` whose `colorNode` is the encoded ID.
- Read back via `readbackBuffer` (r184 surface) or `mapAsync`.

Cross-link to `/webgpu/references/buffers-textures-bindings.md` for buffer mapping patterns and to `materials-and-shaders.md` (sibling reference in this skill) for the encoding contract.

## Migration playbook (WebGL → WebGPU)

A concrete order that works in production:

1. **Swap the renderer behind a flag.** `WebGPURenderer` from `three/webgpu`, `await renderer.init()`. Keep the WebGL2 path constructed lazily for fallback. Do **not** delete it until perf parity is proven on three target browsers.
2. **Replace `MeshStandardMaterial` etc. with `*NodeMaterial` equivalents.** API surface is identical for `.color`, `.map`, `.roughness`, `.metalness`. No shader rewrite required. Since r178 the same NodeMaterial classes work under WebGLRenderer too — you can do this step on the WebGL path first and decouple it from the renderer flip.
3. **Convert `onBeforeCompile` injections to `colorNode` / `positionNode` slots.** Highest-leverage migration. `onBeforeCompile` was always a hack; `NodeMaterial` slots are the supported equivalent and round-trip across WebGL/WebGPU automatically.
4. **Keep raw `ShaderMaterial` only for hand-tuned legacy.** Anything new should be `NodeMaterial`. `ShaderMaterial` does not interop with the node graph or postprocessing pass nodes.
5. **Move CPU-loop simulations to compute.** Force layouts, cluster transitions, particle motion. Win is twofold: zero CPU per frame, and the position buffer is already on-GPU so vertex pulling avoids `bufferData` calls.
6. **Switch instancing to vertex pulling.** Custom `instanceID` attribute + `storage().element(instanceIndex)` is more flexible than `InstancedMesh` and integrates cleanly with compute output.
7. **Replace EffectComposer with the new `RenderPipeline` class.** `RenderPipeline` (renamed from `PostProcessing` in r183) lives in `three/webgpu`. Pass nodes (`bloom()`, `gaussianBlur()`, `fxaa()`, `dof()`, `ao()`, `motionBlur()` — all from `three/addons/tsl/display/*`) compose as a node graph against `pass(scene, camera)`. `outputColorTransform = true` (default) auto-applies tone mapping + sRGB conversion in the pipeline; manual placement of a tone-mapping node is no longer required. Use `mrt({...})` to write multiple G-buffer outputs in a single forward pass.
8. **Decide your TSL authoring style.** Hand-write TSL, use `tsl-uniform-ui-vite-plugin` for auto GUI of uniforms, or use `TSL Graph` (visual node editor) for designer collaboration.

## Gotchas (three.js-side)

- **Three import roots.** `three` (WebGL + NodeMaterial compat layer), `three/webgpu` (renderer + RenderPipeline), `three/tsl` (node primitives), `three/addons/tsl/display/*` (postprocessing pass functions). Stay within one root per file.
- **Async everything.** `init()`, `computeAsync()`, `renderAsync()`, `compileAsync()` all async. Mixing sync and async in one frame is a Safari footgun — Safari is stricter about command queue ordering.
- **`fragmentNode` discards lighting.** If you assign it, you lose `MeshStandardNodeMaterial`'s PBR pipeline. For most graph viz this is fine (flat-shaded points/lines), but for nodes that should respond to scene lights, drive `colorNode` instead.
- **`toVar()` matters.** Without it, repeated subexpressions are re-emitted. For 1M-particle workloads this is not theoretical.
- **`Switch` has no fallthrough.** Refactor multi-case logic into `If/ElseIf` if you need shared bodies.
- **Loops with dynamic bounds compile differently per backend.** WGSL handles dynamic loop counts natively; GLSL ES 3.0 (WebGL2 fallback) may unroll or refuse. Test both backends if you depend on dynamic `Loop` bounds.
- **`indirect-dispatch` is feature-gated.** `renderer.hasFeature('indirect-dispatch')` before assuming `compute().setIndirectBuffer(...)` is available. Older Android Chrome lacks it.
- **Subgroups are feature-gated too.** Check `renderer.hasFeature('subgroups')` before using TSL subgroup ops.
- **`RenderPipeline` `outputColorTransform`.** Defaults to `true` and auto-applies tone mapping + sRGB conversion. Set `false` only if you're applying a tone-mapping node yourself; double-application clips highlights.
- **Debug tooling.** No source maps to your JS. Strategies: `console.log(material.fragmentNode.toString())` to see generated WGSL/GLSL; wrap suspect subgraphs in `toVar('debugX')` and inspect via a screen-space probe pass; use `TSL Graph` for visual inspection. Needle Inspector also surfaces the live node graph for WebGPU scenes.

For raw-WebGPU debug tools (RenderDoc, PIX, WebGPU Inspector, timestamp queries), see `/webgpu/references/performance-and-profiling.md`.

## Graph-viz target (1M particles)

Keep positions in a `storage()` vec4 buffer (xyz + size or charge in w), compute layout with a fixed-step kernel dispatched at 60 Hz, render with `MeshBasicNodeMaterial` + vertex pulling using `instanceIndex`. Avoid `InstancedMesh` — its matrix path is heavier than direct positional pulling. For edges, use the same pattern with a separate index buffer (`uvec2` per edge) and a line shader; `indirect-dispatch` lets you change the live edge count from a compute kernel without a JS round-trip. With `IndirectStorageBufferAttribute` (r183+) the same trick applies to instanced/batched meshes — drive draw counts from a compute shader.
