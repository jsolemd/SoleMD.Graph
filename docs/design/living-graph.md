# The Living Graph - Base, Universe, Active Canvas

> The graph is not trying to show everything at first paint. It is trying to
> open with a domain-rich base scaffold, then let the rest of the mapped
> universe flow in on demand.

The intended operating model is simple:

- `base_points` is the curated opening canvas
- `universe_points` is the mapped remainder
- `overlay_points` is the currently promoted subset from the universe
- `active_points` is the live canvas table
- `evidence_api` serves the heavy retrieval path

The current graph runtime is intentionally **corpus-only**. There is one
canonical graph layer in the browser today: the corpus paper map. Future
layers may exist, but they must arrive as optional modules rather than as
cross-cutting branches through the base graph runtime.

This narrowing is not just cleanup. It is the reason speed, responsiveness,
and overall runtime predictability are improving. We are intentionally
stabilizing this foundation before expanding the feature surface above it.

The target base size should be large enough to preserve organ-system overlap,
but still small enough to remain stable and fast in the browser. The exact
count is a policy decision, not a runtime invariant.

---

## Three Nested Layers

```
┌───────────────────────────────────────────────────────────────────────┐
│  DOMAIN CORPUS                                                        │
│  Full mapped paper universe: paper metadata, PubTator evidence,       │
│  and retrieval substrate.                                             │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  BASE POINTS                                                 │   │
│  │  Curated first-paint scaffold.                               │   │
│  │  High-quality papers admitted through rule evidence,         │   │
│  │  flagship journals, or narrow vocab anchors.                 │   │
│  │                                                               │   │
│  │  ┌───────────────────────────────────────────────────────┐   │   │
│  │  │  ACTIVE CANVAS                                        │   │   │
│  │  │  Base + promoted overlay in one dense table.         │   │   │
│  │  │  DuckDB-local views keep ids stable and links dense.  │   │   │
│  │  └───────────────────────────────────────────────────────┘   │   │
│  │                                                               │   │
│  │  + OVERLAY POINTS                                             │   │
│  │    Mapped papers promoted from the universe for the current   │   │
│  │    user focus.                                                │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  + EVIDENCE API                                                       │
│    Backend retrieval for raw citation neighborhoods and verbose payloads │
└───────────────────────────────────────────────────────────────────────┘
```

---

## What Base Is For

Base points are the papers that should be available immediately when the graph
opens. They are not a synonym for "everything we know".

Base admission should favor:

- rule-backed papers with curated entity or relation support
- flagship journals that reliably carry core neuro / psych work
- narrow vocab-anchored overlap that preserves breadth across medicine
- strong bench, translational, and clinical representation across the domain

That means the opening scaffold should cover:

- neurology
- psychiatry
- neuropsychiatry
- neuroscience
- psychology
- neuropsychology
- high-quality overlap across the rest of medicine

The point is not to maximize recall inside base. The point is to make sure the
base is representative, high-quality, and broad enough that a user can start
working without immediately promoting half the universe.

---

## How the Graph Responds

| User action | Graph response |
|-------------|----------------|
| Filter by year / journal / cluster | Cosmograph updates against local DuckDB views |
| Search for a paper or concept | DuckDB resolves the seed and promotes a local neighborhood when appropriate |
| Click a point | Persistent selection stays separate from active visibility |
| Open a detail panel | Universe-local document/exemplar tables attach if needed |
| Ask for evidence | `evidence_api` handles heavy retrieval and full citation context |

The browser should keep the camera fixed while the active set changes. Users
should feel like they are expanding a stable map, not jumping between maps.

---

## Two Embedding Spaces

| Embedding | Model | Purpose | Scope |
|-----------|-------|---------|-------|
| SPECTER2 | Pre-computed by Semantic Scholar | Layout, cluster structure, paper-paper proximity | Mapped universe and base |
| MedCPT | Self-embedded | Search, RAG, autocomplete, retrieval | Full corpus and evidence |

Why two?

- SPECTER2 is good for map geometry and citation-aware clustering
- MedCPT is good for query-document retrieval
- mixing those responsibilities would weaken both

---

## Canonical Runtime Pattern

The browser runtime now follows this sequence:

1. Boot `base_points` locally.
2. Project `base_points` into narrow DuckDB canvas/query views without copying the
   full base scaffold into a temp table.
3. Attach `universe_points` only when the bundle needs richer local detail or overlay promotion.
4. Promote a subset by mutating DuckDB-local overlay membership tables.
5. Expose `active_points` as a dense union view of base plus overlay.
6. Remap links through `active_links_web` and `active_paper_links_web`.
7. Keep the camera fixed while the canvas changes.
8. Use `evidence_api` for payloads that are too heavy for the bundle.

Implementation detail:

- `base_points_canvas_web` and `universe_points_canvas_web` stay Parquet-backed
  projection views
- point parquet stays narrow: ids, coordinates, cluster/color columns, compact
  bibliographic fields, compact summary metrics, and first-paint filter/search
  fields only
- `current_points_canvas_web` is the render-facing alias for Cosmograph;
  `current_points_web` is the query-facing alias for search, table, and widget
  aggregation
- the frontend binds directly to `current_points_canvas_web` /
  `current_links_web`; internal swap views are runtime detail, not app contract
- `pointIncludeColumns` stays empty on the live graph page; filters, timeline,
  search, table, selection, and info widgets query `current_points_web` /
  `current_paper_points_web` directly through DuckDB instead of hydrating rich
  point metadata through Cosmograph
- the filter panel and timeline may still use the native `@cosmograph/ui`
  controls, but only behind a thin adapter layer that binds filtering clients
  to `current_points_web`; the accessor-driven canvas-table path remains
  off-limits because it would reopen point hydration on the graph path
- `selected_point_indices` is materialized from Cosmograph selection clauses in
  DuckDB; selection should not be mirrored back into SQL through huge
  placeholder lists
- React should only mirror scalar invalidation state for selection/scope; the
  selected row set itself remains in DuckDB
- `overlay_point_ids_by_producer -> overlay_point_ids -> active_point_index_lookup_web`
- `active_points_canvas_web` / `active_points_web` are the browser-facing dense
  base-plus-overlay views
- overlay point rows stay view-backed from `universe_points`; the runtime keeps
  mutable id membership locally, not a copied rich overlay point table
- `current_points_canvas_web` / `current_points_web` / `current_paper_points_web`
  are the stable active aliases that all non-canvas DuckDB queries should use
- `active_links_web` and `active_paper_links_web` follow active ids, not a static export cohort
- info-panel scope changes batch widget summaries in DuckDB and reuse shared
  categorical results across compatible widgets
- search results carry a narrow point shell so search-select does not need a
  second point-resolution query before opening the detail panel

Important scale note:

- a future globally mapped corpus may be much larger than the browser-attached
  universe
- the backend may retrieve against that larger mapped corpus
- the browser should still attach only the needed graph rows for returned refs,
  then materialize them locally through overlay/active aliases

That is how the graph can stay clean and fast while the evidence backend works
over a much larger paper domain.

This is the clean boundary: base and universe are data, active is runtime state,
evidence is a service.

The stable evidence/RAG contract that sits beside this runtime now lives in
[`docs/map/rag.md`](../map/rag.md). Keep this document focused on graph runtime
behavior; keep stable evidence/backend semantics in the RAG map.

---

## Layer Modularity Contract

The graph runtime must not be designed around permanently entangled layers.

Current rule:

- the shipping runtime has one canonical graph layer: `corpus`
- Cosmograph and DuckDB should only boot the corpus canvas path
- there should be no paper/chunk/geo mode switching in the base runtime
- no new layer should widen the core canvas/query contract until the corpus
  runtime foundation is demonstrably stable and fast

If a future layer is added, it must be self-contained:

- its own bundle artifacts or API payloads
- its own DuckDB registration and query module
- its own canvas adapter, if it even renders on the graph canvas
- its own UI entry points and controls
- its own enable/disable switch

And just as important, it must be removable:

- disabling a future layer must not require editing corpus queries
- disabling a future layer must not change corpus view names
- disabling a future layer must not leave dead branches in the base store,
  canvas config, or bundle bootstrap path

The design target is additive modules, not shared branching logic.

---

## Base Admission Policy

The admission model is:

`base = domain entity evidence OR flagship journal OR narrow vocab anchor`

A paper enters **base** if PubTator annotated it with at least one entity
from our curated domain vocabulary (psychiatry, neurology, neuropsychiatry,
neuroscience). Papers from any organ system qualify as long as they carry a
domain entity — a cardiology paper about QT prolongation from haloperidol
gets base because haloperidol is a `psychiatric_medication` entity rule.

### Three tiers

| Tier | Score | Gate |
|------|-------|------|
| `rule` | 3000 + bonuses | `has_rule_evidence` — entity or relation rule hit from domain vocabulary |
| `flagship` | 2000 + bonuses | Paper in a domain-flagship or general-flagship journal |
| `vocab` | 1000 + bonuses | `vocab_entity_match` admission and not in excluded specialties |

### Entity rules — vocab-driven

572 entity rules across 14 domain families, generated from the curated
`data/vocab_terms.tsv` vocabulary (3,361 terms with UMLS CUIs):

| Family | Rules | Source |
|--------|-------|--------|
| `psychiatric_medication` | 183 | Specific psychotropics (haloperidol, SSRIs, lithium, etc.) |
| `neurological_disorder` | 129 | Neurological diagnoses (Alzheimer's, Parkinson's, MS, etc.) |
| `psychiatric_disorder` | 82 | DSM diagnoses tagged `{psychiatric}` in vocab_terms |
| `drug_class` | 47 | Pharmacologic classes (SSRIs, antipsychotics, benzodiazepines) |
| `neurotransmitter_system` | 45 | Dopamine, serotonin, GABA, glutamate, etc. |
| `neuropsych_symptom` | 29 | Anhedonia, psychomotor retardation, suicidality, etc. |
| `biomarker` | 17 | Domain biomarkers (cortisol, BDNF protein, etc.) |
| `behavior` | 14 | Aggression, catatonia, delirium, hallucinations |
| `systemic_bridge` | 7 | C-L bridges (encephalopathy, hyponatremia) |
| `iatrogenic_syndrome` | 6 | NMS, serotonin syndrome, EPS, QT prolongation |
| `neuropsych_disease` | 5 | Epilepsy, FTD, akathisia, PNES |
| `neurotransmitter_gene` | 5 | BDNF, COMT, MAOA, DAT, SERT |
| `endocrine_metabolic` | 2 | DKA, myxedema |
| `psychiatric_gene` | 1 | FKBP5 |

Broad medical entities (`cl_disorder`, `clinical_symptom`) are deliberately
excluded from entity rules. Conditions like hypertension, diabetes, nausea,
and headache belong in the universe layer — they appear across all of medicine
and would flood base with non-domain papers.

### Infrastructure

- `entity_rule` and `relation_rule` define rule evidence
- `journal_rule` and `base_journal_family` define curated journal metadata
- `paper_evidence_summary` is the durable per-paper stage that base admission reuses
- `graph_points.is_in_base` records the final admission decision
- `graph_points.base_rank` orders base points for export and QA
- `solemd.vocab_terms` is the PostgreSQL-backed curated vocabulary with UMLS CUIs and MeSH crosswalks

---

## Target Composition

Base is the domain core — psychiatry, neurology, neuropsychiatry, and
neuroscience. It includes papers from all organ systems that demonstrate
domain relevance through entity annotation overlap.

- **~1.6M papers** with domain entity evidence (rule tier)
- **~50K papers** from flagship journals without entity overlap (flagship tier)
- **~3K papers** from vocab-anchor matches (vocab tier)

The useful mental model is:

- `base_points` is the domain-relevant curated scaffold (~1.6M)
- `universe_points` is everything else in the mapped corpus (scaling toward 200M+ from S2)
- `overlay_points` is the user-driven expansion surface

---

## Implementation Pattern: DuckDB Bundle

The canonical bundle is:

- `base_points.parquet`
- `base_clusters.parquet`
- `universe_points.parquet`
- `paper_documents.parquet`
- `cluster_exemplars.parquet`

DuckDB keeps those artifacts local and queryable without hydrating a giant JS
array. Cosmograph reads the dense active canvas views, not raw application
objects.

The important property is that base and universe are produced from the same
mapped coordinate system. Overlay promotion should not change the manifold or
reset spatial memory.

The same principle now applies to the offline build:

- embeddings stream from DB via binary COPY in 100K-row chunks (~2 GB peak)
- SparseRandomProjection (default) or IncrementalPCA reduces 768D → 50D
- one shared kNN graph feeds both UMAP and Leiden
- `paper_evidence_summary` is the database-side reusable evidence stage
- `graph/tmp/graph_build/<graph_run_id>/` is the filesystem-side layout stage
- publish/export is a later step, not the place where raw evidence or neighbor
  graphs are recomputed

---

## What This Replaces

The new model replaces the older lane-based first-paint policy.

Those terms belonged to a system where the opening canvas had to carry too much
policy logic. In the new architecture:

- base admission is explicit
- universe is preserved
- overlay promotion is runtime state
- evidence stays backend-driven until needed

That is the clean separation the graph needs.

---

## Overlay Activation (Implemented)

The first overlay activation path is live. It validates the
`base / universe / overlay / active / evidence` model in the browser
without falling back to JS point hydration.

Design goals:

- Cosmograph binds to DuckDB table names, not `Record<string, unknown>[]`
- Overlay activation updates the active canvas in place
- Overlay triggers are modular — future entity, relation, citation, and RAG
  flows reuse the same plumbing
- Info/table surfaces refresh when active overlay membership changes

Canonical activation flow:

```
overlay_point_ids_by_producer
  → overlay_point_ids
  → overlay_points_web (view-backed from universe_points)
  → active_points_web (dense union: base + overlay)
```

Implemented trigger: explicit cluster-neighborhood expansion from the info
panel. The runtime publishes versioned active alias views so Cosmograph
receives a real table-name update on overlay changes while preserving point
positions by id.

Evidence retrieval stays backend/API-driven and is not part of the
browser-side overlay slice.

---

## Roadmap

### 1. Expand the Trigger Family

Expand beyond cluster-neighborhood activation while keeping the same overlay
contract.

Recommended order:

1. citation-neighborhood expansion
2. entity / relation-driven expansion
3. semantic / RAG-associated expansion
4. backend-ranked mixed expansion

### 2. In-Place Overlay Validation

Validate living-graph behavior in the browser with real overlay promotion:

- no remount
- no camera reset
- no disruptive flicker
- stable spatial memory for base points

The runtime uses versioned active alias views plus
`preservePointPositionsOnDataUpdate`; what remains is browser validation and
tuning rather than more architectural rewiring.

### 3. Visual Emphasis Policy

Define how active overlay material should change the canvas visually:

- brighten overlay points
- slightly enlarge or otherwise emphasize overlay points
- dim unrelated base regions rather than hard-removing them by default
- keep orientation and spatial continuity intact

This likely needs a small style/state contract, but should stay DuckDB-first.

### 4. Backend Ranking Path for Overlay Candidates

Build the backend selection path that returns a small candidate set to promote
from the premapped universe. This bridges `universe_points` and `evidence_api`.

Supported retrieval modes:

- graph-neighbor retrieval
- cluster-context retrieval
- citation-based candidate expansion
- entity/relation-matched candidate expansion
- semantic/RAG-driven candidate expansion

### 5. Universe-Scale Summaries

Decide which summaries remain local to `active_points` and which should become
universe-aware via backend or remote DuckDB aggregation.

Likely split:

- local: current active canvas widgets and crossfilter
- remote/backend: universe-wide previews, expansion estimates, global counts

### 6. Universe Detail Storage Choice

Keep Parquet-first for wide point tables. Revisit remote read-only `.duckdb`
attach only if universe detail tables become numerous enough that a structured
read-only database is cleaner than many individual Parquet artifacts.

### 7. Release-Scale Build Split

The intended release cadence is:

1. `paper_evidence_summary`
2. `universe_layout`
3. `base_admission`
4. `publish`

The schema-level rationale and table responsibilities live in
[`../map/database.md`](../map/database.md#rebuild-strategy-at-scale).

Implementation notes:

- keep heavy PubTator entity/relation scans tied to permanent mapped-paper
  tables so PostgreSQL can plan parallel workers
- use temporary tables only for smaller downstream staging steps
- keep summary refresh resumable by stage
- keep layout resumable by durable filesystem checkpoints
- reuse one PCA-space kNN graph for both UMAP and Leiden

### Not Planned

The browser should not own the full universe as hydrated JS objects:

- no return to `Record<string, unknown>[]` point hydration for chunk/paper layers
- no full-universe first-paint payload
- no browser-side reinvention of visibility or ranking policy
