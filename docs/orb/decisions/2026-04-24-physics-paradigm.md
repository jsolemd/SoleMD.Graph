# Decision — Hybrid physics (ambient + wake-driven)

**Date:** 2026-04-24
**Owner:** SoleMD engineering
**Status:** Adopted

## Problem

Two compatible-looking but actually-conflicting framings:

- **Canonical** (`docs/future/graph-orb-3d-renderer.md`): physics
  wakes on perturbation, sleeps at rest with `alphaTarget = 0`,
  ambient life from slow group rotation only. Optimizes for
  semantic-meaningful interaction; everything else is free.
- **Original user vision**
  (`docs/future/orb-3d-cosmograph-port-handoff.md`): "galaxy that
  feels alive, physics means something." Suggests *continuous*
  visual aliveness, not just on-perturbation.

Either paradigm alone misses something:

- Pure wake = stale-feeling at rest unless rotation alone carries
  motion.
- Pure continuous = expensive force ticking at all times.

## Decision

**Adopt a hybrid: two physics tiers.**

- **Ambient tier** — always on, ~free.
  - Slow group-Y rotation (existing).
  - Per-particle stateless noise displacement (existing in
    `apps/web/features/field/renderer/field-vertex-motion.glsl.ts:227`).
  - No force integration; pure shader.
  - Bounded so it can't drift past the picking hit-radius.
- **Force-driven tier** — wake-on-perturbation.
  - d3-force semantics, GPGPU-implemented.
  - Runs only when an interaction is active.
  - Sleeps when residual displacement < threshold AND alpha <
    `alphaMin`.

Per [`03-physics-model.md`](../03-physics-model.md) for the full
model; explicit center-split fix for hybrid composition (Codex
round 2 R2-6).

## Rationale

- **Ambient gives "alive" feel** at all times — the orb breathes,
  micro-jitters like a real telescope-image of stars or neurons.
- **Wake gives "physics means something"** — every interaction
  reshapes the layout via real forces.
- **Cost separation** is clean: ambient is shader-noise, free;
  wake is GPGPU compute, paid only on interaction.
- **Reduced-motion** suppresses both tiers: no rotation, no force
  motion, baked positions only. Manual orbit drag still permitted.

## Center-split discipline

Per Codex round 2 R2-6: today's GLSL uses `position` both as base
center and noise input. Hybrid only works if the swap is explicit:
`center = mix(bakedPosition, posTex[aIndex], uWakeMix)`. Picking
shader uses the same. Display ≡ picking still holds.

## Invalidation

- Force kernel cost rises (e.g. WebGPU enables continuous
  full-corpus simulation for free) → "always-on force ticking"
  becomes viable; ambient may absorb into force.
- Reduced-motion semantics change (e.g. allow gentle motion) →
  ambient continues; force suppression unchanged.
- Telemetry shows users find ambient noise distracting →
  ambient amplitude reduces or becomes opt-in.
