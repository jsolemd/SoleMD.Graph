---
name: webgpu
description: |
  Raw WebGPU, WGSL, and compute canon: adapter/device lifecycle, pipelines, bind
  groups, render passes, compute kernels, WGSL extensions, buffers, textures,
  profiling, and browser reality.

  Triggers: WebGPU, WGSL, GPUDevice, GPUAdapter, GPURenderPipeline,
  GPUComputePipeline, GPUBindGroup, GPUBuffer, GPUTexture, render bundle,
  indirect dispatch, var<storage>, var<workgroup>, atomic, workgroupBarrier,
  subgroups, subgroup_id, uniform_buffer_standard_layout,
  texture_and_sampler_let, linear_indexing, packed_4x8_integer_dot_product,
  override, derivative_uniformity, GPGPU, particle simulation, prefix sum,
  radix sort, ping-pong, spatial hash, Compatibility Mode, mapAsync,
  pushErrorScope, device.lost, timestamp query, WebGPU Inspector.

  Do NOT use for: three.js/TSL (use /threejs), orb or field runtime
  (use /module), styling (use /aesthetic), graph runtime (use /cosmograph).
version: 1.0.0
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
paths: "apps/web/features/orb/webgpu/**"
metadata:
  short-description: Raw WebGPU + WGSL + compute canon
---

# WebGPU authoring canon

The platform-level reference for raw WebGPU. Read `/threejs` if you're authoring
a three.js scene; come here when you need to understand what the renderer is
actually doing, write a custom WGSL shader, design a compute kernel, debug a
validation error, or own a non-three.js WebGPU surface.

## Read order

1. This file — top-of-mind rules + reference index.
2. The relevant reference for the surface you're touching (table below).
3. `references/sources.md` for canonical upstream authorities.

## Reference index

| Surface you're touching | Read first |
|---|---|
| Adapter/device/queue lifecycle, render passes, command encoders, error scopes, lost-device recovery, pipeline async creation, HDR canvas, mapAsync streams | `references/api-fundamentals.md` |
| Render pipeline state, vertex pulling vs vertex buffers, primitive/depth/stencil/blend, reverse-Z, MRT, render bundles, indirect draws, render pass mechanics, pipeline cache, override constants, deferred rendering shape | `references/render-pipelines.md` |
| WGSL language core: types, address spaces, alignment + size, attributes, builtins, control flow + uniformity, textures, atomics, barriers, override constants, pointers | `references/wgsl.md` |
| WGSL extensions reference: every enable + language extension (f16, subgroups, packed_4x8, uniform_buffer_standard_layout, subgroup_id, subgroup_uniformity, texture_and_sampler_let, linear_indexing, immediate_data, …) with version timeline + worked example | `references/wgsl-extensions.md` |
| Buffer usage flags, alignment, storage vs uniform, dynamic offsets, texture formats and capabilities, storage textures, MRT, multisampling, bind group layouts, samplers, indirect-arg strides | `references/buffers-textures-bindings.md` |
| GPUBuffer mental model, writeBuffer/mappedAtCreation/staging-ring upload paths, mapping state machine, sub-allocation, indirect arg layouts, query result buffers, residency, fragmentation, lifetime | `references/buffer-resources.md` |
| Implicit barriers, single-queue ordering, mapAsync vs onSubmittedWorkDone, getCurrentTexture lifetime, frame pacing, triple-buffer readback rings, OffscreenCanvas + Worker, tab visibility, queue resets | `references/synchronization.md` |
| Compute pipeline mental model, dispatch shape and limits, workgroup sizing by hardware, subgroups, LDS/`var<workgroup>`, barriers, atomics and contention, memory access and coalescing | `references/compute-fundamentals.md` |
| Reduction, prefix scan (Hillis-Steele/Blelloch/subgroup hybrid), stream compaction, radix/bitonic sort, spatial hashing, Morton codes, Karras LBVH and Barnes-Hut, persistent threads, append/consume, ping-pong particles, force-directed graph layout, image kernels, ML matmul, indirect-dispatch chains | `references/gpgpu-recipes.md` |
| Pipeline cache, render bundles, indirect draws, state minimization, occupancy, memory access patterns, timestamp queries, memory profiling, RenderDoc/PIX/WebGPU Inspector, bottleneck triage | `references/performance-and-profiling.md` |
| Browser support matrix, feature/limit detection, Compatibility Mode, format/compression matrix, platform quirks, worker integration, fallback architecture, device-lost handling with backoff, telemetry, security | `references/browser-platform-reality.md` |
| End-to-end compute recipes: 1M-particle sim, FFT, GPU-driven culling, GEMM (f16, INT8), vertex pulling, BVH ray traversal, marching cubes, spatial-hash collision | `references/recipes-compute.md` |
| End-to-end graphics recipes: separable + Kawase blur, bloom, depth-of-field, SSAO, cascaded shadow maps, volumetric clouds, AgX tone-map, bilateral filter | `references/recipes-graphics.md` |

## Top-of-mind decision rules

**Boot**
```ts
if (!('gpu' in navigator)) throw new Error('webgpu-unavailable');
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) throw new Error('no-adapter');
const device = await adapter.requestDevice({
  requiredFeatures: probeFeatures(adapter),
  requiredLimits:   probeLimits(adapter),
});
device.lost.then(handleLost);                    // BEFORE first frame
device.addEventListener('uncapturederror', e => telemetry(e));
```
Adapters are single-use (consumed by `requestDevice`). Request a fresh adapter for any retry.

**Pipelines: always async**
```ts
const [renderPipeline, computePipeline] = await Promise.all([
  device.createRenderPipelineAsync(renderDesc),
  device.createComputePipelineAsync(computeDesc),
]);
```
Sync `createRenderPipeline` blocks the GPU process queue at first use. Build at boot, never on first draw.

**Layout: never `auto`**

`layout: 'auto'` is **deprecated for shared pipelines** — it produces incompatible bind groups across pipelines. Always build a named `GPUPipelineLayout` and share it.

**Bind group partition by frequency**
| Group | Frequency |
|---|---|
| 0 | per-frame (camera, time) |
| 1 | per-pass (lights, shadow atlas) |
| 2 | per-material (textures, sampler) |
| 3 | per-draw (model matrix via dynamic offset) |

**Default workgroup size: 64**
`@compute @workgroup_size(64, 1, 1)`. 64 is the only value that's a clean multiple of every common subgroup width (NVIDIA 32, AMD 32/64, Apple 32, Intel 8/16/32). 2D image work: `(8,8)`. 3D volumes: `(4,4,4)`.

**Million-particle data layout**
- SoA storage buffers (separate `pos`, `vel`, `color` arrays), not AoS structs. Coalesced reads = 32–64× over strided.
- `vec3` pads to 16 bytes in storage; pack as `vec4` with `w` for size/age/charge or accept the tax.
- Ping-pong two storage buffers for any kernel that reads neighbors (force layouts, SPH, boids).

**Indirect dispatch**
- Compute writes `(workgroupsX, 1, 1)` into an `INDIRECT` buffer.
- **Never** read and write the indirect buffer in the same command buffer — split into two `submit()` calls or a barrier-separated pass break (gpuweb#2189).
- Enables zero-CPU-roundtrip pipelines for visibility culling, GPU-driven streaming, dynamic particle counts.

**Color management on the canvas**
```ts
ctx.configure({
  device, format: navigator.gpu.getPreferredCanvasFormat(),
  alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
```
- `getPreferredCanvasFormat()` is mandatory; mismatch incurs a swap-chain copy.
- `getCurrentTexture()` is valid only until current task completes — never cache across rAF.
- For HDR: `colorSpace: 'display-p3'`, `toneMapping: { mode: 'extended' }`, or `colorSpace: 'rec2100-hlg'` (Chrome 137+); see `references/api-fundamentals.md`.

**Common-mistake checklist (before commit)**
- [ ] `device.lost` handler wired before first submit, with exponential-backoff retry capped at 2 attempts (Chrome's domain-block threshold).
- [ ] `uncapturederror` event listener on the device.
- [ ] No `await mapAsync` on the render thread (use a 2–3-deep readback ring).
- [ ] No per-frame `createBindGroup` allocations (cache; use dynamic offsets for varying offsets).
- [ ] Storage buffer arrays use `vec4` or 16-byte-padded structs (vec3 trap).
- [ ] `bytesPerRow` aligned to 256 in `writeTexture`/`copyBufferToTexture`.
- [ ] Indirect-arg buffer stride matches: `drawIndirect` 16, `drawIndexedIndirect` 20, `dispatchWorkgroupsIndirect` 12.
- [ ] `textureSample` not used in compute shaders (`textureSampleLevel` instead — no derivatives).
- [ ] `workgroupBarrier()` outside divergent control flow.
- [ ] `loadOp/storeOp: 'discard'` set on transient depth/MSAA targets.
- [ ] Pipeline created via `*PipelineAsync`; awaited at boot, never on first draw.
- [ ] No `subgroups-f16` (deprecated); request `shader-f16` + `subgroups` together.
- [ ] No `compatibilityMode: true` (deprecated); use `featureLevel: 'compatibility'`.
- [ ] WebGPU Inspector for capture (Spector.js does NOT work for WebGPU — WebGL only).

## SoleMD.Graph-specific bridges

- **TSL/NodeMaterial layer over WebGPU** lives in `/threejs/references/webgpu-tsl-bridge.md`. The TSL layer is the right authoring abstraction for our codebase; raw WebGPU is for kernel-level work and debugging what TSL emits.
- **Field/orb/particle module integration** lives in `/module`. Module-specific contracts override generic platform advice when they conflict.
- **Browser graph runtime (Cosmograph)** lives in `/cosmograph`. Stay platform-level here.
- **Engineering discipline** — run `/clean` after non-trivial WebGPU changes.

## Status snapshot (May 2026)

WebGPU ships in stable Chrome/Edge (desktop + Android Vulkan-1.1+), Safari 26 (macOS/iOS/iPadOS/visionOS), Samsung Internet 24+, Firefox stable Windows + macOS Apple Silicon. Firefox Linux/Android target H2 2026. Subgroup ops shipped stable Chrome 134; `subgroup_id` / `num_subgroups` builtins added Chrome 144 via the `subgroup_id` language extension. Safari 26+ also supports core subgroups; Firefox not yet. iOS 18.x requires manual feature flag toggle; iOS 26+ ships on by default. Compatibility Mode (`featureLevel: 'compatibility'`) covers ~15% of Android devices through origin trial Chrome 145. Always feature-detect — see `references/browser-platform-reality.md`.
