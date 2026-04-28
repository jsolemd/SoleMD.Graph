# Runtime Model

The physics runtime has to reconcile three truths:

1. The full corpus can be millions of graph objects.
2. The browser should only keep an active resident subset.
3. The user should experience continuous space, not obvious loading boundaries.

This document maps that requirement onto the existing SoleMD.Graph architecture:
checksum-addressed bundles, DuckDB-WASM, OPFS, active views, `FieldCanvas`, and
the current `OrbSurface` state lanes.

## System Planes

| Plane | Owner | Responsibility |
| --- | --- | --- |
| Corpus plane | PostgreSQL, pgvector, future graph stores | Durable biomedical graph, document metadata, embeddings, aliases, evidence |
| Publish plane | `apps/worker` | Precomputed layouts, clusters, kNN shards, bundle manifests, aggregate tiles |
| API plane | `apps/api` | Request-time neighborhoods, search/RAG evidence, prompt entity resolution |
| Browser analytic plane | DuckDB-WASM, OPFS, active views | Attach bundle Parquet, join/filter/rank local graph slices, choose resident set |
| Render plane | `FieldCanvas`, Three/R3F, shaders | Draw resident particles, labels, pulses, orbits, trails, and aggregate dust |
| Physics plane | Current shader uniforms, future force kernel | Integrate positions/velocities and event forces within browser budgets |

The browser should never need the entire corpus loaded as individual particles to
make the galaxy feel whole. It needs fast local expansion, honest aggregates,
and stable transitions.

## 3D Role And Cost

The 3D galaxy is a product choice, not the cheapest graph-reading mode.

Costs we accept:

- Dense edges are harder to read in 3D than in a stable 2D map.
- Labels occlude sooner because depth, size, and camera angle all compete.
- Selection can be ambiguous when two bodies project to nearby pixels.
- The user may need a 2D lens for exact adjacency, ranking, and comparison.

Why 3D is still worth it:

- Wiki/entity/paper hierarchy maps naturally to systems, orbits, rings, and
  reference-frame changes.
- The scene can preserve spatial memory while RAG/search adds provisional
  matter.
- Depth and orbit give us more channels for uncertainty, evidence distance, and
  activity than a flat map.

Contract: 3D owns exploration, memory, and the living wiki metaphor. Cosmograph
or another 2D lens remains the high-density connectivity view when exact edge
legibility matters.

## Residency States

Every renderable identity should have a residency state. This can start as an
implementation-level enum and later become a visible debug overlay.

| State | Meaning | Render Behavior | Data Behavior |
| --- | --- | --- | --- |
| `cold` | Known only through corpus/backend or aggregate tile | Not drawn individually | May exist in manifest, aggregate count, or backend index |
| `warm` | Requested or attached in DuckDB, not yet visible | Optional ghost/dust hint | Available for filtering/ranking soon |
| `entering` | Newly promoted into render set | Fade in, low force participation until stable | Has slot assignment and resident reason |
| `resident` | Active individual particle | Full picking/render/physics | Participates in scope and focus |
| `focused` | Current attention target or protected neighbor | Higher priority, stronger force participation | Eviction-protected |
| `leaving` | No longer needed but still visible for continuity | Fade out, damp velocity, stop expensive interactions | Slot can be reclaimed after transition |
| `evicted` | Removed from draw set | Not drawn | May remain in DuckDB/OPFS cache |

The visual transition should always be fade-then-unrender. Removing first and
fading later creates spatial discontinuity.

## Resident Reasons

Residency should be explainable just like motion.

| Reason | Priority | Typical Source |
| --- | --- | --- |
| `pinned` | Highest | User-pinned wiki/entity/paper |
| `focus` | Highest | Current selection, search target, active panel |
| `prompt` | High | Prompt/RAG provisional matter |
| `neighbor` | High | kNN, citation, entity-paper, or evidence neighborhood |
| `wiki` | Medium | Current wiki/module system |
| `scope` | Medium | Active filter or lasso-like scope |
| `search` | Medium | Ranked query result |
| `sample` | Low | Background representative points |
| `aggregate` | Lowest | Dust/tile/cluster representation |

Eviction should remove low-priority, low-stability matter first. Focused and
pinned items should remain stable enough to support memory and orientation.

## Current Implementation Baseline

The current orb is already partially data-reactive:

- The field point count is fixed at 16,384.
- Particle state is packed into a 128 x 128 RGBA texture.
- Scope updates are resolved through DuckDB and written to the R lane.
- Focus/hover are written to the G lane.
- Evidence/search pulses are written to the B lane from RAG and graph state.
- Ambient speed, rotation, entropy, pause, and reduced-motion controls already
  exist in the field scene state.
- `OrbSurface` runs on the persistent field canvas rather than an isolated
  one-off `GraphOrb` renderer.

Relevant code anchors:

- `apps/web/features/field/asset/point-source-registry.ts`
- `apps/web/features/field/renderer/field-particle-state-texture.ts`
- `apps/web/features/field/asset/field-attribute-baker.ts`
- `apps/web/features/field/renderer/FieldStageLayer.tsx`
- `apps/web/features/orb/surface/OrbSurface.tsx`
- `apps/web/features/orb/surface/hooks/use-orb-scope-resolver.ts`
- `apps/web/features/orb/surface/hooks/use-orb-evidence-pulse-resolver.ts`
- `apps/web/features/field/scene/visual-presets.ts`

This is the right substrate for a first physics pass, but current hiding is
mostly visual. A point with alpha zero still exists in the draw call. True load
reduction requires chunked geometry, draw-range changes, separate render pools,
or a GPU/state indirection layer that prevents nonresident points from being
submitted for the frame.

## Identity Pool And Dust Pool

The first pool split should be explicit:

1. The current 16,384-slot state texture becomes the identity pool.
   These slots are for corpus-backed or session-backed objects that can be
   inspected, picked, explained, and assigned a `residentReason`.
2. Ambient dust moves to a separate non-pickable render path.
   Dust should be shader-only or aggregate-backed. It does not need the identity
   state texture, focus lane, evidence lane, or per-object picking.
3. Do not split the existing 16K texture into identity and dust classes.
   A branchy slot-classification lane would still draw every slot and would not
   solve load shedding. It also spends scarce state capacity on particles that
   are intentionally not inspectable.
4. Do not add a second full dust state texture until dust needs real aggregate
   data.
   The initial dust path should be one small draw call/material fed by stable
   uniforms, cluster/tile summaries, or procedural hashes.

This means the 16K budget is identity-only. If the visual field needs dust,
draw dust outside that budget. If performance is tight, disable or simplify dust
before evicting identity particles that the user can interact with.

## Draw Budget Tiers

These are starting budgets, not product promises. They should be adjusted by
measurement on target hardware.

| Tier | Individual Draw Set | Intended Device/Mode | Notes |
| --- | --- | --- | --- |
| `safe` | 16K | Mobile, reduced power, initial load | Current capacity; reliable baseline |
| `desktop` | 25K-50K | Modern laptop/desktop | Needs chunked residency and measured picking costs |
| `high` | 75K-100K | Strong GPU, focused graph mode | Needs LOD, chunked buffers, GPU-side state, label throttling |
| `aggregate` | 100K+ visual impressions | Overview mode only | Should be aggregate dust/tiles, not all pickable identities |

The full million-point graph belongs in backend storage, precomputed bundles,
and lazy shards. The active orb should expose that scale through streamable
systems rather than brute-force drawing.

## Frame Budget

The runtime should budget work per frame instead of only saying "60 FPS."

Target for 60 FPS is 16.67 ms. A practical initial allocation:

| Phase | 60 FPS Budget | Notes |
| --- | --- | --- |
| CPU/JS orchestration | 2 ms | React invalidation, scalar store reads, resident planner tick, small DuckDB result handling |
| Physics step | 2 ms | One resident-set integration step or no-op when cooled |
| GPU visual draw | 6 ms | Identity points, dust, rings/trails, minimal overlays |
| Picking/labels | 2 ms | Event-driven picking pass plus label update budget; not every static frame |
| Slack | 4.67 ms | Browser variance, GC, panel work, mobile thermal headroom |

Target for 30 FPS is 33.33 ms, but the proportions should stay similar. The
extra time is for lower-end devices and heavy interaction, not permission to
run hidden work.

Rules:

- A pointer-move picking pass may run on pointer events, but should be throttled
  to animation frames and skipped when the pointer is idle.
- Labels must degrade before points. If the scene is over budget, reduce label
  count, label refresh rate, trails, and dust before removing focused identity.
- Physics should cool to near-zero work when the scene is stable.
- Any implementation that changes these budgets needs a benchmark note.

## Streaming Flow

Search, typing, and RAG should use the same residency flow.

1. User focuses a wiki/entity/paper, types into a prompt, or runs search.
2. Browser derives an initial active scope from existing DuckDB tables and UI
   state.
3. API resolves missing entities, aliases, paper refs, and nearest neighborhoods
   if the needed data is not already attached.
4. Browser attaches or reads lazy bundle shards through DuckDB/OPFS.
5. Resident planner scores candidates by focus, relation strength, evidence
   score, stability, and current budget.
6. Existing resident points that are no longer relevant move to `leaving`.
7. Newly selected points move through `warm` and `entering`.
8. Force kernel warms the local system without disturbing unrelated pinned
   systems.

The streaming unit should not be one giant graph. It should be one or more of:

- Wiki-system bundle.
- Entity neighborhood bundle.
- Paper/evidence neighborhood bundle.
- kNN shard.
- Citation/evidence shard.
- Aggregate density tile.
- Prompt session shard.

## Fade, Evict, Replace

Smooth galaxy expansion depends on predictable replacement.

| Step | Visual Goal | Technical Goal |
| --- | --- | --- |
| Dim unrelated | User sees attention shift | Lower alpha/brightness and force participation |
| Cool unrelated | Old regions stop competing | Lower temperature and disable expensive event forces |
| Fade leaving | Scene continuity | Keep old slots visible for a bounded transition |
| Reclaim slots | Recover GPU budget | Remove leaving chunks from draw set or reuse slots |
| Enter new | Reveal new system | Fade in with stable seed positions and low initial velocity |
| Settle | Make it readable | Damping, collision separation, label gating |

Slot reuse must avoid popping. New points should spawn from meaningful locations:
near their parent entity, near a query protostar, on the edge of a wiki system, or
from aggregate dust that represented their cluster.

## Picking Contract

CPU ray picking does not survive once positions live in GPU textures. The
canonical scalable path is GPU color picking:

1. Render pickable identity particles into an offscreen picking framebuffer.
2. Encode the resident slot or stable resident index into an RGB/RGBA color.
3. On pointer move/click, read only the pixel under the pointer with
   `readPixels(1 x 1)`.
4. Decode the color into a resident index, then resolve the stable corpus/session
   ID from the resident table.
5. Keep dust and aggregate background matter out of the picking pass unless a
   tile-level aggregate needs its own pick target.

The picking pass must sample the same position state as the visual draw path.
If visual positions come from `posTex`, picking must come from `posTex` too.
Do not mirror all GPU positions back to CPU just to pick.

Initial ID encoding can use a 24-bit color ID, which supports roughly 16M
objects per pickable layer. That is enough for the resident identity pool. If a
future path needs more, split pickable layers or use integer formats where the
target backend supports them.

## Physics Kernel Phases

The future kernel should run in phases so it can degrade gracefully.

| Phase | Required? | Description |
| --- | --- | --- |
| Seed | Required | Use baked layout, parent anchor, or aggregate tile position |
| Scope gate | Required | Apply `scopeMask` and resident reason |
| Stable forces | Required | Cluster gravity, link springs, damping, separation |
| Event forces | Optional | Search, focus, RAG, prompt formation, evidence pulse |
| Orbit synthesis | Optional | Local planet/moon/ring motion around focused systems |
| Ambient drift | Optional | Low-cost visual breathing |
| Label/picking sync | Required | Keep interaction targets coherent with rendered points |

The kernel consumes two motion gates:

| Gate | Source | Meaning |
| --- | --- | --- |
| `userPauseMotion` | User-facing pause control | Hard freeze for simulation time, rotation, color cycling, and event animation |
| `systemReducedMotion` | OS reduced-motion, low-power profile, or safety gate | Disable or floor nonessential motion while preserving readable state changes |

Reduced motion is not pause. It can disable event/orbit/ambient phases while
preserving scope, selection, and static layout. User pause freezes time even if
the reduced-motion floor would otherwise allow drift.

## Variable Storage Plan

| Variable | Short-Term Storage | Long-Term Storage |
| --- | --- | --- |
| `scopeMask` | Current R lane | State texture/channel or resident table |
| `attention` | Current G/B lanes | Focus/evidence textures plus event buffers |
| `mass` | Baked attribute or DuckDB column | `massTex` or packed resident attribute |
| `position` | Baked buffer attribute | `posTex` or storage buffer |
| `velocity` | None today | `velTex` or storage buffer |
| `relationClass` | Packed attribute/lookup | Relation-class texture or edge buffer |
| `orbitPhase` | Shader-derived | `orbitPhaseTex` or procedural stable hash |
| `residentReason` | Not explicit | Packed state lane or resident planner table |
| `stability` | Not explicit | Packed state lane, DuckDB score, or session table |
| `edgeNeighborhood` | DuckDB/API result | Lazy edge shards plus GPU-friendly compact buffers |

The existing WebGL attribute budget is already tight. New high-cardinality,
per-particle state should move into textures or future WebGPU storage buffers
rather than more vertex attributes.

Float texture filtering gotcha: simulation state should assume `NEAREST`
sampling. Smooth sampling of float or half-float drift/density fields requires
feature detection for linear float/half-float filtering support, and must have a
nearest/manual-bilinear fallback. Do not make linear float filtering a mobile
requirement.

## Backend Capability Contract

The product contract is WebGL2 first.

- The `SemanticPhysicsKernel` interface targets a WebGL2-compatible backend as
  the baseline implementation.
- WebGPU is a feature-detected upgrade backend when `navigator.gpu`, browser
  support, device limits, and Three/R3F integration are acceptable.
- No user-facing graph feature ships as WebGPU-only until a separate product
  decision changes the support contract.
- WebGPU may improve count, compute, and buffer ergonomics; it must not be the
  only way to use the clinical galaxy.

## Precomputation

The worker should compute enough structure that the browser is never inventing
global topology at runtime.

Recommended worker outputs:

- Stable 3D seed coordinates for major point sets.
- Cluster and wiki-system centroids.
- Entity-paper membership indices.
- Citation/evidence neighborhood shards.
- kNN shards by embedding/model/version.
- Aggregate density tiles for dust/overview.
- Mass, degree, recency, and evidence authority percentiles.
- Relation class tables and edge-weight summaries.
- Per-bundle manifests with counts, checksums, and capability flags.

Runtime physics can then refine local neighborhoods without needing to solve a
million-point layout in the browser.

Publish-plane invariant: stable corpus identity must survive reindexing. A
canonical node such as a MeSH/DOI/PMID/entity ID should keep the same stable
seed unless the layout algorithm version or source graph version explicitly
changes. Runtime slot index, Parquet row order, and bundle-local integer ID are
not identity. Bundle manifests should expose enough versioning to tell whether a
layout drifted because the corpus changed, the algorithm changed, or only the
physical asset order changed.

## API Responsibilities

The API should be responsible for missing or user-specific expansion:

- Resolve prompt entities and aliases.
- Return local neighborhoods around an entity/wiki/paper.
- Return RAG evidence references and scores.
- Return aggregate counts for unloaded regions.
- Return bundle URLs/checksums for lazy shards.
- Bound every response by an explicit budget.

The browser should not ask the API for "the universe." It should ask for the
next system that makes the current task more explainable.

## Debug Requirements

Physics needs inspection tools early.

Minimum useful overlays:

- Resident count by reason.
- Identity count versus dust/aggregate count.
- Draw count by chunk.
- Entering/leaving counts.
- Current force temperature.
- Scope count from DuckDB.
- Evidence pulse count.
- GPU capability tier.
- Frame time, physics time, draw time, picking time, and label time.
- Picking mode and last picked resident reason.
- Top eviction reasons.

Without this, the galaxy will feel mysterious to the developer as well as the
user.

## Performance Rules

- Never put per-frame particle state into React state.
- Do not reallocate large buffers during interaction.
- Do not run hidden panel queries or hidden physics passes.
- Prefer stable typed arrays, textures, and DuckDB result batches.
- Keep labels and picking on stricter budgets than points.
- Use aggregates before dense identity particles in overview mode.
- Keep first paint on the base bundle; lazy shards should improve the scene
  after first interaction, not block startup.

## First Implementable Slice

The smallest useful physics pass is:

1. Add explicit resident reason and residency state in the browser planner.
2. Convert the 16K pool into an identity-only pool.
3. Move ambient dust to a separate non-pickable shader/aggregate path.
4. Add fade-in/fade-out states before slot reuse.
5. Add mass and stability as baked scalar columns.
6. Add the GPU picking framebuffer for the identity pool before GPU positions
   become the only position source.
7. Make search/RAG prompt results spawn provisional matter if no resident match
   exists.
8. Add a local focus system where selected entity/wiki/paper becomes a temporary
   barycenter.
9. Add debug overlays for resident counts, pool split, picking cost, and event
   temperature.

That slice turns the current orb from a fixed particle field into the beginning
of a streamable semantic galaxy without forcing a premature engine rewrite.
