# Decision — Scope collapse (override canonical correction 15)

**Date:** 2026-04-24
**Owner:** SoleMD product
**Status:** Adopted

## Problem

The prior canonical plan
(`docs/future/graph-orb-3d-renderer.md`, correction 15) split:

> The orb and the map are different scopes, not different faces
> of the same data. The orb is the 3D physics of evidence; the
> map is the 2D semantic geometry of the full corpus.

This was a correction made after a second-agent review. It made
sense at the time given the canonical's scale assumption (orb
capped at 5–10K evidence subset, main-thread `d3-force-3d`).

The user, in this 2026-04-24 session, clarified:

> All of the same functionality between 3D and 2D. It's just
> that there are two different methods of looking at the data.

This contradicts the canonical's split.

## Decision

**Override canonical correction 15.** Adopt "same data, two
methods of looking at the same data."

- Both surfaces render the same active scope.
- Selection / filter / timeline / search are bidirectional
  across modes.
- Toggle is a surface switch, not a renderer/scope swap.
- `/map` survives (per [`13-2d-map-vendor-replacement.md`](../13-2d-map-vendor-replacement.md))
  but as a **lens**, not a separate data product.

## Rationale

The user is the product owner; their explicit framing wins. The
canonical's split was load-bearing under its scale assumption,
but the user has always wanted feature parity. Collapsing the
split aligns architecture with intent.

## Cascading implications

- **Resident LOD** is the new mechanism for handling scale (per
  [`01-architecture.md`](../01-architecture.md) § Resident LOD,
  [`decisions/2026-04-24-physics-paradigm.md`](2026-04-24-physics-paradigm.md)).
- **Force kernel** must scale to ≥ 16K particles; main-thread
  `d3-force-3d` insufficient at full-corpus scope; GPGPU
  required (per [`decisions/2026-04-24-webgpu-target.md`](2026-04-24-webgpu-target.md)).
- **Anti-hairball guard** still load-bearing — the
  search-first ingress, ranked-list-as-authoritative, tiered-
  edges constraints from canonical's product thesis are
  preserved verbatim.

## Invalidation

- If Resident LOD proves insufficient (e.g. user demands live
  full-corpus simulation that exceeds WebGPU's ceiling) → split
  becomes pragmatic again.
- If telemetry shows `/map` fundamentally serves a different
  user need (different sessions, different cohorts) → revisit
  whether two scopes is actually clearer UX than one with two
  lenses.
