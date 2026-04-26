# Decision - Cosmograph license posture

**Date:** 2026-04-24  
**Amended:** 2026-04-25  
**Owner:** SoleMD product + engineering  
**Status:** Amended - keep native Cosmograph under current non-commercial posture

## Problem

`@cosmograph/cosmograph`, `@cosmograph/react`, and `@cosmograph/ui`
are licensed CC-BY-NC-4.0. The previous draft assumed SoleMD.Graph
was a commercial product and therefore treated Cosmograph as a
blocking dependency.

That assumption is not active. SoleMD.Graph is currently a
non-commercial, not-for-profit hobby project. Under that posture,
Cosmograph's free non-commercial license is acceptable.

License sources:
- `package-lock.json:737, 761, 774` - `@cosmograph/*`.
- `package-lock.json:791` - `@cosmos.gl/graph`.
- Cosmograph licensing page: https://cosmograph.app/licensing.

## Constraints

- Current work is non-commercial and hobby/not-for-profit.
- If project posture changes to commercial use, licensing must be
  revisited before public commercial launch.
- The 2D map UX is already implemented through native Cosmograph
  rendering, labels, filters, widgets, and camera behavior.
- Reimplementing Cosmograph widgets locally would add engineering risk
  and can degrade performance unless there is a concrete reason.

## Options considered

1. **Keep native Cosmograph under non-commercial license** *(adopted)*.
   Best current fit: native optimized widgets, least implementation
   churn, no unnecessary local replacement.
2. **Acquire a Cosmograph commercial license if needed.** Best if the
   project becomes commercial and the 2D map remains core.
3. **Port to `@cosmos.gl/graph` directly.** Permissive MIT engine, but
   requires rebuilding wrapper behavior, widgets, labels, camera, and
   crossfilter integration.
4. **Eliminate the 2D map surface.** Only viable if telemetry shows the
   orb fully replaces the 2D analytical surface.

## Decision

**Option 1.** Keep `@cosmograph/*` as the 2D map runtime while the
project remains non-commercial.

The `@cosmos.gl/graph` port is demoted from M8 requirement to
contingency plan. M8 becomes a license/runtime checkpoint, not a
blocking replacement milestone.

Per [13-2d-map-vendor-replacement.md](../13-2d-map-vendor-replacement.md)
and [milestones/M8-cosmograph-vendor-replacement.md](../milestones/M8-cosmograph-vendor-replacement.md).

## Rationale

- Native optimized implementation beats a local rebuild when licensing
  permits it.
- Cosmograph already owns the 2D graph-specific performance problems:
  filtering, timeline, labels, selection, and graph rendering.
- Direct `cosmos.gl` is still valuable as an escape hatch because it
  preserves the same underlying rendering family.
- This keeps engineering attention on the 3D orb, where custom WebGPU
  work is actually needed.

## Invalidation

- Commercial use, paid distribution, or any non-NC posture change ->
  revisit before launch.
- Cosmograph license becomes permissive for commercial use -> remove
  the license checkpoint entirely.
- 2D telemetry drops below retention threshold after M5b -> evaluate
  retiring `/map` instead of licensing or porting.
