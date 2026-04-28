# WebGPU Orb State Buffer Follow-On

Status: future M7 follow-on.

The current WebGPU orb uses a compact `u32` flag buffer for hover, focus,
selection, scope, neighbor, evidence, and scope-dim lanes. That path is
working and should remain until the visual-parity pass has landed and been
verified.

## Goal

Replace the current 7-flag bitfield with an explicit WebGPU interaction state
buffer that mirrors the semantic lanes of the legacy field state texture
without preserving the DataTexture model.

## Proposed Shape

```ts
type OrbInteractionStateBuffers = {
  state: GPUBuffer; // array<u32>, one entry per resident particle
};
```

Each `u32` packs:

- hover;
- focus;
- neighbor;
- scope;
- scope dim;
- selection;
- evidence;
- reserved future bits.

Sparse interaction updates should use `GPUQueue.writeBuffer()` byte ranges
instead of rebuilding all particle arrays.

## Acceptance

- No live particle state depends on `DataTexture`.
- Focus, hover, selection, scope, and evidence visuals match the current
  WebGPU path.
- State-buffer layout is covered by host/WGSL offset and stride tests.
- The change removes duplicate flag packing rather than adding a parallel
  state path.
