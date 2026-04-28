# M7 - WebGPU-only field runtime rewrite

## Status

Updated 2026-04-27 after the WebGPU-only product decision, after
indexing the W3C GPUWeb repository in CodeAtlas doc-search as
`/gpuweb/gpuweb`, and after the first `/graph` WebGPU implementation
slice landed.

This milestone replaces the previous staged WebGL2/WebGPU compatibility
migration. The field/orb runtime target is now a WebGPU-only rewrite.
Unsupported browsers and devices receive an explicit unsupported state;
they do not receive a degraded WebGL2 field runtime.

The first implementation slice is active on `/graph`:

- `OrbSurface` mounts `OrbWebGpuCanvas`, a raw WebGPU-owned canvas for
  the orb particle core.
- The WebGPU gate rejects unsupported browsers/devices instead of
  falling back to WebGL2.
- Paper chunks stream from DuckDB into WebGPU storage-buffer arrays.
- Particle display uses instanced billboards, not sized WebGPU points.
- Hover, click, and rectangle selection use async compute readback.
- Staging/readback buffers are separate from hot particle buffers.
- The old orb-specific WebGL picker, R3F camera controls, snapshot
  bridge, and DataTexture mutation subscribers have been removed from
  the `/graph` orb path.
- Cosmograph/cosmos.gl remains a separate WebGL dependency for the 2D
  graph lens.

M7 is still not "done": the first slice proves the native GPU data path,
while richer semantic physics, snapshots, layout tests, and device QA
remain acceptance work.

## Product Decision

The shipped field/orb runtime is WebGPU-only:

- Do not ship a WebGL2 adapter.
- Do not keep GLSL parity as a product path.
- Do not allow `WebGPURenderer` to silently choose WebGL2 fallback.
- Do not expose `forceWebGL`.
- Do keep a hard WebGPU capability gate and controlled unsupported
  browser/device state.
- Do keep historical WebGL screenshots only as visual references, not
  as runtime parity targets.

The 2D graph lens is separate. Cosmograph/cosmos.gl remains WebGL until
M8 replaces it or the dependency chain ships complete WebGPU support for
rendering, camera, picking, and overlays.

## WebGPU-Only Profiles

WebGPU-only does not imply one hardware budget. The field may select
WebGPU-only profiles such as `minimal`, `standard`, and `high-density`
based on adapter limits and measured startup probes.

Profiles may reduce:

- resident particle count;
- LOD density;
- storage-buffer allocation size;
- workgroup size and dispatch shape;
- snapshot resolution;
- effect budget and update frequency.

Profiles must never route to WebGL2.

## Documentation Findings

- web.dev reports WebGPU support across Chrome, Edge, Firefox, and
  Safari with platform/version caveats. Chrome's overview documents
  Chrome 113 desktop support, Chrome 121 Android support on Android 12+
  Qualcomm/ARM devices, Firefox 141 on Windows, and Safari 26.
- MDN still marks WebGPU as limited availability / not Baseline and
  secure-context only. A hard gate is still required.
- React Three Fiber supports an async `Canvas.gl` factory for
  `WebGPURenderer`.
- three.js `WebGPURenderer` does not support existing custom
  `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile` paths.
- three.js `PointsNodeMaterial` documents that WebGPU point primitives
  are 1 px only. Sized particles must use instanced sprites/quads, not a
  direct WebGPU `Points` port.
- TSL supports compute nodes and storage-buffer-oriented primitives, but
  raw WGSL is allowed for kernels where TSL obscures force integration,
  compaction, picking, or debug labels.
- WebGPU validation/errors and CPU readback are async. Interaction
  results must use operation tokens and tiny staging buffers.
- MDN notes `GPUQueue.onSubmittedWorkDone()` is useful for throttling
  heavy work, but buffer `mapAsync()` is the normal readback primitive.
- MDN notes adapter limits can be tiered rather than exact and that
  unsupported required limits or required features reject device
  creation. Startup should choose a profile, not over-gate devices with
  one oversized budget.
- WGSL storage buffers must satisfy address-space layout constraints.
  Host-side typed-array packing and WGSL declarations need explicit
  stride/offset tests.

## Legacy WebGL Assumptions Already Removed From `/graph` Orb

- `apps/web/app/(dashboard)/DashboardClientShell.tsx`
  - `/graph` 3D no longer routes through the landing `FieldCanvas`.
- `apps/web/features/orb/webgpu/OrbWebGpuCanvas.tsx`
  - Owns the orb canvas/device/runtime boundary.
- `apps/web/features/orb/webgpu/orb-webgpu-runtime.ts`
  - Replaces render-target color picking with compute picking and tiny
    async readback.
- `apps/web/features/orb/webgpu/orb-webgpu-particles.ts`
  - Replaces orb live `DataTexture` mutation with storage-buffer
    packing.
- Deleted orb-path WebGL files:
  - `apps/web/features/field/renderer/field-picking.ts`
  - `apps/web/features/field/renderer/field-picking-material.ts`
  - `apps/web/features/orb/capture/OrbSnapshotBridge.tsx`
  - `apps/web/features/orb/camera/OrbCameraControls.tsx`
  - `apps/web/features/orb/bake/apply-paper-overrides.ts`

The landing field still uses its historical R3F/WebGL code. That code is
outside the `/graph` WebGPU orb runtime and should not be confused with
the owned 3D orb product path.

## Phase 0 - Hard WebGPU Gate And Lab

Estimate: 2-5 days.

Build a capability gate before mounting the field runtime:

- secure context;
- `navigator.gpu`;
- `requestAdapter({ powerPreference })`;
- adapter limits required by resident particle buffers;
- required feature availability;
- `requestDevice`;
- `device.lost`;
- `uncapturederror`;
- canvas context configuration;
- renderer initialization if three.js remains in the field.

Policy:

- Keep `requiredFeatures` empty unless a feature is mandatory for the
  baseline field.
- Optional capabilities such as timestamp queries or future subgroup
  paths create WebGPU-only optional branches; they do not block startup.
- Required limits are the minimum for the selected WebGPU profile, not a
  single high-density budget for all devices.
- Use promise rejection handling for adapter/device creation. After
  device creation, use error scopes around shader-module creation,
  pipeline creation, and first render/compute dispatch in lab mode.
  `uncapturederror` is telemetry for unexpected errors, not the primary
  validation path.
- Verify the active backend is WebGPU after renderer initialization. If
  three.js cannot expose a stable backend assertion, the field lab uses
  raw WebGPU canvas context configuration instead of accepting ambiguous
  `WebGPURenderer` initialization.
- Phase 0 decides the core field pipeline ownership. The default is raw
  WebGPU for particles, physics, picking, and readback; R3F/three.js may
  remain around camera helpers, debug meshes, and non-particle visuals.
- Define a single canvas/device owner. The field particle core defaults
  to owning the WebGPU canvas, `GPUDevice`, command encoding, frame
  graph, command submission, and presentation texture. R3F/three.js may
  not independently configure or present from the same canvas unless it
  is wrapped behind an explicit integration layer that shares the same
  device, render target, and frame scheduling contract.

Recommended type shape:

```ts
export type WebGpuUnavailableReason =
  | "insecure-context"
  | "navigator-gpu-missing"
  | "adapter-missing"
  | "required-limit-missing"
  | "device-request-failed"
  | "renderer-init-failed";

export type FieldGpuProfile = "minimal" | "standard" | "high-density";

export type FieldGpuRuntime = {
  backend: "webgpu";
  profile: FieldGpuProfile;
  adapter: GPUAdapter;
  device: GPUDevice;
  queue: GPUQueue;
  canvas: HTMLCanvasElement;
  format: GPUTextureFormat;
  destroy(): void;
};
```

Exit criteria:

- Unsupported devices never mount the field runtime.
- Supported devices render a WebGPU-only lab scene.
- No WebGL route exists in the field runtime.
- The lab asserts the active backend is WebGPU, not WebGL2-through-
  `WebGPURenderer`.
- Device loss produces a controlled app state.
- Initialization failures are recorded with product-safe reason codes.
- WebGPU-only profiles are selected from adapter limits and measured
  probes.

## Phase 1 - WebGPU Runtime Boundary

Estimate: 1-2 weeks.

Do not define `FieldRendererBackend = webgpu | webgl2 | unavailable`.
`unavailable` belongs outside the runtime, before mount. If
`FieldGpuRuntime` exists, the backend is WebGPU.

Goals:

- Introduce `FieldGpuRuntime` as the canonical runtime boundary.
- Centralize adapter/device/canvas ownership.
- Centralize destroy/dispose lifecycle.
- Keep React responsible for inputs, subscriptions, and invalidation,
  not GPU state ownership.
- Implement the Phase 0 ownership decision: raw WebGPU owns the particle
  core, physics, picking, and readback. R3F/three.js may remain only for
  non-core visual helpers after Phase 0 proves that those helpers do not
  create a second renderer, second device, second canvas context, or
  ambiguous backend path for the field canvas. If that proof is not
  trivial, the M7 field canvas is raw WebGPU-only.
- Initial M7 device-loss policy: enter a controlled device-lost state
  and offer a full field remount from CPU-side reconstruction seed.
  Automatic silent recovery is out of scope until telemetry shows device
  loss is common enough to justify it. Never attempt to reuse GPU
  resources from the lost device.
- Keep a CPU-side reconstruction seed: resident set id, graph checksum,
  camera state, interaction state, visual params, and current profile.

Exit criteria:

- No shipped field/orb public API exposes `WebGLRenderer`.
- No shipped field/orb runtime path exposes `forceWebGL`.
- Tests assert WebGPU gate behavior and unsupported state behavior.
- Tests assert device-loss policy behavior.

## Phase 2 - Particle Buffers First

Estimate: 2-4 weeks.

Move particle state to storage buffers before visual parity work. Do not
port `field-particle-state-texture.ts` into a WebGPU texture-shaped
equivalent.

Recommended buffer set:

```ts
export type ParticleBuffers = {
  position: GPUBuffer;
  velocity: GPUBuffer;
  attributes: GPUBuffer;
  flags: GPUBuffer;
  ids: GPUBuffer;
  edges: GPUBuffer;
};

export type InteractionReadbackBuffers = {
  pickResult: GPUBuffer;
  pickStaging: GPUBuffer;
  selectionSummary: GPUBuffer;
  selectionSummaryStaging: GPUBuffer;
};
```

Use structure-of-arrays for hot simulation data unless profiling proves
an array-of-structs layout is better.

Goals:

- Resident particle allocator.
- Deterministic dense ordering.
- Resize/dispose path.
- CPU-to-GPU upload path.
- GPU-to-GPU update path.
- Tiny readback path for diagnostics and interaction results.
- Separate staging/readback buffers from hot particle buffers. Mapped
  buffers must never be bound into render or compute passes.
- Define host/WGSL layout contracts for every storage buffer. Prefer
  `vec4f`-aligned records for hot float data, `u32` bitfields for
  flags, and generated byte-offset tests for struct-shaped buffers.
- Tests verify `stride`, `offset`, and typed-array packing against WGSL
  declarations.

Exit criteria:

- Live positions come from storage buffers.
- No live particle state depends on `DataTexture`.
- React does not own per-frame particle state.
- Readback buffers live in an interaction/readback pool, not in
  `ParticleBuffers`.
- Host/WGSL layout tests pass.

## Phase 2.5 - Minimal GPU Pipeline Slice

Estimate: 1-2 weeks.

Before full visual parity, build one thin end-to-end GPU path over the
same storage-buffer particle state.

Goals:

- One raw WebGPU compute pass mutates particle positions.
- One raw WebGPU render pass consumes those positions.
- Render plain instanced quads with fixed color and fixed radius.
- Add one hover/click compute readback result through the readback pool.
- Cover resize and dispose.
- Keep the particle core outside the three.js material system.

Exit criteria:

- One compute step mutates positions.
- One render pass consumes positions.
- One readback path returns a valid particle id.
- Resize/dispose works without leaking GPU resources.
- No three.js material system is involved in the particle core.

## Phase 3 - Instanced Billboard Rendering

Estimate: 3-6+ weeks.

Do not render the main particles as sized WebGPU `Points`. WebGPU point
primitives are documented as 1 px in the three.js node-material path.
Render particles as instanced camera-facing quads/sprites.

Core inputs:

- quad corner;
- particle index;
- position buffer;
- size/radius;
- visual attributes;
- flags;
- camera matrices.

Fragment semantics to rebuild:

- local point UV from quad corner;
- circular mask;
- soft edge;
- haze;
- pulse;
- focus and selection color;
- hover state;
- evidence excitation;
- depth-aware fade.

Exit criteria:

- Field/orb particles render with variable size.
- No WebGPU `Points` primitive is used for sized particles.
- Visual semantics match the old runtime at the behavior level.
- No shipped field/orb display path imports `ShaderMaterial` or
  `RawShaderMaterial`.

## Phase 4 - Native Physics Kernel

Estimate: 1-3 months for a serious first version.

Implement `SemanticPhysicsKernel` as a WebGPU-only compute contract:

```ts
export type SemanticPhysicsKernel = {
  resize(capacity: number): void;
  uploadGraph(input: GraphResidentSet): void;
  uploadInteraction(input: InteractionState): void;
  step(params: PhysicsStepParams): void;
  getBuffers(): ParticleBuffers;
  readSummary(): Promise<PhysicsSummary>;
  destroy(): void;
};
```

TSL is allowed for display/debug paths and simple compute experiments.
The production kernel may use WGSL directly whenever explicit bind-group
layout, labels, struct layout, workgroup sizing, or debugging clarity is
better.

Initial compute passes:

- integrate velocity and position;
- apply focus/resident forces;
- apply edge/local neighborhood forces;
- decay pulse/evidence state;
- update screen-space bounds for picking/LOD;
- write summary stats.

Exit criteria:

- Physics runs through WebGPU compute.
- Kernel state can be disposed, recreated, and resized without leaking
  GPU resources.
- Reduced-motion and low-power modes bypass or downshift compute
  predictably.
- React does not reach into GPU buffers except through the kernel API.

## Phase 5 - Compute Picking And Selection

Estimate: 2-4 weeks.

Do not reproduce WebGL color-ID picking as the primary design.

Interaction flow:

- CPU computes pointer ray or screen-space target.
- GPU compute scans resident particles or a narrowed candidate set.
- Kernel writes a small result buffer: particle id, score, depth, and
  distance.
- JS maps a tiny staging buffer with `mapAsync()`.
- Pointer operation tokens prevent stale async results from overwriting
  newer state.

Rectangle selection should update GPU flags first and read back counts
or compacted ids only when the UI needs CPU-visible data.

Exit criteria:

- No shipped field/orb code uses WebGL render targets for picking.
- No shipped field/orb code calls `readRenderTargetPixels`.
- Hover, click, rectangle selection, and cancel/escape behavior are
  async and token-safe.

## Phase 6 - Snapshots

Estimate: 1-2 weeks.

Snapshots should render one deterministic frame and capture the canvas.
Do not introduce synchronous GPU readback.

Interaction readback uses `mapAsync()` on staging buffers. Snapshot
capture may use a bounded queue-completion wait only in the snapshot
path, never in hover/click loops.

Snapshot metadata should include:

- camera state;
- resident set id;
- device info bucket;
- render params;
- graph bundle checksum.

Exit criteria:

- Snapshot capture works after async WebGPU initialization.
- Device-loss and unsupported states are represented cleanly.
- Snapshot work waits only for the GPU work required for image capture.

## Phase 7 - Remove WebGL Runtime Code

Estimate: 1-2 weeks after parity gates pass.

Delete or quarantine from shipped field/orb runtime imports:

- `WebGLRenderer` public types;
- GLSL shader files;
- `ShaderMaterial`;
- `RawShaderMaterial`;
- WebGL render targets for picking;
- `readRenderTargetPixels`;
- `forceWebGL`;
- product tests for WebGL fallback.

Old WebGL code may remain in a clearly marked historical reference path
only until the rewrite is validated.

## Acceptance Checklist

- CodeAtlas doc-search has `/gpuweb/gpuweb` indexed and available for
  WebGPU/WGSL specification lookups.
- WebGPU gate blocks unsupported devices before the field runtime
  mounts.
- Runtime startup asserts that the active renderer/device path is
  WebGPU, not WebGL2-through-`WebGPURenderer`.
- Exactly one runtime owns WebGPU canvas configuration, command
  submission, and presentation for the field canvas.
- R3F/three.js does not create a second renderer, second device, second
  canvas context, or ambiguous backend path for the field canvas.
- WebGPU-only profiles exist for mobile/integrated/discrete classes.
- `requiredFeatures` contains only baseline-required features.
- Optional WebGPU features route through WebGPU-only branches, not
  startup blockers.
- No shipped field/orb code imports `WebGLRenderer`.
- No shipped field/orb code uses `ShaderMaterial` or
  `RawShaderMaterial`.
- No shipped field/orb code uses WebGL render targets for picking.
- No shipped field/orb code depends on `DataTexture` for live particle
  state.
- No `forceWebGL` or runtime WebGL2 adapter exists.
- Staging/readback buffers are separate from hot particle buffers.
- Host/WGSL layout tests verify offsets and strides for every storage
  buffer.
- Known validation-sensitive operations use GPU error scopes in
  lab/debug mode.
- Initial device-loss behavior is fixed: controlled device-lost state
  plus explicit full remount from CPU-side reconstruction seed.
- A minimal compute-render-readback slice passes before full visual
  parity.
- Particle display uses instanced quads/sprites, not sized WebGPU
  points.
- Particle state lives in storage buffers.
- Physics runs through WebGPU compute.
- Picking is async and token-cancelable.
- Snapshot capture works after async GPU initialization.
- Device loss and uncaptured errors are logged and put the app into a
  controlled state.
- Playwright covers WebGPU Chrome, Firefox, and Safari where CI allows.
- Manual device pass includes integrated GPU, discrete GPU, and Android
  mobile class hardware.
- Cosmograph/cosmos.gl is classified as a separate non-WebGPU dependency
  until replaced.

## Verify

- `npm run typecheck`
- `npm test -- --runInBand apps/web/features/field apps/web/features/orb`
- Host/WGSL storage-buffer layout tests.
- Minimal compute-render-readback slice test.
- Playwright WebGPU desktop screenshot and canvas-pixel checks.
- Playwright WebGPU mobile viewport checks.
- Manual device pass on one integrated GPU, one discrete GPU, and one
  Android mobile class device.
- Device-loss and unsupported-browser manual checks.

## Sources

- W3C GPUWeb repository: https://github.com/gpuweb/gpuweb
- WebGPU specification: https://gpuweb.github.io/gpuweb/
- WGSL specification: https://gpuweb.github.io/gpuweb/wgsl/
- web.dev WebGPU browser support: https://web.dev/blog/webgpu-supported-major-browsers
- Chrome WebGPU overview: https://developer.chrome.com/docs/web-platform/webgpu/overview
- MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
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

## Blocking-on / blocks

- Blocking on: Phase 0 hard gate and lab render.
- Blocks: any claim that the owned 3D field runtime is WebGPU-native.
- Does not block: the separate M8 decision on replacing the 2D
  Cosmograph/cosmos.gl lens.
- Product-level "all graphics are WebGPU" claims remain blocked by M8
  while the 2D lens remains in scope for those claims.
