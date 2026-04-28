# 17 - Rendering stack evolution (WebGPU-only field)

## Status

Updated 2026-04-27 after the WebGPU documentation pass, CodeAtlas
doc-search indexing of `/gpuweb/gpuweb`, and the WebGPU-only product
decision for the owned 3D field/orb runtime.

This file describes the target architecture and migration. It does not
claim the current field/orb runtime is already WebGPU-native. Today, the
owned 3D field is still React Three Fiber on three.js `WebGLRenderer`
with GLSL `ShaderMaterial` programs.

## The Evolution

| Phase | Renderer | State / physics | Notes |
|---|---|---|---|
| **Today** | R3F `Canvas` -> three.js `WebGLRenderer`; GLSL `ShaderMaterial` | shader-time motion and `DataTexture` particle state | persistent field canvas is shipping, but the renderer is WebGL/GLSL-first |
| **M7 Phase 0-1** | hard WebGPU gate plus WebGPU runtime boundary | no mounted runtime when unsupported | prove device/adapter creation, device loss handling, and lab render |
| **M7 Phase 2** | WebGPU runtime | storage-buffer particle state | delete the live `DataTexture` mental model before visual parity work |
| **M7 Phase 3** | WebGPU instanced billboards | storage buffers feed particle display | replace WebGL point sprites; do not use sized WebGPU `Points` |
| **M7 Phase 4-5** | WebGPU compute/render pipeline | `SemanticPhysicsKernel` plus compute picking | native GPU data pipeline for physics and interaction |
| **M7 Phase 6-7** | WebGPU-only shipped field/orb runtime | snapshots and cleanup | remove WebGL runtime imports and unsupported fallback assumptions |

## Product Boundary

The owned 3D field/orb runtime is WebGPU-only:

- Unsupported browsers/devices get a controlled unsupported state.
- WebGL2 is not a runtime adapter.
- GLSL is not a product parity path.
- `forceWebGL` is not exposed.
- three.js `WebGPURenderer` must not be allowed to silently choose a
  WebGL2 fallback for this runtime.
- Exactly one runtime owns WebGPU canvas configuration, command
  submission, and presentation for the field canvas.

The 2D graph lens is separate. Cosmograph/cosmos.gl remains a WebGL
dependency until M8 replaces it or the dependency chain ships complete
WebGPU support for rendering, camera, picking, and overlays.

## WebGPU-Only Profiles

WebGPU-only does not mean a single GPU budget. The field runtime may
select `minimal`, `standard`, or `high-density` profiles based on
adapter limits and measured startup probes.

Profiles may reduce resident particle count, LOD density, buffer
allocation size, workgroup shape, snapshot resolution, effect budget,
and update frequency. They must never route to WebGL2.

## The Contract That Survives The Rewrite

The force/physics boundary is backend-neutral at the product level, but
the M7 implementation is WebGPU-only. Consumers describe the semantic
model: resident particles, focus neighborhoods, evidence pulses,
selections, anchors, links, bands, reduced-motion policy, and LOD.

The field runtime implements that model with:

- `FieldGpuRuntime` for adapter/device/queue/canvas ownership.
- A single frame graph that owns command encoding, `getCurrentTexture()`,
  submission, and presentation.
- Storage buffers for live particle state.
- Separate readback/staging buffers for CPU-visible interaction
  results.
- Instanced camera-facing quads/sprites for sized particle rendering.
- `SemanticPhysicsKernel` for compute.
- Compute picking with tiny async readback.
- Canvas snapshot capture after deterministic render work.

React controls inputs, subscriptions, and invalidation. It must not own
kernel state or backend resource lifecycles.

## 2026 Implementation Standard

- New owned field/orb rendering and physics work is WebGPU/WGSL/TSL
  first.
- WebGL2 is not part of the field/orb runtime design.
- Current WebGL/GLSL assumptions must be removed through a WebGPU
  runtime boundary before particle rendering and physics are rebuilt.
- Do not add a CPU `d3-force-3d` runtime for resident-scale physics.
  Use d3-force semantics as the math vocabulary and implement the
  integration in GPU kernels.
- Do not use WebGL transform feedback or the removed WebGL 2.0 Compute
  API.
- Do not describe the whole graph product as WebGPU-native while the 2D
  lens still depends on Cosmograph/cosmos.gl.

## WebGPU Reality Check

WebGPU support is now broad enough to justify a high-performance
WebGPU-only field surface. web.dev reports support across Chrome, Edge,
Firefox, and Safari, while Chrome documents specific version/platform
availability. MDN still marks WebGPU as limited availability / not
Baseline and secure-context only.

Practical implications:

- Detect secure context, `navigator.gpu`, adapter/device creation,
  required limits, device loss, and uncaptured errors before mounting
  the runtime.
- If any gate fails, render an unsupported state instead of mounting a
  WebGL fallback.
- Assert the active backend after startup. A successful
  `WebGPURenderer` initialization is not enough if the renderer could
  have selected WebGL2 internally.
- Keep `requiredFeatures` empty unless a feature is mandatory for the
  baseline field. Optional features must create WebGPU-only optional
  branches, not startup blockers.
- React Three Fiber can use an async `gl` factory for `WebGPURenderer`,
  but the field may use raw WebGPU for particles, compute, picking, and
  readback if that keeps the pipeline clearer.
- R3F/three.js may remain only for non-core helpers after Phase 0 proves
  they do not create a second renderer, second device, second canvas
  context, or ambiguous backend path for the field canvas. If that proof
  is not trivial, the M7 field canvas is raw WebGPU-only.
- Prefer TSL for display/material nodes where it stays clear. Use raw
  WGSL for compute-heavy kernels when it is more direct.
- Keep resident LOD and low-power profiles. WebGPU raises ceilings; it
  does not make full-corpus live physics the default.

## Particle Rendering Rule

Do not port WebGL point sprites directly.

three.js documents that WebGPU point primitives support only 1 px point
size in the `PointsNodeMaterial` path. The field/orb runtime needs
variable particle size, local sprite UV, circular masks, soft edges,
haze, focus rings, pulses, hover/selection styling, and depth fade.

The native display path must use:

- instanced camera-facing quads, or
- instanced sprites through three.js where compatible, or
- a raw WebGPU render pass with one quad per particle instance.

This replaces:

- `gl_PointSize`;
- `gl_PointCoord`;
- `discard`-driven point sprite masking;
- monolithic GLSL display strings.

## Storage-Buffer State Rule

Do not port `DataTexture` particle state into a new texture-shaped
WebGPU abstraction. Live particle state belongs in storage buffers.

Recommended hot state:

- position;
- velocity;
- visual attributes;
- flags;
- ids;
- edges;

Use structure-of-arrays for hot simulation data unless profiling proves
another layout is better.

Readback state is separate from hot particle buffers:

- pick result;
- pick staging;
- selection summary;
- selection summary staging.

Mapped staging buffers must never be bound into render or compute
passes. Host/WGSL layout contracts must test `stride`, `offset`, and
typed-array packing for every storage-buffer declaration.

## Picking And Snapshots

WebGPU readback is async. The field runtime must not depend on sync
`readRenderTargetPixels` behavior.

Picking should be compute-first:

- CPU computes pointer ray or screen-space target.
- GPU scans resident particles or a narrowed candidate set.
- GPU writes one small result buffer.
- JS maps a tiny staging buffer with `mapAsync()`.
- Pointer operation tokens prevent stale async results from overwriting
  newer state.

Rectangle selection should update GPU flags first and read back counts
or compacted ids only when the UI needs CPU-visible data.

Snapshots should render one deterministic frame and capture the canvas.
Snapshot logic must not depend on synchronous GPU readback.
Snapshot capture may use a bounded queue-completion wait only in the
snapshot path, never in hover/click loops.

Initial device-loss behavior is controlled failure plus explicit full
field remount from CPU-side reconstruction seed. Automatic silent
recovery is not part of M7.

## Cosmograph Boundary

Cosmograph/cosmos.gl remains a WebGL engine dependency. Migrating the
owned field runtime to WebGPU does not make the 2D graph lens
WebGPU-native.

The 2D lens becomes WebGPU only if one of these happens:

- Cosmograph and its dependency chain ship production WebGPU support
  that covers rendering, picking, camera, and overlays.
- M8 replaces the vendor runtime with a WebGPU-native stack.

Until then, documentation and telemetry must report the 3D field
backend and the 2D graph backend separately.

## External References

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

## Owns / Doesn't Own

Owns: stack evolution, WebGPU-only field/orb runtime standard, runtime
gate, particle rendering architecture, and WebGPU data-pipeline
requirements.

Doesn't own:

- Force equations -> [03-physics-model.md](03-physics-model.md).
- Superseded GraphOrb prototype details -> [04-renderer.md](04-renderer.md).
- Current native migration plan -> [M7](milestones/M7-webgpu-port.md).
- 2D lens runtime posture -> [13-2d-map-vendor-replacement.md](13-2d-map-vendor-replacement.md).

## Prerequisites

[01-architecture.md](01-architecture.md),
[03-physics-model.md](03-physics-model.md),
[04-renderer.md](04-renderer.md).

## Consumers

M7 WebGPU-only field runtime migration and any future M8 decision on the
2D graph lens.

## Invalidation

- Target users lack stable WebGPU despite broad browser support -> the
  product decision must be revisited; do not quietly add WebGL fallback.
- three.js changes the WebGPU/TSL authoring model materially -> update
  this file and the M7 milestone before implementation continues.
- Cosmograph ships complete WebGPU support -> update the 2D lens
  boundary and remove the M8 replacement assumption.
- A newer web compute standard becomes relevant for this workload ->
  evaluate it as a replacement runtime decision; do not add parallel
  field backends without a product decision.
