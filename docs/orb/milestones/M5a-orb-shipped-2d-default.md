# M5a — Orb ships with temporary 2D default

> **AMENDED 2026-04-25.** `rendererMode` is `'3d' | '2d'`, default
> `'3d'`. `'3d'` mounts `OrbSurface` (the field-particle paper-identity
> workspace) and `'2d'` mounts native Cosmograph via `DashboardShell`
> (the same path `/map` uses). The `<GraphCanvas>` 2D-vs-3D switch
> referenced below was reframed: the 2D branch reuses the existing
> Cosmograph mount, and the 3D branch is `OrbSurface`, not `GraphOrb`.
> The R3F point-cloud prototype was retired.

## Scope

`/graph` ships the renderer-mode toggle. 2D may remain the temporary
default while 3D hardens, but the product target is already 3D-primary.
Telemetry collects readiness metrics for the M5b default flip.

## Acceptance

- `rendererMode: '2d' | '3d'` slice in `useDashboardStore`
  (or new `view-slice.ts`).
- Toggle UI in chrome (segmented button).
- `<GraphCanvas>` switches branches: 3D mounts `<GraphOrb>`; 2D
  keeps current native `<GraphRenderer>` (Cosmograph remains the 2D
  lens runtime while it satisfies the shared workflow).
- Search-first ingress (per canonical product thesis): cold
  `/graph` paints prompt/search + ranked list + panel prominent;
  orb is the spatial substrate, not decorative backdrop.
- Selection / filter / timeline state shared bidirectionally
  across modes.
- Camera persistence: `solemd:camera-2d` and `solemd:camera-3d`
  separate keys.
- Mode toggle is **instant** (no remount) under shared-shell
  (`docs/future/graph-landing-stealth-handoff.md` companion plan
  must be live; if not, accept a brief crossfade).
- Telemetry events instrumented (per
  [18-verification-and-rollout.md](../18-verification-and-rollout.md)
  § Telemetry signals).

## Files

- `apps/web/features/graph/components/canvas/GraphCanvas.tsx`
  (extend with renderer-mode switch).
- `apps/web/features/graph/stores/slices/view-slice.ts` (new) —
  `rendererMode`, `orbCorpus`, `orbDensity`, `orbEdgeTier`,
  `pauseMotion`, `lowPowerProfile`.
- `apps/web/features/graph/components/explore/CanvasControls.tsx`
  (extend with mode toggle).
- `apps/web/features/graph/widgets/search-bar.tsx` (formalized
  from M3a; persistent panel position).

## Verify

- Open `/graph`, temporary default 2D if configured; search produces
  results and the 3D branch receives identical state when toggled.
- Toggle to 3D, all selection / filter / scope / search persists.
- Click on orb particle, panel opens single mode.
- Toggle back to 2D, same paper highlighted.
- Reduced-motion: orb default static, manual orbit drag works,
  panel fully functional.
- Mobile (Galaxy S26 Ultra per memory): panel as bottom sheet;
  toggle works; resident budget reduces to 8K.
- Telemetry events fire for: mode toggle, search-result-click
  rate, force-effect dispatch rate.
- Regression sweep checklist passes
  ([18-verification-and-rollout.md](../18-verification-and-rollout.md)
  § Regression sweep checklist).

## Blocking-on / blocks

- Blocking on: M4 (orb visually complete with edges).
- Blocks: M5b (default flip needs telemetry data from M5a).
