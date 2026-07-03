# Interactive Learning Architecture

Date: 2026-07-03
Status: canonical direction, implementation pending

## Purpose

Define how SoleMD turns authored lectures, slides, literature, wiki pages, and
the Field/orb visual language into interactive teaching modules.

This document does not duplicate:

- public site ownership: [public-site.md](public-site.md)
- field runtime rules: [field-runtime.md](field-runtime.md)
- implementation stack: [field-implementation.md](field-implementation.md)
- wiki page generation: [wiki-generation.md](wiki-generation.md)
- module vocabulary: [modules/module-terminology.md](modules/module-terminology.md)

## Core Decision

SoleMD education should be wiki-native and graph-grounded.

`SoleMD.Make` remains the authoring and document generation system. It owns the
source markdown, slide decks, manuscripts, citation verification, PDFs, DOCX,
PPTX, and publication manifests.

`SoleMD.Graph/apps/web` owns the public website, wiki pages, module runtime,
interactive visualizations, evidence overlays, and graph actions.

Decks are not dead slide uploads. A deck can still publish PDF and PPTX assets,
but the public website should treat it as a structured source package that can
be rendered as:

- a wiki lecture page
- a module manifest
- a scroll-driven learning experience
- graph-linked evidence overlays
- downloadable generated assets

## Literature-To-Learning Pipeline

The public learning surface should honor the graph intent by grounding topics
in literature first.

| Layer | Unit | Primary source | Public behavior |
|---|---|---|---|
| Paper | PMID / DOI / corpus paper id | PubMed, Semantic Scholar, Zotero, Graph warehouse | Citable evidence node |
| Claim | bounded statement with evidence | Atlas / Graph evidence tables / authored notes | Hoverable or expandable evidence card |
| Topic | entity, mechanism, medication, syndrome, workflow | Graph entity model + wiki slug | Wiki page and graph focus target |
| Wiki page | readable editorial page | Graph wiki markdown | Static page with graph actions |
| Lecture | curated sequence across topics | Make source package + Graph manifest | Wiki lecture page and module entry |
| Module | interactive teaching experience | Graph module manifest | Scroll, stage, simulation, and evidence overlay |
| Asset | PDF, PPTX, images, figures | Make build output | Download or inline figure source |

The pipeline should be explicit:

```text
PubMed / Semantic Scholar / Zotero
  -> Graph warehouse papers and identifiers
  -> Atlas claim/topic recall
  -> Make lecture or deck source
  -> Make publication manifest
  -> Graph wiki page
  -> Graph module manifest
  -> Field and evidence runtime
```

Generated content should never depend on parsing a PPTX in the browser. The
runtime contract is the manifest plus markdown, citations, topic ids, graph
refs, and assets.

## Publication Manifest

A Make-published lecture package should include enough metadata for Graph to
render the page without guessing.

Minimum fields:

```yaml
kind: lecture
slug: wiki/lectures/delirium
module_id: delirium
wiki_page_slug: modules/delirium
title: Delirium
source_path: content/slides/delirium/delirium-complete.md
version: "5.0"
date: 2026-07-03
public: false
topics:
  - entities/delirium
  - entities/acetylcholine
  - entities/dopamine
citekeys:
  - example2026
pmids:
  - 12345678
claims:
  - claim:delirium-acute-brain-failure
assets:
  - delirium-complete.pdf
  - delirium-complete.pptx
  - foundations/slides/four-part-clinical-framework.md
chapters:
  - id: why
    source_project: foundations
    field_scene: cascade
  - id: see
    source_project: evaluation
    field_scene: bedside-recognition
  - id: do
    source_project: nonpharm
    field_scene: bundle-clock
  - id: prescribe
    source_project: pharm
    field_scene: decision-surface
```

`public: false` should remain the default until citations, claims, PMIDs, and
assets resolve cleanly.

## Module Runtime Contract

Interactive learning modules are expanded wiki pages. They are not separate
apps and should not create a parallel route system.

Each module section should declare:

- stable section id
- source deck or source markdown path
- topic ids and evidence ids
- interaction type
- field scene target
- graph focus behavior
- mobile and reduced-motion behavior

The visual runtime should follow the existing Field contract:

- one shared field/runtime family
- no page-local canvases per section
- dynamic client import for heavy scenes
- DOM/SVG for labels, controls, and readable clinical meaning
- particles for substrate, transition, emphasis, and graph metaphor
- graph refs and evidence overlays from canonical identifiers
- reduced-motion path that preserves content without continuous movement

Scroll should update refs, uniforms, and field controller targets. It should not
push high-frequency progress through React state.

## 2026 Rendering Stack

The default module stack should be:

- Next.js app routes and server components for page shells
- React Three Fiber and drei for React-integrated scenes
- Three.js WebGL2 as the reliable baseline renderer
- Three.js WebGPU renderer and TSL as feature-gated enhancements
- raw WebGPU / WGSL only for kernel-level field, orb, or compute-heavy paths
- GSAP or the existing Field scroll driver as the canonical scroll owner

WebGPU is appropriate for high-density particle compute and future orb-quality
surfaces, but it should not be the only path for public education pages. Every
module needs a WebGL2 and reduced-motion fallback.

Current Graph web dependency target after the July 2026 update:

| Package | Target |
|---|---|
| `next` | `16.2.10` |
| `react` / `react-dom` | `19.2.7` |
| `three` | `0.183.2` |
| `@react-three/fiber` | `9.6.1` |
| `@react-three/drei` | `10.7.7` |
| `framer-motion` | `12.42.2` |
| `gsap` | `3.15.0` |
| `tailwindcss` / `@tailwindcss/postcss` | `4.3.2` |

## Delirium Module Shape

The delirium slide series maps cleanly into a four-chapter learning module:

| Chapter | Source deck | Public job | Interactive surface |
|---|---|---|---|
| Why | `foundations` | Explain acute brain failure and mechanisms | Risk ratchet, cascade field, network-disconnection view |
| See | `evaluation` | Teach bedside recognition | Arousal / attention / orientation simulator and phenotype atlas |
| Do | `nonpharm` | Convert risk into bedside actions | 24-hour bundle clock, sensory/orientation/body-needs controls, mobility spiral |
| Prescribe | `pharm` | Teach constrained medication decisions | Safety gate, receptor/phenotype decision surface, evidence cards |

Recommended chapter behavior:

1. Start with the familiar orb/field as papers and claims.
2. Let scroll resolve the field into the four-door framework: why, see, do,
   prescribe.
3. In Foundations, move from vulnerability to insult, BBB/neuroinflammation,
   network disconnection, neurotransmitter imbalance, and synaptic failure.
4. In Evaluation, let the learner manipulate arousal, attention, orientation,
   sleep-wake disruption, and motor phenotype.
5. In Nonpharm, make time-of-day actions visible as a bundle clock rather than
   a checklist.
6. In Pharm, force safety gates before receptor/phenotype matching, then expose
   evidence strength and uncertainty.

The Field/orb should be the through-line, not a decorative background. Its
particles can stand for papers, claims, topics, symptoms, or intervention
levers depending on chapter state, but the active meaning must be declared in
the module manifest and overlays.

### Delirium Evidence QA

The July 2026 audit found enough structure to proceed, but public evidence
overlays should wait for citation cleanup.

Known cleanup items:

- evaluation references include unresolved keys:
  `vanRoutine2011`, `yangCurrent2009`, `zamoscikDelirium2021`
- nonpharm references include a likely evidence mismatch: Chen 2022 delirium
  prevention copy resolving to a stroke-prevention network meta-analysis
- nonpharm also includes unresolved `devlinPadis2025`
- pharm includes unresolved `mortensenLong2024`
- DSM / gray-literature references need a deliberate non-PMID evidence policy

These are content-publication blockers, not module-design blockers.

## AI For MDs Module Shape

`AIforMD-react` should be treated as a migration source for the Graph module,
not as a permanent separate app.

The current Graph destination is the wiki module under
`apps/web/features/wiki/modules/ai-for-mds`.

High-value migration targets:

- prompting practice as an interactive prompt workbench
- SAFER as a risk-control pathway
- workflow sections as staged clinical handoff surfaces
- interactive demo behavior as a case trajectory
- toolkit content as graph clusters and action cards

Possible Field mappings:

- token and context flow as a stream scene
- retrieval-augmented generation as papers and claims pulled into focus
- safety checks as gates along the stream
- clinical case progression as object formation
- model uncertainty as an evidence overlay rather than a warning paragraph

The goal is not to recreate the source app's navigation. The goal is to port
its best interactions into the Graph wiki/module runtime.

## Implementation Sequence

1. Publish a Make-to-Graph lecture manifest for delirium without making it
   public.
2. Create `docs/map/modules/delirium.md` as the semantic module contract.
3. Reconcile delirium citations and evidence mappings.
4. Build a static wiki lecture page from the manifest.
5. Add a Graph module registration for `modules/delirium`.
6. Implement the first bespoke section using existing module-runtime shells.
7. Bridge the module to the Field runtime behind a feature flag.
8. Add evidence overlays after citation QA passes.
9. Promote WebGPU paths only where measurable density or compute wins justify
   the added fallback burden.

## Acceptance Standard

A public interactive lecture is ready when:

- its wiki page is readable without JavaScript-heavy effects
- its manifest resolves source paths, assets, topics, citekeys, and PMIDs
- graph actions operate on canonical refs
- mobile and desktop have feature parity
- reduced-motion mode keeps all teaching content available
- the module uses shared Field and module-runtime primitives
- the experience is grounded in cited papers and flags thin evidence honestly
- generated assets are downloadable but not the only learning surface
