# 03 — Physics model (hybrid ambient + wake-driven)

> **Updated 2026-04-27.** The current `/graph` WebGPU slice implements
> the first compute step: storage-buffer positions drift through a small
> WGSL integration pass and the render/pick paths consume the same
> buffers. The richer `SemanticPhysicsKernel` described below remains
> the target for force effects, edges, summaries, and wake/sleep
> behavior.

## Two physics tiers

**Ambient (always on, ~free):**
- Slow group-Y rotation applied at scene-root level.
- Existing per-particle stateless noise displacement
  (`fbm + snoise` driven by `uTime`) in
  `apps/web/features/field/renderer/field-vertex-motion.glsl.ts:226`.
- No force integration. Pure shader. No wake cost.
- Bounded so noise can't drift a particle past its picking
  hit-radius. Picking shader uses the same motion chunks → picked
  pixel ≡ display pixel preserved
  (`apps/web/features/field/renderer/field-picking-material.ts:15`).

**Force-driven (wake-on-perturbation):**
- d3-force semantics, GPU-implemented via the `ForceKernel`
  contract from [01-architecture.md](01-architecture.md) §
  Force kernel contract.
- Runs only when an interaction (search, focus, scope, tug, RAG
  arrival) is active. Sleeps only when residual displacement, alpha,
  and active-effect latches all permit it.
- M7 is WebGPU-only. Unsupported browsers/devices do not mount the
  field runtime. There is no CPU `d3-force-3d` simulation runtime at
  resident scale and no WebGL2 force fallback.

## Center split (per Codex round 2 R2-6)

WebGPU storage-buffer state is initialized from `bakedPosition`.
Physics treats baked position as the home anchor. The render path still
has a center split so wake enter/exit can crossfade without a snap.
Historical names like `posTex` describe the old texture-shaped model;
the WebGPU-only runtime stores live positions in buffers.

When physics is wake-active:
```
center[i] = posTex[aIndex]
```
When physics is idle (between waves, sleep state):
```
center[i] = bakedPosition[i]   // the original `position` attribute
```
Final vertex position:
```
final[i] = center[i] + bounded_ambient_displacement(noise(aIndex, uTime))
```
The toggle `wake | idle` is a uniform; transition is a smooth lerp
(~200 ms) so the swap doesn't snap.

This is the load-bearing fix that lets the hybrid model work. The
existing GLSL uses `position` both as base center and noise input;
the port splits it.

## Force equations (per particle `i`)

```
F_i = alpha * filterMask[i] * (
        Σ_{j ∈ kNN_resident(i)}    semantic_spring(i, j, w_ij)
      + Σ_{j ∈ cite_resident(i)}   citation_spring(i, j, w_cite_ij)
      + cluster_pull(i, centroid[cluster_i], k_cluster)
      + center_pull(i, origin, k_center)
      + Σ_{j ∈ hash_neighbors(i)}  short_range_repulsion(i, j, k_rep)
      + spatial_mode_force(i, mode, payload)
      )

if pinMask[i]: vel[i] = 0
else: vel[i] += F_i * (dt / mass[i]); vel[i] *= velocityDecay
pos[i] += vel[i] * dt
```

### Components

- **Sparse semantic kNN (k = 20)** — per-cluster shards loaded
  on-demand; resident shard always loaded. Connectome substrate.
- **Citation edges (sparse)** — `universe_links.parquet`,
  resident-bounded.
- **Cluster pull** — single texel per cluster (centroid +
  member_count). Weak attraction.
- **Center pull** — to origin (0, 0, 0). Weak. Prevents drift.
  d3-force `forceCenter` analog.
- **Short-range repulsion** — spatial-hash (uniform 32³ grid),
  only same-cell + neighbor-cell pairs. O(N) per step. **No global
  Barnes-Hut** (sparse adjacency carries long-range structure;
  short-range repulsion handles overlap only).
- **Filter mask multiplier** — `filterMask[i]` ∈ [0, 1]. Particles
  outside scope get force ~0; gradually drift to (0,0,0) under
  weak center pull; fade visually.
- **Spatial mode force** — switched by `spatialMode` uniform: one
  of `idle`, `focus`, `clusterFocus`, `entityFocus`,
  `evidencePulse`. Computes the active spatial-mode effect's
  per-particle target attraction. See
  [10-force-vocabulary.md](10-force-vocabulary.md).

## Alpha / temperature scalar

`alpha ∈ [0, 1]`. Default rest target `alphaTarget = 0`.

- Search / focus / scope-change / RAG-arrival → `alphaTarget = 0.3`,
  alpha eased back up by `alphaDecay = 0.0228` per tick (d3-force
  default).
- alpha decays toward target: `alpha += (alphaTarget - alpha) * alphaDecay`.
- When `alpha < alphaMin = 0.001` AND residual displacement <
  threshold AND no scheduled/held effect is active → sleep:
  `wake = false`, kernel ticking halts.
- Pause-motion control: `alpha = 0`, sim cannot wake.

## Integrator

Velocity Verlet. d3-force native, mathematically equivalent to
leapfrog (Jacobs 2019); symplectic, stable for `dt ≤ 1/(πf)` where
f is fastest oscillation. Reference: d3-force semantics and the d3
simulation docs. The browser implementation is custom GPU code, not a
main-thread d3-force runtime.

## Mass

Intrinsic mass = log-percentile(`paperReferenceCount`) from the paper
baker. The current visual mapping lives in
`apps/web/features/orb/bake/orb-paper-visual-mapping.ts` and writes
display radius/speed into WebGPU buffers. Future physics mass may derive
from the same source data, but it must live in a separate simulation
lane per the lane rule.

Ambient amplitude is also mass-aware: high-mass papers move less,
low-mass papers can twinkle slightly more, and all ambient motion is
bounded by picking radius. Low-power may set ambient amplitude to zero
while preserving color/halo state.

## Spin (independent of physics)

Spin = scene-root quaternion uniform applied as a single mat4
transform to the resident set. Not a force. States: pause, slow,
normal, fast — each is a fixed angular velocity. Auto-rotation
state machine (canonical M2):

```
running ─drag─▶ suspended-drag ─(release + 1500ms)─▶ running
running ─click-select─▶ paused-selection ─dismiss─▶ running
running ─double-click empty─▶ running
```

dt scalar (simulation integrator multiplier) and spin angular
velocity are separate uniforms with separate UI controls.

## Sleep heuristic

After a force-effect dismiss:
1. Compute residual displacement = Σ |pos[i] - bakedPos[i]| /
   resident_count.
2. While residual > threshold: `alphaTarget = 0` (decays), keep
   ticking.
3. If a held `tug`, staged RAG effect, scope transition, or long-decay
   evidence pulse is active, keep ticking even if residual is low.
4. When residual < threshold AND alpha < alphaMin AND active-effect
   count is zero: `wake = false`, kernel ticking halts. Center swap
   from `posTex[aIndex]` → `bakedPosition[i]` over 200 ms; physics
   goes idle.

Result: the orb returns to baked equilibrium at rest, with ambient
noise alive for free.

During the 200 ms wake/idle transition, ambient amplitude lerps with
the center mix. Noise samples particle id / baked position, not the
live `posTex`, so center swaps do not produce visible pops.

## Owns / doesn't own

Owns: physics tiers, force equations, integrator choice, alpha
semantics, sleep heuristic, center split.

Doesn't own:
- The kernel implementation -> [milestones/M2](milestones/M2-orb-renderer-hybrid-physics.md), [milestones/M7](milestones/M7-webgpu-port.md).
- The force-effect vocabulary → [10-force-vocabulary.md](10-force-vocabulary.md).
- The composition rules → [11-three-layer-composition.md](11-three-layer-composition.md).

## Prerequisites

[01-architecture.md](01-architecture.md) (kernel contract, lane rule).
[02-data-contract.md](02-data-contract.md) (edge / kNN / centroid
sources).

## Consumers

[10 Force vocabulary](10-force-vocabulary.md) implements the
spatial-mode force per effect. [04 Renderer](04-renderer.md) reads
live position buffers and applies the center split. [05 Picking](05-picking.md)
reads the same semantic state through compute picking. M7 implements the
WebGPU-only field runtime.

## Invalidation

- WebGPU becomes unavailable or unstable for the target user base ->
  revisit the product decision; do not quietly add a WebGL fallback.
- Spatial-hash repulsion is insufficient at scale → reintroduce
  Barnes-Hut octree → revise force equations + kernel
  implementation cost.
- d3-force semantics revised (e.g. relativistic gravity for
  drama) → entire equation set revisits.
