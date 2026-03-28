# SoleMD.Graph — Graph Bundle Contract

How graph data is partitioned between hot, warm, and cold delivery paths.

---

## Purpose

The graph must preserve rich biomedical metadata without making first paint
impractical.

The bundle contract therefore follows three rules:

1. Keep the always-loaded point layer lean enough for large-map rendering.
2. Keep rich paper and cluster detail locally queryable in the bundle.
3. Keep the heaviest or most verbose payloads behind fetch paths.

And one loading rule:

4. The browser should render the graph as soon as DuckDB can expose the bundle
   tables; rich metadata hydration must not block first paint.

This is a data-delivery contract, not a data-loss policy. Metadata should be
preserved thoughtfully, not discarded.

---

## Delivery Tiers

| Tier | Where it lives | When it loads | What it is for |
|------|----------------|---------------|----------------|
| `Hot` | Mandatory Parquet bundle | First paint / first filter pass | Render, color, size, fast faceting, lightweight search |
| `Warm` | Optional local Parquet artifacts | Attached after interaction, still local in DuckDB-WASM | Detail panels, cluster drilldown, aggregated local summaries |
| `Cold` | Fetch path / detail service | On demand only | Raw citation neighborhoods, full text, mirrored assets, full annotation payloads, heavy citation context |

### Design rule

- `Hot` must stay compact and typed.
- `Warm` can be rich, but should still be structured for local querying.
- `Warm` should be physically separable from `Hot`:
  - a warm artifact should not be part of the mandatory first download if the
    graph can render without it
  - warm files should be fetched and attached only when a panel or workflow
    actually needs them
- `Cold` is where large blobs and verbose evidence payloads belong.
- first paint should be `DuckDB-first`, not `React-array-first`
- staged hydration is expected:
  - `canvas-ready`
  - then `metadata-ready`
- warm hydration should be lazy:
  - do not hydrate all warm metadata automatically on first paint
  - request it when a panel or workflow actually needs it
- tables and other large browser-local read models should prefer DuckDB paging
  over eagerly building million-row React arrays

---

## Hot Contract

Hot data lives in:

- `corpus_points.parquet`

Hot exists to support:

- initial canvas render
- cluster coloring
- point sizing
- default filters
- fast typeahead / local concept search
- cheap hover and selection handoff

Hot should be sufficient for:

- Cosmograph render from DuckDB table names
- point click / label click lookup
- immediate filter primitives
- canvas density heuristics
- dynamic reveal / fade of already-mapped points

### Dynamic visibility belongs in hot

Dynamic graph behavior such as:

- revealing additional papers after search
- fading in older or lower-priority papers after a filter change
- promoting related papers into the current view
- keeping a curated default-visible subset while preserving a larger living map

should operate over the local hot point table, not warm or cold delivery paths.

Reason:

- Cosmograph's filtering and crossfilter model expects the points being filtered
  to already be local and queryable
- if a point must appear immediately in response to a filter, timeline, or
  search interaction, that point and the fields controlling its visibility must
  already exist in local DuckDB state
- warm artifacts are appropriate for richer local detail after interaction
- cold APIs are appropriate for heavy evidence payloads, not core map visibility

This means:

- dynamic visibility should be implemented by filtering, greyout, and selection
  over the hot points table
- the controlling columns for that behavior should remain hot:
  - `is_default_visible`
  - `year`
  - cluster fields
  - compact concept summaries and search text
  - later, additional visibility/ranking fields such as `visibility_tier`,
    `importance_score`, or bridge/novelty scores

Current constraint:

- the browser can only dynamically reveal points that already have coordinates
- today that means the mapped embedding-bearing graph cohort, not the full
  `14M+` corpus
- if the product later wants true dynamic reveal across a broader corpus, those
  additional papers must first receive map coordinates or an alternate placement
  strategy

Current implementation note:

- the bundle now derives `is_default_visible` from the exported run itself
- the publish path also syncs `is_default_visible` upstream for global readiness metadata
- today, that policy marks the published renderable cohort itself as the
  default-visible baseline
- a narrower baseline versus a broader mapped reservoir remains a later
  data-policy step once the mapped universe expands beyond the current published
  render cohort
- the browser's `current` scope is now driven by native visibility clauses
  (`filter:*`, `timeline:*`, `budget:*`) mirrored as SQL, not by eagerly
  materializing large JS point arrays
- query panels prefer that SQL-backed current scope, while explicit
  `selected` state remains separate persistent user intent
- the current visibility-budget lane is DuckDB-local and seed-based:
  - resolve a seed point from search
  - scope it to live filter / timeline state
  - emphasize a local spatial neighborhood, with optional whole-cluster
    inclusion only when the scoped cluster remains small enough

### Required hot fields

- identity:
  - `point_index`
  - `id`
  - `paper_id`
- layout:
  - `x`
  - `y`
- cluster:
  - `cluster_id`
  - `cluster_label`
  - `cluster_probability`
  - `paper_cluster_index`
- compact bibliographic metadata:
  - `title`
  - `journal`
  - `year`
  - `doi`
  - `pmid`
  - `pmcid`
- compact render/filter metadata:
  - `text_availability`
  - `is_open_access`
  - `has_open_access_pdf`
  - `paper_author_count`
  - `paper_reference_count`
  - `paper_asset_count`
  - `paper_entity_count`
  - `paper_relation_count`
  - `is_default_visible`
- compact PubTator-derived summaries:
  - `semantic_groups_csv`
  - `top_entities_csv`
  - `relation_categories_csv`
- lightweight local search:
  - `display_label`
  - `search_text`

### What does not belong in hot

- full abstract-sized text blobs
- full author JSON
- generic payload blobs like `payload_json`
- full PubTator annotation lists
- full PubTator relation lists
- full citation contexts
- full text / chunk bodies
- PDF URLs plus all asset metadata if it can live in warm documents instead

---

## Warm Contract

Warm data stays browser-local and queryable via DuckDB-WASM, but it does not
need to block first paint.

Warm may hydrate after the canvas is already interactive.

Important distinction:

- `Warm` does **not** mean "already downloaded but not queried yet"
- `Warm` means "separate local artifact that can be fetched and attached later"
- if a warm artifact is bundled into the mandatory first-load payload, it is no
  longer behaving like warm from a delivery/performance perspective

Current implementation note:

- the **default published** bundle is currently stricter than the full warm model
- by default, published runs now ship **hot only**
- warm tables remain part of the contract, but should be reintroduced only after
  the warm/cold API boundary is designed cleanly and the browser load path is
  proven stable
- when warm returns, it should return as optional artifacts with their own URLs
  and manifest entries, not as tables implicitly downloaded with the hot payload
- this means the current default publish path is:
  - `corpus_points.parquet`
  - `corpus_clusters.parquet`
- warm tables remain valid future artifacts, but they are not part of the
  default browser payload right now

Warm data lives in:

- `corpus_documents.parquet`
- `corpus_clusters.parquet`
- `corpus_cluster_exemplars.parquet`
- optional compact aggregated link artifacts if they prove small enough to keep
  browser-local

### `corpus_documents.parquet`

Purpose:

- paper detail panels
- richer text preview
- richer author and asset metadata
- later local drilldowns that do not require a server fetch once the warm
  artifact has been attached

Expected content:

- `abstract`
- `display_preview`
- `authors_json`
- OA / PDF metadata
- richer paper counts
- journal / identifiers / provenance-ready metadata

### `corpus_clusters.parquet`

Purpose:

- cluster summaries
- legend
- cluster filtering
- cluster analytics

Expected content:

- cluster labels
- centroid coordinates
- member counts
- confidence/outlier summaries
- representative node metadata

### `corpus_cluster_exemplars.parquet`

Purpose:

- representative papers for clusters
- cluster previews
- label validation

Expected content:

- top exemplars per cluster
- exemplar score
- representative paper metadata
- short preview text

### Aggregated warm link artifacts

Purpose:

- cluster-level relationship summaries
- cheap bundle-local topology hints
- lightweight local drilldown without shipping the full paper-paper graph

Expected content:

- cluster-to-cluster counts
- aggregated bridge metrics
- other compact summary artifacts that stay small enough for the browser

### Why raw citations are not warm

The full paper-paper citation graph should not ship in the default browser bundle:

- the point cloud is the primary visual substrate
- link tables are large
- most interaction only needs a local point cloud plus cluster/document context
- raw citation neighborhoods are better fetched on demand for the selected paper

So the default contract should be:

- aggregated link summaries may stay warm
- raw citation neighborhoods move cold behind a fetch path

Recommended trigger model:

- load `Hot` at page open
- attach `Warm` only on first demand:
  - first detail-panel open
  - first cluster drilldown
  - first workflow that needs local document/cluster context
- use `Cold` only for payloads that are too large, too sparse, or too verbose to
  justify browser-local delivery

Current implementation note:

- `corpus_links.parquet` is no longer part of the default publish path
- raw paper-paper citation neighborhoods are now treated as cold-design work,
  not default bundle content
- the next implementation step is an API contract for on-demand citation
  neighborhoods and, later, compact aggregated link artifacts if they prove
  useful enough to keep warm

---

## Cold Contract

Cold data should be preserved, but fetched only when explicitly needed.

Cold data includes:

- raw paper-paper citation neighborhoods
- full text from `s2orc_v2`
- chunk-level bodies and future chunk embeddings
- PDF mirrors / signed asset paths
- full PubTator annotation lists
- full PubTator relation lists
- large citation-context payloads if they become too heavy for warm delivery
- future RAG evidence payloads that do not belong in first-load graph data

Cold is expected to be served through detail/data services rather than the
always-present bundle.

---

## Metadata Preservation Policy

The project should prefer preserving metadata over dropping it, but the place
where metadata lives matters.

### Preserve in hot if it enables:

- first-paint rendering
- cheap filtering
- cluster comparison
- compact concept search
- low-latency point selection context

### Preserve in warm if it enables:

- paper detail panels
- cluster drilldown
- local aggregated topology summaries
- rich bundle-local querying without another network hop

### Preserve in cold if it is:

- blob-like
- verbose
- rarely needed
- large enough to distort bundle size or first-paint performance

---

## Current Policy Decisions

- Keep Apache Parquet as the standard on-disk bundle format.
- Keep raw citation neighborhoods cold in the default contract.
- Keep only compact aggregated link summaries warm when they earn their weight.
- Keep compact PubTator summaries hot.
- Keep full PubTator detail cold.
- Keep full text cold for now, pending the later RAG/full-text pipeline.
- Prefer typed, explicit columns over generic JSON blobs in hot paths.

---

## Change Rules

Before adding a new field to `corpus_points.parquet`, answer:

1. Does it directly improve render, default filter, or fast local search?
2. Is it compact enough to scale to millions of rows?
3. Does it avoid duplicating a richer warm representation?

If any answer is `no`, the field likely belongs in warm or cold instead.

Before moving a field out of the bundle entirely, answer:

1. Is it still required for rich exploration?
2. Can it remain locally queryable in warm form?
3. Are we preserving it somewhere durable and fetchable?

If not, the move is probably losing useful graph capability.

---

## Related Docs

- [map.md](map.md)
- [data.md](data.md)
- [architecture.md](architecture.md)
- [database.md](database.md)
