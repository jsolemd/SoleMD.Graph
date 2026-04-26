# 10 — Force vocabulary

## The named effects

A small composable set. Lives in
`apps/web/features/graph/orb/sim/force-effects.ts` (new path).

### Spatial-mode class (exclusive — at most one active)

| Effect | Trigger | Force semantics |
|---|---|---|
| `focus(paperId)` | click select OR transient hover | local gravity well with orbital bands: cited papers inner ring, citing papers outer ring, kNN-only papers haze belt |
| `focus(resultSet)` | search-bar commit | score-stratified formation: top hits tight core, mid hits belt, lower hits haze; no single mush centroid |
| `clusterFocus(clusterId)` | double-click cluster centroid OR cluster filter chip | members attract to baked centroid; cohesion controls gravity-well tightness and ambient breath |
| `entityFocus(entityId)` | hover entity chip in panel OR entity-search result | entity-sharing papers magnetize and briefly align along an entity axis via pair weights |
| `evidencePulse(set, kind)` | search bar OR RAG-result arrival (non-refute) | staged inward impulse by result kind/score; decays exp over τ = 4 s |

Generation-based retarget (canonical Rapid Retarget): each dispatch
increments a generation counter. Effects are scheduled as
`{stage, mode, payloadRef, startMs, durationMs, easing}` entries, so
rapid A → resultSet → B chains cancel stale stages, start from the
current particle state, and suppress intermediate camera jumps.

### Overlay class (composes with active spatial mode)

| Effect | Trigger | Render-only behavior |
|---|---|---|
| `evidenceMark(set, kind)` | RAG-result arrival, OR refute-only search | color / halo / badge per kind; no position change |

### Direct-manipulation class

| Effect | Trigger | Force semantics |
|---|---|---|
| `tug(pointIndex, cursorRay)` | drag a node | sets `fx,fy,fz` via cursor projection; neighbors ripple via the same anchor / scope / mode forces; release clears `fx,fy,fz` |
| `pulseImpulse(set, impulse)` | expand-cluster one-shot | one-tick velocity write; sim pulls home over decay |
| `tug(clusterId, cursorRay)` | drag near cluster core | optional later tidal tug: cluster members shift coherently while preserving internal structure |

### Always-on (background)

| Effect | Force semantics |
|---|---|
| `anchor(i, bakedPos[i])` | weak spring toward each particle's `(x3, y3, z3)` from bundle. Always on. Returns sim to baked equilibrium when no other effect is active. |
| `scope(set)` | reads `currentPointScopeSql` membership; in-scope = stiff anchor; out-of-scope = release anchor + mild radial push. Continuous timeline mass via `filterMask` smooth-step. |

## Force accumulator

One `ForceKernel` instance per session. Force functions are
**registered at creation** (not swapped in and out at runtime).
Each tick, the kernel iterates resident-set particles and applies:

1. Anchor force (always).
2. Scope force (reads `filterMask`).
3. Spatial-mode force (reads `spatialMode` uniform; switches per
   active effect).
4. Overlay force (reads `excitationTex` for `evidencePulse` —
   but `evidenceMark` is render-only, no force participation).
5. User-gesture force (reads `tug` state, `pulseImpulse` queue).

Overlay-state lives in plain JS tables / DataTextures keyed by
`particleIdx`, mutated by the effect-dispatch API
(`register(id, payload)` / `unregister(id)`). Not by swapping d3
force instances. (Per canonical "force accumulator" framing,
slightly tightened.)

## Shape grammar

These are product-visible shapes, not separate state systems:

| Shape | Metaphor | Data signal | Implementation | V1 |
|---|---|---|---|---|
| Orbital belts | Saturn rings | cites / cited-by / semantic kNN | `focus(paperId)` writes `radialBandTex` + `orbitPhaseTex`; tangential velocity is bounded | yes |
| Citation cascade | comet tail | citation lineage + publication year | focus subtype, precomputed 2-3 hop lineage, `lineageDepthTex` later | no |
| Cluster gravity well | galactic cluster | cluster size + cohesion + signal | background cluster pull reads centroid/cohesion buffer | yes |
| Entity constellation | aligned star field | shared entity / mechanism | `entityFocus` writes pair targets and entity axis | after v1 |
| RAG narrative | three-act evidence formation | support/refute/neutral + score | scheduled `evidencePulse` + `evidenceMark`, `effectStageTex` | yes MVP |
| Temporal flow | time lens | publication year | explicit temporal lens only; never default position encoding | no |
| Author orbit | virtual author body | author/coauthor graph | later virtual-body focus with author bundle assets | no |
| Pulsar/supernova | breathing research activity | citation percentile + recency | render/ambient lane only, no force | restrained yes |
| Interaction inertia | mass/heaviness | mass + velocity | damping/velocity decay parameter sweep | yes |
| Scope event | expansion/contraction | filter/timeline membership change | Layer 1 scheduled mask transition | after filters stable |
| Tidal tug | dragging a galaxy core | cluster/neighborhood cohesion | direct-manipulation field over cluster members | later |
| Resonance | binary stars | mutual citation / co-citation | top-N coupled pairs, local only | no |

Reduced-motion / low-power rule: every shape must degrade to static
membership, color, halo, edge, or list state. If a shape cannot
explain itself without motion, it does not ship.

## Edge weights from canonical spec

Force strengths read directly from the canonical `weight FLOAT`
column on the edge view (`current_links_web` for citations,
`orb_entity_edges_current` for shared-entity). **Never re-derived
at any consumer.** The publisher's `entity-edge-spec.json` SHA is
the single source; runtime / publisher / force layout all read
from it.

## Reduced-motion / Pause-motion / Low-power

All force effects no-op their **motion** when any of these are
active:

- `prefers-reduced-motion` (OS).
- Pause-motion control (UI override).
- Low-power profile (auto or manual).

State still flows through panel + ranked list + color/badge.
Refute and overlay marks stay visible. Spatial state (which paper
is focused, which scope is filtered) updates correctly. Only
**positional motion** is suppressed.

This means the user can still navigate, see refute markers, see
filter scope dimming, see selection glows — all without any
force-driven movement. Per canonical correction 20 + R2-9.

## Owns / doesn't own

Owns: the seven effect names + their force semantics, the
accumulator structure, the edge-weight read rule, the reduced-
motion contract.

Doesn't own:
- How effects compose → [11-three-layer-composition.md](11-three-layer-composition.md).
- Search workflow / dispatch ordering → [09-search-and-rag-excitation.md](09-search-and-rag-excitation.md).
- The kernel implementation → [milestones/M2](milestones/M2-orb-renderer-hybrid-physics.md).

## Prerequisites

[03-physics-model.md](03-physics-model.md).

## Consumers

[09-search-and-rag-excitation.md](09-search-and-rag-excitation.md),
[11-three-layer-composition.md](11-three-layer-composition.md), all
M3 milestones.

## Invalidation

- New effect added → check three-layer composition compatibility
  before shipping.
- Edge weight formula changes → `orbCapabilityVersion` bumps; the
  whole spec hash changes.
- Reduced-motion semantics change (e.g. allow gentle motion) →
  per-effect motion flag instead of global no-op.
