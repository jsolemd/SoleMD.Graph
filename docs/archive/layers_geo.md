# GEO — Geographic Research Layer

> **Updated**: 2026-03-14 | **Source**: planned
> **Parents**: [graph.md](../system-map/graph.md)
> **Planning Docs**: [web-map-geographic-layer-v1.md](../plans/future/web-map-geographic-layer-v1.md), [geo-rag-extension-v1.md](../plans/future/geo-rag-extension-v1.md)
> **Vision**: [web-map-vision-v1.md](../plans/future/web-map-vision-v1.md)

The geographic layer shows where research comes from. It is the third lens on
the corpus — alongside the semantic lens (chunks) and the bibliographic lens
(papers) — rendering institutions, countries, and collaboration networks on an
interactive map.

Same DuckDB bundle. Same panels. Same filters. Same modes. Different renderer.

---

## Overview

| Aspect | Description |
| --- | --- |
| **Purpose** | Geographic visualization of institutional output, author mobility, and cross-institution collaboration |
| **Node Kind** | `institution` |
| **Primary Input** | `solemd.paper_authors` JOIN `solemd.author_affiliations` |
| **Enrichment** | OpenAlex API (primary), ROR API (fallback) |
| **Renderer** | MapLibre GL JS via react-map-gl (not Cosmograph) |
| **Bundle Tables** | `geo_points`, `geo_links`, `geo_clusters`, `geo_facets`, `graph_author_geo` |
| **Status** | Planned |

---

## Three Lenses

```
LayerSwitcher:  [Grid]  Chunks       — what the corpus means
                [File]  Papers       — what the corpus is
                [Globe] Geography    — where the corpus comes from
```

Each layer reads from the same DuckDB bundle. The layer switch only changes the
renderer and the points table. Everything else — panels, state, filters, the
DuckDB connection — is shared infrastructure.

---

## What You See

**Zoomed out**: Countries colored by research output. Soft choropleth in brand
pastel palette. Click a country → zoom in, see institution markers.

**Zoomed in**: Individual institution markers sized by paper count, colored by
type (education, healthcare, research). Cluster at low zoom, expand at high
zoom.

**Arcs**: Thin, luminous great-circle lines connecting institutions that share
co-authorship. Width proportional to shared papers. Gradient-colored.

---

## Three Cards

### Institution Card

Click an institution marker. The detail panel opens with:

- Institution name, city, country, type
- Paper count, author count, year range
- Top topics (from term associations)
- Author list
- Collaborating institutions
- Papers from this institution

### Author Card

Click an author name anywhere in the interface. The detail panel shows:

- Author name, ORCID
- Institution history (chronological path on map)
- Paper count, topic profile
- Papers list

### Country Card

Click a country on the choropleth or in the facet filter:

- Country name, institution count, paper count, author count
- Top institutions ranked by output
- Top topics
- Collaboration partners (other countries)
- Publication timeline

---

## Cross-View Filtering

The map and scatter plot talk to each other:

- **Map → Cosmograph**: Click "United States" → Cosmograph highlights only
  US-authored chunks/papers
- **Cosmograph → Map**: Select a dopamine cluster → map highlights institutions
  publishing on dopamine

Mechanism: shared Zustand store, shared DuckDB session, `paper_id` as join key.

---

## Data Pipeline

```
GROBID TEI XML ──► structured affiliation parser ──► author_affiliations
                                                        │
OpenAlex API ────► batch enrichment by DOI ─────────────┤
                                                        │
ROR API ─────────► affiliation matching fallback ───────┘
                                                        │
Legacy SoleMD.App affiliation/backfill logic ───────────┘
                                                        │
                                                        ▼
                                              author_affiliations
                                              (institution, city, country,
                                               lat/lng, ror_id, source)
                                                        │
                                                        ▼
                                              graph export ──► geo_points
                                                               geo_links
                                                               geo_facets
                                                               graph_author_geo
```

### Expected Coverage

| Source | Running Total |
| --- | --- |
| GROBID (fixed parser) | 55-60% |
| + OpenAlex enrichment | 75-85% |
| + ROR matching | 83-92% |

---

## Aesthetic

The map follows the Cosmograph aesthetic: quiet, warm, floating.

- **Tiles**: Soft cream/gray landmass, pale water, minimal labels. Deep navy in
  dark mode.
- **Markers**: Soft circles, brand palette, indigo shadows, lift on hover.
- **Arcs**: Thin, translucent, gradient-colored. Visible when you look,
  invisible when you don't.
- **Panels**: Glass-morphism overlays via existing `PanelShell.tsx`.
- **Transitions**: Smooth fly-to, eased zoom, gentle marker scale-up.

---

## Key Interactions

| Cosmograph Pattern | Map Equivalent |
| --- | --- |
| Click point → detail panel | Click marker → institution/author/country card |
| Search by field → highlight | Search by institution/country/author → highlight + fly-to |
| Filter facet → grey out | Filter facet → grey out non-matching markers |
| Timeline slider → filter | Timeline slider → filter by year |
| Lasso select → selection set | Region select → selection set |

---

## Searchable Fields

```typescript
searchableFields: {
  institution: 'Institution',
  country: 'Country',
  city: 'City',
  authorName: 'Author',
  paperTitle: 'Paper',
  citekey: 'Citekey',
  year: 'Year',
}
```

---

## Technology

### Why Not Cosmograph Native?

Cosmograph has no geographic capabilities — no coordinate projections, no tile
layers, no basemaps. It renders abstract 2D point clouds (UMAP embeddings,
force-directed layouts). While you could pre-project lat/lng to x/y and feed
them in, there would be no basemap underneath — just floating dots with no
geographic context. A dedicated map library is required.

### Selected Stack

| Component | Selection | Why |
| --- | --- | --- |
| Map engine | MapLibre GL JS | Open source (BSD), premium aesthetic control, custom tile styles via Style Spec JSON |
| React wrapper | react-map-gl | Native hooks API (`useMap`, `useControl`), Next.js 15 App Router compatible |
| Arc overlay | deck.gl ArcLayer | WebGL collaboration arcs overlaid on MapLibre via `MapboxOverlay` |
| Tile provider | Stadia Maps | Free tier, "Alidade Smooth" style matches SoleMD minimalism |
| Enrichment | OpenAlex API | Free, 98.6% biomedical coverage, lat/lng included directly |
| Geocoding | ROR dataset | 116K institutions with coordinates, CC0 license, affiliation matching API |

Cost: **$0/month** at current scale.

### What Was Evaluated and Rejected

| Library | Reason Rejected |
| --- | --- |
| Cosmograph | No geographic projection, no tile support, no basemap |
| kepler.gl | Requires Redux (conflicts with Zustand), Next.js compatibility issues, heavy bundle |
| Mapbox GL JS | Proprietary license, paid tiles — MapLibre is the identical open-source fork |
| Leaflet | Canvas-based (not WebGL), less styling control, no deck.gl interop |

---

## Implementation

See [web-map-geographic-layer-v1.md](../plans/future/web-map-geographic-layer-v1.md)
for the full technical plan including:

- Database schema (`author_affiliations` table)
- GROBID parser changes
- OpenAlex/ROR enrichment services
- DuckDB bundle export (`geo_points`, `geo_links`, `geo_facets`, `graph_author_geo`)
- Layer config and web component architecture
- Build flow and CLI flags
- Phased implementation roadmap

Transition note:
- if existing affiliation parsing or backfill logic from SoleMD.App is worth keeping, port it into `SoleMD.Graph/engine` as first-class code rather than depending on SoleMD.App at runtime
