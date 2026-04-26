# 17 - Rendering stack evolution (2026 WebGPU-first)

## The evolution

| Phase | Renderer | Force kernel | Notes |
|---|---|---|---|
| **Today (pre-orb)** | three.js `WebGLRenderer` + GLSL `ShaderMaterial` | none (stateless shader noise) | lands mode + persistent canvas already shipping |
| **M2** | three.js `WebGPURenderer` + TSL primary; WebGL2 compatibility path | `ForceKernelRouter` chooses WebGPU compute or WebGL2 ping-pong | orb mode lit up; 2026 path first, compatibility preserved |
| **M7** | WebGPU hardening and optimization | storage-buffer tuning, workgroup sizing, fallback retirement checks | not the first WebGPU port; this is the maturity gate |
| **Post-M7** | WebGPU default where stable, WebGL2 fallback where needed | runtime-selected based on capability and telemetry | fallback removed only after real usage supports it |

## The contract that survives every transition

`ForceKernel` interface from [01-architecture.md](01-architecture.md)
section "Force kernel contract". Inputs and outputs are defined at
the force model boundary. Backends implement that model in their
native idiom:

- WebGPU: three.js WebGPU/TSL compute, storage buffers,
  `StorageBufferAttribute`, storage textures where useful, compute
  dispatch.
- WebGL2: `GPUComputationRenderer`, ping-pong position/velocity
  textures, fragment-pass compute.

Consumers do not know which backend is active.

## 2026 implementation standard

- New orb rendering and physics code is TSL/WebGPU-first.
- WebGL2 exists as compatibility, not as the conceptual source of
  truth.
- Do not add a CPU `d3-force-3d` runtime for resident-scale physics.
  Use d3-force semantics as the math vocabulary and implement the
  integration in GPU kernels.
- Do not use WebGL transform feedback or the removed WebGL 2.0 Compute
  API. They are dead-end paths for this product.
- Do not replace native optimized libraries with local recreations
  unless a measured product requirement requires it.

## WebGPU reality check

As of 2026, WebGPU is supported across major browser families, and
three.js `WebGPURenderer` is the modern target for high-end rendering
and compute. It is still capability-detected at runtime because MDN
does not classify WebGPU as Baseline across all widely used browsers.

Practical implications:

- Always detect `navigator.gpu` and successfully initialize the
  renderer before choosing the WebGPU path.
- Keep a WebGL2 fallback for unsupported browsers, older WebViews, and
  device/driver failures.
- Keep `forceWebGL` test coverage so both paths stay exercised.
- Treat WebGPU as the performance path, not as permission to skip
  resident LOD or low-power profiles.
- Prefer native three.js WebGPU primitives before custom raw WGSL
  wrappers. Drop to hand-authored WGSL only when TSL cannot express a
  measured kernel requirement cleanly.

## WebGL2 compatibility reality check

WebGL2 compute is not a real target. The supported compatibility
pattern is `GPUComputationRenderer` ping-pong:

- Position texture (RGBA16F or RGBA32F).
- Velocity texture.
- Mass/mask/excitation textures as read-only inputs.
- Per-frame compute through fragment shaders into render targets.
- Swap buffers after each step.

This path must stay correct and reasonably fast, but it should not
drive the shape of new orb features.

Documented compatibility floor:

- Desktop WebGL2 target: 10K resident particles, kNN k<=10,
  Tier-0/Tier-1 edges, core/belt/haze formations preserved.
- Mobile WebGL2 target: 4K resident particles, reduced edges, no
  cluster-wide tidal tug.
- If a device cannot preserve focus neighborhoods, selection, picking,
  and score-band formations at that floor, fall back to static orb
  compatibility rather than claiming full parity.

Visual parity is semantic, not trajectory-identical. Verify selected
paper inclusion, orbital band membership, score-band ordering,
nearest-neighbor overlap, and picking. Do not require 30 seconds of
cross-backend force integration to produce the same coordinates.

## TSL port rules

`WebGPURenderer` does not run the existing raw GLSL
`ShaderMaterial`/`RawShaderMaterial` chunks as-is. Orb shaders must
have TSL source for the primary path:

- `gl_PointSize` -> `pointSize`.
- `gl_PointCoord` -> `pointUV`.
- `gl_FragColor` -> output node.
- `discard` -> `discardNode`.
- `texture2D` / `texelFetch` -> TSL `texture` / `textureLoad`.
- JS-level constants and uniforms replace custom string-defined
  preprocessor state when practical.

The GLSL path implements compatibility behavior and uses the same
motion chunks conceptually; it is not the primary authoring surface.

## When can WebGL2 be retired?

Only after telemetry shows all of the following for at least one stable
release cycle:

- WebGPU-capable sessions are at or above the adoption threshold.
- WebGPU p95 frame time is better than or equal to WebGL2 on supported
  devices.
- WebGPU picking accuracy matches WebGL2 within the documented hit
  tolerance.
- Low-power and reduced-motion behavior match.
- The WebGL2 user share is below the retirement threshold.

Until then, WebGL2 remains compatibility coverage.

## External references

- three.js `WebGPURenderer` manual: https://threejs.org/manual/en/webgpurenderer
- three.js `WebGPURenderer` API: https://threejs.org/docs/pages/WebGPURenderer.html
- three.js `GPUComputationRenderer` API: https://threejs.org/docs/pages/GPUComputationRenderer.html
- MDN WebGPU API compatibility note: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

## Decision separability

WebGPU-first is a standards/native-services choice, not a
feature gate. Every user-facing feature still needs a fallback behavior
for non-WebGPU devices:

- Full motion on WebGPU.
- Reduced resident budget or lower particle/edge ceilings on WebGL2.
- Static/marked behavior under reduced-motion or low-power.

## Owns / doesn't own

Owns: stack evolution, 2026 renderer standards, backend separation,
and fallback-retirement criteria.

Doesn't own:
- Force equations -> [03-physics-model.md](03-physics-model.md).
- Renderer component details -> [04-renderer.md](04-renderer.md).
- Per-backend milestone work -> [M2](milestones/M2-orb-renderer-hybrid-physics.md),
  [M7](milestones/M7-webgpu-port.md).
- 2D lens runtime posture -> [13-2d-map-vendor-replacement.md](13-2d-map-vendor-replacement.md).

## Prerequisites

[01-architecture.md](01-architecture.md), [03-physics-model.md](03-physics-model.md), [04-renderer.md](04-renderer.md).

## Consumers

M2 and M7 milestones.

## Invalidation

- WebGPU fails on target user devices despite nominal browser support ->
  WebGL2 remains the production default and resident budgets stay lower.
- three.js changes the WebGPU/TSL authoring model materially -> update
  this file and the M2/M7 milestones before implementation continues.
- A newer web compute standard becomes relevant for this workload ->
  add it as another backend behind `ForceKernel`; do not bypass the
  contract.
