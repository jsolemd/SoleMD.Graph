# Decision - 3D-primary native workspace

## Date

2026-04-25

## Amended

2026-04-27 - align with the WebGPU-only field/orb runtime decision.

## Context

The earlier docset framed `/graph` and `/map` as two roughly peer
lenses over the same data. The product direction is now sharper:
the 3D orb should become the main graph workspace, with prompt/search,
ranked results, info panel, wiki content, filters, selection, and RAG
evidence all present there. The 2D map remains available when a flat
analytic lens is useful.

The engineering constraint remains `/clean`: native services first, no
parallel subsystems, no renderer-owned product state.

## Decision

Make the 3D orb the primary product surface for `/graph`.

- 3D owns the first-class workspace composition: prompt/search, ranked
  results, info, pinned wiki, filters, timeline, and RAG evidence.
- 2D remains a toggleable analytic lens over the same DuckDB/Zustand
  state.
- New 3D rendering and physics use a WebGPU-only field runtime.
- Unsupported browsers/devices receive a controlled unsupported state;
  there is no WebGL2 field runtime backend.
- Native Cosmograph remains the 2D lens runtime while it serves the
  product requirement.
- Shared behavior is expressed in DuckDB views, Zustand slices, and
  renderer-agnostic effect schedules before either renderer binds it.

## Rationale

The user's intended experience is not "a dashboard plus an orb." It is
a galaxy workspace that reads the data: focus creates citation rings,
search forms score bands, RAG evidence stages into meaningful shapes,
and wiki/info context stays spatially connected to the graph.

That requires 3D to be the default mental model and implementation
target. Keeping 2D as an optional lens preserves analytical utility
without letting 2D widget constraints dictate the 3D interaction model.

## Consequences

- M5b is a product-target flip, not an optional experiment.
- M8 is a non-critical 2D lens boundary checkpoint, not a launch-track
  renderer rewrite.
- Force effects need scheduled stages and foundational lanes
  (`radialBandTex`, `effectStageTex`, `residentReason`, etc.).
- Resident LOD must include focus neighborhoods before generic
  sampling.
- Verification focuses on 3D workspace readiness plus 2D state parity,
  not 2D/3D feature parity by visual identity.

## Invalidation

Revisit this decision only if:

- Users consistently prefer the 2D lens for core prompt/search →
  evidence → wiki workflows after M5b.
- WebGPU cannot meet the resident/physics budget on target devices; in
  that case, revisit the product decision instead of quietly adding a
  WebGL fallback.
- A new native graph runtime provides the 3D physics, picking,
  filtering, and panel integration with less local code than the
  planned Three/WebGPU path.
