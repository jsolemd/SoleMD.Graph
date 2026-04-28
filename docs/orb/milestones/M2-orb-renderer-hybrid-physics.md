# M2 - Historical orb renderer + hybrid physics milestone

## Status

Superseded by [M7](M7-webgpu-port.md) after the 2026-04-27 WebGPU-only
field/orb decision.

This file is retained to preserve the historical milestone intent and
the force-vocabulary sequencing that earlier reviews discussed. It is
not the implementation plan for the current product path.

Current direction:

- The owned 3D field/orb runtime is WebGPU-only.
- Unsupported browsers/devices receive an unsupported state before the
  field runtime mounts.
- There is no shipped WebGL2 `GPUComputationRenderer` compatibility
  backend.
- There is no shipped GLSL parity path.
- Particle state moves to WebGPU storage buffers before visual parity
  and complex physics work.
- Sized particles render as instanced billboards/sprites, not WebGPU
  `Points`.

## Original Scope Preserved For Context

`<GraphOrb>` was expected to mount with hybrid physics: ambient noise
plus wake-driven force effects. The current product path uses
`OrbSurface` on the persistent `FieldCanvas` instead of the abandoned
`<GraphOrb>` / `/orb-dev` prototype.

Still useful from the old milestone:

- Ambient and wake-driven physics remain separate conceptual tiers.
- Force effects still use a semantic schedule.
- Reduced-motion, pause-motion, and low-power controls still gate
  motion.
- Search/focus/RAG effects still build on the same force vocabulary.

No longer current:

- `ForceKernelRouter`.
- `WebGL2ForceKernel`.
- WebGL2 `GPUComputationRenderer` floors.
- Forced-WebGL verification.
- New `apps/web/features/graph/orb/render/GraphOrb.tsx` as the
  product renderer target.

## Current Replacement

Use [M7 WebGPU-only field runtime rewrite](M7-webgpu-port.md).

M7 owns:

- hard WebGPU gate;
- `FieldGpuRuntime`;
- storage-buffer particle state;
- instanced billboard rendering;
- WebGPU `SemanticPhysicsKernel`;
- compute picking;
- async snapshots;
- WebGL cleanup from shipped field/orb imports.

## Blocking-on / blocks

- Historical only.
- Does not block current implementation.
