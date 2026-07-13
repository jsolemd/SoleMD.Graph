# Public Site Ownership

Date: 2026-07-10
Status: canonical direction

## Decision

`SoleMD.Web` owns the public `solemd.org` website, personal/about surface,
lecture catalog, and the shared public shell for future educational
experiences.

`SoleMD.Graph/apps/web` owns the Graph product: field/orb landing surfaces,
Cosmograph exploration, wiki runtime, graph panels, and graph-native modules.
It is no longer the implementation target for the general public homepage.

This supersedes the 2026-07-03 proposal to make Graph the unified public site.
The split is intentional: the public site must remain simple and stable while
the graph, orb, Cosmograph, and wiki work can evolve independently.

## Repository boundaries

| Repository | Owns |
|---|---|
| `SoleMD.Web` | Public identity, About, lecture discovery, public navigation, shared educational brand shell |
| `SoleMD.Graph` | Graph/orb/field/Cosmograph/wiki product runtimes and graph-native modules |
| `SoleMD.Make` | Markdown sources, decks, citations, PDFs/DOCX/PPTX, evidence and publication metadata |

Repositories may reference each other read-only. They must not import source or
runtime assets across workspace boundaries. Content publication requires an
explicit manifest or package contract.

## Current public-site shape

| Route | Owner | Purpose |
|---|---|---|
| `/` | Web | Public SoleMD landing page |
| `/about` | Web | Jon Sole biography and training |
| `/lectures` | Web | Canonical lecture catalog |
| `/lectures/[slug]` | Web | Lecture preview or future educational experience |
| Graph/orb routes | Graph | Dedicated knowledge-graph product |
| Wiki routes | Graph | Graph-linked reader and module runtime |

The exact Graph deployment path/domain is an infrastructure decision. It must
not silently reclaim the public root.

## Educational experiences

A lecture starts as a typed record and preview route in Web. It may later grow
into a rich Fable/AI-for-Psychosis-style experience behind the same slug.

Use Web for ordinary public educational experiences. Use Graph only when the
experience materially depends on graph/orb/Cosmograph/wiki runtime behavior.
If a lecture remains a separate deployment, consume a versioned shared brand
package rather than copying tokens or site chrome.

Orb, Cosmograph, wiki expansion, and the earlier unified-site plan are on hold
for the current public-site release.

## Brand relationship

The two products share the core SoleMD palette. They do not share all component
grammar:

- Web preserves the legacy personal-site composition: centered viewport
  heroes, route accents, floating pill header, 2rem cards, and stacked footer.
- Graph retains its product-specific matte panels, density scaling, mode
  accents, PanelShell, and AMOLED field behavior.

See Web `docs/brand.md` and Graph [brand.md](brand.md). The `aesthetic` skill
routes between these contracts by active repository.

## Content publication

Make remains the source of authored lecture/deck content. Web should receive
only material explicitly marked for public release. Forthcoming preview pages
must not invent download links, metrics, publication claims, or availability.

The first real Make-to-Web publication should define a versioned manifest with
at least slug, title, version, date, public status, source path, assets, and
citations. Do not create that pipeline until a real published lecture requires
it.
