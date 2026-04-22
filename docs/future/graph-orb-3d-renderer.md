# GraphOrb — Second Renderer on the Cosmograph Pipeline

> Status: future / exploratory plan. Not yet scheduled.
> Captures the design for a 3D WebGL "orb" view of the SoleMD graph corpus that reuses the existing Cosmograph + DuckDB + bundle pipeline as its data layer.
>
> The conceptual tracks below (background, shape-of-change, tracks 1–7) stand as context. The authoritative build order is **"Product framing"**, **"Review corrections"**, and **"Implementation milestones"** at the bottom of this doc, written after a two-round review with a second agent and three product reframes with the user. Where those sections conflict with an earlier track, the later sections win. The latest framing supersedes both "UMAP-positioned" and "Fibonacci-free-form" positioning — **3D positions come from force-directed physics, seeded by UMAP, refined with cluster-affinity; browser physics is wake-on-perturbation, not continuous.**
>
> **Companion plan (prerequisite for M5a and M6):** `docs/future/graph-landing-stealth-handoff.md`. Defines the hybrid-route / shared-shell architecture where `/` and `/graph` mount the same `<GraphShell>`, so the landing → graph flow never crosses a route boundary. Its M2 (extract `<GraphShell>`) must land before this plan's M5a ships cleanly; its M3 is where this plan's orb first appears in the shell; its M4 subsumes this plan's M6. Under that plan, both the orb and the 2D Cosmograph map are mounted simultaneously — scope toggle is a `visibility` flip, not a mount/remount.

## Product thesis

Three critiques will be levelled at this design by anyone with dataviz background:

1. **"Avoid 3D" (Wilke, data-to-viz).** Tableau, PowerBI, Qlik refuse 3D charts. Perspective distortion defeats quantity judgment.
2. **"Everything looks like a graph, but almost nothing should be drawn as one" (Gephi team, 2011).** The hairball is the default outcome, not the failure mode.
3. **The market retreat from graph views (ResearchRabbit 2025).** Dense force-directed graphs overwhelm casual users; researchers prefer iterative chains and ranked lists.

The orb answers each directly:

- **The third dimension is navigable context, not quantitative encoding.** Position carries no IDF, no citation count, no publication year — anything a user would need to read numerically lives in the 2D Cosmograph map or the ranked list. The orb earns the Z axis the same way EVE Online's star map does: it's a space to move through, not a chart to read off.
- **The orb is never an undifferentiated corpus graph.** Evidence-scoped (~5–10k papers, not the full 1M corpus), search-first ingress (user arrives already narrowed), persistent ranked-list + detail panel beside the orb (list is the authoritative surface; orb is the exploration affordance over it), and tiered edges that stay aggregated at rest and only become local on intent. Every design decision pushes away from "spinning hairball."
- **Motion is legibly data-driven or it doesn't ship.** Every force effect has a one-sentence explanation the UI can surface on demand ("pulled inward because 7 of 10 IDF-weighted entity matches"). Spring strength tracks relationship strength in the Cytoscape/STRING grammar biomed users already read fluently. Exploration follows the Neo4j Bloom model: search first, then expand and inspect.

If these answers can't be made concrete in the shipped product, the orb doesn't ship. The thesis is non-negotiable — if a future iteration lets the orb drift into "spinning hairball with pretty motion," the design has failed and the correct response is to pull it, not polish it.

## Product framing

The orb and the map are **different scopes, not different faces of the same data**. The orb is the 3D physics of evidence; the map is the 2D semantic geometry of the full corpus. The product shape:

- **`/graph` default is the 3D orb over the evidence set only.** ~5k–10k papers (release-scoped evidence members) rendered as an interactive 3D cluster-structure, shaped by force-directed physics. Every point is a paper SoleMD has actually reasoned with.
- **The 2D Cosmograph map is the full corpus (~1M papers) with semantic UMAP layout.** Different scope, different scale, different affordances. The map is the rigorous analytical surface; the orb is the exploratory, story-telling, identity surface. Toggling between them is a **surface switch** (orb ↔ map), not a renderer swap — you are choosing which surface you are on, which has implications for what you can see, what physics does, and what interactions are available. **The two surfaces do not share a visual vocabulary.** The map has no physics; there is no "2D equivalent of `focus()`," and there does not need to be.
- **Search-first ingress, not free-orbit-first.** Cold `/graph` on an orb-capable bundle mounts the orb auto-rotating, but the primary entry affordance the user sees is search / scope / ranked-list — not "drag to explore a sphere of dots you don't yet have context for." The ranked-list + detail panel sits alongside the orb from first paint and is the authoritative surface for *which papers matter now*; the orb is the 3D exploration affordance over that list. This is the Bloom model (search → expand → inspect), not the Obsidian 3D-graph model (land on a sphere and hope the user figures out what it means).
- **3D positions come from physics, not UMAP and not Fibonacci.** Publish-time: 3D force-directed layout over the evidence subgraph (edges = citations + shared-entity), seeded by 3D UMAP for semantic structure, refined with ForceAtlas2 (cluster-affinity edge-weight bonus, soft anchor to UMAP seed to preserve semantic signal, ~200–400 refinement iters). Connected papers cluster through real attraction; the orb's shape is an emergent consequence of the citation+entity graph, not an imposed sphere. Same release → same positions, so users build spatial memory.
- **Physics wakes on perturbation, sleeps at rest — and every perturbation MEANS something.** The sim sits at baked equilibrium with `alphaTarget = 0` when idle. Interactions wake it, but they are not arbitrary nudges — each interaction reshapes the force field to make a *semantic* relationship visible through motion. Click a paper → that paper becomes a local gravity well; its citation and shared-entity neighbors pull inward with strength proportional to IDF-weighted relationship strength; unrelated papers drift outward slightly. The user doesn't just see edges highlight — they feel the relational topology. Hover is a preview of the same effect. Filter change: matching papers anchor, non-matching repelled outward. Cluster focus: members pull toward centroid, non-members disperse. Evidence overlay (a RAG answer arriving): evidence-supporting papers pulse inward toward the camera, refuting papers drift away. When the user releases the interaction (deselect, clear filter, dismiss cluster focus), forces return to baseline and the anchor springs pull everyone back to baked equilibrium; sim sleeps. Ambient "aliveness" comes from slow auto-rotation at the group level, not from sub-frame position jitter.
- **Physics is the visual channel for data relationships, not cosmetic motion.** The edge spec (`packages/graph/src/entity-edge-spec.ts` — allowlist, IDF rarity weighting, thresholds) doesn't just drive which lines are drawn; it drives which forces act on the sim during every interaction. If two papers share rare entities, clicking one pulls the other in visibly harder than it pulls in papers with weak overlap. The orb teaches its own data through motion.
- **Edges drive the layout AND the visualization.** Because the physics layout is edge-driven, edges are the primary semantic channel on the orb — they're not decoration, they're the reason the orb has shape. Edge sources: citations (existing `current_links_web`) + shared-entity edges (new runtime view from bundle entity tables). Default-visible layers at rest: low-alpha cluster-aggregate chords. Hover/select reveals 1-hop neighborhoods.
- **Cluster structure is visible both in position and color.** Cluster-affinity bonus in the force layout pulls same-cluster members closer, producing visible cluster regions on the orb. Per-point color marks cluster membership. Unlike the earlier Fibonacci framing, clusters here are *spatial* — you can orbit the orb and see them.
- **The landing hero is scroll-continuous pre-roll for `/graph`**, not a separate surface. Under the companion `graph-landing-stealth-handoff.md`, `/` and `/graph` mount the same `<GraphShell>`; the orb canvas is literally the same instance throughout scroll; text layers fade over it at the last chapter; chrome fades in; input unlocks; internal "enter graph" is a scroll-to-end, not a route navigation. No crossfade is required because nothing is unmounting or remounting. The 2D Cosmograph map mounts hidden once the session is warm, first-paints invisibly, and stays mounted — scope toggle is a `visibility` flip, toggle is instant.
- **Auto-rotation is default on, drag-to-orbit suspends, click-selects pauses.** Fresh mount rotates slowly around the world Y axis (physics continues in the rotating frame). Drag → suspend rotation for drag + 1500ms grace → resume. Click a point → pause until dismissed. Double-click empty space → resume.
- **Bundle preload runs in the background during scroll, never blocks.** `useGraphWarmup` at landing mount. Orb renders with baked positions the moment the parquet arrives; live sim starts tick-ing; interactions unlock at the end of scroll chapters.

Concrete contracts the milestones enforce:

- **`release_points_3d.parquet` IS a bundle asset**, reinstated from the earlier (now-superseded) Fibonacci framing. Published per release, immutable, columns: `point_index UINT32, paper_id VARCHAR, x3 FLOAT, y3 FLOAT, z3 FLOAT, cluster_id UINT32`. Positions from UMAP-seeded FA2 over the evidence subgraph.
- **`release_evidence_members.parquet`** as before — membership + per-paper signal metrics. Release-scoped, immutable.
- **Entity edges are a runtime view**, not a new publish artifact. Joined under the active scope.
- **First-paint artifact set on orb-capable bundles** includes both parquets + entity tables needed for the edge view. `base_points` stays loaded (2D fallback).
- **Capability fallback is silent.** Pre-orb bundle → 2D default, no 3D toggle surfaced.
- **Accessibility fallback is explicit.** `prefers-reduced-motion` pins 2D and hides the toggle. The live physics sim is also throttled or frozen if the user has reduced-motion set globally, so the "static" 2D alternative is genuinely motionless.
- **Toggle labels** are **"Evidence (orb)"** and **"Full corpus (map)"**, not "3D / 2D".
- **Landing → `/graph` boundary renders zero visual change.** Three things shared: (1) warm bundle session, (2) `indexToPaperId` map, (3) camera pose + rotation phase. Positions are identical because the parquet is the source of truth for both sides, and because the sim is sleeping at baked equilibrium at the route boundary (if a user perturbed the sim during landing, we accept a small re-settle across the boundary — edge case, imperceptible). Sim state is NOT strictly required in the contract; however, **under the hybrid-route / shared-shell architecture locked in `docs/future/graph-landing-stealth-handoff.md`, the internal landing → graph flow never crosses a route boundary at all** (it is scroll on a single shell component mounted from both `/` and `/graph`), so sim state persists through the flow by construction. Sim state only fails to persist on *external* cold entry to `/graph` (bookmarks, deep links) — which is the acceptable cold-entry case anyway. The earlier "we do not commit to hoisting above the route tree" framing is superseded: no hoisting is needed because the scroll flow is single-route.
- **Manual motion controls alongside OS reduced-motion.** `prefers-reduced-motion` is necessary but not sufficient — not every motion-sensitive user sets the OS flag. A visible "Pause motion" control in the orb chrome stops rotation and forces the sim to sleep, independent of the OS setting. Persists per session.
- **Low-power profile for mobile, defined now.** At 5–10k nodes memory is trivial, but Three.js canvas + offscreen picking + `<Html>` labels + main-thread sim ticks can thermal-throttle low-end Android into persistent jank. Low-power profile (capability-detected or user-toggled): frozen baked positions, no sim wake on tug (tug still re-projects click, but no ripple), reduced edge/label policy. Devices graduate into live-sim mode after profiling, not by default.

## Context

Can we keep the Cosmograph + DuckDB + parquet bundle pipeline we've invested in, but give it a WebGL / Three.js "flavor" — a rotatable, interactable 3D globe of the same corpus?

Recon confirms the architecture is already shaped for this, even though nobody built it that way on purpose:

- **DuckDB + bundle are the data layer.** `GraphCanvasSource = { duckDBConnection, pointCounts, overlayRevision }` (`apps/web/features/graph/duckdb/types.ts:25-33`) is a pure DuckDB handle. `createGraphBundleSession` (`apps/web/features/graph/duckdb/session/index.ts:19-143`) registers parquet tables and SQL views that have no opinion about rendering.
- **`<Cosmograph>` is the renderer face**, mounted in `apps/web/features/graph/components/canvas/GraphRenderer.tsx:442-524`. It consumes the DuckDB connection + table names + column names. That's it — no internal state that the rest of the app relies on.
- **The stores are renderer-agnostic.** `useDashboardStore`'s SelectionSlice (`slices/selection-slice.ts:1-79`), ConfigSlice, TimelineSlice, VisibilitySlice all describe *what to show*, not *how*. `useGraphStore` holds `selectedNode`, `focusedPointIndex`, `mode`, `animationPhase` — again, about the data, not the viewport.
- **The selection pipeline is already decoupled.** A click resolves through `resolveAndSelectNode()` into the DuckDB `selected_point_indices` table + store SQL via `buildCurrentPointScopeSql()`. Cosmograph's `onPointsFiltered` is *one* input to that pipeline; any renderer can drive the same funnel.
- **The only 2D-specific leak is camera persistence.** `CameraSnapshot = { zoomLevel, transformX, transformY }` in `packages/graph/src/cosmograph/camera-persistence.ts` is Cosmograph-only, persisted to sessionStorage outside the store. A 3D camera can live alongside under a separate key.
- **Cosmograph itself has no 3D path.** Confirmed via @cosmograph/react v2.1.0 docs: pure 2D d3-zoom viewport, no z, no orbit camera, no roadmap hint. 3D is not coming from the vendor.

Research verdict on the 3D stack: **Raw R3F + drei + custom shader `THREE.Points` + GPU-ID picking + `yomotsu/camera-controls`**. Rationale: the landing already runs an R3F scene (field), so an R3F-based orb composes into the existing canvas or mounts cleanly as a sibling — no second WebGL context, no vendor framework stealing the scene. Reagraph is the tactical fallback if we want a globe running this week, but it owns its own `<Canvas>` and caps around 5k nodes. `react-force-graph-3d` is prototype-only. Cosmograph 3D, G6-3D, Sigma-3D, deck.gl are all wrong for this shop.

## The shape of the change

One pipeline, two renderer faces, three surfaces.

**Pipeline (unchanged):** GraphBundle → DuckDB-WASM → views → stores → selection/filter SQL → (renderer).

**Renderer face A (today):** `<CosmographRenderer>` — 2D canvas, d3-zoom camera, Cosmograph labels. Stays exactly as-is.

**Renderer face B (new):** `<GraphOrb>` — R3F Points on a unit sphere (3D UMAP normalized), straight-chord edges through the sphere interior at low alpha, GPU-ID picking, drei `<Billboard>` / `<Html>` for hovered + cluster-centroid labels, `camera-controls` orbit with click-to-focus via slerp. Consumes the same `GraphCanvasSource`, the same stores, and the same `resolveAndSelectNode()` entry point.

**Surfaces:**
1. **Graph canvas** (`/graph` route today): add a `rendererMode: '2d' | '3d'` toggle. Same data, same selection, two faces — pick the one that fits the question. Cosmograph for analysis, orb for overview and semantic grokking.
2. **Landing hero**: the blob story's final chapter morphs into `<GraphOrb>` itself — not a separate "globe transition frame," but the real component the user will interact with next. The morph *is* the handoff: blob particles relocate to their real paper positions on the sphere, cluster colors resolve in, field fades out, orb controls fade in, UI chrome appears. One continuous motion, and the "end" is a live explorable orb.
3. **Future modules**: the orb becomes a reusable primitive for any surface that wants the corpus as a 3D shape — wiki modules, learn shells, evidence overlays.

## The population: the evidence set, not base_points

The orb's default isn't "all 500k papers" and isn't a static heat ranking. It's the **evidence set** — papers the RAG pipeline has actually used to answer something. Two levels:

- **Global evidence union** (orb default): the durable set of all papers ever surfaced with `signal_kind ∈ {answer_evidence, answer_support, answer_refute}` across sessions — these are the papers the system has genuinely leaned on. Materialized as a new view `solemd.evidence_paper_set` that aggregates `graph_signals` rows (see `packages/api-client/src/shared/graph-rag.ts:258-283`) into a stable corpus-wide subset. Expected order: tens of thousands to ~100k as the system matures.
- **Session-local evidence overlay**: the current query's `answer_graph_paper_refs` + `graph_signals` highlight on top, with a subtle glow + edge emphasis. Transient, per-query.

Why this beats a static ranking: it's *honest* — every paper on the orb is a paper the system has reasoned with. The corpus reads as "the knowledge SoleMD has actually used," not "papers we scored highly." A "show full base (500k)" toggle is available but not the default.

Backend work: new materialized view rolling up `graph_signals` by `paper_id` into `solemd.evidence_paper_set(paper_id, signal_count, last_seen_at, earliest_seen_at)`. Exported as a new parquet (`evidence_points.parquet`) keyed to the bundle checksum. Small — tens of MBs even at 100k rows.

## Approach

### Track 1 — Data: evidence subset + 3D coordinate
- Worker step (A): materialize `solemd.evidence_paper_set` — a view rolling up `graph_signals` across sessions into a per-paper row with `signal_count`, `earliest_seen_at`, `last_seen_at`, dominant `signal_kind`. Incremental refresh so new queries add to the set without a full rebuild.
- Worker step (B): run 3D UMAP on SPECTER2 embeddings restricted to `evidence_paper_set.paper_id`. Mean-subtract first (kills cosine-embedding clumping), L2-normalize to the unit sphere. Publish `evidence_points.parquet` (columns: `paper_id`, `x3`, `y3`, `z3`, `signal_count`, `dominant_kind`) under `/graph-bundles/<checksum>/`.
- Also run 3D UMAP for the full 500k `base_points` and publish `base_points_3d.parquet` — used when the user toggles "show full corpus." One-time compute per bundle publish; evidence-set 3D is a delta.
- Add optional `evidencePoints` + `points3d` asset references to `packages/graph/src/types/bundle.ts`.
- New DuckDB views registered in `registerInitialSessionViews`:
  - `current_points_orb_evidence` — evidence subset, default for the orb
  - `current_points_orb_full` — 500k base with 3D coords, behind a toggle
  - `current_points_orb_selection` — orb-scope join of whatever `currentPointScopeSql` the store has set, so the orb respects filters identically to Cosmograph
- Edge tables: existing `graph_edges.parquet` (citations) reused as-is. Add `evidence_cooccurrence_edges.parquet` if we want a "papers co-cited in the same evidence answer" relationship — defer unless Track 5 needs it.

### Track 2 — `<GraphOrb>` renderer component
- New directory: `apps/web/features/graph/components/orb/` (parallel to `components/canvas/`).
- `GraphOrb.tsx`: R3F scene. One `<points>` with `BufferGeometry` (position = `x3,y3,z3`; attributes for color, size, paperId-as-float, selection mask, signal-count-as-glow). Custom `ShaderMaterial` for round sprites with per-point color and alpha. One or more `<lineSegments>` for edges — see Track 5 (Edges).
- Data path: hook `useOrbPointBuffers(canvas, mode)` queries the relevant view (`current_points_orb_evidence` by default, `current_points_orb_full` behind toggle) and packs results straight into `Float32Array`s bound to the geometry's attributes. No React re-renders for data updates — store-driven deltas rewrite buffer ranges in place via `BufferAttribute.needsUpdate = true` on the modified ranges.
- Picking: second render target rendering paperId (32-bit) as RGBA color; `onPointerMove` → `readPixels` at cursor → decode → hover state. Sub-ms at 2k, constant-time up to 100k (cost is screen pixels, not point count).
- Labels: ~20 drei `<Html>` billboards at cluster centroids with distance-based opacity (`smoothstep`). Hovered/selected point gets a single `<Html>` tooltip. Never per-point DOM.
- Camera: `yomotsu/camera-controls` via drei integration. Click-to-focus = slerp camera position around sphere origin so the clicked point lands at the camera-facing pole; target stays at origin. `rotateTo(azimuth, polar, true)` = "the orb turned to show you this paper." Inertia for mouse + touch drag.
- Interaction wiring: hover/click call the existing `resolveAndSelectNode()` → DuckDB `selected_point_indices` → store. Zero new selection plumbing. See Track 4 (Selection parity) for lasso/rectangle.
- Camera persistence: new sessionStorage key `solemd:camera-3d` storing `{ azimuth, polar, radius, target }`. Never pollutes `useDashboardStore`.

### Track 3 — Renderer toggle on the graph canvas
- Add `rendererMode: '2d' | '3d'` to `useDashboardStore` (or a small new `view-slice.ts` — ~20 lines). Add `orbCorpus: 'evidence' | 'full'` to the same slice.
- `apps/web/features/graph/components/canvas/GraphCanvas.tsx` switches on the mode: `{rendererMode === '3d' ? <GraphOrb canvas={canvas} queries={queries} /> : <CosmographRenderer canvas={canvas} queries={queries} />}`. Nothing else changes here.
- Toolbar control (segmented button) toggles the mode. Selection/filter/timeline state persists across the switch because it's all renderer-agnostic.
- Transition animation between modes: 400ms crossfade + optional "flatten z→0" pre-fade for 3D→2D, "lift from plane" for 2D→3D. Cheap — same paper positions in both views, so the motion is coherent.

### Track 4 — Cosmograph-parity selection (the unlock)
Selection state lives in DuckDB's `selected_point_indices` table + `currentPointScopeSql` in the store, not in Cosmograph itself. The orb writes to the same table. Every selection gesture the user knows from Cosmograph works on the orb and is bidirectional across the mode toggle.

- **Click**: existing `resolveAndSelectNode()` — done in Track 2.
- **Rectangle (screen-space)**: `onPointerDown` + drag → 2D screen rect → project each visible point's world position to NDC → filter `{ndcX,ndcY} ∈ rect` → push paperIds into `selected_point_indices` via DuckDB `INSERT`. Reuses `buildCurrentPointScopeSql()` from `apps/web/features/graph/lib/cosmograph-selection.ts` (rename to `graph-selection.ts` since the name is misleading).
- **Lasso (free polygon)**: same mechanism, point-in-polygon test on projected screen coordinates. Both front and back of orb are selectable because screen-space projection doesn't care about depth — matches user intuition of "I want everything inside this shape."
- **Depth-aware lasso** (optional modifier, hold Shift): only select front-facing points (dot(cameraForward, pointNormal) > 0). Useful when the user explicitly wants just what they can see.
- **Brush select**: hold-and-drag near the sphere surface adds points within a sphere-collider brush radius. 3D-native.
- **Filter/timeline**: already renderer-agnostic. Both views honor the same scope SQL — the orb queries `current_points_orb_selection` which is just the orb-point view JOINed against the live scope.
- **Selection persistence across toggle**: flipping from orb to Cosmograph keeps every selected paperId highlighted — they read the same table.
- **Visual feedback**: selected points drive `aSelection` attribute (0..1) toward 1.0 over ~200ms; fragment shader boosts alpha + adds a halo. Dimming of non-selected is the existing pattern already in the field shader.

### Track 5 — Edges: references and beyond
Rendering every citation edge at 100k-point scale is a million-plus segments and unreadable mud. Layered approach, tiered by user intent:

- **Tier 0 — no edges by default.** Orb at rest reads as a cloud; edges introduce themselves on interaction.
- **Tier 1 — 1-hop on selection**: when the user hovers or selects a paper, fade in its direct citation neighbors' edges (inbound and outbound) over ~200ms. 50–200 lines, always readable. This is the default edge experience.
- **Tier 2 — scope edges**: when the filter narrows scope to N < 5k papers, show all edges within scope. Cheap, semantically clean.
- **Tier 3 — cluster-aggregate chords**: ~few hundred chords representing citation flow between clusters (`cluster_id` → `cluster_id` summed). Always available as a toggle. Shows "topics flow into topics" at a glance.
- **Tier 4 — edge bundling (optional, later)**: hierarchical edge bundling for dense on-demand views. Standard hairball fix. Defer until we see whether Tier 1–3 is enough.
- **Beyond citations**: same `<lineSegments>` primitive, new edge source. New edge parquet + store toggle renders shared-author links, evidence chains (papers co-cited in the same RAG answer), drug-target edges, etc. All live alongside the citation layer with per-layer color + alpha.
- **Geometry**: straight interior chords at alpha ~0.08–0.15 for the background layer; hovered-neighborhood edges at alpha ~0.4–0.6 and slight thickness boost via shader. Chords through the sphere interior read as "semantic connections"; geodesics rejected (over-commit to the surface metaphor).

### Track 6 — Scale to 100k on desktop
Point count is effectively free on GPU; edges and DOM are the ceiling.

- **Points**: `THREE.Points` with typed-array buffer attributes, one draw call, no per-point React. Cosmograph itself renders 500k+ in 2D; 3D orb at 100k is well inside GPU budget.
- **Updates**: selection/filter deltas rewrite only the changed ranges via `BufferAttribute.updateRange` — sub-ms for typical selection sizes.
- **Picking**: GPU-ID via offscreen render target is O(screen pixels), not O(points). Stable at 100k.
- **Edges**: rely on Tier 1/2/3 strategy above. Never render all 100k+ citation edges at once.
- **Labels**: cluster-level only at rest; one tooltip for hover. DOM stays at ~20 elements regardless of point count.
- **Mobile**: default to the evidence subset (~tens of thousands); if it exceeds ~30k, sample down for mobile only. "Show full corpus" is a desktop-only option.
- **Density modes**: `orbCorpus: 'evidence' | 'full'` + derived `orbDensity: 'landing' | 'standard' | 'dense'`:
  - `landing`: 2k–3k for the landing hero morph (the blob only has so many particles — matching counts keeps the morph crisp).
  - `standard`: full evidence set (~tens of thousands).
  - `dense`: all 500k base points, desktop only.
- **LOD on zoom**: at far camera radius, downsample visible points via stride; at close radius, render all. Purely visual — never changes the selection/scope model.

### Track 7 — Landing handoff
- Ambient-field preloads the graph bundle + DuckDB session at page mount (not on scroll). Session is shared with the orb that will mount at scroll-end.
- Extend `field-shaders.ts` with `uGlobeMorph` + `aGlobePosition` attribute. In the blob's final scroll chapter (`BlobController.bindScroll` at `BlobController:480-627`), tween `uGlobeMorph: 0 → 1` over ~2s with `scrub: 1`. Color lerps from the rainbow stops to `aColor = hex_color`. Rotation continues.
- `aGlobePosition` for the field particles comes from the same 3D parquet but is sampled to whatever particle count the blob runs (19k today — oversample the 2k orb subset with jitter so the blob has enough points, or render the orb at 19k matched).
- At `uGlobeMorph ≈ 0.95`: `<GraphOrb>` mounts underneath, its shader reading the same positions, opacity 0 → 1 over 400ms. Ambient-field canvas opacity 1 → 0 over the next 300ms. UI chrome fades in on a staggered schedule.
- If the bundle hasn't finished loading by the scroll beat, the morph stalls at `uGlobeMorph = 0.95` with idle rotation until ready. No spinner. No pop.
- The "end" of the landing is not a 2D graph — it's the orb, live and explorable. The user can drag, click, hover immediately. The 2D toggle is one click away via the toolbar that fades in.

## Principles carried forward to all modules

- **Native pipeline hijack, not overlay.** The orb reads the same DuckDB views Cosmograph reads; it doesn't recompute or duplicate data.
- **Store is the contract.** Modules can subscribe to the same selection/filter/scope state the orb and Cosmograph share, and visualize or restrict based on what's currently live.
- **Shader-uniform choreography for scroll/motion.** The field morph vocabulary (`uGlobeMorph`, `uPlaneMorph`, etc.) is the template for any module-level transform.
- **One R3F canvas, many components.** Ambient-field, orb, and future module visualizations live in (or compose with) the same R3F scene graph — one WebGL context, one loop clock.

## Interaction capabilities (what "interact" means here)

**Free tier (hours):** hover tooltips, orbit drag, zoom, click-to-select, click-to-focus-camera, cluster-label hover with non-cluster dim.

**Modest tier (day or two):**
- **Tug-on-point (spring-feel)**: per-point displacement uniform. Grab a point, it follows cursor with a spring; release snaps back. Neighbors (by edge or cluster) ripple along with softer springs — pure shader + RAF, no physics engine.
- **Tug-on-cluster**: drag near a cluster centroid, members surge forward; release, they settle.
- **Animated cluster dive**: double-click cluster centroid; camera flies to it, non-members fade, edges within the cluster boost alpha.
- **Link highlight on hover**: hovered node's edges brighten, neighborhood lifts alpha.
- **Scroll-wheel depth fade**: as camera pulls out, per-point alpha fades so far side doesn't overwhelm near side.

**More work (~week):** lasso / rectangle / brush selection (Track 4), permanent pin/tug mode, light physics ragdoll for spring-mass neighbor wobble (gate behind a toggle to preserve semantic honesty).

Interactions that move points must be clear about *temporary vs permanent* — users have to trust the layout reflects real semantics. Default: tug always snaps back unless they enter a dedicated "pin" mode.

## Critical files

**Renderer-agnostic, already in place (reuse, don't touch):**
- `apps/web/features/graph/duckdb/session/index.ts` — `createGraphBundleSession`
- `apps/web/features/graph/duckdb/types.ts:25-33` — `GraphCanvasSource`
- `apps/web/features/graph/stores/dashboard-store.ts` + slices — selection, config, timeline, visibility
- `apps/web/features/graph/stores/graph-store.ts` — selected node, mode, focus
- `apps/web/features/graph/lib/cosmograph-selection.ts` — selection SQL builders (name is misleading; it's renderer-agnostic)
- `apps/web/features/graph/lib/selection-query-state.ts`
- The `resolveAndSelectNode()` entry point (trace from `GraphRenderer.tsx:197-209`)

**To modify:**
- `apps/web/features/graph/components/canvas/GraphCanvas.tsx` — add renderer-mode switch (~15 lines)
- `packages/graph/src/types/bundle.ts` — add optional `evidencePoints` + `points3d` assets to manifest
- `apps/web/features/graph/duckdb/session/index.ts` — register `current_points_orb_*` views when the 3D assets are present
- `apps/web/features/field/renderer/field-shaders.ts` — add `uGlobeMorph`, `aGlobePosition`, `aColor`; nested-mix position + color
- `apps/web/features/field/asset/field-attribute-baker.ts:144` — bake real-paper positions into the blob's particle attributes
- `apps/web/features/field/controller/BlobController.ts:480-627` — extend unified timeline with the morph-and-handoff chapter
- `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx` — start bundle preload on mount, mount `<GraphOrb>` at the handoff moment, orchestrate the crossfade

**To add:**
- `apps/web/features/graph/components/orb/GraphOrb.tsx`
- `apps/web/features/graph/components/orb/use-orb-point-buffers.ts`
- `apps/web/features/graph/components/orb/orb-picking.ts` — GPU-ID picking pass
- `apps/web/features/graph/components/orb/orb-selection.ts` — rectangle / lasso / brush gestures writing to `selected_point_indices`
- `apps/web/features/graph/components/orb/orb-edges.ts` — Tier 1–3 edge rendering logic
- `apps/web/features/graph/components/orb/orb-shaders.ts`
- `apps/web/features/graph/components/orb/orb-camera-persistence.ts` — 3D camera sessionStorage helper
- `apps/web/features/graph/stores/slices/view-slice.ts` (or extend dashboard store) — `rendererMode`, `orbCorpus`, `orbDensity`, `orbEdgeTier`
- Worker-side: `solemd.evidence_paper_set` materialized view, 3D UMAP step for evidence set + full base, bundle publisher update emitting `evidence_points.parquet` + `base_points_3d.parquet`

## Risks and mitigations

1. **Cosine-embedding clumping** (SPECTER2 vectors cluster near origin; naive sphere-normalize = fuzzy ball). Mitigation: mean-subtract before 3D UMAP; fall back to `output_metric='haversine'` if needed. Validate on 500 papers first.
2. **Edges on a sphere look muddy.** Resolved in research: straight interior chords at low alpha read as "semantic connections," geodesics over-commit to the surface metaphor. Start with chords.
3. **Picking precision under devicePixelRatio**. Use GPU-ID picking, not raycast on `Points` — raycast jitters past 5k at low DPR.
4. **Edge count scaling past 10k.** LineSegments cost rises; budget by filtering to edges within current selection/scope at high counts. The store's scope SQL already gives us this for free.
5. **Two R3F canvases on the landing** (field + orb). Solve by either mounting the orb inside the field's existing `<Canvas>` (preferred — one WebGL context), or crossfade two adjacent canvases then unmount the ambient one. Decide during implementation; default is shared canvas.
6. **Camera state collision** on toggle. 2D camera persists under the existing key; 3D camera under the new `solemd:camera-3d` key. No overlap, no store pollution.
7. **Store rename friction**: `apps/web/features/graph/lib/cosmograph-selection.ts` has "cosmograph" in the filename but is renderer-agnostic. Leave for now; if the orb feels permanent, rename to `lib/graph-selection.ts` in a later commit.

## Verification

- **Graph canvas toggle.** Open `/graph`, confirm 2D and 3D modes show the same selection, same filters, same timeline; click a point in 3D, confirm detail panel opens exactly as in 2D; toggle back to 2D, confirm focus persists.
- **Cluster coherence honesty check.** Pick 10 papers visibly near each other on the orb; confirm via Neo4j read-cypher or CodeAtlas that they share `cluster_label` or have cosine similarity > 0.75.
- **Landing end-to-end.** Desktop + Galaxy S26 Ultra: full scroll with and without network throttling; confirm graceful stall when bundle slow; confirm UI chrome appears without layout thrash.
- **Performance trace.** Sustained 60fps desktop, no jank at crossfade, label LOD stable under rotation.
- **Accessibility.** Reduced-motion cuts morphs to crossfades; 3D mode is not required for any analysis task — the 2D toggle is always available and the mode toggle itself is keyboard-navigable.
- **Regression.** Existing Cosmograph canvas behaves identically when `rendererMode === '2d'`. Selection pipeline, filters, timeline, camera persistence all unchanged.
- **Slow-network behavior.** Throttle to 3G, confirm landing morph stalls at 0.95 until bundle arrives; confirm orb mounts cleanly after.

## Open questions for a later round

- Does the orb render on the `/graph` route as a toggle first, or does the landing handoff ship first? Probably landing first for the wow moment, but either order works.
- Do edges render at all in the landing morph, or only after handoff into the interactive orb? Leaning toward "no edges during morph, fade in after orb takes over."
- Landing corpus count: 2k (polished, matches blob particle count cleanly) or push the blob particle count up to match the evidence set? Start 2k landing morph, full evidence set after handoff.
- Evidence subset refresh cadence: materialized view refreshed on each bundle publish, or on a cron? Probably per-publish, since the bundle is the unit of deployment.
- Beyond-citation edge layers to ship in first cut: probably just citations + "co-cited in same evidence answer" (the latter is the most novel and differentiates from Cosmograph). Shared-author and drug-target can follow.

## Review corrections (post round-2)

The earlier tracks contain claims that did not survive a second-agent review against the current runtime contract. These are corrected here and the milestones below assume the corrected versions.

1. **Evidence delivery is snapshot-at-publish, not a mutating parquet.** The bundle contract is checksum-addressed and assets under `/graph-bundles/<checksum>/` are immutable. The plan's original "materialized view that grows incrementally under the same checksum URL" breaks that contract. Evidence is snapshotted per release as an immutable bundle asset. Session-local evidence overlay (current query's `graph_signals`) handles freshness for the live query. Historical evidence landing between publishes is a visible lag; the answer is publish cadence, not a live-mutable bundle asset.
2. **Evidence membership is release-scoped.** `graph_signals` aggregation is keyed by `graph_release_id` / `bundle_checksum`, never corpus-global. No cross-release mixing.
3. **~~One canonical 3D layout per release. / No 3D layout published; Fibonacci.~~ Superseded by v3 framing: 3D positions are published, from physics.** The publisher runs a 3D force-directed layout over the **evidence subgraph only** (~5k–10k nodes): seed with 3D UMAP for semantic structure → refine with ForceAtlas2 (Barnes-Hut octree, `dim=3`, `linLogMode=True`, same-cluster edge-weight ×2 for cluster-affinity, soft anchor to UMAP positions via weak gravity, 200–400 refinement iters) → bake to `release_points_3d.parquet`. Scale makes publish-time cost ≤30s on non-GPU CI. Positions are release-deterministic: same evidence set + same seed → same positions. 2D Cosmograph continues to use its UMAP layout over the full 1M-paper corpus; 3D and 2D are different scopes, not different renderers of the same scope.
4. **Canonical views extend with 3D coordinate + evidence columns.** `current_points_*` LEFT JOINs `release_points_3d` (on `sourcePointIndex → point_index`, exposing nullable `x3, y3, z3`) and `release_evidence_members` (exposing nullable `signalCount, dominantKind, earliestSeenAt, lastSeenAt`). No parallel `current_points_orb_*` family. Orb-specific filtering is `WHERE signalCount > 0 AND x3 IS NOT NULL` on the canonical view.
5. **GPU picking encodes dense integer row index, not `paperId`.** `paperId` is `string | null` in the current graph types, so encoding it as a float was dead on arrival. The orb maintains a JS-side `indexToPaperId` map populated at buffer pack time and resolves hover/click back to `paperId` before calling `resolveAndSelectNode`. Click uses strict sync readback; hover uses `readRenderTargetPixelsAsync()` throttled to the animation-frame budget.
6. **Edges in the orb come from TWO sources.** Citations: `universe_links.parquet` / view `current_links_web` (unchanged, the phantom `graph_edges.parquet` was never a thing). Shared-entity edges: a new view `orb_entity_edges_current` computed at runtime from entity tables already present in the bundle (papers that share drugs, receptors, diseases, mechanisms). The runtime view joins under the active scope like everything else; no new parquet. Because 3D positions encode no semantics, edges are the primary information channel of the orb — the edge tier strategy is correspondingly promoted from "optional enhancement" to "default-visible."
7. **Blob baseline is 16384 points, not 19k.** Documented for the morph-count sizing in the deferred landing milestone.
8. **Landing stage is intentionally `pointer-events-none` and scroll-owned.** Making it interactive at the end is a UX and accessibility redesign, not a shader handoff. That redesign is a precondition for the landing-morph milestone and is out of scope until then.
9. **Three.js API surface is `updateRanges` (plural) with `addUpdateRange()`/`clearUpdateRanges()`,** not the old `updateRange` singular.
10. **Render/pick/edge sets stay identical.** Under a device cap, the orb draws, picks, and edge-chords against the *same* deterministic capped subset for a given release × scope × device class, and the UI surfaces that cap ("showing 30k of 87k — zoom for full"). No visual-only LOD that diverges from the selection model.
11. **Graph-canvas toggle ships first; landing morph is last and separately planned.** Isolates the renderer's real unknowns — 3D data contract, picking, selection parity, edges, memory — inside the existing graph shell. The toggle ships with 2D still the default (M5a) and the default flips to 3D-evidence only after real-traffic validation (M5b). Landing morph (M6) depends on a shipping orb that already looks good and on M5b having flipped `/graph` to orb-default.
12. **Gesture commit timing is explicit.** Rectangle / lasso / brush previews live entirely in JS during drag; one `INSERT` into `selected_point_indices` on pointerup. Front-facing-only is the default; `Shift` enables through-sphere.
13. **Auto-rotation is a first-class behavior, not a demo gimmick.** Fresh mount rotates slowly. User drag → suspend rotation for the drag + brief grace period, then resume. Click selects a paper, pauses rotation until selection is dismissed or resume control is hit. Double-click empty space resumes. Rotation speed and grace-period timings live in a small config; camera-persistence key `solemd:camera-3d` stores both pose and rotation-paused state.
14. **Landing → `/graph` is scroll-continuous, not a route cut.** The last text chapter ends with a short scroll-range that fades text out, fades chrome in, and unlocks pointer-events on the orb. Same canvas, same scene, same camera, same rotation phase, same running physics simulation. Direct navigation to `/graph` mounts the interactive orb immediately, skipping the scroll pre-roll.
15. **Live physics sleeps at rest, wakes on perturbation.** `d3-force-3d` (or custom verlet) sits at `alphaTarget = 0` when idle — no per-frame tick cost, positions held at baked equilibrium. Interactions wake the sim: tug sets `fx,fy,fz` + raises `alphaTarget`, neighbors ripple via link springs, release clears `fx,fy,fz`, anchor force pulls back to equilibrium, and when residual displacement falls below threshold the sim re-sleeps. Ambient life comes from slow auto-rotation at the group-matrix level, not from continuous physics ticks. Three.js renders always; the sim computes only when something is happening.
16. **Scale is 5k–10k nodes, not 30k+.** Single biggest product constraint on the orb side. It means live physics wake-on-perturbation on the main thread is fine; `d3-force-3d` handles ripples comfortably; no GPGPU is needed; publish-time force layout is seconds on CPU. If the evidence set crosses ~15k the constraints change — document that ceiling in the view-slice and add a "move sim to worker" gate before crossing it.
17. **Layout edges must be a subset of default-visible runtime edges.** If shared-entity edges shape the baked layout but are not rendered by default, users see "why is this paper here?" with no visible explanation. Canonical edge-builder spec is shared between publisher and runtime — same sources, same thresholds, same rarity weighting, same entity-type allowlist. Default-visible runtime edge layers include every source that influenced the layout. Toggling off an edge source at runtime for clutter reduction is fine; omitting a layout-input source from the default at all is a product lie.
18. **Shared-entity edge spec is load-bearing.** Common biomedical entities (e.g. "protein," "human") would create giant glue-cliques if used naively, faking the orb's structure. M0 prerequisite: a canonical `orb_entity_edge_builder` spec covering entity-type allowlist (domain-specific terms: drugs, receptors, diseases, mechanisms — not generic types), rarity weighting (IDF-style: edge weight ∝ log(N/entity_frequency)), minimum shared-entity count threshold (≥ 2, tunable). Same spec used by the publisher's force layout AND the runtime view. Not deferred.
19. **Gesture arbitration is a first-class design, not an implementation detail.** The orb's pointer surface supports: orbit drag, click-select, click-focus, tug, rectangle/lasso/brush select, double-click cluster, Shift through-sphere, rotation pause/resume. Without an explicit precedence model and a touch-specific contract, week-2 becomes pointer-conflict debugging. M3 must include a decision table: which pointer gesture beats which, and how touch differs from mouse.
20. **Physics is the orb's semantic channel, not the product's semantic channel.** On the orb surface, every interaction reshapes the force field: click-select magnetizes IDF-weighted neighbors, filter scopes away out-of-scope papers, cluster-focus pulls members to centroid, entity-hover magnetizes entity-sharing papers, RAG-answer overlay pulses evidence inward and styles refuters distinctively. The user learns relational structure on the orb through motion. **This is the orb's reason to exist.** It is NOT a claim about renderer equivalence — the 2D map has no physics, no `focus()`, no bloom; the map conveys the same relational information through UMAP position + edge drawing + ranked-list ordering, and that's fine. Switching from orb to map is a surface switch, not a translation of vocabulary. Ship the core force effects (`focus`, `scope`, `tug`) in M3b and the extended ones (`clusterFocus`, `entityFocus`, `evidenceSignalOverlay`, `pulseImpulse`) in M3c — see the M3 split.
21. **Orb capability is a versioned contract, not just "has a parquet."** The bundle manifest carries an `orbCapabilityVersion: u8` field. A bundle is orb-capable iff `orbCapabilityVersion >= MINIMUM_CLIENT_VERSION`. The version increments when any of these change: (a) `release_points_3d.parquet` schema, (b) `release_evidence_members.parquet` schema, (c) the entity-edge-spec JSON hash, (d) the edge weight formula. Shallow gating on "manifest has `releasePoints3d`" without a version is unsafe: a bundle with an older spec would render with the current client's view of edge weights and produce incoherent positions. Versioning is the gate.
22. **Teardown/disposal is a first-class contract, but applies on session exit, not surface toggle.** Under the companion shell plan, scope toggle (orb ↔ map) is a `visibility` flip on already-mounted canvases — no mount/unmount, no WebGL-context churn, no disposal work. Disposal applies when the user genuinely exits the shell (route leave, tab close, session end) or when the low-power profile forcibly tears down the orb path (defer-to-frozen-positions-plus-Cosmograph-only mode). Ownership table in M2 covers: Three.js render targets and GPU buffers, picking offscreen target, CameraControls, drei `<Html>` portals, `d3-force-3d` simulation instance, orb-lazy-attached DuckDB views. Each subsystem exposes `dispose()`; `GraphShell` orchestrates on exit. No implicit cleanup on React unmount alone — the shell outlives individual route renders.
23. **Single state authority for UI sync.** The orb, the ranked list, the detail panel, hover, focus, click-select, and lasso-selection all touch overlapping state. Without a named authority, week-3 failure mode is UI desync where hover-over-orb does not match hover-over-list, or the panel shows a different paper from the last-clicked highlight. The authority: `useDashboardStore` is the sole source of truth for `{hoveredPaperId, focusedPaperId, selectedPointIndices, activePanelPaperId}`, all downstream views subscribe; no local state for any of these in any component. Confusions like "hovered in orb" vs "hovered in list" are collapsed into one `hoveredPaperId` — provenance (which surface triggered it) is out of scope for v1.
24. **Search-first ingress is a plan-level commitment, not a later polish.** Cold `/graph` paints with search + ranked-list + panel prominent. Orb auto-rotates in the background; user's first interaction is typed or clicked — not "orbit to discover." Without this, the plan replicates the Gephi/ResearchRabbit failure it explicitly rejects. Ships in M5a as a prerequisite, not a follow-on.

## Physics vocabulary

A small set of composable force-effects that every meaningful orb interaction dispatches through. Lives in `apps/web/features/graph/orb/sim/force-effects.ts`. Each effect wakes the sim, applies forces while active, and allows the anchor-springs + `alphaTarget → 0` transition to return everything to baked equilibrium on dismiss.

### The force accumulator

`d3-force-3d`'s `forceLink` is a single force with a links array, not an accumulator of additive sub-forces. Repeatedly calling `simulation.force('link', newForceLink)` resets internal state and is not how composition is built. Instead, the orb's sim owns **one** `d3-force-3d` simulation with a set of custom force functions registered at creation, and each tick the simulation iterates nodes applying:

- **Anchor force**: always-on weak spring toward each node's baked `(x3, y3, z3)` from `release_points_3d.parquet`.
- **Scope force**: reads the current `scope()` membership from an overlay-state table and applies stiff anchor for in-scope / mild radial push for out-of-scope.
- **Spatial mode force**: reads which of `{focus, clusterFocus, entityFocus}` is active (at most one) and applies that mode's target-attraction.
- **Overlay force**: reads `evidenceSignalOverlay` state and applies time-decaying impulses to signal-tagged nodes.
- **User-gesture force**: reads `tug` / `pulseImpulse` transient state.

Overlay-state lives in plain JS tables keyed by `pointIndex` or cluster/entity ID, mutated by the effect-dispatch API (`register(id, payload)` / `unregister(id)`) — not by swapping d3 force instances. This is a named-slot registry at the simulation-config level and an accumulator at the per-tick-compute level. See Correction 17 (H5 resolution).

### The effects

- **`focus(paperId)`** — paper becomes a local gravity well. Target-attraction strength per neighbor reads from the canonical `weight` column in the edge view (`current_links_web` ∪ `orb_entity_edges_current`) — one spec, one value, no runtime re-derivation. Neighbors fall inside scope (see composition). Click = persistent until deselect; hover = transient.
- **`scope(pointIndexSet)`** — in-scope papers stiff-anchor; out-of-scope papers release anchor + mild radial push + alpha fade.
- **`clusterFocus(clusterId)`** — cluster members attract to the baked cluster centroid (read from the parquet, see M0 H2 resolution); non-members release anchor + drift.
- **`entityFocus(entityId)`** — papers tagged with the entity magnetize toward each other via an overlay-state table of entity-sharing pairs and their IDF weights. No "temporary sub-graph" is spun up; the per-tick force function iterates the overlay table.
- **`evidenceSignalOverlay(signals)`** — overlay-state table entry per `graph_signal`. Per-tick force function applies: `answer_evidence|answer_support` → inward-toward-camera pulse (decays over ~2s); `answer_refute` → kept visually distinct by color/halo/badge but does NOT drift in position while a spatial-mode effect is active (see composition).
- **`pulseImpulse(pointIndexSet, impulse)`** — one-shot velocity write. Used by expand-cluster.
- **`tug(pointIndex, cursorRay)`** — direct manipulation. Sets `fx,fy,fz`; neighbors ripple via the same anchor/scope/mode forces; release clears `fx,fy,fz`.

### Three-layer composition model

This is the canonical rule for how effects compose. Every effect is one of three layers; the layers interact deterministically.

**Layer 1 — Scope is the hard population gate.** `focus`, `clusterFocus`, and `entityFocus` *only* operate on nodes inside the current scope. A click on a paper never pulls in out-of-scope neighbors; an entity focus never magnetizes out-of-scope entity-sharing papers. If the user wants to see beyond the scope, they must explicitly "Expand scope to related" via a panel action — that's a `scope` change, not a smuggled-in neighbor pull. This closes the UX ambiguity where `focus + scope` could silently redefine "related."

**Layer 2 — Spatial mode is exclusive.** Exactly one of `{focus, clusterFocus, entityFocus}` is active. Activating any dismisses the others. That mode owns position changes inside the scope.

**Layer 3 — Overlay is styling-only inside the active spatial mode.** `evidenceSignalOverlay` applies position impulses *only to nodes the active spatial mode isn't touching*. If a paper is both a `focus` neighbor (being pulled inward) AND an `answer_refute` signal (would drift outward), it stays in the bloom position dictated by `focus` and is marked as refuting by color/halo/badge. Topology stays legible; polarity stays visible. Once `focus` clears, the overlay can move it.

### Rapid retarget (focus-A → focus-B mid-bloom)

Generation-based retargeting. Each `focus()` dispatch increments a `focusGeneration` counter; the force function reads the current generation each tick. Clicking B while A's bloom is still settling: B's dispatch cancels A in the same frame (all A-specific attractions cleared), positions at that frame become the start state for B's bloom, B's target-attractions ramp in over a fixed short window (~150ms) to prevent a position snap. No queued settle, no dual-focus blend.

### Baseline rule

When no effect is active and no overlay is running, the sim is asleep (`alphaTarget = 0`). Dismissing the last active effect: compute residual displacement; once below threshold, sleep. `prefers-reduced-motion` or Pause-motion user control: the whole accumulator short-circuits to "anchor force only" at `alphaTarget = 0` regardless of events. Low-power profile: same.

## Implementation milestones

Each milestone has acceptance criteria, specific files, and a verification step. Do not start M`n+1` until M`n` passes verification. M6 is gated and blocked on M2 stability plus a separate landing-morph plan.

### M0 — Data contract (evidence members + baked 3D force layout + canonical specs)

**Acceptance:**
- **Canonical entity-edge-spec lives as JSON**, not TypeScript. File: `packages/graph/spec/entity-edge-spec.json`. Contains: entity-type allowlist, IDF rarity weighting formula parameters, min-shared-entity threshold, top-K-per-node cap, edge weight formula coefficients (`α` citation weight, `β` IDF entity weight). Both the TS runtime and the Python publisher load this file directly (`import spec from '...' with { type: 'json' }` / `json.load()`). CI check: `sha256(canonical_json(spec))` is written to a committed hash constant; the TS build and the Python build both assert equality before producing artifacts. TypeScript has a thin typed re-export (`packages/graph/src/entity-edge-spec.ts`) that imports the JSON and exposes it with a Zod or `satisfies` schema — the `.ts` file is sugar, the `.json` is the source of truth.
- Warehouse surface `solemd.release_evidence_members` aggregates `graph_signals` per `(graph_release_id, paper_id)` with `signal_count`, `dominant_kind`, `earliest_seen_at`, `last_seen_at`. Release-scoped only.
- Publisher emits immutable `release_evidence_members.parquet` under `/graph-bundles/<checksum>/`.
- **New publisher step: bake 3D force layout over the evidence subgraph.**
  - Input: evidence paper set (5k–10k rows), citation edges from `universe_links` restricted to evidence, shared-entity edges computed via the canonical entity-edge-spec (publisher reads the JSON), cluster assignments.
  - Pipeline: 3D UMAP on SPECTER2 embeddings → initialize FA2 positions → ForceAtlas2 (`dim=3`, `linLogMode=True`, same-cluster edge-weight ×2 per cluster-affinity bonus, soft anchor to UMAP seed via weak gravity, Barnes-Hut octree, 200–400 iters) → normalize to unit-sphere extent.
  - Library choice: `bhargavchippada/forceatlas2` (Python Cython, native `dim=3`) as baseline. `graph-tool` SFDP is acceptable if already in env (faster, same visual result).
  - Wall-clock budget: ≤30s on non-GPU CI at 10k nodes.
- **New publisher step: bake canonical edge weights.** Citation edges + shared-entity edges emitted by the publisher carry the final `weight FLOAT` column already computed via the canonical spec's formula (`weight = α · citation_weight + β · idf_shared_entity_weight`). Runtime edge rendering and runtime force effects both read `weight` directly — never re-derive. Citation edges keep their existing parquet (`universe_links.parquet`) with `weight` ensured/added; shared-entity edges come from a runtime view (see M4) that emits the same `weight` column by the same formula.
- **New publisher step: bake cluster centroids.** `release_points_3d.parquet` carries cluster centroid as derived columns or a sibling `release_cluster_centroids.parquet` — baked once at publish from the final layout. Runtime never recomputes at-rest centroids. Sim-wake recomputation of centroids (during bloom) goes through a single runtime cache, not per-consumer.
- Output: `release_points_3d.parquet`, `release_evidence_members.parquet`, `release_cluster_centroids.parquet` all immutable under `/graph-bundles/<checksum>/`.
- **Manifest carries `orbCapabilityVersion: u8`** alongside optional asset keys. Increments when: layout algorithm parameters change meaningfully, entity-edge-spec hash changes, edge weight formula changes, parquet schemas change. Bundle is orb-capable iff `orbCapabilityVersion >= MIN_CLIENT_VERSION`. Client refuses to enter orb mode on stale capability.
- Manifest records layout parameters (`force_iters`, `force_library`, `umap_seed`, `cluster_bonus_multiplier`, `linlog_mode`, `entity_edge_spec_hash`) for debug and reproducibility.
- `packages/graph/src/types/bundle.ts` exposes `releasePoints3d?`, `releaseEvidenceMembers?`, `releaseClusterCentroids?`, `orbCapabilityVersion?`.
- Bundle fetch/normalize recognizes the new keys without requiring them (pre-orb bundles still load).
- **Verify entity tables carry columns for M4's shared-entity runtime view.** If missing, fix in M0, don't defer.

**Python dependencies added to the worker (named explicitly):** `umap-learn`, `numpy`, `scipy`, `scikit-learn`, `bhargavchippada/forceatlas2` (or `fa2-modified`). Image size impact ~+300 MB; committed to. Alternative lighter path (numpy + scipy MDS seed, no UMAP, no FA2) is available if image size becomes a blocker — trade-off is weaker semantic seeding.

**Column contract:**
- `release_points_3d.parquet`: `point_index UINT32`, `paper_id VARCHAR`, `x3 FLOAT`, `y3 FLOAT`, `z3 FLOAT`, `cluster_id UINT32`.
- `release_cluster_centroids.parquet`: `cluster_id UINT32`, `centroid_x FLOAT`, `centroid_y FLOAT`, `centroid_z FLOAT`, `member_count UINT32`.
- `release_evidence_members.parquet`: `point_index UINT32`, `signal_count UINT16`, `dominant_kind VARCHAR`, `earliest_seen_at TIMESTAMP`, `last_seen_at TIMESTAMP`.
- `universe_links.parquet`: existing columns + `weight FLOAT` (added if absent).
- `point_index` is the stable release row index; all joins use `sourcePointIndex → point_index`.

**Files:**
- `db/migrations/warehouse/<timestamp>_warehouse_graph_orb_release_surfaces.sql` (new) — evidence materialized view
- `apps/worker/app/graph/layout_3d.py` (new) — UMAP seed + FA2 refinement step; pure Python/Cython, no GPU dependency
- `apps/worker/app/graph/publish.py` (extend) — emit both parquets; record layout params in manifest
- `packages/graph/src/types/bundle.ts`
- `apps/web/features/graph/lib/fetch/constants.ts`
- `apps/web/features/graph/lib/fetch/normalize.ts`

**Tuning gate (runs before parquet contract is locked):**
- Publisher produces three release fixtures at ~5k, ~8k, ~10k evidence nodes.
- For each, generate a render sheet: 3 camera angles, points colored by `cluster_id`, edges tier-0 (cluster chords) drawn.
- Visual criteria, all required:
  - Clusters visibly separated; no single dominant blob swallowing most nodes.
  - Clusters NOT exploding into disconnected islands (cluster-affinity bonus is not overtuned).
  - Linked pairs and same-cluster pairs are materially closer than random pairs (quantitative: mean intra-cluster distance < 0.6 × mean random-pair distance; mean linked-pair distance < 0.7 × mean random-pair distance).
  - 20-paper exemplar audit: product owner picks 20 papers whose semantic neighborhood they know, verifies each paper's 3D neighbors match expected topical cluster.
- Structural stability criterion (not epsilon reproducibility): rerun publish twice on a fixed seed against the same data; after Procrustes alignment, 90th-percentile nearest-neighbor set overlap ≥ 0.8 across runs. This replaces the earlier floating-point-epsilon claim, which is not realistic across CI runners with different BLAS/Cython builds.
- Sign-off required: product owner + graph-runtime owner. Only after sign-off are layout parameters (`cluster_bonus_multiplier`, `umap_anchor_strength`, `force_iters`, `linLogMode`, entity-edge thresholds) locked into the `release_points_3d.parquet` contract.

**Verify (post-sign-off):**
- Manifest exposes both parquets + locked layout params.
- `read_parquet` matches both contracts.
- Structural stability check passes between two back-to-back publisher runs.
- Render sheet artifacts are saved alongside the bundle for future audit.

### M1 — Canonical views extended (coordinates + evidence + centroids + canonical edge weight)

**Acceptance:**
- Canonical `current_points_*` view chain LEFT JOINs `release_points_3d` and `release_evidence_members` on `sourcePointIndex → point_index`, exposing `x3, y3, z3, cluster_id_3d, signalCount, dominantKind, earliestSeenAt, lastSeenAt`. All NULL when tables absent.
- Register `release_cluster_centroids` as a first-class DuckDB table; runtime reads baked centroids via a small query `SELECT * FROM release_cluster_centroids`. No client-side centroid computation at rest (H2 resolution).
- Canonical `current_links_web` view already exposes `weight` from `universe_links.parquet`. Extend with the new runtime view `orb_entity_edges_current` (M4) which also emits a `weight FLOAT` column using the canonical formula from `entity-edge-spec.json`. Downstream consumers (edge rendering, force effects) read `weight` — never re-derive (H3 resolution).
- Bootstrap registers empty placeholder views with the same columns if optional tables are missing, so downstream SQL stays valid on pre-orb bundles.
- No `current_points_orb_*` family. Orb population is `WHERE signalCount > 0 AND x3 IS NOT NULL` on the canonical view.
- Existing 2D queries unchanged.

**Files:**
- `apps/web/features/graph/duckdb/views/orb.ts` (new) — optional-table attach + placeholder fallback
- `apps/web/features/graph/duckdb/views/base-points.ts`
- `apps/web/features/graph/duckdb/views/active-points.ts`
- `apps/web/features/graph/duckdb/views/register-all.ts`
- Tests: extend `apps/web/features/graph/duckdb/views/__tests__/*`.

**Verify:** bootstrap DuckDB against (a) a legacy bundle with no evidence or 3D tables, (b) an orb-capable bundle. In both, `DESCRIBE current_points_web` returns the nullable coordinate + evidence columns and every existing 2D test still passes. Orb scope SQL returns a non-zero row count on (b) and zero on (a).

### M2 — GraphOrb renderer (baked positions, live physics, auto-rotation)

**Acceptance:**
- `<GraphOrb>` mounts inside its own `<Canvas>` in `GraphCanvas.tsx`, selected when `rendererMode === '3d'`. 2D first-paint path is unchanged; 3D activation lazily attaches the orb tables.
- **Baked positions + wake-on-perturbation physics loop.** `use-orb-point-buffers.ts` reads `(x3, y3, z3, cluster_id)` from DuckDB via the canonical view, packs into `Float32Array`s. `use-orb-simulation.ts` configures `d3-force-3d` but keeps it **sleeping at `alphaTarget = 0` by default** — no per-frame tick cost at rest.
  - Forces (configured, dormant until wake): `forceLink` on citation + shared-entity edges, `forceManyBody` repulsion, per-node `forceRadial` anchor to baked `(x3,y3,z3)`, `forceCenter` on origin.
  - Wake triggers: tug pointerdown, expand-cluster double-click, explicit resume after Pause-motion control flip.
  - While awake, each tick flushes updated positions to the Three.js buffer via `updateRanges` + `addUpdateRange()`/`clearUpdateRanges()`. No full-buffer re-uploads.
  - Sleep trigger: residual displacement (sum of `|currentPos - bakedPos|` across all nodes) falls below a small threshold → `alphaTarget = 0`, tick loop halts until next wake.
  - At 5–10k, a wake-period tick costs <6 ms on main thread. If sustained wake periods show up as main-thread cost under profile, move the sim to a worker via `postMessage` with `transferable` semantics — deferred until measured.
- `THREE.Points` with `BufferGeometry`, custom `ShaderMaterial`, one draw call. Attribute streams and their update policies:
  - `position` — `DynamicDrawUsage`; full-buffer re-upload each tick during sim wake (every node's position changes); at rest (sim asleep), no uploads.
  - `aColor`, `aSelection`, `aSignalCount` — `DynamicDrawUsage`; **partial** updates via `updateRanges` + `addUpdateRange()`/`clearUpdateRanges()` only when the affected subset changes (selection toggled, signal overlay arrives, cluster color changes). Never per-frame.
  - `aIndex` — `StaticDrawUsage`; written once at buffer pack.
  - This corrects an earlier claim that positions could use `updateRanges` during sim wake — they can't, because every node updates.
- **Disposal contract (explicit, not implicit).** On surface switch away from orb, on low-power toggle on, on component unmount: dispose Three.js render target and its GPU buffers, picking offscreen target, CameraControls instance, drei `<Html>` portals, simulation instance + typed-array buffers, entity-edge runtime view (if lazily attached). `orb/render/GraphOrb.tsx` owns the disposal orchestration; each subsystem exposes a `dispose()` method. No implicit cleanup on React unmount alone.
- **Auto-rotation loop.** Group-level matrix rotation, ~6 rpm around world Y. Rotation state machine: `running | suspended-drag | paused-selection`. Drag → `suspended-drag` for drag + 1500 ms grace → `running`. Click-select → `paused-selection` until dismissed. Double-click empty space → `running`. Physics sim keeps running in the rotating frame regardless — rotation is purely visual/group-level.
- Orbit camera via `@react-three/drei` `<CameraControls>` (wraps `yomotsu/camera-controls`). Click-to-focus slerps camera so the clicked point lands facing the camera; target stays at origin.
- Picking: offscreen render target encodes dense integer row index as RGBA; `onPointerMove` uses `readRenderTargetPixelsAsync()` throttled to rAF; click uses sync readback. JS-side `indexToPaperId: Map<number, string>` populated at buffer pack; hover/click resolves index → `paperId` → `resolveAndSelectNode(paperId)`.
- Labels: drei `<Html>` at cluster centroids (centroid = mean position of cluster members, recomputed cheaply each rAF tick at this scale) with distance-based opacity. Single `<Html>` tooltip for hovered point.
- Camera persistence under new `solemd:camera-3d` sessionStorage key, storing `{ azimuth, polar, radius, target, rotationState, rotationPhase }`. Sim state does NOT persist — each page load starts a fresh sim from baked positions and converges toward equilibrium within the first few frames (imperceptible given baked positions are already near equilibrium).
- **`prefers-reduced-motion` keeps the orb reachable but static.** The default surface for reduced-motion users is the 2D map, but the orb toggle is not hidden — a user who explicitly enters the orb gets a static 3D surface: baked positions, no auto-rotation, no physics wake, no camera slerp, no scripted bloom. Manual orbit drag is permitted (user-initiated motion is not the same as system-driven motion per WCAG). Relationship information for reduced-motion users flows through the ranked list + edge highlighting + detail panel — not through force bloom.
- **Manual "Pause motion" control in the orb chrome** — stops rotation and locks the sim to sleep regardless of OS setting. Persists per session via `view-slice`. Present in v1, not a future polish.
- **Low-power profile applies uniformly to all physics effects.** When on: `focus`, `scope`, `clusterFocus`, `entityFocus`, `evidenceSignalOverlay`, `pulseImpulse`, and `tug` all no-op their motion — the orb shows state through alpha, color, edge tier, and panel/list sync instead. Rotation still runs (group-transform, zero physics cost) unless `prefers-reduced-motion` also applies. Detection ships as a conservative auto-default with a visible user-override control in the chrome; the exact auto-detect heuristic is deferred to measurement (see Decisions still deferred).

**Files (restructured into three subdirs per M2-finding):**
- `apps/web/features/graph/components/canvas/GraphCanvas.tsx` (renderer branch)
- `apps/web/features/graph/orb/render/GraphOrb.tsx` (new) — owns disposal orchestration
- `apps/web/features/graph/orb/render/point-buffers.ts` (new) — pack baked positions from DuckDB
- `apps/web/features/graph/orb/render/shaders.ts` (new)
- `apps/web/features/graph/orb/render/picking.ts` (new)
- `apps/web/features/graph/orb/render/rotation-controller.ts` (new) — group-matrix rotation state machine
- `apps/web/features/graph/orb/render/camera-persistence.ts` (new)
- `apps/web/features/graph/duckdb/session/index.ts` — lazy orb-table attach + disposal hook
- `apps/web/features/graph/duckdb/session/query-controller.ts` — orb queries
- `package.json` — add `d3-force-3d` (~2 KB, vasturiano/d3 vendor). Worker additions (`umap-learn`, `numpy`, `scipy`, `scikit-learn`, `forceatlas2`) are in M0's worker `pyproject.toml`, not here.

**Verify:**
- Load an orb-capable bundle, toggle to 3D. Orb-table attach fires once; visible positions match the baked parquet.
- With no interactions: points STATIC at baked positions, sim sleeping (verify tick counter does not advance), auto-rotation runs.
- Hover a point, tooltip matches the 2D result. Click a point, detail panel opens identically to 2D, rotation pauses.
- Tug a node: sim wakes, neighbors ripple, release → sim settles to equilibrium within ~1s, `alphaTarget` drops to 0, tick counter stops advancing.
- `prefers-reduced-motion`: sim stays asleep through all interactions, rotation stops, orb is static.
- Pause-motion control toggled on: rotation stops, sim cannot wake.
- Low-power profile on: tug does not wake sim; select still works.
- Desktop sustained 60 fps at 10k nodes both at rest and during sustained tug interactions.
- Profile trace: wake-period tick <6 ms at 10k; sleep-period main-thread cost is zero for the orb.

### M3a — Interaction contract (selection + gesture arbitration, no physics)

Ships the interaction plumbing without any physics effects. Orb is still static-with-rotation at this point (like M2); selection works; gestures are routed; the force accumulator from M2 is present but only the anchor force runs. This milestone's value is a robust, tested interaction surface on top of which M3b and M3c layer semantic physics.

**Acceptance:**
- **Selection parity with 2D**: rectangle, lasso, brush. Drag preview JS-only. Pointerup → one `INSERT` into `selected_point_indices` + one store update. Front-facing-only default; `Shift` → through-sphere.
- **Gesture arbitration** via the single decision table in correction 19. All rows are test cases.
- **Empty-click dismissal scope**: single-click on empty space clears `focusedPaperId` and `hoveredPaperId` (no-ops in M3a since no spatial-mode effect exists yet, but the clear contract is set). Does NOT clear `scope` or `selectedPointIndices` or timeline. Double-click empty resumes auto-rotation.
- **Hover-on-cluster-centroid**: cursor within N pixels of a cluster centroid's screen projection triggers a transient cluster highlight (color ring + label brighten) — not a physics effect. Sets `hoveredClusterId` in the store.
- **Single-paper-scope UX guard**: when the user narrows scope to 1 paper, the panel surfaces a "Show this paper's neighborhood" action that converts the scope-of-1 into a `focus()` — this avoids the dead-end state where the user is looking at a single paper alone in space.
- **Multi-selection detail panel**: when `selectedPointIndices.size > 1`, the panel shows a summary (count, cluster breakdown, top entities, top cited) + a list. A single click on any list row is equivalent to `click that paper on the orb`.
- **Single state authority**: `useDashboardStore` owns `{hoveredPaperId, focusedPaperId, hoveredClusterId, selectedPointIndices, activePanelPaperId}`. No local component state for any of these.

**Files:**
- `apps/web/features/graph/orb/interact/gesture-arbiter.ts` (new)
- `apps/web/features/graph/orb/interact/selection.ts` (new) — rect/lasso/brush
- `apps/web/features/graph/orb/interact/SelectionToolbar.tsx` (new)
- `apps/web/features/graph/orb/render/GraphOrb.tsx`
- `apps/web/features/graph/components/explore/CanvasControls.tsx` — mount the orb toolbar when 3D
- `apps/web/features/graph/lib/graph-selection-state.ts`
- `apps/web/features/graph/lib/graph-selection.ts` — renamed from `cosmograph-selection.ts` during this milestone (L1 resolution; single `git mv`)
- `apps/web/features/graph/stores/slices/selection-slice.ts` — add the state-authority fields as the sole source of truth

**Verify:**
- Every row of the gesture decision table has a passing test.
- Selection preserved across orb ↔ map toggle.
- Single-click empty clears focus/hover but not scope/timeline.
- Multi-select shows panel summary, not a single paper's detail.
- Single-paper scope surfaces the expand-to-neighborhood action.
- `useDashboardStore` is the only writer of the authority fields.

### M3b — Core physics vocabulary (focus, scope, tug)

Minimum viable semantic orb. Without these, the orb is a rotating sphere of dots + a list — it doesn't justify its existence (Product thesis). With these, the orb starts being semantically informative.

**Acceptance:**
- **Force accumulator active**: one `d3-force-3d` simulation, custom force functions reading overlay-state tables. Anchor, scope, spatial-mode, user-gesture forces registered (overlay force slot empty at this milestone).
- **`focus(paperId)`** — click-select AND transient hover. IDF-weighted neighbor attractions read from canonical `weight` column. Persistent on click, transient on hover. Click-select integrated action: wakes sim, starts bloom, rotation pauses, detail panel opens.
- **`scope(pointIndexSet)`** — debounced on `currentScopeRevision` changes. While the revision advances faster than 300ms (user is scrubbing timeline), visual alpha/color updates immediately; force-field update waits until scrub-idle, then one wake. This prevents sim thrash during timeline drag (H6 resolution).
- **`tug(pointIndex, cursorRay)`** — drag a node; neighbors ripple.
- **Three-layer composition** enforced: scope gates population, spatial-mode is exclusive, no overlay yet.
- **Rapid retarget**: generation-based retargeting on focus-A → focus-B; ~150ms ramp.
- **Reduced-motion / Pause-motion / Low-power**: all three effects no-op their motion. `focus` still sets `focusedPaperId` for panel + list sync; `scope` still filters visually; `tug` does nothing.
- **Dismissal**: single-click empty clears `focus`. Scope clears via the filter UI, not by empty-click.

**Files:**
- `apps/web/features/graph/orb/sim/simulation.ts` (new) — d3-force-3d bootstrap + tick loop + wake/sleep state machine
- `apps/web/features/graph/orb/sim/force-effects.ts` (new) — custom force functions reading overlay-state tables
- `apps/web/features/graph/orb/sim/effect-bindings.ts` (new) — wires `selectedPaperId` / `currentScopeRevision` → effect dispatch; handles debounce
- `apps/web/features/graph/orb/sim/centroid-cache.ts` (new) — reads baked centroids from parquet by default; recomputes only when sim awake, dirty-flagged
- `apps/web/features/graph/orb/sim/force-generation.ts` (new) — generation counter + retarget state

**Verify:**
- Click a paper, 1-hop neighbors visibly pull inward over ~1s, IDF-weighted neighbors pull harder.
- Scope narrowing reshapes orb (in-scope stiff-anchor, out-of-scope drift + fade). Timeline scrubbing does NOT thrash the sim.
- Rapid A → B click: A unwinds cleanly, B ramps in without snap.
- Reduced-motion: all physics motion no-op, state still updates through panel/list.
- Sim sleeps when no effect is active (tick counter stops).

### M3c — Extended physics vocabulary (clusterFocus, entityFocus, evidenceSignalOverlay, pulseImpulse)

Additional force effects on top of the core M3b engine. Each composable per the three-layer model.

**Acceptance:**
- **`clusterFocus(clusterId)`** — double-click cluster centroid OR cluster-filter chip. Members attract to baked centroid (from `release_cluster_centroids.parquet`), non-members release anchor + drift outward.
- **`entityFocus(entityId)`** — hover entity chip in panel OR entity-search result. Entity-sharing papers magnetize via the entity overlay table; IDF-weighted.
- **`evidenceSignalOverlay(signals)`** — auto-fires on RAG-answer arrival (subscribes to `rag-slice`). `answer_evidence`/`answer_support` pulse inward toward camera (decay ~2s); `answer_refute` rendered as color/halo/badge, no position drift (stays wherever the active spatial mode has it). Staged: confirm first, refute marker second, varied timings per Heer/Robertson.
- **`pulseImpulse(set, impulse)`** — expand-cluster one-shot; sim pulls home.
- **Composition enforced**: only one of `{focus, clusterFocus, entityFocus}` active; `evidenceSignalOverlay` composes with the active spatial mode as styling-only inside its affected set.
- **Reduced-motion / Pause-motion / Low-power**: all no-op motion; confirmation/refutation shown through color/badge only.

**Files:**
- `apps/web/features/graph/orb/sim/force-effects.ts` — extended
- `apps/web/features/graph/orb/sim/effect-bindings.ts` — extended
- `apps/web/features/graph/orb/sim/overlay-state.ts` (new) — tables per effect type

**Verify:**
- Double-click cluster centroid: members attract, non-members disperse, dismiss restores.
- Hover entity chip: entity-sharing papers magnetize, dismiss on mouseout.
- RAG answer fires: staged confirm → refute-marker visual; composes with any active `focus`; refute papers that are also focus neighbors stay at focus position, marked by color only.
- All effects composable per the three-layer rules; no visual conflicts.
- Reduced-motion: no motion for any extended effect; panel/list/color communicate state.

*Gesture arbitration (explicit decision table — first match wins):*

| Pointer event | Starts over a node | Modifier | Resolves as |
|---|---|---|---|
| pointerdown + move <5px | yes | — | click-select (on pointerup) |
| pointerdown + move ≥5px, <200ms | yes | — | tug |
| pointerdown + move ≥5px | no | — | orbit drag |
| pointerdown + move ≥5px | no | selection-tool active (rect/lasso/brush) | selection gesture |
| pointerdown + move ≥5px | yes | Shift | through-sphere lasso starting on this node |
| double-click | yes (point) | — | focus camera on paper |
| double-click | near cluster centroid | — | expand cluster |
| double-click | empty space | — | resume auto-rotation |
| scroll wheel | anywhere | — | dolly camera |

Touch-specific:
- Single-finger drag on node → tug (touch has no click-vs-drag ambiguity with the 200ms threshold).
- Single-finger drag on empty → orbit.
- Two-finger pinch → dolly.
- Two-finger rotate → unused in v1 (don't conflict with orbit).
- Long-press on node (500ms) → equivalent of desktop hover tooltip.
- Double-tap → camera focus.

This table is the spec; M3 implementation must pass a test suite that exercises each row.

**Files:**
- `apps/web/features/graph/orb/orb-selection.ts` (new)
- `apps/web/features/graph/orb/orb-interactions.ts` (new) — tug + expand-cluster via sim perturbation
- `apps/web/features/graph/orb/OrbSelectionToolbar.tsx` (new)
- `apps/web/features/graph/orb/GraphOrb.tsx`
- `apps/web/features/graph/components/explore/CanvasControls.tsx` — mount the orb toolbar when 3D
- `apps/web/features/graph/lib/graph-selection-state.ts`
- `apps/web/features/graph/lib/cosmograph-selection.ts` — (keep filename; rename deferred)

**Verify:**
- Lasso a visible patch on the orb, toggle to 2D — same points highlighted. Repeat with `Shift`, back-hemisphere joins.
- No DuckDB writes fire during drag or tug (verify via query log).
- Tug a node: 1-hop neighbors visibly spring along, release → smooth decay back to baked positions within ~1s.
- Double-click a cluster centroid: cluster puffs out, re-gathers cleanly; no drift in non-cluster points.
- `prefers-reduced-motion` disables tug and expand (select-only interactions); impulses no-op.

### M4 — Edges as the primary semantic channel

Because 3D positions carry no meaning, edges are the only semantic signal on the orb. The tier strategy is shifted accordingly — cluster-aggregate chords become the **default-visible rest state**, not an optional toggle.

**Edge sources (canonical spec shared between publisher force-layout and runtime view — see correction 17 and 18):**

Both sources MUST be default-visible at runtime because both influenced the baked positions. User can toggle sources off for declutter; user cannot be in a default state where layout-input edges are invisible.

- **Citations** from `current_links_web` (view over `universe_links.parquet`). Unweighted or weighted by citation-relevance score if available.
- **Shared-entity edges** from a runtime view `orb_entity_edges_current` that emits columns `source_point_index, target_point_index, weight FLOAT, source_bitmap UINT8` using the canonical spec from `packages/graph/spec/entity-edge-spec.json`:
  - **Entity-type allowlist**: domain-specific types only — drugs, diseases, receptors, mechanisms, pathways, chemicals. Exclude generic types (protein, human, cell, gene-unspecified). Allowlist lives in the JSON spec.
  - **Rarity weighting (IDF-style)**: edge weight ∝ log(N_papers / entity_frequency) per the canonical formula.
  - **Shared-entity count threshold**: ≥ 2 shared entities.
  - **Max neighbors per node**: top-K (K=30) strongest shared-entity edges to prevent glue-clique artifacts.
  - **`weight` column is the canonical edge strength** — same value used by the publisher's force layout, by edge rendering here, and by runtime force-effect strength (`focus()`, `entityFocus()`). Never re-derived from formula inputs at any consumer. This is the H3 resolution.
- **Future, deferred:** evidence-co-citation edges (papers cited in the same RAG answer). Layered on top of citation + shared-entity post-M5b.

**Tiers:**
- **Tier 0 — cluster-aggregate chords, default-visible.** A few hundred chords from cluster→cluster flow summed across *both* edge sources (citations + shared entities), weighted, alpha ~0.08–0.12. Always on at rest. This is the global signal replacing what position would otherwise carry.
- **Tier 1 — 1-hop on hover.** Hovered paper's citation neighbors + shared-entity neighbors fade in over ~200 ms, alpha ~0.45, slight thickness boost. Differentiated by color or dash (citation = one hue, entity = another).
- **Tier 2 — 1-hop persistent on select, with optional 2-hop toggle.** Selected paper's neighborhood stays lit; user can expand to 2-hop via a control.
- **Tier 3 — all in-scope edges.** Engages when current scope cardinality < 5000. Both sources.
- **Tier 4 — cluster-dive.** Double-click a cluster centroid: camera flies in, non-cluster points dim, intra-cluster edges (both sources) at full alpha.

All tiers respect the same capped subset used by render + pick. Legend shows which sources are active.

**Files (restructured into `orb/render/`):**
- `packages/graph/spec/entity-edge-spec.json` (new) — canonical spec: allowlist, rarity weighting, thresholds, top-K cap, edge weight formula. Source of truth.
- `packages/graph/src/entity-edge-spec.ts` (thin re-export) — `import spec from './entity-edge-spec.json' with { type: 'json' }`; exposes typed spec via `satisfies` or Zod.
- `packages/graph/spec/__tests__/entity-edge-spec.hash.test.ts` (new) — CI: `sha256(canonical_json(spec))` equals committed hash constant. Both TS and Python builds assert this.
- `apps/web/features/graph/orb/render/edges.ts` (new) — tier orchestration + shader attribute packing
- `apps/web/features/graph/orb/render/edge-geometry.ts` (new) — straight interior chord geometry + centroid chord bundling
- `apps/web/features/graph/orb/render/GraphOrb.tsx`
- `apps/web/features/graph/orb/render/shaders.ts` — two-source edge shader (per-source color, alpha, thickness)
- `apps/web/features/graph/duckdb/views/entity-edges.ts` (new) — register `orb_entity_edges_current` view emitting `weight` via the JSON spec
- `apps/web/features/graph/duckdb/queries/orb-edges.ts` (new) — chord aggregation SQL
- `apps/web/features/graph/stores/slices/links-slice.ts` — orb edge tier state + legend visibility
- `apps/worker/app/graph/layout_3d.py` — `json.load()` the canonical spec and enforce equality with the committed hash before publishing; use the same weight formula for force-layout edges

**Verify:**
- Fresh orb renders cluster-aggregate chords at rest (both sources). No visual hairball.
- Hover a paper, ~50–200 citation + shared-entity neighbors fade in with distinguishable colors.
- Click a paper, neighborhood persists; toggle 2-hop, depth expands cleanly.
- Narrow scope below the threshold, Tier 3 engages on both edge sources.
- Double-click a cluster centroid, Tier 4 engages.
- No frame drops during tier transitions on desktop; mobile stays at 30+ fps with Tier 0 + Tier 1 on.
- Entity edges are computed at scope-change time from the runtime view; DuckDB query budget holds under existing limits for the evidence set.

### M5a — Surface toggle UI + search-first ingress (ship orb opt-in, map default)

**Prerequisite:** `graph-landing-stealth-handoff.md` Milestone 2 has landed. The `<GraphShell>` component exists; `/` and `/graph` both mount it; scope toggle mechanics (dual-canvas mount, visibility flip) are in place at the shell level with map-only behavior. This milestone turns on the orb side of that shell.

**Acceptance:**
- New `view-slice.ts` owns `activeSurface: 'map' | 'orb'`, `pauseMotion: boolean`, `lowPowerProfile: 'auto' | 'on' | 'off'`. No leaks into selection, config, timeline, panel slices.
- Default on `/graph`: `activeSurface = 'map'` (unchanged user-facing behavior at this milestone).
- Feature flag (env + user) gates visibility of the toggle. Capability gate: toggle visible only when the loaded manifest has `orbCapabilityVersion >= MIN_CLIENT_VERSION` AND feature flag is on. Shallow "has parquet" gating is not sufficient (see correction 21).
- Segmented button labels: **"Evidence (orb)"** and **"Full corpus (map)"**. The toggle communicates a surface/scope switch, not a renderer swap — labels reflect that.
- **Search-first ingress (correction 24)**: on both surfaces, the search + ranked-list + detail panel sit alongside the visualization from first paint. Cold `/graph` never paints an "empty orb with no context"; the ranked-list panel is already populated by the current scope/evidence set.
- **Both canvases mounted simultaneously.** The orb canvas and the Cosmograph canvas both mount as soon as the DuckDB session is ready; each first-paints independently; both stay mounted across session lifetime. Scope toggle is a `visibility` flip in the shell, not a mount/remount. Switching preserves `selectedPointIndices`, filters, timeline, open panels, detail — this is automatic since both canvases read the same `useDashboardStore`. Switching to orb sets the population filter to evidence-only; switching to map sets it to full-corpus.
- **Three readiness signals** surfaced from the warmup hook: `sessionReady` (data warm), `orbReady` (orb canvas first-paint complete), `mapReady` (Cosmograph canvas first-paint complete). The landing warmup button transitions from pulse to play on `orbReady` (not `sessionReady`).
- **`prefers-reduced-motion`**: default surface is map but the orb toggle **is not hidden**. A user who explicitly enters the orb gets the static-3D path from M2 (baked positions, no auto-rotation, no scripted motion, manual orbit-drag permitted). This resolves the M5a-vs-M2 contradiction: M2's "even if explicitly selected" is now reachable.

**Files:**
- `apps/web/features/graph/stores/slices/view-slice.ts` (new) — `activeSurface`, `pauseMotion`, `lowPowerProfile`
- `apps/web/features/graph/stores/dashboard-store.ts`
- `apps/web/features/graph/stores/index.ts`
- `apps/web/features/graph/hooks/use-graph-bundle.ts` — expose `orbCapabilityVersion` + `isOrbCapable(minVersion)` predicate
- `apps/web/features/graph/components/chrome/ChromeBar.tsx` — segmented control + search-first ingress layout (search input + ranked-list panel alongside canvas)
- `apps/web/features/graph/components/canvas/GraphCanvas.tsx` — branch on `activeSurface`
- `apps/web/features/graph/lib/renderer-flags.ts` (new) — feature flag + capability-version gate + reduced-motion predicate + low-power auto-detect

**Verify:**
- With flag off OR capability-version gate fails OR feature flag off: no orb toggle rendered; map is the only reachable surface.
- With flag on + capable bundle + motion allowed: toggle flips surfaces without losing selection, scope SQL, timeline, panel tabs, or open detail row. Round-trip map → orb → map preserves all state.
- Reduced-motion user: default surface is map; toggle IS visible; explicit entry to orb yields static 3D with baked positions, no scripted motion, manual orbit-drag permitted.
- Search-first layout: cold `/graph` paints search + ranked-list + visualization together; ranked-list is populated from first paint (not empty).

### M5b — Flip `/graph` default to orb on orb-capable bundles

**Acceptance:**
- On orb-capable bundles (per `orbCapabilityVersion` gate from M0), fresh sessions default to `activeSurface = 'orb'`.
- Non-orb-capable bundles still default to `activeSurface = 'map'`. No visible change for them.
- `prefers-reduced-motion` continues to default to `map` with the orb reachable as static-3D; M3c's extended physics are no-op under reduced-motion.
- **First-paint budget is absolute, not ratio-based.** Baseline: cold `/graph` with map as default paints in `T_ms_map` (measured per `.claude/skills/graph/references/frontend-performance.md`; record the number before M5b starts). Budget: cold `/graph` with orb as default paints in `T_ms_map + 300 ms` on desktop, `T_ms_map + 600 ms` on Galaxy S26 Ultra. Ratios hide regressions when the baseline moves; absolute deltas don't.
- Bundle preload enters first-paint mode: `release_points_3d.parquet`, `release_evidence_members.parquet`, `release_cluster_centroids.parquet` attached before the orb's first render.
- User can explicitly switch to map; switch round-trip preserves state.
- Rollback: one-line default change in `view-slice.ts` + flag flip.

**Files:**
- `apps/web/features/graph/stores/slices/view-slice.ts` — default values branch on capability
- `apps/web/features/graph/duckdb/session/index.ts` — first-paint attach of 3D + evidence tables when bundle is orb-capable
- `apps/web/features/graph/lib/renderer-flags.ts` — `defaultRendererMode(capability, prefersReducedMotion)` predicate
- `apps/web/features/graph/lib/fetch/constants.ts` — include 3D + evidence in the startup artifact set when bundle declares them

**Precondition:** M5a has been live in production for a validation window (real-traffic perf + memory + evidence-set-size distribution look healthy). Duration is a product call, not a plan commitment.

**Verify:** cold `/graph` on an orb-capable bundle paints the orb directly. Cold `/graph` on a pre-orb bundle paints 2D (no regression). Reduced-motion user on orb-capable bundle lands in 2D. First-paint trace shows 3D + evidence parquets attached before the orb's first render, not during/after.

### M6 — Landing choreography (subsumed by `graph-landing-stealth-handoff.md` Milestone 4)

**The architectural work this milestone used to own has moved to the companion plan** (`docs/future/graph-landing-stealth-handoff.md`). Under that plan: `/` and `/graph` mount the same `<GraphShell>` with different `mode` props; the orb canvas is a single instance onscreen throughout the landing scroll; internal "enter graph" is a scroll-to-end, not a `router.push`; no route boundary is crossed during the landing → graph flow; no crossfade is needed. This plan's earlier framings (first "zero pixel delta via persistent canvas," then "field until bundle ready, then crossfade") are both superseded.

**What this plan's M6 still owns, layered on top of stealth-handoff's M4:**
- **Scroll chapter choreography over a live orb.** Text opacity, chrome opacity, pointer-events unlock — all scroll-scrubbed against a continuously-present orb canvas.
- **Orb rest state during pre-roll.** Auto-rotation running, sim asleep (no scripted motion on the orb while text is still fading); physics only wakes once pointer-events unlock and a user interaction fires.
- **Reduced-motion behavior.** `prefers-reduced-motion` disables auto-rotation during scroll; the orb is static behind fading text; pointer-events unlock the same way.
- **Slow-network behavior under the shared shell.** If the DuckDB session isn't `sessionReady` by end-of-scroll, the orb canvas is mounted but showing a placeholder state (baked-positions-not-yet-loaded is impossible since positions come from the parquet that `sessionReady` gates; the orb mount itself waits for `orbReady`). The warmup icon stays in "pulse" state; clicking it is a no-op until ready. No banner required under the shared-shell model — the shell waits cleanly.
- **Landing text chapter content.** Out of scope for this plan; owned by the landing product surface.

**Acceptance:** do **not** start. Blocked until:
- M2 passes desktop and Galaxy S26 Ultra perf + selection-parity exit criteria.
- M5b has flipped `/graph`'s default to orb on orb-capable bundles (so the landing's end state matches `/graph`'s default state).
- `graph-landing-stealth-handoff.md` Milestones 1–3 have landed (shared shell extracted, orb mounted in shell, scope toggle working).

**Exit contract — what must be true when this milestone is done:**
- Scroll from top-of-landing to end-of-landing renders the same `<GraphShell>` mount throughout. Zero route transitions, zero canvas remounts, zero crossfades between renderer surfaces.
- Text chapters overlay on the orb; at end-of-scroll, text alpha is 0 and chrome alpha is 1.
- Pointer-events on the orb transition from locked to unlocked exactly once, at end-of-scroll.
- Physics remains asleep until a user-originated interaction fires (not triggered by scroll completion itself).
- Direct `/graph` navigation (deep link) mounts the shell with `mode="graph"` — same shell, scroll already at end, chrome already visible. Cold-mount loading cost is accepted per the stealth-handoff plan.
- Reduced-motion user: no auto-rotation during scroll, no auto-rotation post-scroll unless they explicitly resume.

**Files touched when it unblocks** (small, because stealth-handoff owns the hard parts):
- `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx` — remove the field-to-orb crossfade assumption; wire scroll progress to text/chrome opacity uniforms; the orb canvas already lives in the shell.
- `apps/web/features/graph/orb/render/rotation-controller.ts` — respect `mode === 'landing' && scroll < end` as a "rotation paused during pre-roll" signal.
- `apps/web/features/graph/orb/render/GraphOrb.tsx` — accept a `pointerEventsLocked` prop from the shell that maps to scroll progress in landing mode.

**Verify:** gate check only. When implemented:
- Chrome DevTools frame recording shows the same WebGL context ID throughout scroll (no context recreation).
- React devtools shows `<GraphShell>` mounted once from scroll start through end-of-scroll.
- Pointer-events toggle exactly at end-of-scroll; sim tick counter does not advance during scroll.
- Reduced-motion: rotation never starts during scroll; clicking a paper post-scroll works normally (static orb still supports click-select).

## Decisions still deferred

- ~~M6 canvas ownership / persistent-canvas-above-routes.~~ **Resolved via `docs/future/graph-landing-stealth-handoff.md`**. The hybrid-route / shared-shell plan keeps landing → graph on a single component via scroll-to-end, so the route boundary is never crossed during that flow. Persistent-canvas-above-routes is not needed; the earlier language in this plan saying "hoisting above the route tree is out of scope" is compatible with that resolution — no hoisting is required, because the flow stays single-route.
- Mobile thresholds for the low-power profile. Profile on Galaxy S26 Ultra (flagship Android) + one mid-range Android + one older iPhone before committing. Current heuristic (`devicePixelRatio × area > N` OR `hardwareConcurrency < 4`) is a guess; refine after measurement.
- Force-layout parameter defaults: locked by the M0 tuning gate, not by this doc. Starting values: `cluster_bonus_multiplier = 2.0`, `umap_anchor_strength ≈ 10% of edge-spring strength`, `force_iters = 300`, `linLogMode = on`.
- Live-sim force tuning: wake `alphaTarget` target, anchor-spring strength (~0.3), link strength, charge strength. Surface in a dev-only tuning UI; ship M2 with defaults.
- Entity-edge thresholds: `min_shared_entities = 2`, `top_k_per_node = 30`, rarity-weighting formula. Locked by the M0 tuning gate; spec lives in `packages/graph/spec/entity-edge-spec.json` (the JSON is canonical; see correction 17).
- Entity-type allowlist: initial set (drugs, diseases, receptors, mechanisms, pathways, chemicals). Needs curation with the biomedical-knowledge owner; ship with a conservative first pass and refine.
- Web-worker vs main-thread for the sim wake-period ticks. Main-thread first; move to worker only if profile shows sustained >6 ms per tick.
- Auto-rotation timing (rpm, grace period), tuned after first playable build.
- Evidence-co-citation as a third edge source, layered on top of citation + shared-entity. Post-M5b.
- ~~Renaming `lib/cosmograph-selection.ts` → `lib/graph-selection.ts`.~~ Resolved: rename happens during M3a (one `git mv`, trivial).
