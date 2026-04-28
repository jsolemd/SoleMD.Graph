# H1 Edge Data Prerequisites

Status: data-only scaffold complete; no renderer, shader, geometry, or draw call.

## Scope

H1 extends the H0 contract with the missing source and Tier-0 query surfaces:

- `packages/graph/spec/entity-edge-spec.json` is the publisher/runtime source
  contract for shared-entity edge weights.
- `orb_entity_edges_current` is registered as an empty-safe DuckDB view so
  downstream edge SQL can always reference the entity source.
- `buildOrbClusterChordSql` aggregates cluster chords in SQL and joins baked
  `release_cluster_centroids` when that M0 artifact is present.

## Runtime Contract

Shared-entity edges are optional evidence artifacts. Pre-orb bundles still boot:
the browser registers `orb_entity_edges_current` as an empty view with the same
link shape used by citation edges plus `source_bitmap = 2`.

When `orb_entity_edges.parquet` is present, the view projects:

- `source_node_id`
- `source_point_index`
- `target_node_id`
- `target_point_index`
- `link_kind = 'entity'`
- `weight`
- `source_bitmap = 2`

Point indices are resolved through `active_point_index_lookup_web`, so overlay
activation and active-scope point indexing stay aligned with the existing
Cosmograph link pipeline.

## Tier-0 Contract

Cluster chords are SQL aggregates, not JavaScript rollups:

- citation source: `active_links_web`, `source_bitmap = 1`
- entity source: `orb_entity_edges_current`, `source_bitmap = 2`
- grouping: `LEAST(src.clusterId, dst.clusterId)` and
  `GREATEST(src.clusterId, dst.clusterId)`
- endpoint positions: `release_cluster_centroids`

If `release_cluster_centroids` is absent, `queryOrbClusterChords` returns `[]`
and emits a development warning. That keeps pre-M0 bundles usable while making
the missing publisher artifact explicit.

## Still Not In H1

- No `OrbEdgeLayer`.
- No shader or edge material.
- No line geometry upload.
- No hover/select fade logic.
- No publisher implementation for `orb_entity_edges.parquet`.
