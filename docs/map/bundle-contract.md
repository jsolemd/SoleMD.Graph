# SoleMD.Graph - Graph Bundle Contract

The bundle contract defines how the live graph is delivered to the browser.
It is based on four runtime layers:

- `base`
- `universe`
- `active`
- `evidence`

The contract is canonical and non-compatibility-based. Base admission is encoded
in the exported data itself through `is_in_base` and `base_rank`.

---

## Purpose

The graph needs to stay fast at first paint while still preserving the full
mapped corpus and rich evidence.

The bundle contract therefore follows three rules:

1. Keep the always-loaded base point layer compact enough for large-map rendering.
2. Keep only canvas/search/filter/table-critical metadata in the point parquet.
3. Keep rich paper, cluster, and universe detail behind lazy DuckDB views or API fetches.
4. Keep heavy citation, full-text, and annotation payloads behind evidence fetch paths.

Loading should be DuckDB-first, not JS-array-first.

---

## Delivery Layers

| Layer | Where it lives | When it loads | Purpose |
|------|----------------|---------------|---------|
| `Base` | Mandatory Parquet bundle | First paint | Render, color, size, fast faceting, local search, paged table rows |
| `Universe` | Optional local Parquet artifacts | Attached after interaction | Overlay activation and local promotion from the mapped remainder |
| `Active` | DuckDB-local views + overlay membership table | Immediately after base load | Base + promoted overlay in one dense canvas table |
| `Evidence` | Fetch path / detail service | On demand | Paper detail, raw citation neighborhoods, full text, mirrored assets, full annotation payloads |

### Design rule

- `Base` must stay typed and compact.
- `Base` and `Universe` should stay Parquet-backed in the browser; do not eagerly copy the
  full base scaffold into DuckDB temp point tables.
- `Universe` can be richer, but it must remain queryable locally.
- `Active` is a local runtime state, not a shipped artifact.
- `Evidence` is for large or verbose payloads that do not belong in first load.

---

## Base Contract

Base data lives in:

- `base_points.parquet`
- `base_clusters.parquet`

Base exists to support:

- initial canvas render
- cluster coloring
- point sizing
- default filters
- local concept search
- fast hover and click handoff

### Required base fields

The base point schema should include the smallest useful set of typed columns:

| Category | Fields |
|----------|--------|
| identity | `point_index`, `id`, `paper_id` |
| layout | `x`, `y` |
| cluster | `cluster_id`, `cluster_label`, `cluster_probability` |
| bibliographic | `title`, `citekey`, `journal`, `year`, `display_label` |
| quality | `paper_author_count`, `paper_reference_count`, `paper_entity_count`, `paper_relation_count` |
| base admission | `is_in_base`, `base_rank` |
| compact rendering | `hex_color`, `hex_color_light`, `text_availability` |
| compact evidence summaries | `semantic_groups_csv`, `organ_systems_csv`, `relation_categories_csv` |

### What belongs in base

Base should contain high-quality papers that satisfy one of these conditions:

- rule-backed papers with curated entity or relation support
- flagship journals that reliably preserve foundational neuro / psych / neuroscience coverage
- narrow vocab-anchored overlap that is needed for domain breadth

The intent is a domain-rich opening scaffold around the target first-paint size,
not a recall-maximizing first-paint bucket.

### What does not belong in base

- DOI / PMID / PMCID identifiers
- open-access booleans and asset counters
- `search_text`, `top_entities_csv`, or other stitched convenience text
- full abstract-sized text blobs
- full author JSON
- full PubTator annotations
- full relation lists
- full citation neighborhoods
- any browser-local JS hydration of the entire point set

---

## Universe Contract

Universe data stays browser-local and queryable via DuckDB-WASM, but it does not
need to block first paint.

Universe lives in:

- `universe_points.parquet`
- `paper_documents.parquet`
- `cluster_exemplars.parquet`

Universe points are:

- mapped to the same UMAP manifold as the base scaffold
- excluded from first paint until promoted
- available for later overlay activation

`paper_documents.parquet` and `cluster_exemplars.parquet` carry the richer
paper/cluster detail that does not belong in the point parquet.
`cluster_exemplars.parquet` is a paper-level preview table for cluster context,
not a chunk graph layer. If a future detail surface grows beyond those local
tables, it belongs in `evidence`, not back in `base_points`.

The universe point schema should stay aligned with the base point schema so the
runtime can combine them without remapping coordinates or rebuilding ids.

---

## Active Contract

Active canvas state is DuckDB-local and derived from the loaded bundle.

The canonical runtime views are:

- `selected_point_indices`
- `overlay_point_ids_by_producer`
- `overlay_point_ids`
- `overlay_points_web`
- `active_point_index_lookup_web`
- `current_points_canvas_web`
- `current_points_web`
- `current_paper_points_web`
- `current_links_web`
- `active_points_web`
- `base_links_web`
- `active_links_web`
- `active_paper_links_web`

Rules:

- `selected_point_indices` is materialized from live Cosmograph selection clauses inside DuckDB
- `overlay_point_ids_by_producer` and `overlay_point_ids` are the mutable local membership surfaces
- `overlay_points_canvas_web` / `current_points_canvas_web` are the narrow render-facing point views used by Cosmograph
- `overlay_points_web` / `current_points_web` are the richer query-facing point views used for search, table, and widget aggregation
- `overlay_points_web` resolves promoted universe rows for query usage without copying them into a second local point table
- `active_point_index_lookup_web` remaps ids to dense active indices
- `current_points_canvas_web` / `current_points_web` / `current_paper_points_web`
  are the canonical browser-facing active aliases
- the frontend render path binds directly to `current_points_canvas_web` /
  `current_links_web`; any swap views behind those aliases are not public contract
- `active_points_web` is the dense browser-facing union of base + overlay
- `active_links_web` and `active_paper_links_web` remap to active ids so links follow the canvas
- when overlay is empty, the active canvas should alias base directly rather than materializing a synthetic active copy
- `pointIncludeColumns` should stay empty on the live graph page; richer detail
  stays on DuckDB query paths or the backend evidence API rather than mirrored
  JS point objects
- `current_points_canvas_web` and related `*_canvas_web` views are render-only
  inputs; rich query/detail paths should not be rebuilt on top of them
- native filter/timeline UI may be mounted from `@cosmograph/ui`, but only
  through adapters that bind filtering clients to `current_points_web`; do not
  switch back to the accessor-driven Cosmograph components that depend on point
  metadata columns
- info-panel widget queries should batch by scope change, not fan out one DuckDB roundtrip per widget

This keeps the active canvas stable while still allowing the user to promote
relevant papers in place.

It also keeps the optimization target explicit: stronger foundations first,
feature expansion second.

---

## Evidence Contract

Evidence data should be preserved, but fetched only when explicitly needed.

Evidence is also release-scoped. The frontend should not invent release
metadata or bypass the backend when a user is working inside a specific
published graph release.

Evidence includes:

- raw paper-paper citation neighborhoods
- full text from `s2orc_v2`
- chunk-level bodies and future chunk embeddings
- PDF mirrors or signed asset paths
- full PubTator annotation lists
- full PubTator relation lists
- large citation-context payloads

Evidence is served through detail/data services rather than the always-present
graph bundle.

Chunk-capable evidence may exist behind that API in the future, but chunk
assumptions must not leak back into the corpus graph runtime or the live bundle
contract.

---

## Metadata Preservation Policy

The project should preserve metadata whenever possible, but the storage layer
should match the access pattern.

### Preserve in base if it enables

- first-paint rendering
- cheap filtering
- cluster comparison
- compact concept search
- low-latency point selection

### Preserve in universe if it enables

- paper detail panels
- cluster drilldown
- local aggregated topology summaries
- rich bundle-local querying without another network hop

### Preserve in evidence if it is

- blob-like
- verbose
- rarely needed
- large enough to distort bundle size or first-paint performance

---

## Current Contract Rules

- Keep Apache Parquet as the standard on-disk bundle format.
- Keep raw citation neighborhoods out of the mandatory first-load bundle.
- Keep compact PubTator summaries in base.
- Keep full PubTator detail in evidence.
- Keep full text in evidence until a dedicated text bundle is justified.
- Prefer typed, explicit columns over generic JSON blobs in base and universe paths.

---

## Change Rules

Before adding a new field to `base_points.parquet`, answer:

1. Does it directly improve render, default filter, or fast local search?
2. Is it compact enough to scale to millions of rows?
3. Does it avoid duplicating a richer universe representation?

If any answer is `no`, the field likely belongs in universe or evidence.

Before moving a field out of the bundle entirely, answer:

1. Is it still required for rich exploration?
2. Can it remain locally queryable in universe form?
3. Are we preserving it somewhere durable and fetchable?

If not, the move is probably losing useful graph capability.

---

## Related Docs

- [map.md](map.md)
- [data.md](data.md)
- [architecture.md](architecture.md)
- [database.md](database.md)
