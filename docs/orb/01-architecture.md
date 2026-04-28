# 01 — Architecture

## Single source of truth, 3D-primary workspace

```
┌──────────────────────────────────────────────────────────────────┐
│  DuckDB-WASM bundle session (in browser)                         │
│  ├─ base_points + release_points_3d (LEFT JOINed)                │
│  ├─ release_evidence_members, release_cluster_centroids          │
│  ├─ universe_links (citations) + orb_entity_edges_current (view) │
│  ├─ paper_knn_<cluster_id>.parquet (per-cluster shards, OPFS)    │
│  └─ shared selection / filter / timeline tables                  │
└──────────────────────────────────────────────────────────────────┘
        ▲                                                ▲
        │                                                │
   ┌────┴─────┐                                    ┌─────┴────┐
	   │  /map    │   <─── visibility flip on the ───> │  /graph  │
	   │ optional │      shared-shell, simultaneously  │ primary  │
   │          │      mounted canvases              │          │
   │ Renderer │                                    │ Renderer │
   │   over   │                                    │   over   │
   │ native   │                                    │ WebGPU   │
   │Cosmograph│                                    │ runtime  │
   └──────────┘                                    └──────────┘
        │                                                │
        └───────── shared force vocabulary ──────────────┘
                  (focus / scope / evidencePulse / ...)
	                  applies to both surfaces. 3D expresses
	                  through force motion and shape; 2D expresses
	                  through native Cosmograph selection, filtering,
	                  camera, and edge/list highlighting.
```

## State authority

Per canonical correction 23: **`useDashboardStore` is the sole
source of truth** for `{hoveredPaperId, focusedPaperId,
hoveredClusterId, selectedPointIndices, activePanelPaperId}`.
No local component state for any of these. Both renderers
subscribe; both write through the same dispatchers.

`useGraphStore` holds renderer-coupled state: camera-2D pose,
camera-3D pose, rotation phase, mode (`'orb' | 'map'`).

Prompt/search text, RAG answer state, ranked results, info-panel
mode, and pinned wiki state are not renderer-coupled. They live in
the dashboard/RAG/wiki state surfaces and render first in the 3D
workspace. The 2D lens consumes the same state but does not fork it.

DuckDB tables hold the SQL-projected truth: `selected_point_indices`,
filter-clause projections, scope rev counter. Both renderers read
the same `currentPointScopeSql`.

## Render-vs-physics lane separation

Codified at `apps/web/features/orb/bake/apply-paper-overrides.ts:51`,
restated here as the *first* architectural rule:

- **Render lanes** (existing): `aSpeed`, `aClickPack.{xyz, w}`,
  `aBucket`, `aFunnel*`, `aColor` (planned). Written by surface code
  (paper baker, click handler, lands-mode field baker). Cheap to
  rewrite via `addUpdateRange` + `bufferSubData`. Visual output
  only.
- **Physics lanes** (new): position, velocity, mass, selection mask,
  filter mask, excitation state (intensity + decayStart), pin mask,
  plus foundational effect lanes: relation class, radial band, effect
  stage, orbit phase, and resident reason. Written by simulation pass /
  interaction stores. M7 stores live state in WebGPU storage buffers.
  Historical texture names such as `posTex` / `selectionMask` describe
  semantics, not the target storage primitive. **Never** conflated with
  render attributes.

Adding a feature = naming its lane + wiring its writer + wiring
its reader. No glue layers. No lane overloads.

See [reference/lane-rule.md](reference/lane-rule.md) for full
quotation of the codified contract.

## Resident LOD

Mechanism that resolves the scope-collapse vs hairball tension:

- **Logical scope**: the active filter/timeline/selection set,
  arbitrary size (1 → corpus). Read from the same `currentPointScopeSql`
  the 2D map uses.
- **Resident set**: deterministic sub-sample of the scope, sized to
  ≤ 16K (mobile) or ≤ 30K (desktop) particles. Sampling starts with
  a focus override reserve, then fills remaining slots by
  cluster-aware / quantile-stratified `paperReferenceCount`.
- **Focus override reserve**: selected paper, 1-hop citation
  neighbors, top semantic kNN neighbors, active RAG/search result
  members, and pinned wiki references are resident before generic
  sampling. This is required for orbital belts, citation cascades,
  and RAG narrative physics to remain honest.
- **Render + physics + picking** all operate on the resident set.
- **Selection model** operates on the whole scope (filter SQL).
- **UI banner** when scope > resident: *"showing 16K of 87K — zoom
  or narrow scope for full"*. Banner action: open filter UI.

Resident set rebuilds on:
- Scope change (filter, timeline, selection).
- Device class change (mobile/desktop, low-power toggle).
- Cluster focus (resident becomes cluster-stratified for that
  focus).

The ambient render canvas (`apps/web/features/field/asset/point-source-registry.ts:22`,
16,384 points) is the substrate; resident LOD writes new
`paperId↔particleIdx` mappings into it via the
`apply-paper-overrides` hot path.

See [milestones/M1-canonical-views-and-mask-writer.md](milestones/M1-canonical-views-and-mask-writer.md)
for the `paperId↔particleIdx` mask writer that makes resident-LOD
filter parity with `/map` work.

## Force kernel contract (semantic schedule, WebGPU runtime)

```
interface SemanticPhysicsKernel {
  resize(capacity: number): void
  uploadGraph(input: GraphResidentSet): void
  uploadInteraction(input: InteractionState): void
  step(params: PhysicsStepParams): void
  getBuffers(): ParticleBuffers
  readSummary(): Promise<PhysicsSummary>
  dispose(): void
}

type PhysicsStepParams = {
  schedule: ForceEffectSchedule
  alpha: number
  dt: number
}

type ForceEffectSchedule = Array<{
  id: string
  generation: number
  layer: 'scope' | 'spatial' | 'overlay' | 'direct'
  mode: 'focus' | 'clusterFocus' | 'entityFocus' | 'evidencePulse' | 'scope' | 'tug' | 'pulseImpulse'
  startMs: number
  durationMs: number
  easing: 'linear' | 'smoothstep' | 'spring'
  payloadRef: string
}>

type ParticleBuffers = {
  position: GPUBuffer
  velocity: GPUBuffer
  attributes: GPUBuffer
  flags: GPUBuffer
  ids: GPUBuffer
  edges: GPUBuffer
}

type InteractionReadbackBuffers = {
  pickResult: GPUBuffer
  pickStaging: GPUBuffer
  selectionSummary: GPUBuffer
  selectionSummaryStaging: GPUBuffer
}
```

- M7 ships a WebGPU-only `SemanticPhysicsKernel`. It does not route to
  WebGL2.
- The WebGPU gate owns capability selection before the field runtime
  mounts. Unsupported devices get an unsupported state.
- `FieldGpuRuntime` owns one WebGPU canvas context, one `GPUDevice`, one
  command submission path, and one presentation path for the field
  canvas.
- The kernel owns storage-buffer state and compute dispatch. It must not
  allocate payload objects or rebuild pipelines inside the frame loop.
- Readback/staging buffers are separate from hot particle buffers so
  mapped buffers are never bound into render or compute passes.
- TSL compute is acceptable where it stays clear. Hand-authored WGSL is
  acceptable for force integration, compaction, picking, and debugging
  when it is more direct.

Layer 2 remains exclusive at the product level, but staged effects
such as RAG narrative physics are represented as multiple scheduled
writes/ramp windows under one generation.

See [03-physics-model.md](03-physics-model.md) for the equations and
[milestones/M7-webgpu-port.md](milestones/M7-webgpu-port.md) for the
WebGPU-only runtime migration.

## Disposal

Per canonical correction 22: disposal applies on **session exit**,
not surface toggle. `<GraphShell>` outlives individual route
renders. On surface toggle (orb ↔ map), both canvases stay mounted;
only `visibility` flips. On low-power toggle or session leave,
each subsystem exposes `dispose()`:

- WebGL render targets, GPU buffers, picking offscreen target.
- `<CameraControls>` (yomotsu).
- drei `<Html>` portals.
- `ForceKernel` instance + typed-array buffers.
- Lazy-attached DuckDB views (orb-specific).
- OPFS-cached kNN shards (kept across sessions; cleared on cap
  exceeded via LRU).

`GraphShell` orchestrates. No implicit React-unmount cleanup.

## Owns / doesn't own

This file owns the **architectural skeleton** (where state lives,
how surfaces compose, the lane rule, resident LOD, force kernel
contract).

Doesn't own:
- Specific render shaders → [04-renderer.md](04-renderer.md).
- Specific force equations → [03-physics-model.md](03-physics-model.md).
- Specific milestones -> [milestones/](milestones/).
- 2D lens runtime posture -> [13-2d-map-vendor-replacement.md](13-2d-map-vendor-replacement.md).

## Prerequisites

[00-product-framing.md](00-product-framing.md).

## Consumers

Every implementation file. The lane rule, resident LOD concept, and
force kernel contract are load-bearing for milestones M1–M7.

## Invalidation

- Lane rule overridden → physics state flows through render lanes →
  invalidates M2's GPGPU design and the canonical's correction 51.
- Resident LOD removed → reverts to scope = render set → caps the
  product at evidence-subset scale or risks hairball.
- Single-source-of-truth-in-store fragmented → desync hell across
  the two renderers.
