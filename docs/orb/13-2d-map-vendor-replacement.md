# 13 - 2D lens native-service posture

## Why this exists

The 3D orb is the primary graph workspace. The 2D map remains as an
optional analytic lens over the same DuckDB/Zustand state, using
native Cosmograph services where they are already strong: canvas
rendering, filter widgets, timeline, selection, camera, and
crossfilter.

This file exists to keep that native-service boundary clean. It is not
a renderer-rewrite plan unless a measured technical gap proves the
native path cannot serve the shared graph workflow.

## The decision

**Keep native Cosmograph for the optional 2D lens and put all durable
product state in renderer-agnostic stores/views.**

This is the 2026-appropriate choice for the current scope:

- `@cosmograph/react` and `@cosmograph/ui` already provide optimized
  graph rendering, labels, filtering, search, and timeline widgets.
- Rebuilding those widgets in visx would be less native, less tested,
  and likely slower for the interaction patterns Cosmograph already
  owns.
- `@cosmos.gl/graph` remains the permissive low-level engine, but it is
  not a drop-in replacement for the full Cosmograph wrapper.
- Three.js WebGPU/TSL remains the native target for new 3D work; do
  not force 3D concepts through the 2D library boundary.

## Runtime rules

- Keep app-level `@cosmograph/*` imports inside
  `apps/web/features/graph/cosmograph/**` or a documented
  package-level adapter explicitly owned by that boundary.
- Prefer native Cosmograph props, callbacks, widgets, and filtering
  behavior before writing local replacements.
- Keep direct imports from Cosmograph internals behind adapter modules
  in `features/graph/cosmograph/**`; do not let private APIs leak into
  panels, stores, or shared graph libraries.
- Keep DuckDB scope, selection, and filter clause generation
  renderer-agnostic. Cosmograph is the 2D renderer, not the source of
  product state.
- Promote Mosaic dependencies to direct dependencies only when code
  outside Cosmograph actually imports them.

## Native-service options

Use the highest native surface that satisfies the product requirement:

1. `@cosmograph/react` / `@cosmograph/ui` for the optional 2D lens.
2. `@cosmos.gl/graph` only when the lower-level engine directly solves
   a measured renderer/camera/selection gap.
3. DuckDB-WASM SQL/views for selection, filters, scope, and widget
   source data.
4. Three.js WebGPU/TSL for 3D rendering, picking, and physics.

The goal is "native services, no parallel subsystems." If 3D needs a
2D-equivalent capability, first express the shared behavior in
DuckDB/Zustand, then bind each renderer natively.

## Port scope if option 2 is ever chosen

`@cosmos.gl/graph` provides graph rendering and selection at the array
level. It does not provide the higher-level integration that the
Cosmograph wrapper adds:

| Feature | Today (`@cosmograph/*`) | Direct `cosmos.gl` port |
|---|---|---|
| 2D point/link rendering | `<Cosmograph>` | direct `cosmos.gl/graph` Graph instance |
| DuckDB binding | Cosmograph wrapper | React hook that writes arrays via `setPointPositions` / `setLinks` |
| Labels | Cosmograph label props/widgets | DOM or R3F Html label layer |
| Camera persistence | current Cosmograph adapter | existing `solemd:camera-2d` helper |
| Point/link styling | Cosmograph props | direct array writes |
| Click / hover callbacks | Cosmograph props | `cosmos.gl` events + adapter |
| Crossfilter | Cosmograph / Mosaic path | direct Mosaic client + current SQL clauses |
| Timeline / bars / histogram | `@cosmograph/ui` | native replacement only after perf proof |
| Rect / polygon selection | Cosmograph methods | `cosmos.gl` selection methods + shared table writes |

This is a real rewrite measured in weeks. It is not part of the orb
critical path while the 2D lens can remain native.

## 2026 implementation standard

- Native optimized library first: Cosmograph for 2D graph UX, three.js
  WebGPU/TSL for new 3D orb work.
- No visx rebuild of Cosmograph widgets unless native behavior cannot
  support the product requirement after measurement.
- No parallel 2D state model. All durable state remains in DuckDB views
  and Zustand slices described in [01-architecture.md](01-architecture.md).
- No new code should depend on Cosmograph private internals outside the
  adapter boundary.

## Owns / doesn't own

Owns: the 2D lens runtime posture, native-service boundary, and the
contingency plan if a measured technical gap requires a port.

Doesn't own:
- Cosmograph adapter implementation details ->
  `apps/web/features/graph/cosmograph/**`.
- DuckDB scope and filter clauses ->
  `apps/web/features/graph/lib/cosmograph-selection.ts` today, renamed
  to `graph-selection.ts` only when the shared selection library is
  actively touched.
- Orb rendering stack -> [17-rendering-stack-evolution.md](17-rendering-stack-evolution.md).

## Prerequisites

[01-architecture.md](01-architecture.md), [08-filter-and-timeline.md](08-filter-and-timeline.md).

## Consumers

[milestones/M8-cosmograph-vendor-replacement.md](milestones/M8-cosmograph-vendor-replacement.md)
records the non-critical 2D lens checkpoint and adapter-hardening track.

## Invalidation

- Native Cosmograph widgets or renderer cannot satisfy a measured
  product requirement -> evaluate `@cosmos.gl/graph` or a minimal
  local widget only for that gap.
- Telemetry post-M5b shows 2D lens has negligible usage ->
  evaluate retiring `/map` instead of porting it.
