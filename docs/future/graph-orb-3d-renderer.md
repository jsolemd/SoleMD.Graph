# GraphOrb — Second Renderer on the Cosmograph Pipeline

> Status: future / exploratory plan. Not yet scheduled.
> Captures the design for a 3D WebGL "orb" view of the SoleMD graph corpus that reuses the existing Cosmograph + DuckDB + bundle pipeline as its data layer.

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
