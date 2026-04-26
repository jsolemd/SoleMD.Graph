# M4 — Edges as the primary semantic channel

## Scope

Edges become the load-bearing information channel of the orb.
Tiered rendering. Default-visible cluster chords. Citations +
shared-entity edges from canonical spec.

## Acceptance

Per canonical M4 (preserved):

- Edge sources:
  - Citations from `current_links_web` (view over
    `universe_links.parquet`). Weight from canonical formula.
  - Shared-entity edges from runtime view
    `orb_entity_edges_current` per
    `packages/graph/spec/entity-edge-spec.json`.
  - **Both** default-visible because both influenced baked layout.
- Tiers:
  - **Tier 0** — cluster-aggregate chords, default-visible. ~few
    hundred chords cluster→cluster summed across both sources;
    alpha ~0.08–0.12. Always on at rest.
  - **Tier 1** — 1-hop on hover. Hovered paper's neighbors fade
    in over ~200 ms; alpha ~0.45.
  - **Tier 2** — 1-hop persistent on select; optional 2-hop
    toggle.
  - **Tier 3** — all in-scope edges when scope cardinality < 5K.
  - **Tier 4** — cluster-dive: double-click cluster centroid;
    camera flies in; non-cluster dim; intra-cluster edges full
    alpha.
- All tiers respect resident-LOD cap.
- Legend shows which sources are active.
- Edge differentiation by source: citation = one hue, shared-
  entity = another; line style optional (dashed for entity).

## Files

- `apps/web/features/graph/orb/render/edges.ts` (new) — tiered
  edge rendering.
- `apps/web/features/graph/orb/render/edge-shaders.ts` (new) —
  `LineSegments` material with per-edge alpha + color.
- `apps/web/features/graph/orb/state/edge-state.ts` (new) — which
  tiers active.
- `apps/web/features/graph/duckdb/views/orb-entity-edges.ts`
  (new) — runtime view definition.
- `apps/web/features/graph/orb/render/cluster-chord-builder.ts`
  (new) — Tier 0 aggregation.

## Verify

- Cold orb mount: cluster chords visible at rest, low alpha.
- Hover a paper: neighbors fade in within 200ms.
- Click a paper: 1-hop persists; toggle 2-hop adds more.
- Scope filter to <5K papers: all in-scope edges render; perf
  stable.
- Double-click cluster centroid: cluster-dive activates; intra-
  cluster edges at full alpha.
- Toggle off shared-entity source from legend: only citations
  visible; orb still readable.
- Performance at full Tier 3 + 5K scope: 60 fps desktop; 30 fps
  mobile.

## Blocking-on / blocks

- Blocking on: M2 (renderer mounted), M0 (canonical edges
  shipped).
- Blocks: M5a (orb is feature-complete enough to ship behind toggle).
