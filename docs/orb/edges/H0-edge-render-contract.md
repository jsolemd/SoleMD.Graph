# H0 Edge Render Contract

Status: locked for H1, H2, and H3 implementation.

## Scope

H0 defines the data and state contract for 3D orb edges. It does not add
geometry, shaders, draw calls, or new DuckDB views.

M4 makes edges the orb's primary information channel: cluster chords at rest,
1-hop edges on hover, persistent 1-hop edges on select, in-scope edge tiers,
and two sources, citation and shared entity. H0 keeps those future renderer
tiers on one shared pipeline instead of letting each slice invent its own edge
path.

## Existing Pipeline

Citation links already flow through the native graph runtime:

- `universe_links_web` is registered from `universe_links.parquet`.
- `base_links_web`, `active_links_web`, and `active_paper_links_web` are
  created in `apps/web/features/graph/duckdb/views/universe.ts`.
- 2D Cosmograph already renders links from the active layer config in
  `apps/web/features/graph/cosmograph/GraphRenderer.tsx`.

The orb extends that path. It does not create a second citation-link loader.

## Decisions

1. Citation edge data comes from the existing `*_links_web` view family. H0
   queries `active_links_web`. H1 may add `orb_entity_edges_current`, but it must
   match the citation column shape so consumers can load sources together.

2. Edges are addressed by paper id, not particle index. The H0 hook returns
   `{ srcPaperId, dstPaperId, weight, kind, sourceBitmap }`. Particle endpoints
   are resolved once during edge-buffer upload with
   `apps/web/features/orb/edges/resolve-paper-to-particle.ts`.

3. Hover and selected-node focus never trigger edge data queries. The active edge
   query is parameterized by `activeLayer`, `currentPointScopeSql`, and the
   resident paper set. Hover and selection tiers are rendering filters over the
   resident buffer.

4. Tier and source state lives in `LinksSlice`, not in renderer components:
   `edgeTierEnabled`, `edgeSourceEnabled`, `edgeTierBudgets`, and
   `edgeTierAlphas`.

5. Selection paths stay separate. H2 hover reads
   `useOrbFocusVisualStore.hoverIndex`; persistent select reads
   `useGraphStore.selectedNode`; H3 scope reads
   `useDashboardStore.currentPointScopeSql`. H0 does not introduce a new
   selection model.

6. Resident LOD is enforced before rendering. `useActiveLinks` drops links whose
   endpoints are not in the resident paper set, so renderers never receive
   out-of-resident edges.

7. Tier 0 cluster chords are aggregated in SQL, not JavaScript. They remain
   blocked until `release_cluster_centroids.parquet` ships. Until then, Tier 0
   implementation must return an empty chord buffer and warn in development
   rather than treating the missing centroids as a runtime error.

8. The future edge material consumes the same `uParticleStateTex` uniform used by
   paper scope, focus, hover, and evidence pulse lanes. Particle positions come
   from the field geometry route, not from the particle-state texture.

9. 2D Cosmograph and the 3D orb share the data layer. Improvements to link view
   registration, source availability, or edge source semantics should benefit
   both renderers.

## H0 Code Surface

- `apps/web/features/graph/duckdb/hooks/use-active-links.ts` is the canonical
  active-link hook for orb edge buffers. It applies resident-paper filtering in
  the same DuckDB query and uses the serialized query helper directly, avoiding
  the SQL explorer row cap.
- `apps/web/features/graph/stores/slices/links-slice.ts` owns edge tier/source
  defaults and future UI control state.
- `apps/web/features/orb/edges/resolve-paper-to-particle.ts` resolves paper ids
  through the existing resident paper mirror at upload time.

## H1+ Queue

- Add `packages/graph/spec/entity-edge-spec.json`.
- Add `apps/web/features/graph/duckdb/views/entity-edges.ts` with
  `orb_entity_edges_current`.
- Add Tier 0 chord SQL in `apps/web/features/graph/duckdb/queries/orb-edges.ts`
  after centroids publish.
- Add `apps/web/features/orb/edges/OrbEdgeLayer.tsx` under `FieldScene` as a
  sibling layer that reuses cached layer uniforms and `uParticleStateTex`.
- Add H2 hover/select tier filters from existing focus stores; no DuckDB query on
  hover.
- Gate H3 in-scope full edge rendering when selected scope size is at or above
  5,000 papers.
- Document publisher weight normalization after the worker rebuild lands.

## Verification

- Hook tests cover missing link view, scope SQL threading, hover-store isolation,
  and resident endpoint filtering.
- Store tests cover default tier/source state and independent citation/entity
  toggles.
- H0 manual runtime checks are limited to confirming the existing 2D link path was
  not replaced. Full edge rendering QA belongs to H1+ after backend, engine, and
  search are up.
