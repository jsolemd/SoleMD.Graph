# M8 - 2D lens native boundary checkpoint

## Scope

M8 is not a renderer-rewrite track. The 3D orb is the primary graph
workspace; native Cosmograph remains the optional 2D analytic lens.

M8 exists to harden the native boundary, verify no 2D-only state has
crept in, and decide whether the optional 2D lens should remain,
shrink, or be retired based on measured use.

Per [13-2d-map-vendor-replacement.md](../13-2d-map-vendor-replacement.md)
and
[decisions/2026-04-25-3d-primary-native-workspace.md](../decisions/2026-04-25-3d-primary-native-workspace.md).

## Sequencing

Parallel to M0-M7. Not blocking orb work and not blocking the M5b
default flip.

## Acceptance

### M8.0 - 2D lens usage checkpoint

- Review 3D vs 2D lens telemetry after M5b.
- If 2D lens remains useful: keep native Cosmograph and harden the
  adapter.
- If 2D lens usage is negligible: evaluate retiring `/map` before
  porting or rebuilding anything.
- If a measured 2D gap exists: choose the smallest native-service fix
  (`@cosmograph/*`, `@cosmos.gl/graph`, or DuckDB/Mosaic adapter).

### M8.1 - Native Cosmograph hardening

- Keep all `@cosmograph/*` imports inside
  `apps/web/features/graph/cosmograph/**`.
- Keep Cosmograph private/internal API access isolated to adapter
  files in that directory.
- Preserve native Cosmograph widgets where they provide optimized
  behavior; do not replace with visx without a measured gap.
- Keep DuckDB selection/filter clauses renderer-agnostic.

### M8.2 - Contingency plan only if native path fails

If native Cosmograph cannot satisfy a measured 2D lens requirement:

- Promote Mosaic dependencies to direct dependencies.
- Port the 2D renderer to a thin React adapter over `@cosmos.gl/graph`.
- Rebuild only the widget behavior required by product telemetry.
- Remove `@cosmograph/*` deps after regression parity is proven.

## Files

Current native path:

- `apps/web/features/graph/cosmograph/**` - remains the native 2D map
  runtime boundary.
- `apps/web/features/graph/lib/cosmograph-selection.ts` - remains until
  actively renamed by shared selection work.

Measured-gap port files:

- `apps/web/features/graph/components/canvas/MapRenderer.tsx` (new if
  direct `cosmos.gl` port is chosen).
- `apps/web/features/graph/widgets/*` (new only for measured widget
  gaps).
- `apps/web/features/graph/lib/init-mosaic-client.ts` (new only if
  Mosaic is needed outside Cosmograph).

## Verify

Current path:

- All 2D map interactions remain native Cosmograph-backed.
- No new `@cosmograph/*` imports outside the adapter directory.
- No local visx widget replacement exists without a documented
  performance/product reason.

Contingency port path:

- Filter, timeline, selection, labels, hover, click, and camera
  persistence match the native Cosmograph behavior.
- Bundle size and interaction latency are measured before/after.
- The 3D workspace remains the default product surface.

## Blocking-on / blocks

- Blocking on: nothing in the orb track.
- Blocks: nothing in the orb track.
