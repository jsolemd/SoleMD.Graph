# Orb 3D — documentation index

> **Status (2026-04-27 amendment).** The R3F `<GraphOrb>` /
> `Graph3DSurface` / `/orb-dev` point-cloud prototype described
> throughout this docset has been retired from the product path. The
> current 3D primary is `OrbSurface` with a raw WebGPU-owned
> `OrbWebGpuCanvas` for the orb particle core. Paper identity streams
> from DuckDB into WebGPU storage buffers; compute picking resolves
> hover/click/rectangle selection. The landing field may still use the
> legacy R3F/WebGL canvas, and 2D remains the native Cosmograph mount
> via `DashboardShell` (the same path `/map` uses). The renderer-mode
> toggle on `/graph` is `'3d' | '2d'` with `'3d'` default.
>
> The field/orb WebGPU target is now WebGPU-only, not a WebGL2/WebGPU
> compatibility migration. Unsupported browsers/devices get a controlled
> unsupported state. The migration plan lives in
> [`milestones/M7-webgpu-port.md`](milestones/M7-webgpu-port.md).
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
5. [`17-rendering-stack-evolution.md`](17-rendering-stack-evolution.md) — WebGPU-only field runtime, hard gate, storage buffers, instanced billboards.
6. [`10-force-vocabulary.md`](10-force-vocabulary.md) — `focus`, `scope`, `clusterFocus`, `entityFocus`, `evidencePulse`, `evidenceMark`, `pulseImpulse`, `tug`.
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

- **Render-vs-physics lane separation** — paper visual mappings are
  centralized in `apps/web/features/orb/bake/orb-paper-visual-mapping.ts`
  and packed for WebGPU by
  `apps/web/features/orb/webgpu/orb-webgpu-particles.ts`. Live orb
  state uses storage-buffer lanes (`position`, `velocity`,
  `attributes`, `flags`); simulation state remains separate from visual
  derivations. Never overload one lane with another meaning.
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
- **WebGPU-only field runtime** — new field/orb work targets a hard
  WebGPU gate, storage-buffer particle state, instanced billboard
  rendering, compute picking, and WebGPU compute. Unsupported devices
  get an unsupported state, not a WebGL2 field runtime.
- **One semantic contract, one shipped field backend** — the effect
  schedule remains product-semantic, but M7 implements it through a
  WebGPU-only field runtime. The optional 2D lens remains a separate
  Cosmograph/WebGL dependency until M8 or upstream support changes that.

## Conventions

- Each top-level file is **≤ 300 lines**. Split if it grows.
- Each file states **what it owns**, **what it doesn't own**,
  **prerequisites**, **consumers**, and **invalidation conditions**
  for any decisions inside.
- File-path references use `apps/web/...:LINE` or
  `packages/graph/...:LINE` so the next agent can `Read` directly.
- Decision files are dated and name the alternatives that were
  considered.
