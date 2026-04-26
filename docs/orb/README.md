# Orb 3D — documentation index

> **Status (2026-04-25 amendment).** The R3F `<GraphOrb>` /
> `Graph3DSurface` / `/orb-dev` point-cloud prototype described
> throughout this docset has been retired from the product path. The
> current 3D primary is `OrbSurface` on the persistent FieldCanvas
> (paper identity overlaid on the 16,384-particle field substrate);
> 2D is the native Cosmograph mount via `DashboardShell` (the same
> path `/map` uses). The renderer-mode toggle on `/graph` is
> `'3d' | '2d'` with `'3d'` default.
>
> Files in this docset that describe the abandoned R3F renderer are
> kept for historical context but should not be used as the spec for
> further implementation. Read alongside `apps/web/features/orb/surface/OrbSurface.tsx`
> and `apps/web/features/graph/orb/GraphSurfaceSwitch.tsx` for the
> current contract.
>
> **Original status.** Living doc set. Authored 2026-04-24 after Codex round 1
> + round 2 verify-only reviews, then amended 2026-04-25 after the
> third-round architecture review. The product target is now explicit:
> the 3D orb becomes the primary graph workspace; 2D remains available
> as an optional analytic lens. The plan file lives at
> `~/.claude/plans/handoff-written-to-docs-future-orb-3d-co-synthetic-liskov.md`
> (post-approval). This folder is the deliverable.

## Reading order

If you're new to this work, read **top-to-bottom**:

1. [`00-product-framing.md`](00-product-framing.md) — 3D-primary workspace, 2D analytic lens. Anti-hairball constraints.
2. [`01-architecture.md`](01-architecture.md) — single source of truth, native 3D workspace, optional 2D renderer.
3. [`02-data-contract.md`](02-data-contract.md) — bundle schema, capability versioning.
4. [`03-physics-model.md`](03-physics-model.md) — hybrid ambient + wake; one kernel contract, two implementations.
5. [`10-force-vocabulary.md`](10-force-vocabulary.md) — `focus`, `scope`, `clusterFocus`, `entityFocus`, `evidencePulse`, `evidenceMark`, `pulseImpulse`, `tug`.
6. [`11-three-layer-composition.md`](11-three-layer-composition.md) — how the effects compose.
7. [`09-search-and-rag-excitation.md`](09-search-and-rag-excitation.md) — the headliner.

Then by topic:

- **Renderer + interaction**: [04 Renderer](04-renderer.md) → [05 Picking](05-picking.md) → [06 Camera](06-camera-and-rotation.md) → [07 Selection](07-selection.md) → [16 Gestures](16-gesture-arbitration.md).
- **Filtering + state**: [08 Filter+timeline](08-filter-and-timeline.md) → [12 Info panel + wiki](12-info-panel-and-wiki.md).
- **Engineering tracks**: [13 2D lens posture](13-2d-map-vendor-replacement.md) -> [14 Bundle build](14-bundle-build-pipeline.md) -> [17 Rendering stack evolution](17-rendering-stack-evolution.md).
- **Quality + rollout**: [15 A11y + low-power](15-accessibility-and-low-power.md) → [18 Verification + rollout](18-verification-and-rollout.md).

Implementation: [`milestones/`](milestones/) M0 → M8 in dependency order.

Constraint trail: [`decisions/`](decisions/) explains the load-bearing
choices and what would invalidate them.

Background: [`reference/`](reference/) has the lane rule + the Codex
review transcripts.

## What this docset replaces / extends

- **`docs/future/graph-orb-3d-renderer.md`** — preserved as the prior
  canonical plan (~600 lines, two earlier review rounds). This docset
  *integrates and overrides* a few of its load-bearing reframes (most
  notably the "different scopes" split — see
  [`decisions/2026-04-24-scope-collapse.md`](decisions/2026-04-24-scope-collapse.md)).
- **`docs/future/orb-3d-cosmograph-port-handoff.md`** — preserved as
  the framing handoff that opened this work. Its 16 open questions
  are resolved across [10 Force Vocabulary](10-force-vocabulary.md),
  [03 Physics Model](03-physics-model.md), and the [`decisions/`](decisions/) set.
- **`docs/future/orb-mass-normalization-port.md`** — still the
  canonical lane rule reference. Pointer in
  [`reference/lane-rule.md`](reference/lane-rule.md).

## Cross-cutting principles

Every file in this docset honors:

- **Render-vs-physics lane separation** — visual render attributes
  (`aSpeed`, `aClickPack`, `aBucket`, `aFunnel*`) are written by
  surface code; physics state (`posTex`, `velTex`, `selectionMask`,
  `filterMask`, `excitationTex`) lives in dedicated GPGPU lanes.
  Never overloaded. Codified at
  `apps/web/features/orb/bake/apply-paper-overrides.ts:51`.
- **Single source of truth in DuckDB + Zustand** — both
  the 3D workspace and optional 2D lens read the same view chain and
  subscribe to the same store; no parallel state.
- **3D-primary product posture** — prompt/search, ranked results,
  info panel, wiki content, filters, selection, and RAG state all live
  in the 3D `/graph` workspace. 2D is a toggleable analytic lens over
  the same state, not a separate product or the default long-term
  destination.
- **Resident LOD** — orb renders the active scope intersected with a
  render budget (~16K particles baseline; up to ~30K on desktop).
  Selection model is over the whole scope; physics simulates the
  resident set. See [`01-architecture.md`](01-architecture.md) §
  Resident LOD.
- **Focus-aware residency** — when an interaction asks the galaxy to
  explain a paper or result set, the resident budget first reserves
  the focused paper, its 1-hop citation neighbors, high-weight kNN
  neighbors, and result/evidence members. Quantile sampling only fills
  the remaining budget.
- **Anti-hairball guard** — search-first ingress, ranked list as
  authoritative surface, tiered/intent-revealed edges. From the
  canonical plan's product thesis; preserved verbatim.
- **2026 stack first** — new orb work is WebGPU/TSL-first where
  available, with a WebGL2 compatibility backend for devices that do
  not support WebGPU. No CPU `d3-force-3d` runtime at resident scale.
- **One semantic contract, backend-native implementations** — the
  effect schedule is renderer-agnostic; the WebGPU path uses native
  three.js WebGPU/TSL compute/storage buffers, while WebGL2 uses
  `GPUComputationRenderer` ping-pong only as compatibility.

## Conventions

- Each top-level file is **≤ 300 lines**. Split if it grows.
- Each file states **what it owns**, **what it doesn't own**,
  **prerequisites**, **consumers**, and **invalidation conditions**
  for any decisions inside.
- File-path references use `apps/web/...:LINE` or
  `packages/graph/...:LINE` so the next agent can `Read` directly.
- Decision files are dated and name the alternatives that were
  considered.
