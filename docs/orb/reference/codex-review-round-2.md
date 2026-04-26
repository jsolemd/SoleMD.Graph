# Reference — Codex review round 2

> Historical reference. The 2026-04-25 amendment keeps the R2 facts
> but changes the decisions they drive: native Cosmograph stays while
> the project is non-commercial, and M2 becomes WebGPU/TSL-first with
> WebGL2 compatibility instead of WebGL2-first. See
> [`../decisions/2026-04-24-cosmograph-license.md`](../decisions/2026-04-24-cosmograph-license.md)
> and [`../decisions/2026-04-24-webgpu-target.md`](../decisions/2026-04-24-webgpu-target.md).

**Run:** `node codex-companion.mjs task --resume <thread>` after
the integrated plan critiqued the canonical plan and proposed the
`docs/orb/` reorganization.

**Findings folded into:** the final docset (this folder).

## Findings (severity-tagged)

### BLOCKER

#### R2-1 — Scope collapse is product-state, not simulate-every-row

Plan said the orb handles whatever scope the map exposes.
Codex correctly: today's orb substrate is **16,384 particles**
(`apps/web/features/field/asset/point-source-registry.ts:22`); the
bundle contract expects 100K–500K base + lazy universe links
(`docs/rag/05b-graph-bundles.md:1078`,
`docs/map/graph-runtime.md:130`). Full-corpus *logical* scope is
fine; full-corpus *live* force particles + edges is the hairball
failure canonical was right to fear.

**Resolution:** Resident LOD. Orb renders the active scope
intersected with a render budget. Per
[`01-architecture.md`](../01-architecture.md) § Resident LOD,
[`00-product-framing.md`](../00-product-framing.md) § Resident LOD.

#### R2-2 — kNN at full-corpus scale won't ship as one parquet

`paper_knn_top20` at 1M papers ≈ 80 MB minimum. Bundle has no kNN
lane today (`packages/graph/src/types/bundle.ts:19`); only
`base_points` / `base_clusters` are mandatory at first paint
(`apps/web/features/graph/lib/fetch/constants.ts:10`).

**Resolution:** Tiered kNN shipping. Per-cluster shards (OPFS-
cached), resident-set kNN, optional engine/API fallback. Per
[`02-data-contract.md`](../02-data-contract.md) § Sharded / lazy
+ [`14-bundle-build-pipeline.md`](../14-bundle-build-pipeline.md)
§ Step 5.

### IMPORTANT

#### R2-3 — `@cosmos.gl/graph` is not a drop-in

License correct. But the engine provides array-level graph
rendering/selection only. Current `<Cosmograph>` owns DuckDB
binding, labels, styling props, callbacks, filtering
(`GraphRenderer.tsx:442`); widgets use Cosmograph internal
crossfilter API and `@cosmograph/ui`. Replacement = full widget +
DuckDB binding + label + Mosaic-promotion-to-direct-dep rewrite.

**Resolution:** [`13-2d-map-vendor-replacement.md`](../13-2d-map-vendor-replacement.md)
§ Scope of the port; M8 sub-milestones.

#### R2-4 — WebGPU was internally inconsistent

Plan said WebGPU primary but sequenced M7 after M2. If M2 ships
first, WebGL2-`GPUComputationRenderer` is the *real* primary.
TSL targeting WGSL/GLSL doesn't make one WebGPU compute kernel
automatically equivalent to a WebGL2 ping-pong fragment pipeline.

**Resolution:** One contract, two implementations. Per
[`17-rendering-stack-evolution.md`](../17-rendering-stack-evolution.md),
[`decisions/2026-04-24-webgpu-target.md`](../decisions/2026-04-24-webgpu-target.md).

#### R2-5 — Current GLSL doesn't TSL-port cleanly

Orb uses raw `ShaderMaterial` strings with custom noise,
`#define`, `gl_PointSize`, `gl_PointCoord`, `gl_FragColor`,
`discard` (`field-vertex-motion.glsl.ts:62`,
`field-shaders.ts:26`). Picking is WebGL-specific
(`field-picking.ts:34`). M7 is a real rewrite.

**Resolution:** [`17-rendering-stack-evolution.md`](../17-rendering-stack-evolution.md)
§ TSL port reality check + [`milestones/M7-webgpu-port.md`](../milestones/M7-webgpu-port.md).

#### R2-6 — Hybrid noise + GPGPU works only with explicit center split

Today `computeFieldDisplacement` uses `position` both as base
center AND noise input (`field-vertex-motion.glsl.ts:226`).

**Resolution:** Center split. Per
[`03-physics-model.md`](../03-physics-model.md) § Center split.

#### R2-7 — `evidenceSignalOverlay` violated three-layer rule

Plan called it "inward pulse" (spatial) AND "overlay = styling-
only" (non-spatial).

**Resolution:** Split into `evidencePulse` (Layer 2) +
`evidenceMark` (Layer 3). Per
[`10-force-vocabulary.md`](../10-force-vocabulary.md),
[`11-three-layer-composition.md`](../11-three-layer-composition.md),
[`decisions/2026-04-24-search-as-headliner.md`](../decisions/2026-04-24-search-as-headliner.md)
§ Sub-decision.

#### R2-8 — SPECTER2 shards aren't a "feels-instant" search path

Repo docs scope SPECTER2 to graph-build / relatedness, not
runtime retrieval (`docs/rag/02-warehouse-schema.md:1206`,
`docs/rag/07-opensearch-plane.md:1307`). int8 768-d crosses ~5
MiB at ~6.8K vectors raw; first-query lazy load won't feel
instant.

**Resolution:** Per-scope shards as enhancement, NOT live-search
path. Per
[`decisions/2026-04-24-embeddings-shards.md`](../decisions/2026-04-24-embeddings-shards.md).

### NIT

#### R2-9 — docs/orb/ split is mostly right

Don't merge `09-search-and-rag-excitation.md` with
`10-force-vocabulary.md`; search is a workflow, force vocabulary
is the mechanics contract. Avoid duplicating
`evidencePulse` / `evidenceMark` semantics across both. Keep
`13-2d-map-vendor-replacement.md` as its own M8 vendor track.

**Resolution:** Followed verbatim. Search and force-vocabulary
are separate; vendor replacement has its own track.

## What canonical had right and the integrated plan must keep

Codex called this out and it's preserved verbatim in
[`00-product-framing.md`](../00-product-framing.md) § Anti-hairball
constraints:

- Search-first ingress.
- Ranked list as authoritative surface.
- Tiered / intent-revealed edges.
- Reduced-motion / Pause-motion / low-power profiles.
- Baked stable layout from publish-time UMAP-seeded ForceAtlas2.
- "Never an undifferentiated corpus graph" — anti-hairball
  guard.

## Cited file paths

`apps/web/features/field/asset/point-source-registry.ts:22`
`docs/rag/05b-graph-bundles.md:1078`
`docs/map/graph-runtime.md:130`
`packages/graph/src/types/bundle.ts:19`
`apps/web/features/graph/lib/fetch/constants.ts:10`
`apps/web/features/graph/cosmograph/GraphRenderer.tsx:442`
`apps/web/features/graph/cosmograph/widgets/init-crossfilter-client.ts:3`
`apps/web/features/graph/cosmograph/widgets/FilterBarWidget.tsx:4`
`apps/web/features/graph/cosmograph/widgets/TimelineWidget.tsx:4`
`apps/web/features/field/renderer/field-vertex-motion.glsl.ts:62, 226`
`apps/web/features/field/renderer/field-shaders.ts:26`
`apps/web/features/field/renderer/field-picking.ts:34`
`apps/web/features/field/renderer/field-picking-material.ts:15`
`apps/web/features/field/renderer/FieldScene.tsx:69, 160`
`apps/web/features/orb/bake/apply-paper-overrides.ts:51`
`docs/rag/02-warehouse-schema.md:1206`
`docs/rag/07-opensearch-plane.md:1307`
`apps/web/features/graph/lib/cosmograph-selection.ts:1, 222`

## External sources cited by Codex

- Three.js `WebGPURenderer` docs (https://threejs.org/manual/en/webgpurenderer).
- Three.js TSL docs (https://threejs.org/docs/TSL.html).
- Cosmograph licensing page (https://cosmograph.app/licensing).
