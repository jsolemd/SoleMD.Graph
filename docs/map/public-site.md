# Public Site Integration

Date: 2026-07-03
Status: canonical direction, implementation pending

## Purpose

Define the public SoleMD website architecture across Graph, Make, the wiki,
legacy website content, and future Three.js / WebGPU educational surfaces.

This document owns the website integration decision. It does not duplicate:

- field runtime rules: [field-runtime.md](field-runtime.md)
- landing chapter inventory: [modules/landing.md](modules/landing.md)
- wiki content contract: [wiki-generation.md](wiki-generation.md)
- interactive learning contract: [interactive-learning.md](interactive-learning.md)
- graph runtime: [graph-runtime.md](graph-runtime.md)
- visual identity: [brand.md](brand.md)

## Core Decision

The unified SoleMD website should be hosted by `SoleMD.Graph/apps/web`.

`SoleMD.Make` remains the markdown-first authoring and document generation
system. It should produce lectures, slides, manuscripts, PDFs, and metadata
that Graph can publish and render.

The former legacy SoleMD site is not the implementation target. It is useful
only as an information-architecture and copy reference: landing, about,
education, research/papers, and wiki entry points.

The modern public homepage should evolve from the Graph field / Three.js
landing surface, not from the legacy page implementation.

## Product Shape

One website:

| Route | Purpose | Runtime owner |
|---|---|---|
| `/` | Public SoleMD landing page using the Field visual language | Graph field runtime |
| `/about` | Jon Sole professional/about page | Graph public site shell |
| `/wiki` | Knowledge entry point and browsing surface | Graph wiki runtime |
| `/wiki/topics/...` | Topic/entity pages connected to graph nodes | Graph wiki runtime |
| `/wiki/lectures/...` | Curated lectures and teaching modules | Graph wiki + module runtime |
| `/wiki/papers/...` or `/papers/...` | Papers/manuscripts with citation and graph context | Graph wiki/paper adapters |
| `/graph` | Full graph exploration product surface | Graph runtime / Cosmograph / orb |

The exact route group names are implementation details. The product invariant
is that public navigation, wiki, lectures, papers, and graph exploration live
inside one website and share one design/runtime language.

## Repository Ownership

### SoleMD.Graph owns hosting and runtime

Graph owns:

- Next.js routes and public navigation
- landing page and Field visual substrate
- wiki rendering, search, backlinks, and graph actions
- educational modules rendered in the website
- paper/entity/topic pages
- graph/orb exploration surfaces
- public asset serving for published web artifacts

### SoleMD.Make owns authoring and generated artifacts

Make owns:

- markdown source documents
- slide and lecture source
- DOCX/PDF/PPTX generation
- citation verification and Zotero-backed manuscripts
- content packaging metadata for publication

Make should not become a separate public website runtime. It publishes
content and assets into Graph through an explicit manifest contract.

## Landing Page Direction

The public landing page should use the current Field / Three.js standard as
the modern evolution of SoleMD.

The landing page should tell a broader public-site story than the current
graph-only product copy:

1. SoleMD as a clinical knowledge system.
2. The graph as the substrate.
3. Wiki pages, papers, and lectures as authored views over that substrate.
4. Make as the content engine behind lectures, slides, and writing.
5. `/graph` as the deep exploration mode.

The landing page should still obey the current module contract:

- one shared runtime family
- fixed full-viewport field stage
- declarative chapter manifest
- DOM/SVG overlays for readable meaning
- explicit mobile and reduced-motion paths
- graph bridge behavior for entering `/graph`

Do not rebuild a page-local landing animation, add per-section canvases, or
copy the legacy floating-card implementation.

## Wiki And Education Model

Education should be wiki-native.

Topic pages are nodes in the knowledge surface. Lectures and modules attach
to those topics through frontmatter, links, citations, and graph refs.
The interactive lecture/module contract lives in
[interactive-learning.md](interactive-learning.md).

Recommended content model:

```yaml
---
title: Antipsychotic Pharmacology
page_kind: lecture
section: sections/education
topics:
  - entities/dopamine-d2-receptor
  - entities/haloperidol
  - entities/qt-prolongation
source_project: make:content/slides/antipsychotic-pharmacology
version: "1.0"
date: 2026-07-03
featured_pmids:
  - 12345678
---
```

The markdown page is the readable editorial object. Runtime graph actions are
derived from canonical identifiers, PMIDs, and resolved graph refs, not from
ad hoc browser parsing.

### AI For MDs

`AIforMD-react` should be treated as a migration source, not a permanent
separate website. The canonical destination should be the Graph wiki/module
surface, most likely under `apps/web/features/wiki/modules/ai-for-mds`.

The existing Graph AI-for-MDs module manifest is the starting destination.
The richer React rewrite can supply missing sections, interaction ideas, and
copy during migration.

## Make To Graph Publishing Contract

Make should publish web artifacts to Graph through a manifest, not by loose
manual copies.

Minimum manifest fields:

```yaml
kind: lecture
slug: wiki/lectures/antipsychotic-pharmacology
title: Antipsychotic Pharmacology
source_path: content/slides/antipsychotic-pharmacology/antipsychotic-pharmacology.md
version: "1.0"
date: 2026-07-03
public: true
topics:
  - entities/dopamine-d2-receptor
  - entities/haloperidol
citekeys:
  - example2026
pmids:
  - 12345678
assets:
  - antipsychotic-pharmacology.pdf
  - antipsychotic-pharmacology.pptx
  - slides/slide-001.png
```

Graph consumes this as a public content package:

- creates or updates a wiki page shell
- links assets to the page
- resolves topics and evidence into graph actions
- keeps generated files outside hand-authored route code

The publication command can extend the existing Make-to-Graph sync pattern,
but lectures/slides need their own contract. Animation component sync is not
the same thing as content publication.

## Legacy Site Role

The old website is useful for:

- page inventory
- rough section hierarchy
- about/education copy fragments
- remembering that the public site should feel organized, not only visual

The old website should not be copied for:

- global CSS classes
- client-only static pages
- old floating cards
- page-local scroll observers
- placeholder research/publication content
- external Obsidian Publish linking

Recovered reference points:

- initial legacy website commit: `4140180`
- archived marketing site before deletion: `3b0e414:archive/marketing`
- legacy deletion commit: `a94d612`

Use those commits as a copy/reference archive only.

## Engineering Standard

Implementation should satisfy the current Graph standard:

- route entries are server components unless interactivity requires a client shell
- heavy canvas scenes use dynamic client imports
- field/orb/module work reuses the shared runtime family
- Three.js work follows the project renderer, DPR, lifecycle, and dispose rules
- orb raw WebGPU remains a distinct product runtime unless intentionally bridged
- CSS lives in the existing token/style architecture
- mobile is a first-class layout, not desktop scaled down
- reduced motion is authored explicitly
- graph actions go through adapters, not page-local route logic

## Phased Implementation Plan

### Phase 1 - Architecture and inventory

- Keep this public-site map current.
- Inventory legacy copy worth preserving.
- Compare `AIforMD-react` against the existing Graph AI-for-MDs module.
- Define the first Make publication manifest for one lecture.

### Phase 2 - Public shell

- Add the public route shape in Graph.
- Reframe the landing content around SoleMD as the unified clinical knowledge
  website.
- Add `/about` using current tokens and route patterns.
- Keep `/graph` as the deep exploration entry.

### Phase 3 - Wiki-first education

- Add full-page public wiki browsing if the current panel shell is too
  graph-workspace specific.
- Migrate one lecture into the wiki/module runtime.
- Link lecture pages to topic/entity pages and cited papers.

### Phase 4 - Make publication

- Add Make-side package metadata for lectures/slides.
- Publish generated assets and page metadata into Graph.
- Add validation that topics, citekeys, and PMIDs resolve.

### Phase 5 - Higher-fidelity educational surfaces

- Use the Field runtime for major modules by default.
- Use SVG/DOM for mechanism diagrams and readable teaching layers.
- Use Three.js/TSL or raw WebGPU only when the visual/compute need justifies it.
- Keep canvas density under runtime budgets and meaning in DOM/SVG overlays.

## Open Questions

- Should papers live under `/papers/...` or only as wiki pages under
  `/wiki/papers/...`?
- Does the public wiki need a dedicated full-page reader shell separate from
  the graph workspace panel?
- What is the first lecture to publish from Make into Graph?
- Which parts of the legacy about page are still factually accurate and worth
  preserving?
