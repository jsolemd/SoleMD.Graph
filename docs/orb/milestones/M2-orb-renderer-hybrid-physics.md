# M2 — Orb renderer + hybrid physics (WebGPU-first)

## Scope

`<GraphOrb>` mounts. Hybrid physics: ambient noise (existing) +
wake-driven `ForceKernelRouter` (new). WebGPU/TSL is the primary
2026 path; WebGL2 `GPUComputationRenderer` is the compatibility path.
Mode flip orb ↔ lands.

## Acceptance

- `<GraphOrb>` mounts inside the persistent FieldCanvas
  (`DashboardClientShell.tsx:59-115`). Coexists with lands
  controllers behind a `mode: 'lands' | 'orb'` switch.
- Ambient continues to ship today's `fbm + snoise`
  (`field-vertex-motion.glsl.ts:227`).
- **Center split** (per [03-physics-model.md](../03-physics-model.md)
  § Center split):
  ```
  center = mix(bakedPosition, posTex[aIndex], uWakeMix)
  final = center + bounded_ambient_displacement(noise(aIndex, uTime))
  ```
  Display + picking shaders both use the same center logic.
- `ForceKernelRouter` ships behind `ForceKernel` interface:
  - Preferred backend: `WebGPUForceKernel` using TSL/WGSL compute,
    storage buffers / `StorageBufferAttribute`, and compute dispatch.
  - Compatibility backend: `WebGL2ForceKernel` using
    `GPUComputationRenderer` ping-pong (separate position + velocity
    passes).
  - Router accepts a `ForceEffectSchedule`, not a single mutable
    `spatialModePayload`.
  - Pipelines/bind groups/payload buffers are prebound outside the
    frame loop; no per-frame object allocation in the router.
  - Forces: anchor (always-on), scope (reads `filterMask`),
    spatial-mode (idle for now), short-range repulsion via
    spatial-hash, center pull.
  - `evidencePulse` / `focus` / etc. **not yet wired** (M3a/M3b).
  - Wake on user dispatch; sleep when residual displacement <
    threshold AND alpha < `alphaMin` AND no held/scheduled effect is
    active.
- Auto-rotation state machine (per
  [06-camera-and-rotation.md](../06-camera-and-rotation.md)).
  drei `<CameraControls>` with damping.
- Picking ports together with display (same motion chunks; see
  [05-picking.md](../05-picking.md)).
- Disposal contract per
  [01-architecture.md](../01-architecture.md) § Disposal.
- Resident-LOD render budget enforced (≤ 16K mobile, ≤ 30K
  desktop).
- Reduced-motion + Pause-motion + low-power suppress motion per
  [15-accessibility-and-low-power.md](../15-accessibility-and-low-power.md).

## Files

- `apps/web/features/graph/orb/render/GraphOrb.tsx` (new)
- `apps/web/features/graph/orb/render/point-buffers.ts` (new)
- `apps/web/features/graph/orb/render/shaders.ts` (new)
- `apps/web/features/graph/orb/render/picking.ts` (new — calls
  the existing field-picking primitives with orb-specific layer
  mask)
- `apps/web/features/graph/orb/render/rotation-controller.ts` (new)
- `apps/web/features/graph/orb/render/camera-persistence.ts` (new)
- `apps/web/features/graph/orb/sim/force-kernel.ts` (new — interface)
- `apps/web/features/graph/orb/sim/force-kernel-router.ts` (new)
- `apps/web/features/graph/orb/sim/webgpu-force-kernel.ts` (new)
- `apps/web/features/graph/orb/sim/webgl2-force-kernel.ts` (new compatibility backend)
- `apps/web/features/graph/orb/sim/spatial-hash.ts` (new)
- `apps/web/features/graph/components/canvas/GraphCanvas.tsx`
  (renderer-mode branch)
- `apps/web/features/field/asset/field-attribute-baker.ts:16` —
  doc-string drift fix (per Codex round 1 #2): replace "written by
  orb physics" with "written by click-attraction handler".
- `package.json` — no `d3-force-3d` runtime dependency for the orb
  simulation. The force model follows d3-force semantics, but resident
  physics runs in GPU kernels.

## Verify

- Toggle `/graph` to 3D orb mode. Particles render at baked
  positions. Auto-rotation runs. No interactions = no force ticks
  (verify tick counter does not advance).
- WebGPU-capable browser selects `WebGPUForceKernel`; forced-WebGL
  test mode selects `WebGL2ForceKernel`.
- Tug a node (M2 ships `tug` as the only spatial-mode dispatcher
  for verification): sim wakes, neighbors ripple via short-range
  + anchor; release → settles to equilibrium within ~1s; alpha
  drops to 0; tick counter halts.
- Reduced-motion: tug doesn't wake the sim; click still selects.
- Pause-motion ON: rotation stops; sim cannot wake.
- Low-power: sim cannot wake; orbit drag still works; selection
  still works.
- Desktop sustained 60 fps at 16K resident with sustained tug on the
  WebGPU path; WebGL2 compatibility uses the documented 10K/4K floors
  in [17-rendering-stack-evolution.md](../17-rendering-stack-evolution.md).
- Profile trace: wake-period tick < 6 ms at 16K on the WebGPU path;
  WebGL2 compatibility path meets the documented lower budget.
  Sleep-period main-thread cost ≈ 0.

## Blocking-on / blocks

- Blocking on: M1 (mask writer + view extensions).
- Blocks: M3a (search + focus uses the kernel's spatial-mode
  interface).
