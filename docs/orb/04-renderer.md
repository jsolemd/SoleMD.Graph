# 04 — Renderer (`<GraphOrb>`)

> **SUPERSEDED 2026-04-27.** The `<GraphOrb>` R3F point-cloud renderer
> described below was a prototype and has been retired. The current
> 3D primary on `/graph` is `OrbSurface` plus
> `apps/web/features/orb/webgpu/OrbWebGpuCanvas.tsx`. The orb particle
> core is raw WebGPU: one canvas/device owner, storage-buffer particle
> state, instanced billboards, compute integration, and async compute
> picking. This file is kept as background for earlier physics/render
> lane discussions; do not implement against it as a current spec.

## Overview

R3F component mounted under `apps/web/features/graph/orb/render/GraphOrb.tsx`
(new path; canonical correction split into `orb/render/`). Reads
`(x3, y3, z3, cluster_id, hex_color, paperReferenceCount,
paperEntityCount, year, signalCount)` from
`current_points_web` (extended with orb columns; see
[02-data-contract.md](02-data-contract.md)) for the resident set.

Mounts inside the persistent FieldCanvas hoisted at
`apps/web/app/(dashboard)/DashboardClientShell.tsx:59-115` —
shares the WebGL context with the lands-mode field renderer
(`apps/web/features/field/renderer/FieldScene.tsx`). Both modes
coexist behind a `mode: 'lands' | 'orb'` switch on the field
controllers.

## Geometry

`THREE.Points` with `BufferGeometry`, one draw call. Attribute
streams and update policies:

| Attribute | Type | Usage | Updated when |
|---|---|---|---|
| `position` (vec3) | `StaticDrawUsage` | base baked center for the resident's particle | resident set rebuild |
| `aIndex` (1) | `StaticDrawUsage` | particle index 0..budget-1 | once at pack |
| `aColor` (vec3) | `DynamicDrawUsage` | cluster color | filter overlay state, partial via `addUpdateRange` |
| `aMass` (1) | `DynamicDrawUsage` | log-percentile mass for size | bake |
| `aSelection` (1) | `DynamicDrawUsage` | 0 / 1 selection state | selection change, partial |
| `aSignalCount` (1) | `DynamicDrawUsage` | for evidenceMark glow | RAG arrival, partial |

Existing render lanes from the lands renderer (`aSpeed`,
`aClickPack`, `aBucket`, `aFunnel*`) remain; orb mode reads
`aClickPack.w` for size factor (per the canonical mass-norm port).

Physics state lives in **separate textures** (per the lane rule):
`posTex`, `velTex`, etc. These are sampled in the vertex shader,
not stored as attributes.

## Shader (TSL first, GLSL compatibility)

For new orb code, the primary authoring target is three.js
`WebGPURenderer` + TSL. WebGL2 GLSL `ShaderMaterial` exists only as a
compatibility backend for devices where WebGPU is unavailable or
flagged off. Do not author new orb features in GLSL first and plan to
port them later.

Vertex motion sketch:

```
varying vec3 vColor;
varying float vSize;

void main() {
  vec3 baked = position;
  vec3 live = texelFetch(posTex, ivec2(aIndex, 0), 0).xyz;
  vec3 center = mix(baked, live, uWakeMix);  // 0 = idle, 1 = wake-active

  vec3 ambient = bounded_ambient_displacement(aIndex, uTime);
  vec3 final = center + ambient;

  vec4 mvPosition = modelViewMatrix * vec4(final, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float sizeFactor = aMass;          // already log-percentile from baker
  vSize = uPointSize * sizeFactor * (100.0 / -mvPosition.z);
  gl_PointSize = clamp(vSize, 2.0, 64.0);

  // selection + filter visual
  float selBoost = aSelection * uSelectionGlow;
  float dim = mix(0.15, 1.0, texture2D(filterMask, ...).r);
  vColor = mix(aColor * dim, vec3(1.0), selBoost);
}
```

Fragment shader: round sprite via `length(gl_PointCoord - 0.5)`,
soft alpha falloff, `discard` if alpha < cutoff.

In the TSL path: `gl_PointSize` maps to `pointSize`, `gl_PointCoord`
maps to `pointUV`, and fragment discard maps to `discardNode`. The
GLSL path is a compatibility implementation of the same force/display
contract, not the source of truth.

## Mount tree

```
<DashboardClientShell>
  <FieldCanvas>            // existing persistent canvas
    <FieldScene>           // existing lands renderer (mode='lands')
    <GraphOrb mode='orb'>  // NEW
      <Points geometry={residentBufferGeometry} material={orbMaterial} />
      <CameraControls makeDefault dampingFactor={0.08} />
      <Bounds fit clip observe>{...}</Bounds>
      <PickingPass renderer={renderer} />     // see 05-picking.md
      <ClusterLabels />                        // drei <Html> at centroids
      <HoverTooltip />                          // single drei <Html>
    </GraphOrb>
  </FieldCanvas>
</DashboardClientShell>
```

When `mode='lands'`, GraphOrb's geometry is hidden via
`visible={false}`; physics kernel pauses. Mode flip is instant; no
WebGL context churn.

## Force kernel mount

`GraphOrb` instantiates the active `ForceKernel` via R3F
`useFrame` after the lands controllers tick (existing useFrame at
`apps/web/features/field/renderer/FieldScene.tsx:516`).

```
useFrame((state, dt) => {
  if (mode !== 'orb' || !forceKernel.wake) return;
  const out = forceKernel.step({
    posTex, velTex, massTex, edges, filterMask, selectionMask,
    excitationTex, alpha, dt, spatialMode, spatialModePayload,
  });
  // out.posTex is the new ping-pong texture; assign for next frame
  posTexBinding.value = out.posTex;
  velTexBinding.value = out.velTex;
  if (out.residualDisplacement < THRESHOLD && alpha < ALPHA_MIN) {
    forceKernel.wake = false;  // sleep
  }
});
```

## Resident-set rebuild

When scope changes (filter, timeline, selection):
1. DuckDB resident-set query (see [02-data-contract.md](02-data-contract.md) § Resident-set construction).
2. Update `paperId↔particleIdx` map and inverse.
3. Write new `position`, `aIndex`, `aColor`, `aMass` via
   `addUpdateRange` + `bufferSubData`.
4. Update DataTextures: `selectionMask`, `filterMask`,
   `excitationTex`, `pinMask`.
5. Re-fetch `paper_knn_resident.parquet` shard.
6. Re-fetch entity edges via `orb_entity_edges_current` view.
7. If wake-active, reheat alpha to settle into new layout.

Fast filter scrub does not block the visible mask update. Resident
rebuilds are generation-cancelled async work: keep the old resident
buffers live until the new resident set, kNN shard, and edge buffers
are ready, then swap in one commit. Stale rebuild generations are
discarded.

## Materials

- `orbMaterial` - display, TSL/WebGPU primary with GLSL/WebGL2
  compatibility.
- `orbPickingMaterial` — composes the same motion chunks, encodes
  `aIndex` as 24-bit RGB. See [05-picking.md](05-picking.md).
- `orbEdgeMaterial` — `LineSegments` material for tiered edges.
  See [10-force-vocabulary.md](10-force-vocabulary.md) and the M4
  edges milestone.

## Owns / doesn't own

Owns: the renderer component, geometry attribute layout, shader
chunk composition, mount tree, force-kernel integration with R3F
useFrame.

Doesn't own:
- Picking pipeline → [05-picking.md](05-picking.md).
- Camera + rotation → [06-camera-and-rotation.md](06-camera-and-rotation.md).
- Selection writes → [07-selection.md](07-selection.md).
- Filter+timeline mask writes → [08-filter-and-timeline.md](08-filter-and-timeline.md).
- Force kernel implementation → [milestones/M2](milestones/M2-orb-renderer-hybrid-physics.md), [milestones/M7](milestones/M7-webgpu-port.md).

## Prerequisites

[01-architecture.md](01-architecture.md), [02-data-contract.md](02-data-contract.md),
[03-physics-model.md](03-physics-model.md).

## Consumers

All milestone implementation work that touches the orb renderer.

## Invalidation

- Render-budget rises past WebGL2 max-vertex-count ->
  cap rises; geometry layout unchanged.
- WebGPU support regresses on target devices -> keep the WebGL2
  compatibility material and lower resident budgets.
