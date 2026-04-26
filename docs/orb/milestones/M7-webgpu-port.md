# M7 - WebGPU hardening and optimization

## Scope

M7 is no longer the first WebGPU port. M2 already ships WebGPU-first
with WebGL2 compatibility. M7 hardens the WebGPU backend, validates
parity against the fallback, and decides whether any fallback
retirement is justified.

Per Codex round 1 #3 + round 2 R2-4 + R2-5: WebGPU remains a real
renderer/material/kernel architecture, not a one-line swap.

## Acceptance

- `WebGPUForceKernel` is production-hardened:
  - storage-buffer layout documented and stable;
  - workgroup size tuned on at least one integrated GPU and one
    discrete GPU;
  - edge buffers use deterministic ordering for bounded parity;
  - dispatch count minimized for the active effect set.
- TSL display and picking paths are the primary implementation:
  - vertex motion chunks;
  - display fragment;
  - picking material;
  - point-size / point-UV / discard equivalents.
- WebGL2 compatibility remains available through a forced fallback
  flag.
- Visual parity is semantic, not trajectory-identical:
  - focus neighborhoods and resident reasons match;
  - orbital band / score-band membership matches;
  - nearest-neighbor overlap stays within tolerance;
  - picking results match for randomized clicks within hit radius.
- Performance:
  - WebGPU path is faster than or equal to WebGL2 p95 on supported
    devices;
  - no regression in reduced-motion or low-power modes;
  - no WebGPU context-loss increase relative to baseline telemetry.
- Retirement decision recorded:
  - keep WebGL2 fallback, or
  - schedule a separate cleanup if WebGL2 user share is below threshold.

## Files

- `apps/web/features/graph/orb/render/orb-shaders-tsl.ts` (extend)
- `apps/web/features/graph/orb/render/picking-tsl.ts` (extend)
- `apps/web/features/graph/orb/sim/webgpu-force-kernel.ts` (harden)
- `apps/web/features/graph/orb/sim/force-kernel-router.ts` (telemetry + flags)
- `apps/web/features/graph/orb/render/GraphOrb.tsx` (capability reporting)

## Verify

- Capability detection: WebGPU-capable browser uses WebGPU; forced
  fallback uses WebGL2.
- Same bundle, same scope -> layouts remain semantically equivalent
  across backends under the parity metrics above.
- All M3a/M3b/M3c interactions work on WebGPU and WebGL2.
- Reduced-motion + low-power behavior matches across backends.
- Profile traces saved for desktop integrated GPU, desktop discrete
  GPU, and mobile/low-power class where available.

## Blocking-on / blocks

- Blocking on: M2 WebGPU-first baseline shipping in production.
- Blocks: fallback retirement only. Product features must not wait for
  M7.
