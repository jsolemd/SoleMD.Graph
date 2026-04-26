# Decision - WebGPU-first with WebGL2 compatibility

**Date:** 2026-04-24  
**Amended:** 2026-04-25  
**Owner:** SoleMD engineering  
**Status:** Adopted - M2 is WebGPU/TSL-first with WebGL2 fallback

## Problem

Force-engine and renderer implementation choice. Constraints:

- Resident-LOD budget starts at ~16K desktop and ~8K mobile; it may
  rise on capable WebGPU devices.
- d3-force semantics are required: link springs, anchor, center,
  repulsion, and interaction-specific forces.
- WebGL 2.0 Compute API is not a viable target; transform feedback is
  a dead end for this architecture.
- WebGPU is now the modern web graphics/compute target across major
  browser families, but runtime capability detection remains required.
- `WebGPURenderer` uses TSL/WebGPU authoring patterns; existing raw
  GLSL `ShaderMaterial` chunks are not the primary future path.

## Options considered

1. **CPU main-thread d3-force-3d.** Useful as a conceptual reference
   and small-prototype tool. Not acceptable for resident-scale product
   physics.
2. **WebGL2 GPGPU only** (`GPUComputationRenderer` ping-pong).
   Broad compatibility but not the 2026 primary path.
3. **WebGPU compute only.** Cleanest modern architecture but excludes
   unsupported browsers/devices and makes fallback behavior fragile.
4. **WebGPU-first + WebGL2 compatibility behind one `ForceKernel`**
   *(adopted)*. New code is TSL/WebGPU-first; WebGL2 implements the
   same contract through ping-pong textures.

## Decision

**Option 4.**

- M2 ships the router and both backends needed for production safety:
  WebGPU as preferred path, WebGL2 as compatibility path.
- WebGPU uses TSL/WGSL compute, storage buffers, and compute dispatch.
- WebGL2 uses `GPUComputationRenderer` ping-pong textures. It is not
  allowed to dictate the feature model.
- M7 becomes the WebGPU hardening/optimization and fallback-retirement
  gate, not the first WebGPU port.

Per [17-rendering-stack-evolution.md](../17-rendering-stack-evolution.md)
and [milestones/M7-webgpu-port.md](../milestones/M7-webgpu-port.md).

## Rationale

- **2026-native**: new graphics/compute work targets WebGPU and TSL
  first instead of locking product architecture to older WebGL idioms.
- **Coverage**: WebGL2 fallback keeps unsupported browsers usable.
- **Performance discipline**: no CPU force runtime at resident scale.
- **Clean architecture**: one force model, backend-native kernels,
  shared dispatch and effect vocabulary.

## What this is NOT

- Not a one-line swap from GLSL to TSL.
- Not permission to skip WebGL2 fallback.
- Not a guarantee that every WebGPU device is faster; telemetry and
  runtime capability checks decide.
- Not permission to remove Resident LOD. WebGPU raises ceilings but
  does not make full-corpus live physics the default.

## Sources checked

- three.js `WebGPURenderer` manual: https://threejs.org/manual/en/webgpurenderer
- three.js `GPUComputationRenderer` API: https://threejs.org/docs/pages/GPUComputationRenderer.html
- MDN WebGPU API compatibility note: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

## Invalidation

- Target users lack stable WebGPU despite broad browser support ->
  WebGL2 compatibility remains default and budgets stay conservative.
- three.js WebGPU/TSL APIs change materially -> update renderer and
  kernel plans before implementation continues.
- WebGL2 user share falls below retirement threshold after M7 ->
  remove fallback in a separate cleanup decision.
