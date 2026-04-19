# Author Institution World Runtime

Date: 2026-04-18
Status: proposed build method

## Purpose

Define one reusable frontend runtime for:

- a global author and institution exploration surface
- inline geography-aware modules inside the panel shell
- expanded world views for author, institution, and paper cohorts
- the handoff from geographic context into the live graph workspace

This doc treats Google Language Explorer as the reference for delivery strategy
and exploration grammar, not as a branding reference alone.

The objective is to avoid three separate systems:

- a one-off globe or map page
- a separate institution detail experience
- a disconnected handoff into the graph workspace

Instead, SoleMD should have one shared world runtime that presents geography as
an additional projection of the same paper and author identity space already
used by the graph.

This runtime is not meant to replace the graph manifold. It is meant to answer
questions the UMAP surface does not answer well on its own:

- where institutions are located
- how paper authorship distributes across institutions and countries
- how institutions connect through shared papers and author movement
- how local geographic context can hand off into graph exploration without
  losing paper identity

## What We Are Copying From Google Language Explorer

The part worth copying is the exploration architecture:

1. one persistent world frame
2. one fast client-side search surface
3. one detail overlay or route state above the frame
4. one static-data-first delivery model

The part we are not copying is the literal visual form or stack. The Google
site shows that the effect comes from composition:

- a persistent world scene
- a search-first entry path
- thin detail overlays
- routeable detail views
- versioned static data assets

For SoleMD, this is a better fit than a live request-per-hover model, because
our world surface should stay fast, cacheable, and release-scoped in the same
way the graph bundle stays release-scoped.

We should not copy their literal 3D globe as the default.

The product grammar here should be:

- a projected world field
- institution anchors as nodes
- paper and author relationships as progressive edge layers
- Cosmograph-style emphasis, dimming, and handoff
- DOM overlays for legibility, not dense DOM geography

## Observed Reference Implementation

Chrome DevTools MCP inspection of the public site on 2026-04-18 showed:

- one HTML shell served at `https://sites.research.google/languages/language-explorer/`
- a client-side app with custom elements including `rle-app` and `rle-globe`
- one WebGL canvas with id `globe-canvas`
- bundled Three.js in the shipped JavaScript
- versioned static JSON assets fetched from Cloud Storage:
  - `all_languages.json` at `367118` bytes
  - `fuzzy-search.json` at `1285782` bytes
- static country SVG fetches on detail view
- route-level language detail at paths like `/languages/language-explorer/yo`
- no live application backend or query API observed during normal search and
  detail interaction

More specifically, the shipped implementation appears to use:

- a custom Three.js globe renderer
- an embedded GeoJSON-like country dataset exposed in the bundle as
  `COUNTRY_DATA`
- country `Polygon` and `MultiPolygon` features rendered onto a sphere with
  custom geometry and shader effects
- static per-country SVG assets for detail cards

I did not find evidence of:

- Mapbox
- Leaflet
- Google Maps JS
- deck.gl
- a tile service
- a live geospatial backend for normal navigation

I also did not find an explicit provenance label for the country geometry in the
shipped bundle, so the exact upstream map source remains unverified from frontend
inspection alone.

The important lesson is not "build a globe." The important lesson is:

- keep the experience static-asset-first
- make search instant
- keep detail state local and fast
- keep identity stable across search, view changes, and detail routes

## Core Decisions

### 0. Geography is a projection layer, not the primary identity space

Papers, authors, institutions, and clusters retain stable product identities.
Geography is an additional projection of those identities, not a second source
of truth.

That means:

- paper ids remain canonical
- institution ids must be canonicalized before export
- author ids remain stable when present
- geographic coordinates are an attribute of institution or affiliation records
- world navigation can hand off into graph navigation without remapping ids

### 1. Use one governed runtime family, not a one-off geo page

The world surface should reuse the same product-level runtime ideas already
established for the ambient field:

- release-scoped static assets
- semantic scene state
- sparse overlays
- graph handoff
- scroll or filter driven emphasis

The world runtime should be reusable across:

- a future dedicated world exploration route
- homepage or module scenes that need geographic context
- inline institution or author modules inside the wiki shell
- graph handoff states when the user pivots from place into paper relations

### 2. Copy the static delivery model, not the literal globe

Google Language Explorer proves that the experience can be served from static
assets and client-side state. That part maps cleanly to our architecture.

The literal 3D globe does not.

Reasons not to copy the globe as the default:

- our product grammar is node and edge based, not country-outline-first
- inline panel and module reuse is easier in projected 2D
- world-to-graph handoff is cleaner when both are 2D canvases
- labels, overlays, and edge readability degrade on a rotating globe
- a globe introduces novelty cost that is not doing evidentiary work

Recommended default:

- projected 2D world field
- preprojected coordinates in the asset build
- optional subtle depth, parallax, or atmospheric motion
- no mandatory spherical camera or globe rotation

If a future marketing-only surface wants a globe, that should be a presentation
variant of the same data contract, not the canonical runtime.

### 3. Institution nodes are the primary geographic anchor

The world surface should anchor on institutions, not individual authors.

Reasons:

- institutions are more stable than affiliations in raw author rows
- multi-author papers collapse naturally onto institution cohorts
- institutional anchors make country and region aggregation tractable
- author-level rendering at global scale will be visually noisy and unstable

The default visible hierarchy should be:

- institution nodes first
- institution-to-institution connection summaries second
- paper and author details on focus or drill-in

### 4. Geography mode and graph mode are distinct

Geography mode is for:

- orientation
- institutional distribution
- regional concentration
- cross-country or cross-institution flows
- cohort discovery before deeper graph exploration

Graph mode is for:

- full paper relationship exploration
- cluster and evidence context
- richer paper selection behavior
- entity and citation reasoning
- dense interactive graph controls

The user should feel that they moved from place to relation, not that one
visualization replaced another arbitrarily.

### 5. Scene manifests declare semantic intent, not map math

Modules and world surfaces should publish semantic scene state. They should not
manipulate projection math, world asset indices, or renderer details directly.

The runtime owns:

- point rendering
- geographic projection resolution
- connection layer visibility
- label budgets
- camera framing
- handoff choreography

### 6. Search and filter should be local-first

The search path should work the way Google Language Explorer works:

- lightweight local search index
- instant filter response
- no server roundtrip for normal navigation
- stable route or panel detail state after selection

That means release-scoped search assets should ship with the world runtime.

### 7. Geographic uncertainty must be explicit

The Google site includes a direct note that language maps are imperfect. Our
world surface needs the same epistemic discipline.

We must not imply false precision when affiliation resolution is noisy.

Required rules:

- unresolved affiliations are not plotted as fake points
- institution location quality is tracked explicitly
- multi-affiliation papers do not silently duplicate author intent
- country-only records remain country-only unless a better coordinate exists
- overlays can disclose location provenance and confidence

## Runtime Model

The recommended architecture is:

```text
author geo export build
    ->
WorldFieldRuntime
    ->
WorldSceneController
    ->
WorldOverlayLayer
    ->
WorldSurfaceAdapter
    ->
optional GeoGraphHandoff into live Cosmograph
```

### WorldFieldRuntime

Owns the persistent geographic field.

Responsibilities:

- load one release-scoped world asset set per graph release
- render institution anchors and optional connection layers
- expose imperative camera and focus hooks to the scene controller
- keep styling aligned with Cosmograph tokens
- reduce work when hidden or backgrounded

Recommended implementation:

- projected 2D renderer
- preprojected coordinates exported ahead of time
- shared point and edge style tokens with the graph surface
- optional lightweight world outline underlay

Possible renderer choices:

- lightweight custom WebGL layer for the ambient world field
- or native Cosmograph when the experience is explicitly interactive and edge
  heavy

Do not force the live graph runtime to become the geography runtime by default.

### WorldSceneController

Owns transitions and focus changes for the world surface.

Responsibilities:

- translate section, search, or filter state into renderer updates
- manage region focus, institution emphasis, and connection modes
- support scroll-driven scenes where appropriate
- support search-driven direct focus without animation dependency

### WorldOverlayLayer

Owns the readable interface above the geographic field.

Responsibilities:

- institution cards
- author and paper cohort callouts
- region summaries
- uncertainty notes
- filter controls
- handoff controls into graph mode

The overlay layer should stay sparse. Dense geography and connection density
belong in canvas or WebGL, not DOM.

### WorldSurfaceAdapter

Connects the shared world runtime to a concrete surface.

Required adapters:

- dedicated world exploration adapter
- inline module adapter
- expanded module adapter
- graph handoff adapter

These adapters should translate lifecycle and container concerns only. They
must not create alternate scene logic families.

### GeoGraphHandoff

Owns the transition from geographic context into live graph exploration.

Responsibilities:

- preserve focused paper ids and institution ids
- warm graph mode using the same release
- seed the graph view with the subset discovered in geography mode
- crossfade or route into graph mode without identity loss

## Data Contract

### Release-scoped world asset set

Build one release-scoped geographic asset set from the same release family that
produces the graph bundle.

Minimum hot-path assets:

```text
world_institutions.parquet
world_search.json
world_region_rollups.json
```

Lazy or progressive assets:

```text
world_institution_edges.parquet
world_paper_institution_edges.parquet
world_outlines.json
world_country_shapes.svg or preprojected polyline asset
```

### Institution anchor asset

Minimum useful fields:

- `institution_id`
- `institution_label`
- `ror_id`
- `country_code`
- `country`
- `region`
- `latitude`
- `longitude`
- `geo_x`
- `geo_y`
- `paper_count`
- `author_count`
- `primary_cluster_id`
- `salience_rank`
- `location_confidence`
- `has_graph_grounding`

`geo_x` and `geo_y` should be precomputed at export time. Do not make browser
projection math a requirement for first paint.

### Connection assets

The world surface needs at least two connection layers:

1. institution-to-institution summary edges
2. paper-to-institution or cohort-to-institution drill-in edges

Hot-path institution edges should stay aggregated.

Minimum useful fields for institution summary edges:

- `source_institution_id`
- `target_institution_id`
- `shared_paper_count`
- `shared_author_count`
- `first_year`
- `last_year`
- `edge_strength_rank`
- `primary_semantic_group`

Do not ship raw author-affiliation rows directly to the browser as the primary
world edge model.

### Search asset

Search should ship as a dedicated local-first asset.

Minimum useful fields:

- `label`
- `kind` as `institution`, `author`, `country`, `region`, or `paper`
- `target_id`
- `subtitle`
- `country_code`
- `salience_rank`
- `alias_tokens`

This mirrors the Google approach: one lightweight search index that can answer
most navigational queries without a server roundtrip.

### Supporting projection APIs

The world runtime should resolve cards and deeper detail from thin projections,
not warehouse-scale payloads.

Primary candidates:

- institution api cards
- institution geo profiles
- author geo profiles
- paper api cards
- institution cohort summaries
- region and country rollups

These can be backed by PostgreSQL or future FastAPI endpoints, but their shape
should stay thin and view-oriented.

## Scene API

World surfaces should declare scene state through a semantic API.

Baseline shape:

```ts
type WorldFieldSceneState = {
  focus?: {
    institutionIds?: string[];
    authorIds?: string[];
    corpusIds?: number[];
    countryCodes?: string[];
    regionIds?: string[];
  };
  view?: {
    preset?: "global" | "region" | "country" | "institution" | "paper-flow";
    fit?: "focus" | "bounds";
    padding?: number;
    dimStrength?: number;
  };
  edges?: {
    mode?: "none" | "institution-summary" | "paper-flow" | "author-flow";
    maxCount?: number;
    minStrength?: number;
  };
  labels?: {
    mode?: "none" | "region" | "country" | "institution";
    ids?: string[];
    maxCount?: number;
  };
  hotspots?: {
    ids: string[];
    kind: "institution" | "author" | "paper" | "region";
  };
  transition?: {
    preset: "fade" | "zoom" | "pan" | "handoff";
    durationMs: number;
  };
};
```

Rules:

- identify focus by stable ids, never raw coordinates
- request labels by semantic group, not absolute placement
- let the runtime resolve search hits, overlay placement, and edge budgets
- keep geo projection details out of authored manifests

## Can We Recreate This With The Current Plan?

### Yes, already aligned

These parts fit the current direction without a new product layer:

- release-scoped static delivery
- client-side search and detail state
- WebGL-driven geographic field
- shared scene and overlay architecture
- graph handoff after geography-based focus selection

Current repo support already exists for:

- author and affiliation storage in the canonical schema
- latitude, longitude, country, and `ror_id` columns on normalized affiliation
  rows
- Three.js and React Three Fiber in the frontend
- Cosmograph and the existing graph handoff surface
- GSAP-driven scrolly primitives when geography is used inside modules

### Yes, but only with planned extensions

These are feasible within current architecture, but they are not already solved:

- institution canonicalization from raw affiliation rows
- release-scoped world asset export
- local-first world search index export
- aggregated institution connection exports
- route-safe detail cards for institution and author cohorts
- a thin world outline or country-shape asset contract

### No, not from the current graph bundle alone

The current graph bundle contract is intentionally too thin for this world
surface.

Today it excludes:

- full author JSON
- full affiliation payloads
- raw relation lists needed for geo connection rendering

So the world runtime cannot be built by "just reusing base_points" alone.

It needs a dedicated geographic read model and export path.

## What Current Plan Does Not Yet Cover

### 1. No canonical institution read model yet

The schema contains parsed institution text and `ror_id`, but it does not define
an institution-first table or read model for stable world rendering.

Without that, we will get:

- duplicated institutions
- unstable display labels
- edge fragmentation
- low-quality clustering of the same institution across spelling variants

### 2. No published world asset contract yet

We have a graph bundle contract. We do not yet have a parallel world asset
contract for institution anchors, connection summaries, search, and outlines.

### 3. No geographic quality policy yet

We have the columns needed for geo enrichment, but not the policy for:

- what counts as plot-worthy location quality
- how to handle country-only records
- how to resolve multi-affiliation authorship
- how to rank institutions for first paint

### 4. No world boundary asset yet

If we want geographic orientation beyond bare points, we need one lightweight
outline asset:

- preprojected country polylines
- or static SVG overlays
- or region masks

This is new work, but it is not a new backend class.

## Recommended Minimal Additions

### 1. Add an institution-first read model

Recommended derived outputs:

- `institution_geo`
- `institution_geo_membership`
- `institution_connection_summary`

Whether these land as durable tables or export-time views can be decided later,
but the world runtime needs these concepts explicitly.

### 2. Add a release-scoped world export step

The same release that publishes the graph bundle should be able to publish:

- world institutions
- world edge summaries
- world search index
- optional outlines

This keeps the world surface and graph surface on the same release identity.

### 3. Preproject coordinates at export time

Do not make runtime cartography a browser concern unless there is a strong
reason. Export:

- `geo_x`
- `geo_y`
- optional label anchor coordinates

This avoids needing a heavy geography runtime library in phase 1.

### 4. Keep Google-style static delivery, not Google-style stack

We do not need:

- a live map backend
- a separate geography database
- a map tile service
- a new app shell

We do need:

- normalized institution identity
- a world asset export
- a search index
- a lightweight outline asset

## Handoff Contract To Live Cosmograph

The world runtime and live graph must share:

- the same release
- the same paper ids
- the same institution ids where available
- the same semantic color vocabulary
- the same focus subset when handing off

Recommended handoff:

1. world runtime is already focused on an institution, region, author, or paper
   cohort
2. graph mode warms in the background from the same release
3. the focused cohort is translated into corpus ids and optional institution ids
4. graph mode opens with the same subset already emphasized
5. the world view fades back while the graph view becomes fully interactive

Avoid:

- remapping paper ids during handoff
- resolving institutions differently in world and graph mode
- changing colors or salience semantics during the transition
- reopening the full graph universe before the focused cohort is clear

## Existing Repo Seams To Reuse

### Current module and scene seams

- `apps/web/features/wiki/components/WikiModuleContent.tsx`
- `apps/web/features/wiki/components/WikiPanel.tsx`
- `apps/web/features/wiki/module-runtime/primitives/ScrollyPin.tsx`

### Current live graph shell

- `apps/web/features/graph/cosmograph/GraphRenderer.tsx`
- `apps/web/features/graph/components/shell/DesktopShell.tsx`
- `apps/web/features/graph/components/canvas/GraphCanvas.tsx`

### Current frontend capability surface

- `three`
- `@react-three/fiber`
- `@cosmograph/react`
- `gsap`

These are already present in the frontend dependency graph and are sufficient
for phase 1 without adding a new runtime family.

## Agentic Build Method

The system must support agentic authoring. The user should not have to hand-code
institution focus logic, search payloads, or edge selection rules.

The recommended method is:

### 1. Runtime-first

Build the reusable world runtime before building many geography surfaces.

Deliverables:

- shared world renderer
- shared scene API
- shared overlay primitives
- shared graph handoff contract

### 2. Manifest-driven content

Each geography-aware section should be represented by structured data.

At minimum:

- section copy
- scene state
- overlay anchors
- institution, author, paper, or region references
- transition preset

### 3. Thin semantic authoring surface

Agents should work in terms like:

- "focus Nigerian institutions"
- "show the institutions linked to this paper cohort"
- "highlight cross-country connections"
- "open the graph on the papers behind this institution"

They should not need to hand-author projection math or point indices.

### 4. Shared review loop

Every world surface should be reviewed against the same questions:

- does it reuse the shared world runtime?
- does it keep ids stable across geography and graph mode?
- does it avoid raw affiliation rows as direct UI payload?
- does it disclose geographic uncertainty?
- does it stay static-asset-first for normal navigation?

## Delivery Phases

### Phase 0. Canonicalize the architecture

Outcome:

- this doc becomes the working method for world author and institution surfaces

### Phase 1. Build the geographic read model

Build:

- institution-first derived read model
- geo quality policy
- release-scoped export contract

### Phase 2. Build the world runtime foundation

Build:

- world field renderer
- search asset loader
- overlay primitives
- focus and edge controller

### Phase 3. Ship one dedicated world exploration surface

Deliver:

- global institution view
- search to institution, country, region, and author cohort
- institution detail panel
- graph handoff CTA

### Phase 4. Add module reuse

Deliver:

- inline geography-aware modules
- expanded world scenes
- route-safe detail transitions

### Phase 5. Add richer connection modes

Deliver:

- institution-to-institution summaries
- paper-flow overlays
- author cohort views
- regional comparison scenes

### Phase 6. Add agentic authoring support

Deliver:

- world scene manifests
- validators for world asset references
- reusable authoring templates for geography-driven modules

## Bottom Line

The Google reference is reproducible in principle with our current direction,
but not by reusing the current graph bundle unchanged.

We can capture the important part ourselves:

- static asset delivery
- instant search
- WebGL world frame
- panel detail overlays
- handoff into graph exploration

We do not need a new class of backend to do this.

We do need:

- an institution-first geographic read model
- release-scoped world exports
- a search asset
- a lightweight outline asset

That is the difference between "in scope for the current plan" and "possible
only with some other platform." This is in scope for the current plan, but it
needs explicit data products that do not yet exist.
