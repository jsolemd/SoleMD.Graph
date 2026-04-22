# GraphOrb + Shell Extraction — Team Implementation Handoff

> Status: handoff to an implementation team. Authoritative plans this handoff drives from: `docs/future/graph-orb-3d-renderer.md` (physics orb) and `docs/future/graph-landing-stealth-handoff.md` (shared shell). Both must be read by every team member before starting. This doc partitions work, sequences it, and names the contracts where teammates meet.

## 0. What's being built, in one paragraph

A 3D force-directed "orb" renderer for the ~5–10k release-scoped *evidence* papers of SoleMD (papers the RAG has actually cited), alongside the existing 2D Cosmograph map for the full ~1M-paper corpus. The orb's positions are baked at publish time (UMAP-seeded ForceAtlas2 with cluster-affinity + soft UMAP anchor). In the browser, a `d3-force-3d` sim sleeps at baked equilibrium and wakes only when the user interacts — click, hover, filter, cluster-focus, RAG-answer arrival. Every wake reshapes the force field to make a *semantic* relationship visible: click a paper, its IDF-weighted neighbors pull inward. Both the orb and the map mount simultaneously inside a shared `<GraphShell>` component served from both `/` (landing) and `/graph` (direct); scope toggle between orb and map is a `visibility` flip. Internal "enter graph" from landing is a scroll-to-end, not a route navigation. Done right, this is the first shipped product that uses physics *dynamics* (not just physics-as-layout) as a semantic channel for scientific-literature exploration.

## 1. Required reading before writing code

Every teammate reads these in order, start to finish. Do NOT skim.

1. `docs/future/graph-orb-3d-renderer.md` — physics orb plan. Read the "Product thesis," "Product framing," all 24 Review corrections, "Physics vocabulary," and every milestone (M0 through M6). The "Implementation milestones" section is authoritative; earlier tracks are historical context.
2. `docs/future/graph-landing-stealth-handoff.md` — shared-shell plan. Read in full. This is the architectural substrate the orb work depends on.
3. `.claude/skills/graph/SKILL.md` — architecture + ownership contract.
4. `.claude/skills/graph/references/frontend-performance.md` — non-negotiable runtime perf rules. Record the current cold `/graph` first-paint ms numbers before M5b.
5. `docs/rag/15-repo-structure.md` — locked repo shape.
6. `docs/map/graph-runtime.md` — browser + DuckDB + bundle runtime.
7. The CLAUDE.md files at `/`, `apps/web/`, and the user-CLAUDE at repo root.

Each role's brief (Section 5 below) lists additional role-specific reading.

## 2. Prerequisites and gates

These must hold before the team starts Wave 1:

- **Stealth-handoff Milestone 1 spike landed.** The single-shell spike has been built and the three open questions from `graph-landing-stealth-handoff.md` §Open-questions are answered empirically:
  1. Does Cosmograph tolerate `visibility: hidden` first-paint cleanly?
  2. Do two simultaneous WebGL contexts on the same page work on mid-range desktop + Galaxy S26 Ultra?
  3. Does a hidden Cosmograph canvas stay warm across scope toggles?
- **Baseline perf numbers recorded.** Cold `/graph` first-paint measured on a mid-range laptop and Galaxy S26 Ultra per the frontend-performance skill. Numbers committed to a tracked location so M5b's budget (`T_ms_map + 300ms` desktop, `+600ms` mobile) is anchored to something real.
- **Product-owner sign-off on the Product thesis.** The orb's reason to exist is the physics-as-semantic-channel thesis. If product isn't aligned, the team must not start — the orb collapses into a spinning hairball without that discipline.
- **Biomedical-knowledge owner sign-off on the entity-type allowlist.** The first-pass set (drugs, diseases, receptors, mechanisms, pathways, chemicals) must be curated against real pubtator data. A too-broad allowlist makes glue-cliques; too-narrow makes the orb sparse.

Gate means: **blocked until done**, not "nice to have."

## 3. Team composition — 7 roles, peer-to-peer

Suggested. Adjust to headcount.

| Role | Owns | Primary files | Key reading beyond Section 1 |
|---|---|---|---|
| **R1 Publisher** | M0 — worker bake, parquets, manifest, JSON spec, CI hash | `apps/worker/app/graph/layout_3d.py`, `apps/worker/app/graph/publish.py`, `db/migrations/warehouse/<ts>_warehouse_graph_orb_release_surfaces.sql`, `packages/graph/spec/entity-edge-spec.json`, `packages/graph/spec/__tests__/entity-edge-spec.hash.test.ts` | bhargavchippada/forceatlas2 docs, pubtator schema, research report lines on force layout |
| **R2 Views** | M1 — canonical views extended, centroid attach, weight column | `apps/web/features/graph/duckdb/views/orb.ts`, `views/base-points.ts`, `views/active-points.ts`, `views/register-all.ts`, `packages/graph/src/entity-edge-spec.ts` (thin re-export) | `apps/web/features/graph/duckdb/session/index.ts`, existing view SQL in `views/*.ts` |
| **R3 Shell** | Stealth-handoff M2 — extract `<GraphShell>`, hybrid routes, scroll-to-end wiring | `apps/web/app/page.tsx`, `apps/web/app/graph/page.tsx`, new `apps/web/features/graph/components/shell/GraphShell.tsx`, reshuffled `DashboardShell` body | `stealth-handoff.md` in full, `use-dashboard-shell-controller.ts`, existing `DashboardShell` and `FieldLandingPage` |
| **R4 Render** | M2 render side — `THREE.Points`, shaders, picking, rotation, camera | `apps/web/features/graph/orb/render/GraphOrb.tsx`, `render/shaders.ts`, `render/picking.ts`, `render/rotation-controller.ts`, `render/camera-persistence.ts`, `render/point-buffers.ts` | `@react-three/fiber`, `@react-three/drei` `<CameraControls>`, Three.js `BufferAttribute` `updateRanges` + `DynamicDrawUsage` |
| **R5 Sim** | M2 sim side + M3b + M3c — force accumulator, physics vocabulary, composition | `apps/web/features/graph/orb/sim/simulation.ts`, `sim/force-effects.ts`, `sim/effect-bindings.ts`, `sim/centroid-cache.ts`, `sim/force-generation.ts`, `sim/overlay-state.ts` | `d3-force-3d` README in full (forces are named-slot, not additive — see correction H5), the three-layer composition rules |
| **R6 Interact** | M3a — gestures, selection, state-authority fields | `apps/web/features/graph/orb/interact/gesture-arbiter.ts`, `interact/selection.ts`, `interact/SelectionToolbar.tsx`, `stores/slices/selection-slice.ts` extensions, rename `lib/cosmograph-selection.ts` → `lib/graph-selection.ts` | Gesture arbitration table in correction 19 + M3a; pointer-events idioms; existing selection plumbing in `duckdb/views/selection.ts` |
| **R7 Edges + Toggle** | M4 (edges) + M5a (toggle, view-slice, search-first ingress) | `apps/web/features/graph/orb/render/edges.ts`, `render/edge-geometry.ts`, `duckdb/views/entity-edges.ts`, `duckdb/queries/orb-edges.ts`, `stores/slices/view-slice.ts`, `lib/renderer-flags.ts`, chrome segmented toggle | Edge tier strategy in M4; reduced-motion + capability-version gate in corrections 21/24 |

Roles are ownership boundaries, not exclusion rules. Teammates read each other's code. But nobody commits into someone else's primary files without a handoff.

## 4. Dependency map and wave plan

```
Wave 1 (parallel, days 1–N)
├── R1 Publisher (M0)         ── blocks R2, R7
└── R3 Shell (stealth M2)     ── blocks R7

Wave 2 (starts when R1 publishes test fixture; R3 shell extracted)
├── R2 Views (M1)             ── blocks R4, R5, R7
└── R4 Render scaffold (M2)   ── can mock data from R2 briefly if needed

Wave 3 (starts when R2 ships views + R4 has a mountable orb)
├── R5 Sim (M2 sim + M3b)     ── needs R4 to mount it
├── R6 Interact (M3a)         ── needs R4 for pointer surface; feeds R5 dispatches
└── R7 Edges (M4)             ── needs R1 spec + R2 view + R4 render

Wave 4 (parallel, post-core)
├── R5 Extended physics (M3c)
├── R7 Toggle UI (M5a)        ── needs R3 shell done
└── R1/R2 Tuning-gate support for M0 sign-off
```

**Critical path**: R1 (publisher M0 tuning gate) + R3 (shell extraction) both start day 1. If either is blocked, the whole team slips.

## 5. Per-role kickoff briefs

Each brief is self-contained. Copy into the teammate's working prompt.

### R1 — Publisher kickoff

> You own M0 end-to-end. Your deliverables:
>
> 1. Canonical `packages/graph/spec/entity-edge-spec.json` (entity-type allowlist, IDF rarity weighting formula with constants, min-shared-entity threshold=2, top-K-per-node=30, edge weight formula `weight = α · citation_weight + β · idf_entity_weight` with committed α, β). Consult the biomedical-knowledge owner on the allowlist before locking.
> 2. CI hash test: `packages/graph/spec/__tests__/entity-edge-spec.hash.test.ts` asserts `sha256(canonical_json(spec))` equals a committed hash constant. Python publisher build must assert the same hash against its loaded JSON before producing any parquet.
> 3. `solemd.release_evidence_members` warehouse view (release-scoped aggregation of `graph_signals`). Migration in `db/migrations/warehouse/<timestamp>_warehouse_graph_orb_release_surfaces.sql`.
> 4. Publisher step `apps/worker/app/graph/layout_3d.py`: 3D UMAP seed → ForceAtlas2 refinement (`dim=3`, `linLogMode=True`, same-cluster edge-weight ×2, soft UMAP anchor via weak gravity, 200–400 iters). Library: `bhargavchippada/forceatlas2`. Wall-clock ≤30s at 10k nodes on non-GPU CI. New deps added to `apps/worker/pyproject.toml`: `umap-learn`, `numpy`, `scipy`, `scikit-learn`, `forceatlas2`. Worker image grows ~300MB; committed.
> 5. Publisher emits three new parquets:
>    - `release_points_3d.parquet` — columns per M0 column contract
>    - `release_evidence_members.parquet` — columns per M0 column contract
>    - `release_cluster_centroids.parquet` — columns per M0 column contract
>    - `universe_links.parquet` must carry a `weight` column (add if absent) per the canonical formula
> 6. Manifest: `orbCapabilityVersion: u8`, `releasePoints3d?`, `releaseEvidenceMembers?`, `releaseClusterCentroids?`, `entity_edge_spec_hash`, and layout parameters for debug/audit.
> 7. `packages/graph/src/types/bundle.ts` updated with the new optional keys.
> 8. **Tuning gate**: produce render sheets at 5k, 8k, 10k fixture sizes; run the quantitative criteria (intra-cluster distance, linked-pair distance, NN overlap after Procrustes ≥ 0.8 between reruns); 20-paper exemplar audit; product + runtime owner sign-off *before* the parquet contract is locked for downstream teammates.
>
> Blocks: R2 (needs fixture bundles), R7 (needs spec JSON for entity edges).
>
> Must read: the research-report library section on FA2 vs SFDP; pubtator schema (verify entity tables have the columns the spec references); the Product thesis (ensure your layout supports the thesis, not fights it).
>
> Anti-patterns:
> - Do NOT re-derive edge weights at different stages. The publisher computes the final `weight`; every downstream consumer reads it.
> - Do NOT skip the tuning gate. Parquet contract is NOT locked until sign-off.
> - Do NOT ship with a too-broad entity-type allowlist. Common entities create glue-cliques that fake the orb's structure.
> - Do NOT claim floating-point-epsilon reproducibility — the verify contract is structural stability (NN-overlap after Procrustes), not byte-identical.

### R2 — Views kickoff

> You own M1. Your deliverables:
>
> 1. `apps/web/features/graph/duckdb/views/orb.ts` — optional-table attach logic + empty placeholder views if optional tables are missing.
> 2. Extend canonical `current_points_*` view chain: LEFT JOIN `release_points_3d` on `sourcePointIndex → point_index`, exposing `x3, y3, z3, cluster_id_3d`. LEFT JOIN `release_evidence_members`, exposing `signalCount, dominantKind, earliestSeenAt, lastSeenAt`.
> 3. Register `release_cluster_centroids` as a table; runtime reads via `SELECT * FROM release_cluster_centroids`.
> 4. Extend `current_links_web` to always expose the `weight` column from `universe_links.parquet`.
> 5. `packages/graph/src/entity-edge-spec.ts` — thin re-export of the JSON with a typed `satisfies` or Zod schema. TS callers import from here.
> 6. Bootstrap registration in `views/register-all.ts` handles both pre-orb (no optional tables) and orb-capable bundles transparently.
> 7. Tests: pre-orb bundle + orb-capable bundle, `DESCRIBE current_points_web` returns nullable orb columns in both cases; existing 2D tests unchanged; `WHERE signalCount > 0 AND x3 IS NOT NULL` returns non-zero on orb-capable, zero on pre-orb.
>
> Blocks: R4, R5, R7.
>
> Must read: current `views/*.ts` and `register-all.ts`, `GraphCanvasSource` type, `sql-helpers.ts`.
>
> Anti-patterns:
> - Do NOT create a `current_points_orb_*` view family. One canonical lineage (see correction 4).
> - Do NOT re-derive entity edges at runtime without respecting the canonical `weight` formula. The runtime view emits the same `weight` the publisher used.
> - Do NOT change existing 2D query shapes; additive columns only.

### R3 — Shell kickoff

> You own the stealth-handoff Milestone 2 (the architectural substrate the orb depends on). You are NOT writing orb code in this milestone; you are making the shell possible. Your deliverables:
>
> 1. Confirm the Milestone 1 spike answers remain true on the target branch (see the "Prerequisites" section of the handoff).
> 2. Extract the current `DashboardShell` body into `apps/web/features/graph/components/shell/GraphShell.tsx` accepting a `mode: 'landing' | 'graph'` prop. Preserve all existing 2D Cosmograph behavior exactly — this milestone ships with no orb yet.
> 3. `apps/web/app/page.tsx` → `<GraphShell mode="landing">`. Existing landing scroll chapters move into the shell's tree under `mode="landing"`. Scroll starts at top. Chrome hidden until last chapter.
> 4. `apps/web/app/graph/page.tsx` → `<GraphShell mode="graph">`. Scroll starts at end (programmatic jump on mount). Chrome live.
> 5. Retire the cross-route internal flow: the warmup-ready action scrolls in place; no `router.push`.
> 6. `useGraphWarmup` extended to return `{sessionReady, orbReady, mapReady}`. `orbReady` and `mapReady` return false until R4/R7 wire them; `sessionReady` is today's behavior.
> 7. Tests: `/` → scroll-to-end is zero-loading (same mount); `/graph` direct entry is a cold mount with the existing loading overlay (accepted).
>
> Blocks: R7 toggle (needs shell structure).
>
> Must read: `graph-landing-stealth-handoff.md` in full; `FieldLandingPage.tsx`, `DashboardShell`, `use-dashboard-shell-controller.ts`, `apps/web/app/layout.tsx`.
>
> Anti-patterns:
> - Do NOT introduce a persistent canvas above the route tree — the hybrid-route plan explicitly avoids that. Shell-per-route is the pattern.
> - Do NOT remove the `/graph` URL entry. Deep links are a product requirement.
> - Do NOT change Cosmograph lifecycle assumptions during the extract.

### R4 — Render kickoff

> You own M2 render side. Your deliverables:
>
> 1. `apps/web/features/graph/orb/render/GraphOrb.tsx` — mounts inside `<GraphShell>`, owns disposal orchestration.
> 2. `render/point-buffers.ts` — reads `(x3, y3, z3, cluster_id_3d)` from DuckDB; packs `Float32Array`s; returns buffer attributes ready to bind.
> 3. `render/shaders.ts` — custom `ShaderMaterial` for `THREE.Points`. Attribute streams: `position` (`DynamicDrawUsage`, full-upload during sim wake), `aColor`/`aSelection`/`aSignalCount` (`DynamicDrawUsage`, partial updates via `updateRanges`), `aIndex` (`StaticDrawUsage`). No shader breathing noise.
> 4. `render/picking.ts` — offscreen render target encoding dense integer row index as RGBA. Hover: `readRenderTargetPixelsAsync()` throttled to rAF. Click: sync readback. JS-side `indexToPaperId` Map populated lazily on first hover/click (not at buffer pack — this is a cache view, not a handoff artifact per H7).
> 5. `render/rotation-controller.ts` — group-matrix rotation state machine: `running | suspended-drag | paused-selection`. Respects `pauseMotion` from view-slice and `prefers-reduced-motion`.
> 6. `render/camera-persistence.ts` — `solemd:camera-3d` sessionStorage key; stores pose + rotation state.
> 7. `@react-three/drei` `<CameraControls>` wraps `yomotsu/camera-controls`. Click-to-focus slerps camera such that clicked point lands facing camera.
> 8. Cluster `<Html>` labels at centroid positions (centroid-cache shared with R5).
> 9. `package.json` — add `d3-force-3d` dep. (The dep belongs here; R5 consumes it.)
> 10. Disposal contract: every subsystem owned by R4 exposes `dispose()`; `GraphOrb.tsx` orchestrates on session exit or low-power teardown. Scope toggle is visibility flip, no disposal required.
>
> Blocks: R5, R6, R7.
>
> Must read: M2 in full; Three.js `BufferAttribute` docs on `updateRanges` + `addUpdateRange` + `clearUpdateRanges`; `@react-three/fiber` + drei `<CameraControls>` docs; existing `FieldScene` / `FieldCanvas` for R3F conventions in this codebase.
>
> Anti-patterns:
> - Do NOT use `updateRanges` for positions during sim wake. Every node updates; it's a full-buffer upload. Range updates are for per-change attributes only.
> - Do NOT try to encode `paperId` as a float in picking. Dense integer index only; resolve to `paperId` via the JS Map.
> - Do NOT add shader breathing noise — physics is the aliveness channel.
> - Do NOT leak on unmount. The shell outlives the route render; dispose explicitly on session exit, not on React unmount alone.

### R5 — Sim kickoff

> You own M2 sim side and all of M3b + M3c. Your deliverables:
>
> 1. `sim/simulation.ts` — ONE `d3-force-3d` simulation per orb mount. Custom force functions registered at creation. Sleep-at-rest discipline: `alphaTarget = 0` when idle; wake on perturbation; sleep when residual displacement below threshold.
> 2. `sim/force-effects.ts` — custom force functions reading overlay-state tables. Forces: anchor (always-on weak spring to baked `(x3,y3,z3)`), scope (stiff for in-scope, radial-out for out-of-scope), spatial-mode (focus/clusterFocus/entityFocus target-attraction), overlay (evidenceSignalOverlay impulses), user-gesture (tug/pulseImpulse).
> 3. `sim/overlay-state.ts` — plain JS tables keyed by pointIndex / clusterId / entityId, mutated via `register(id, payload)` / `unregister(id)`. Never swap d3 force instances; use overlay-state + custom force functions.
> 4. `sim/effect-bindings.ts` — wires store subscriptions to effect dispatch. `currentScopeRevision` scope debounced at 300ms during scrub. RAG-answer arrivals auto-fire `evidenceSignalOverlay`.
> 5. `sim/centroid-cache.ts` — reads baked centroids from `release_cluster_centroids` by default; recomputes only when sim is awake, dirty-flagged. Shared with R4 for labels.
> 6. `sim/force-generation.ts` — generation counter for rapid focus-A → focus-B retargeting. Force functions read current generation each tick; retarget cancels prior in-frame, ramps new over ~150ms.
> 7. **Three-layer composition enforced in code**: scope gates population (spatial-mode effects never pull out-of-scope in); spatial-mode is exclusive (only one of focus/clusterFocus/entityFocus active); overlay is styling-only inside active spatial mode (refuters that are focus neighbors stay at bloom position, marked via store state for R4 to render as color/halo — not as position drift).
> 8. M3b ships: `focus`, `scope`, `tug`, composition engine, wake/sleep, reduced-motion and low-power no-op behavior.
> 9. M3c ships: `clusterFocus`, `entityFocus`, `evidenceSignalOverlay`, `pulseImpulse`.
>
> Blocks: none downstream (but R6 depends on your dispatch API).
>
> Must read: d3-force-3d README in full; research-report section 2 on d3-force-3d; the physics-vocabulary + three-layer-composition sections of the orb plan; correction 15 (sleep-on-rest); correction H5 (named-slot registry vs accumulator).
>
> Anti-patterns:
> - Do NOT call `simulation.force('link', newForceLink)` mid-session. That resets internal state and breaks composition. One sim, custom force functions, overlay-state tables.
> - Do NOT let the sim tick continuously at low `alphaTarget`. That was the earlier draft; it's been replaced by wake-on-perturbation.
> - Do NOT let a `focus()` effect pull in out-of-scope neighbors. Scope is the hard gate.
> - Do NOT silently re-derive edge weights. Read `weight` from the canonical view.

### R6 — Interact kickoff

> You own M3a — the interaction contract. Your deliverables:
>
> 1. `interact/gesture-arbiter.ts` — pointer event → gesture resolution per the decision table in correction 19 / M3a. Every row is a test case.
> 2. `interact/selection.ts` — rectangle, lasso, brush. Drag preview JS-only. Pointerup → one INSERT into `selected_point_indices` + one store update. Front-facing-only default; `Shift` → through-sphere.
> 3. `interact/SelectionToolbar.tsx` — mode picker; mounts in `CanvasControls` when orb is active.
> 4. Extend `stores/slices/selection-slice.ts` with the state-authority fields: `hoveredPaperId`, `focusedPaperId`, `hoveredClusterId`, `selectedPointIndices`, `activePanelPaperId`. `useDashboardStore` is the sole writer; no local component state for these.
> 5. Rename `apps/web/features/graph/lib/cosmograph-selection.ts` → `lib/graph-selection.ts` (single `git mv`; TS compiler finds all importers).
> 6. Empty-click dismissal: clears `focusedPaperId` and `hoveredPaperId`. Does NOT clear scope/timeline/selectedPointIndices. Double-click empty resumes rotation.
> 7. Hover-on-cluster-centroid: sets `hoveredClusterId` in store; within N pixels of a cluster centroid's screen projection.
> 8. Single-paper-scope UX guard: panel exposes "Show this paper's neighborhood" action that converts scope-of-1 into `focus()`.
> 9. Multi-selection panel behavior: when `selectedPointIndices.size > 1`, panel shows summary (count, cluster breakdown, top entities, top cited) + list.
> 10. `interact/gesture-arbiter.ts` dispatches to R5's effect API — it does NOT own physics logic itself. Keep the coupling clean.
>
> Blocks: (R5 depends on your dispatch API for wiring).
>
> Must read: gesture table in correction 19 / M3a; `duckdb/views/selection.ts` + `overlay-controller.ts` for the existing selection plumbing; correction 23 (single state authority).
>
> Anti-patterns:
> - Do NOT duplicate hovered/focused state across multiple components. Single authority in the store.
> - Do NOT have `gesture-arbiter` import d3-force-3d or know about physics internals. It dispatches; R5 reacts.
> - Do NOT let rectangle/lasso write to DuckDB on every pointermove. JS preview only; one INSERT on pointerup.

### R7 — Edges + Toggle kickoff

> You own M4 (edges) and M5a (toggle + view-slice + search-first ingress). Your deliverables span two tightly-related areas:
>
> **M4 Edges:**
> 1. `duckdb/views/entity-edges.ts` — registers `orb_entity_edges_current` view. Loads the canonical JSON spec; emits `(source_point_index, target_point_index, weight, source_bitmap)` per the canonical formula. Same top-K cap as the publisher.
> 2. `duckdb/queries/orb-edges.ts` — chord aggregation SQL over citations + entity edges, grouped by cluster pair.
> 3. `orb/render/edges.ts` — tier orchestration (Tier 0 cluster chords at rest, Tier 1 hover 1-hop, Tier 2 scope-wide when <5k, Tier 3 cluster-dive). Shader attribute packing.
> 4. `orb/render/edge-geometry.ts` — straight interior chord geometry + cluster-centroid bundling.
> 5. Extends `stores/slices/links-slice.ts` with orb edge tier state + legend.
> 6. `orb/render/shaders.ts` — two-source edge shader (per-source color/alpha/thickness). R4 owns the file; you contribute the edge path.
>
> **M5a Toggle:**
> 1. `stores/slices/view-slice.ts` (new) — `activeSurface: 'map' | 'orb'`, `pauseMotion: boolean`, `lowPowerProfile: 'auto' | 'on' | 'off'`. No leaks into other slices.
> 2. `lib/renderer-flags.ts` — feature flag + `orbCapabilityVersion >= MIN_CLIENT_VERSION` gate + `prefers-reduced-motion` predicate + low-power auto-detect.
> 3. `components/chrome/ChromeBar.tsx` — segmented toggle with labels "Evidence (orb)" / "Full corpus (map)" + search-first layout (search input + ranked-list panel alongside canvas).
> 4. `GraphCanvas.tsx` — branches on `activeSurface`; both canvases already mounted via shell (R3), toggle is visibility flip.
> 5. `use-graph-bundle.ts` — exposes `orbCapabilityVersion` + `isOrbCapable(minVersion)` predicate.
> 6. Default `/graph` behavior: `activeSurface = 'map'` at M5a (M5b flips this later, post-validation).
> 7. `prefers-reduced-motion`: default surface is map; orb toggle visible; explicit entry gives static orb.
>
> Blocks: none (M5b is post-launch validation).
>
> Must read: M4 and M5a sections of the orb plan; correction 17 (edge spec JSON) + 18 (edge spec load-bearing) + 21 (capability version) + 24 (search-first ingress); `.claude/skills/graph/references/frontend-performance.md` for first-paint baselining.
>
> Anti-patterns:
> - Do NOT compute edge weights in the runtime. Read `weight` from the view.
> - Do NOT gate orb availability on "has parquet." Capability version gate.
> - Do NOT hide the orb toggle under reduced-motion. Default surface changes; toggle stays visible.
> - Do NOT ship M5a with orb as default. That is M5b, after validation.

## 6. Shared contracts — what everyone reads, nobody owns alone

These are the team seams. Violations here break every teammate downstream.

### 6.1 `packages/graph/spec/entity-edge-spec.json`
Single source of truth for: entity-type allowlist, IDF rarity weighting formula and constants, min-shared-entity threshold, top-K cap, edge weight formula. Owner: R1 authors; everyone reads. CI hash test (R1) enforces no drift.

### 6.2 `point_index` as the stable release row index
Every parquet carries it. Every JOIN uses `sourcePointIndex → point_index`. Never reorder. If the publisher reorders points, the entire bake is invalid.

### 6.3 `weight` as the canonical edge strength
Computed once by the publisher per the canonical formula. Stored in `universe_links.parquet` and in `orb_entity_edges_current` view output. Every consumer (edge rendering, force effects, chord aggregation) reads `weight` directly. Never re-derive.

### 6.4 `useDashboardStore` as single state authority
`hoveredPaperId`, `focusedPaperId`, `hoveredClusterId`, `selectedPointIndices`, `activePanelPaperId`: all owned by the store. No local component state. R6 introduces; everyone consumes via store selectors.

### 6.5 Three-layer physics composition
Scope gates population. Spatial mode is exclusive. Overlay is styling-only inside active spatial mode. R5 enforces; R6 dispatches respecting it; R4 renders the resulting positions + color/halo state.

### 6.6 `orbCapabilityVersion` in bundle manifest
Increments when: layout params change, entity-edge-spec hash changes, edge weight formula changes, parquet schemas change. R1 writes; R7 reads for the capability gate.

### 6.7 Three readiness signals
`sessionReady` (R3), `orbReady` (R4), `mapReady` (R3/existing). R7's landing warmup action transitions on `orbReady`.

## 7. Coordination protocol

- **Daily 15-min sync.** Who is blocked by whom; which contracts are in flux; any spec-JSON changes (require unanimous sign-off).
- **Shared doc for open questions.** `docs/future/graph-orb-implementation-log.md` (create on day 1). Every teammate drops questions they hit; daily triage.
- **Spec changes require cross-team sign-off.** If R1 wants to change the edge weight formula, R4/R5/R7 must agree. The CI hash check ensures nothing sneaks through.
- **Weekly demo.** End of each wave: walk the orb state on a test bundle. Spot defects early.
- **`/ultrareview` at each milestone completion.** Not optional; the orb has too many cross-cutting contracts to ship a milestone without a multi-agent review pass.
- **Codex rescue on hard bugs.** When a single teammate is stuck on a non-obvious issue for >2 hours, hand it off to Codex via `codex:rescue`. Don't grind solo.

## 8. What NOT to do (codebase-specific anti-patterns)

- **Never use `grep` / `rg` / `find` for code exploration.** Use the CodeAtlas MCP (`mcp__codeatlas-graph__*`) instead — `search_code`, `inspect_symbol`, `dependents`, `trace_flow`, `get_flow`.
- **Never import from another SoleMD project's Python modules.** Hand-off via GitHub issue per the top-level CLAUDE.md.
- **Never use `git add .` or `git add -A`.** Always name files. Secrets live in 1Password, never in `.env`.
- **Never rename with a loose `sed`.** TypeScript rename = `git mv` + compiler finds importers. Spec-JSON rename = coordinate across R1/R2/R7.
- **Never skip the `/clean` review before committing a milestone.** Engineering discipline is a contract, not a polish pass.
- **Never silently defer.** If a plan item has a clear scope, either implement it or document the how-to in a skill reference. See `feedback_no_silent_defer`.
- **Never change a canonical spec without updating the hash constant.** CI will catch it, but you'll have spent the time wrongly.
- **Never ship M5b until M5a validation is green.** The two-step flip is the point.

## 9. Done criteria per milestone

- **M0 done**: tuning gate passed + sign-off + parquets publishing + CI hash green + `orbCapabilityVersion` in manifest.
- **M1 done**: canonical views expose optional orb columns; pre-orb and orb-capable bundles both work; existing 2D tests green.
- **Stealth M2 done**: `/` + `/graph` share `<GraphShell>`; internal enter-graph is scroll-to-end; `/graph` cold entry is acceptable.
- **M2 (orb render) done**: orb mounts in shell on orb-capable bundle; baked positions visible; rotation runs; picking resolves correctly; disposes on session exit.
- **M3a done**: every gesture row is a test; selection parity with 2D; state authority enforced.
- **M3b done**: focus / scope / tug implemented; three-layer composition enforced; wake-sleep verified; reduced-motion and low-power no-op correctly.
- **M3c done**: extended vocabulary (clusterFocus, entityFocus, evidenceSignalOverlay, pulseImpulse) shipped; refuter-as-neighbor case resolved via styling-only-inside-active-mode.
- **M4 done**: edges at all four tiers; entity edges runtime view emits canonical `weight`; legend correct; no hairball at rest.
- **M5a done**: feature-flagged toggle behind capability + flag + reduced-motion; search-first layout visible; round-trip preserves state; both canvases hot.
- **M5b done (post-launch)**: `/graph` default flipped to orb on orb-capable bundles; absolute-ms budget met; rollback path tested.
- **M6 done**: scroll-chapter choreography over live orb landed; rotation-paused-during-pre-roll works; reduced-motion path clean; no canvas remount during landing → graph flow.

Whole project done: user story in the orb plan's "What the user story is when this plan is fully implemented" is reproducible on the live product.

## 10. Hand-off to `/team`

Kickoff prompt (copy-paste):

> We're implementing the GraphOrb + stealth-handoff plans from `docs/future/graph-orb-3d-renderer.md` and `docs/future/graph-landing-stealth-handoff.md`. Full handoff and work partitioning in `docs/future/graph-orb-implementation-handoff.md`. Read all three docs start-to-finish before assigning roles. Team composition is 7 roles (R1–R7) with clear ownership boundaries and wave-based dependencies. Prerequisites in Section 2 must hold before Wave 1 starts. Shared contracts in Section 6 are the team seams — violations here break every downstream teammate. Please assign roles, confirm prerequisites, and begin Wave 1 with R1 (Publisher) and R3 (Shell) in parallel.
