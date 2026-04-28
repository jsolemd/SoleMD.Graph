# Reference — Codex review round 1

> Historical reference. The 2026-04-25 amendment changed the
> Cosmograph conclusion from "mandatory replacement" to "native
> Cosmograph is acceptable while use remains non-commercial." The
> 2026-04-27 amendment changed the field/orb rendering stack to a
> WebGPU-only runtime with unsupported-browser state. See
> [`../decisions/2026-04-24-cosmograph-license.md`](../decisions/2026-04-24-cosmograph-license.md)
> and [`../decisions/2026-04-24-webgpu-target.md`](../decisions/2026-04-24-webgpu-target.md).

**Run:** `Skill(codex:rescue, ...)` after the initial integrated
plan synthesis. **Findings folded into:** the first revision of
the plan and into `docs/future/graph-orb-3d-renderer.md` notes.

## Findings (severity-tagged)

### BLOCKER

- **Cosmograph license claim was wrong.** `@cosmograph/cosmograph`,
  `@cosmograph/react`, and `@cosmograph/ui` are CC-BY-NC-4.0
  (non-commercial) locally
  (`package-lock.json:737, 761, 774`). Underlying
  `@cosmos.gl/graph` is MIT (`package-lock.json:791`). The
  original handoff's GPL caveat was wrong, but my MIT claim was
  also wrong. Codex confirmed via npm + Cosmograph's licensing
  page.

  **Resolution:** [`decisions/2026-04-24-cosmograph-license.md`](../decisions/2026-04-24-cosmograph-license.md)
  + [`milestones/M8-cosmograph-vendor-replacement.md`](../milestones/M8-cosmograph-vendor-replacement.md).

### IMPORTANT

1. **Lane rule honored, but `field-attribute-baker.ts:16`
   doc-string drifts.** Calls `aClickPack.xyz` "written by orb
   physics." Should be "written by click-attraction handler."

   **Resolution:** Tightened in
   [`milestones/M2-orb-renderer-hybrid-physics.md`](../milestones/M2-orb-renderer-hybrid-physics.md)
   files list.

2. **TSL/WebGPU "one-line swap" oversold.** Three's docs say
   `WebGPURenderer` does NOT support `ShaderMaterial` /
   `RawShaderMaterial`. Real port, not syntax migration.

   **Resolution:** Reframed M7 as a discrete renderer + material
   port milestone in
   [`17-rendering-stack-evolution.md`](../17-rendering-stack-evolution.md)
   and [`milestones/M7-webgpu-port.md`](../milestones/M7-webgpu-port.md).

3. **WebGL2 "single TSL kernel per timestep" misframes the
   floor.** Three's `GPUComputationRenderer` is variable-based
   ping-pong, separate position+velocity passes. A single
   storage-buffer compute kernel is a WebGPU concept.

   **Resolution:** superseded by the 2026-04-27 WebGPU-only decision.
   WebGL2 is no longer a shipped field/orb runtime path.

4. **Force model defensible only with stable baked equilibrium.**
   Sparse kNN + citation springs match connectome framing better
   than global Barnes-Hut, but local spatial-hash repulsion alone
   does not replace global layout quality. Baked equilibrium from
   publish-time UMAP-seeded ForceAtlas2 is the answer.

   **Resolution:** [`14-bundle-build-pipeline.md`](../14-bundle-build-pipeline.md)
   § Step 2 — ForceAtlas2 refinement.

5. **F3 (filter+timeline) requires explicit `paperId →
   particleIdx` mask writer.** Orb's particle index is
   reservoir-sampled (`use-paper-attributes-baker.ts:190`); /map's
   filter widgets work over graph point indices. Same
   `filteredIndices` is false today without a translation layer.

   **Resolution:** [`milestones/M1-canonical-views-and-mask-writer.md`](../milestones/M1-canonical-views-and-mask-writer.md)
   + [`08-filter-and-timeline.md`](../08-filter-and-timeline.md)
   § paperId↔particleIdx mask writer.

6. **Filter widgets do NOT port verbatim.** `FilterBarWidget`,
   `FilterHistogramWidget`, `TimelineWidget` import
   `@cosmograph/ui` and Cosmograph internals. Reuse the Mosaic
   clause/SQL builder logic, not the components.

   **Resolution:** [`08-filter-and-timeline.md`](../08-filter-and-timeline.md)
   § Mosaic-vs-widget split.

7. **F6 sequencing self-contradicted.** Plan put search excitation
   after live GPGPU sim but later said it ships without engine
   changes. Resolution: split highlight (early) from coalescence
   (after live sim).

   **Resolution:** Headliner promoted into M3a/M3b
   ([`decisions/2026-04-24-search-as-headliner.md`](../decisions/2026-04-24-search-as-headliner.md)).

8. **Bundle scale under-specified.** kNN at full-corpus scale
   doesn't ship as one parquet. Resident-LOD framing.

   **Resolution:** Round 2 BLOCKER R2-2 →
   [`02-data-contract.md`](../02-data-contract.md) § Sharded /
   lazy.

9. **UMAP-3D alone insufficient.** UMAP-seeded ForceAtlas2 is
   the right baked layout.

   **Resolution:** [`14-bundle-build-pipeline.md`](../14-bundle-build-pipeline.md)
   § Step 2.

### NIT

- **Rapier rejection correct.** `@dimforge/rapier3d-compat`
  exists transitively but is not a direct dep. "No Rapier" =
  no direct simulation architecture, not "uninstall transitively."

## Cited file paths

(Preserved verbatim from Codex output for traceability.)

`package-lock.json:737, 761, 774, 791, 742, 931, 5560`
`apps/web/features/orb/bake/apply-paper-overrides.ts:51`
`apps/web/features/field/renderer/field-vertex-motion.glsl.ts:236`
`apps/web/features/field/asset/field-attribute-baker.ts:16`
`apps/web/features/field/renderer/FieldScene.tsx:69, 160`
`node_modules/three/examples/jsm/misc/GPUComputationRenderer.js:16`
`apps/web/features/orb/bake/use-paper-attributes-baker.ts:190`
`apps/web/features/graph/lib/cosmograph-selection.ts:222`
`apps/web/features/graph/cosmograph/widgets/FilterBarWidget.tsx:4`
`apps/web/features/graph/cosmograph/widgets/init-crossfilter-client.ts:3`
`apps/web/features/graph/cosmograph/widgets/use-widget-selectors.ts:4`
`docs/rag/05b-graph-bundles.md:1076`
`docs/map/graph-runtime.md:123`
`docs/future/graph-orb-3d-renderer.md:6, 33`

## External sources cited by Codex

- npm Cosmograph package page.
- Cosmograph licensing page (https://cosmograph.app/licensing).
- Three.js WebGPURenderer docs.
- D3 force-many-body docs.
- Rapier docs.
- Can I Use WebGPU.
