# 2026-04-28 - SoleMD.Graph WebGPU Orb Visual Parity Ledger

## Scope

Continue the WebGPU-only orb migration beyond the first runtime slice:
particle color, size, depth, selection/scope/evidence visuals, shader
modularization, and the next implementation queue before semantic physics.

## Current State / Runtime Contract

- `/graph` 3D is owned by `OrbSurface` and the raw WebGPU
  `OrbWebGpuCanvas`.
- Cosmograph remains the unchanged 2D lens.
- Paper chunks stream from DuckDB into `useOrbGeometryMutationStore`, then
  pack into WebGPU `position`, `velocity`, `attributes`, and `flags`
  storage buffers.
- Interaction readback is async compute picking through staging buffers.
- Motion controls and mobile twist drive the WebGPU runtime directly.

## Ranked Themes And Findings

1. Visual parity should happen before complex physics. The current runtime
   has the correct WebGPU data path but only minimal billboard styling.
2. `orb-webgpu-runtime.ts` was too large for the local `/clean` contract,
   so shader source, binding layout helpers, and resource creation need
   separate modules before the kernel grows.
3. Scope state needs a negative visual lane. A positive `scope` bit alone
   cannot dim non-scope particles; a WebGPU `scopeDim` flag is the clean
   storage-buffer expression.
4. The cluster palette should be stable and curated rather than pure HSL
   spin, so clusters read as related biomedical groups without a one-note
   color family.

## Completed Batches

- Started from CodeAtlas context for:
  - `apps/web/features/orb/webgpu/orb-webgpu-runtime.ts`
  - `apps/web/features/orb/webgpu/orb-webgpu-particles.ts`
- Began splitting the WebGPU runtime into:
  - `orb-webgpu-layout.ts`
  - `orb-webgpu-shader.ts`
  - `orb-webgpu-resources.ts`
- Added the first visual-parity shader expansion:
  - depth-aware billboard scale/light
  - soft body/core/halo/ring composition
  - focus, hover, selection, scope, neighbor, and evidence visual lanes
  - compute picking that shares the same projected center math
- Added `ORB_WEBGPU_SCOPE_DIM_FLAG` for non-scope dimming when a scope is
  active.
- Verified all touched WebGPU source files remain below the 600-line
  `/clean` limit after modularization.

## Commands / Verification

- `npm run typecheck --workspace @solemd/web`
- `npm test --workspace @solemd/web -- --runInBand apps/web/features/orb/webgpu apps/web/features/orb/interaction apps/web/features/graph/orb/__tests__/GraphSurfaceSwitch.test.tsx`
- `npm run lint --workspace @solemd/web`
- `npm run build --workspace @solemd/web`
  - Passed with the existing `apps/web/instrumentation.ts` Edge-runtime
    warnings about `node:path`, `node:fs`, and `process.cwd`.

## Commits

- Baseline before this pass: `0e45a6a`

## Blockers

None yet.

## Newly Discovered Follow-On Work

- Add host/WGSL layout tests once the runtime buffer contract grows beyond
  simple `vec4f` and `u32` arrays.
- Add a browser screenshot/pixel smoke for WebGPU once the local Chrome MCP
  path is stable enough for this repo.
- Implement real IDs/edge buffers before semantic physics.
- Keep unrelated worker/corpus and warehouse schema changes out of the WebGPU
  visual parity commits; they were present in the worktree during this pass.

## Next Recommended Passes

1. Finish the visual parity batch and verify typecheck/lint/Jest/build.
2. Add snapshot capture for the raw WebGPU canvas.
3. Add the first `SemanticPhysicsKernel` force contract behind the existing
   storage buffers.
