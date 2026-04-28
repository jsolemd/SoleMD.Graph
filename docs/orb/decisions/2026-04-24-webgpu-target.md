# Decision - WebGPU-only field/orb runtime

**Date:** 2026-04-24
**Amended:** 2026-04-27
**Owner:** SoleMD engineering
**Status:** Adopted target - current implementation is still WebGL/GLSL-first

## Problem

Force-engine and renderer implementation choice for the owned 3D
field/orb runtime. Constraints:

- Resident-LOD budget starts at ~16K desktop and ~8K mobile; it may
  rise on capable WebGPU devices.
- d3-force semantics are required: link springs, anchor, center,
  repulsion, and interaction-specific forces.
- WebGL 2.0 Compute API is not a viable target; transform feedback is
  a dead end for this architecture.
- WebGPU is now broadly available across major browser families, but
  runtime capability gating remains required and MDN still does not
  classify it as Baseline.
- `WebGPURenderer` uses TSL/WebGPU authoring patterns; existing raw
  GLSL `ShaderMaterial` chunks are not the primary future path.
- WebGPU point primitives are not a direct replacement for WebGL point
  sprites because three.js documents them as 1 px only in the node
  material path.
- The current field/orb runtime still uses R3F `Canvas`,
  `WebGLRenderer`, GLSL `ShaderMaterial`, WebGL render-target picking,
  `DataTexture` particle state, and WebGL-typed snapshot/controller
  surfaces.
- Cosmograph/cosmos.gl remains a separate WebGL dependency for the 2D
  graph lens.

## Options Considered

1. **CPU main-thread d3-force-3d.** Useful as a conceptual reference
   and small-prototype tool. Not acceptable for resident-scale product
   physics.
2. **WebGL2 GPGPU only** (`GPUComputationRenderer` ping-pong).
   Broad compatibility but not the modern target, and it preserves the
   wrong data model.
3. **WebGPU + WebGL2 runtime compatibility.** Lower lockout risk, but
   adds a long-lived adapter surface, keeps GLSL parity pressure, and
   complicates the rewrite.
4. **WebGPU-only field runtime with unsupported-browser state**
   *(adopted)*. The field/orb runtime is rewritten as a native WebGPU
   data pipeline. Unsupported devices do not mount the runtime.

## Decision

**Option 4.**

- The owned 3D field/orb runtime migrates through the M7 WebGPU-only
  plan: hard gate, WebGPU runtime boundary, storage-buffer particle
  state, instanced billboard rendering, WebGPU compute physics, compute
  picking, async snapshots, and WebGL cleanup.
- There is no shipped WebGL2 adapter for field/orb.
- There is no shipped GLSL parity path for field/orb.
- `forceWebGL` is not exposed.
- Startup asserts the active backend is WebGPU, not WebGL2-through-
  `WebGPURenderer`.
- Exactly one runtime owns WebGPU canvas configuration, command
  submission, and presentation for the field canvas.
- R3F/three.js may remain only for non-core helpers after Phase 0 proves
  they do not create a second renderer, second device, second canvas
  context, or ambiguous backend path for the field canvas.
- Initial device-loss behavior is controlled device-lost state plus
  explicit full remount from CPU-side reconstruction seed.
- WebGPU-only profiles may reduce resident count, LOD, buffer size,
  workgroup shape, snapshot resolution, and effect budgets for mobile,
  integrated, and discrete GPU classes.
- three.js may remain useful for camera/scene/simple objects and R3F
  integration, but particles, physics, picking, selection, and readback
  may use raw WebGPU/WGSL behind local runtime contracts.
- The 2D graph lens is not considered WebGPU-native until Cosmograph
  ships complete WebGPU support or M8 replaces that runtime.

Per [17-rendering-stack-evolution.md](../17-rendering-stack-evolution.md)
and [milestones/M7-webgpu-port.md](../milestones/M7-webgpu-port.md).

## Rationale

- **Native data model**: storage buffers, compute passes, and async
  readback match the field's GPU-resident particle workload.
- **Reduced complexity**: one runtime target is cleaner than preserving
  WebGL2 and WebGPU behavior indefinitely.
- **Tiered WebGPU support**: profiles keep capable lower-end WebGPU
  devices usable without reintroducing WebGL fallback.
- **Correct rendering primitive**: instanced billboards replace WebGL
  point sprites instead of forcing a weak WebGPU `Points` port.
- **Performance discipline**: no CPU force runtime at resident scale.
- **Honest product boundary**: unsupported browsers get an explicit
  state instead of a misleading degraded renderer.

## What This Is NOT

- Not a one-line swap from GLSL to TSL.
- Not a direct port of WebGL point sprites to WebGPU `Points`.
- Not permission to remove Resident LOD.
- Not permission to make React own per-frame particle state.
- Not a claim that the current codebase is already WebGPU-native.
- Not a claim that Cosmograph becomes WebGPU because the three.js field
  runtime does.
- Not a hidden WebGL fallback.

## Sources Checked

- W3C GPUWeb repository: https://github.com/gpuweb/gpuweb
- WebGPU specification: https://gpuweb.github.io/gpuweb/
- WGSL specification: https://gpuweb.github.io/gpuweb/wgsl/
- web.dev WebGPU browser support: https://web.dev/blog/webgpu-supported-major-browsers
- Chrome WebGPU overview: https://developer.chrome.com/docs/web-platform/webgpu/overview
- MDN WebGPU API compatibility note: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- MDN `GPUCanvasContext.configure()`: https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure
- MDN `GPUCanvasContext.getCurrentTexture()`: https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/getCurrentTexture
- MDN `GPUAdapter.limits`: https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter/limits
- MDN `GPUAdapter.requestDevice()`: https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter/requestDevice
- MDN `GPUBuffer.mapAsync()`: https://developer.mozilla.org/en-US/docs/Web/API/GPUBuffer/mapAsync
- MDN `GPUDevice.uncapturederror`: https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/uncapturederror_event
- MDN `GPUDevice.lost`: https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost
- MDN `GPUQueue.onSubmittedWorkDone()`: https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/onSubmittedWorkDone
- three.js `WebGPURenderer` manual: https://threejs.org/manual/en/webgpurenderer
- three.js `WebGPURenderer` API: https://threejs.org/docs/pages/WebGPURenderer.html
- three.js `PointsNodeMaterial` API: https://threejs.org/docs/pages/PointsNodeMaterial.html
- three.js TSL API: https://threejs.org/docs/pages/TSL.html
- React Three Fiber `Canvas` WebGPU docs: https://r3f.docs.pmnd.rs/api/canvas#webgpu
- deck.gl WebGPU status: https://deck.gl/docs/developer-guide/webgpu

## Invalidation

- Target users lack stable WebGPU despite broad browser support -> the
  product decision must be revisited; do not quietly add WebGL fallback.
- three.js WebGPU/TSL APIs change materially -> update renderer and
  kernel plans before implementation continues.
- Cosmograph ships complete WebGPU support -> update the 2D lens
  boundary and remove the vendor-replacement assumption.
- WebGPU-only lockout becomes unacceptable for product goals -> write a
  new decision before adding a fallback runtime.
