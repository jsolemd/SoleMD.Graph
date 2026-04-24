# Landing Module Inventory

This file is the canonical chapter inventory for the field landing
module.

Use it when naming work. The goal is to let us say "work on
`section-sequence`" or "change Story 2 beat 02" without re-deriving
the page structure from code.

The landing runtime architecture itself lives in
`.claude/skills/module/SKILL.md`. Authoring vocabulary lives in
`docs/map/modules/module-terminology.md`.

This file is intentionally the inventory/contract view, not a
duplicate of the full runtime manual.

## Module Identity

- Module id: `landing`
- Module kind: `landing`
- Runtime family: `Field`
- Ending pattern: `bookend return`
- Checked-in contract: `docs/map/modules/landing.md`
- Global locked deviations:
  - Landing ends on the opening blob (bookend return), not on a
    Maze-style terminal object-formation surface.
- Mobile path:
  - same runtime, same chapter structure, same vocabulary; the field
    animation drives the visual story on any viewport without a second
    scene system. No dedicated mobile chapter.
- Reduced-motion path:
  - static copy, reduced particle motion, overlays fade-in rather
    than scrub.
- Text reveal motion (standard):
  - every beat's title + body enters with a bidirectional fade + rise
    keyed off its own viewport crossing (framer-motion `whileInView`,
    `once: false`, `amount: 0.2` — trigger fires once ~20% of the beat
    is visible). Title leads, body staggers in ~80ms behind. Uses
    ease `[0.16, 1, 0.3, 1]` over 600ms. Surface Rail uses the same
    grammar plus a `staggerChildren: 0.06` cascade across its
    Papers / Entities / Connections / Synthesis grid items.
  - OS reduced-motion is honored by `MotionConfig reducedMotion="user"`
    at the landing shell root (`FieldLandingShell`) — every descendant
    framer-motion element drops its transforms and reads as static copy
    without losing the hero's `TextReveal` on mount.

## Narrative Thesis

The landing helps the reader understand what Cosmograph — and the
SoleMD.Graph product it renders — makes possible. The through-line is
a zoom through four layers of the graph:

1. **elementary units** — the field as particles (Hero, Surface Rail)
2. **papers** — individual citable units (Story 1)
3. **entities** — recurring concepts that thread across papers (Story 2)
4. **connections** — relations that turn isolated papers into reasoning
   paths (Story 3)
5. **synthesis** — clusters, living-knowledge articles, and educational
   modules that emerge from the field (Sequence)

CTA returns the field to its opening state as a bookend. Mobile parity
is an accepted product default, not a chapter — no dedicated Mobile
Carry section.

## Terminology Bridge

Uses canonical vocabulary from `module-terminology.md`. No module-
specific divergence.

## Stage Manifest

The fixed stage runs one continuous landing substrate (`blob`) plus one
overlapping middle-module carrier (`stream`).

| Order | Section id | Controller family | Ownership | Carry window |
|---|---|---|---|---|
| 1 | `section-hero` | `blob` | `owner` | through `section-surface-rail` |
| 2 | `section-surface-rail` | `blob` | `carry` | through `section-story-1` |
| 3 | `section-story-1` | `blob` | `owner` | through `section-story-2` |
| 4 | `section-story-2` | `blob` | `carry` | through `section-story-3` |
| 5 | `section-story-2` | `stream` | `owner` | through `section-story-3` |
| 6 | `section-story-3` | `blob` | `carry` | through `section-sequence` |
| 7 | `section-story-3` | `stream` | `owner` | through `section-sequence` |
| 8 | `section-sequence` | `blob` | `carry` | through `section-cta` |
| 9 | `section-sequence` | `stream` | `owner` | through `section-cta` |
| 10 | `section-cta` | `blob` | `owner` | — |

The stream fades out in the tail of the Sequence blob/stream timelines
(late-Sequence keyframe takes stream alpha → 0.12 and wrapperZ → 88) so
CTA opens on a pure blob bookend without requiring a dedicated stream
hand-off in the CTA section. The blob's per-category emphasis reset
(papers/entities/relations/evidence back to identity, clusterEmergence
+ focusActive to 0) is folded into CTA's first keyframe.

Landing stage overlays (pinned to the stage, Plane A):

- `FieldHotspotPool` — blob hotspot DOM pool projected onto blob points
- `FieldConnectionOverlay` — SVG lines keyed off shared Story 3
  progress. **Deferred for removal** once Story 3's visx graph overlay
  ships (Phase 2 — see Deferred Overlays below).

In-section UI (rendered inside the scrolling `<section>`, Plane B — not
a stage overlay):

- `FieldStoryProgress` — beat progress rail, mounted inside Story 1 and
  Story 3 chapters alongside their beats

## Deferred Overlays (Phase 2 — visx graph overlays)

Four chapter-bound SVG overlays authored with `visx`, each pinned
during its chapter's carry window and driven by shared chapter
progress. Maze-grammar layering — field dims behind, overlay strokes
in as scroll progresses. All four share one illustrative fixture
dataset (real-feeling cross-specialty content: lithium, delirium,
QT, haloperidol, catatonia, NMS, encephalopathy).

- Story 1: paper-node reveal pass — ~10 labeled paper nodes fade in
  one at a time.
- Story 2: entity layer — entity nodes fade in with arcs linking them
  to the paper subset from Story 1.
- Story 3: edge stroke-draw pass — relations between papers and
  entities draw in as the beats progress. Replaces
  `FieldConnectionOverlay`.
- Sequence: cluster/label pass — soft enclosing curves around
  groups of nodes with three cluster labels matching the synthesis
  cards.

Not shipped in Phase 1. Tracked as module-level deferred work.

## Chapter Inventory

### 1. Hero

- Section id: `section-hero`
- Chapter key: `hero`
- Stage state: `blob owner`
- Purpose: introduce the project with a weighted thesis — *the clinical
  connectome* — so the reader arrives oriented to the neuroscience /
  psychiatry / psychology target and the graph-shaped-like-its-subject
  metaphor before the zoom begins.
- Content:
  - eyebrow: `Field`
  - title: `The clinical connectome.`
  - body: `A living graph of biomedical evidence — shaped like what
    it studies.`
- Overlay: none
- Interaction: passive scroll. No CTA button in Hero; the
  `FieldScrollCue` is the only affordance.

### 2. Surface Rail

- Section id: `section-surface-rail`
- Chapter key: `surfaceRail`
- Stage state: `blob carry`
- Purpose: preview the four zoom levels the reader is about to descend
  through, so the story below reads as a promised arc rather than a
  sequence of independent sections.
- Content:
  - eyebrow: `Zoom Levels`
  - title: `Four layers deep.`
  - body: `The same field, resolved four ways — papers, entities,
    connections, synthesis.`
  - four zoom labels (rendered as plain-typography grid, no pills):
    - `Papers`
    - `Entities`
    - `Connections`
    - `Synthesis`
- Overlay: none

### 3. Story 1

- Section id: `section-story-1`
- Chapter key: `storyOne`
- Stage state: `blob owner`
- Purpose: land the first zoom step — individual papers pull out of the
  substrate as identifiable citable units.
- Content:
  - eyebrow: `Papers`
  - title: `Each point is a paper.`
  - body: `Every dot you see is a real paper — indexed, embedded,
    retrievable.`
  - beat `info-1` / progress `01` — title: `Papers emerge`
  - beat `info-2` / progress `02` — title: `Context narrows`
  - beat `info-3` / progress `03` — title: `Ready to connect`
    (centered variant)
- In-section UI:
  - `FieldStoryProgress` — beat progress rail tracking info-1 → info-3
- Overlay:
  - `hotspot cards` (`FieldHotspotPool`) anchored to blob points
  - `graph overlay (visx)` — Phase 2, deferred; paper-node reveal pass
    over the shared fixture

### 4. Story 2

- Section id: `section-story-2`
- Chapter key: `storyTwo`
- Stage state: `stream owner + blob carry`
- Purpose: reveal the entity layer — the concepts (diagnoses, drugs,
  mechanisms) that recur across papers and organize the field's
  structure above the paper grain.
- Content:
  - eyebrow: `Entities`
  - title: `They thread together.`
  - body: `The threads are concepts — diagnoses, drugs, mechanisms —
    that recur across papers.`
- Overlay:
  - `graph overlay (visx)` — Phase 2, deferred; entity-node reveal with
    arcs linking entities to the paper subset from Story 1

### 5. Story 3

- Section id: `section-story-3`
- Chapter key: `storyThree`
- Stage state: `stream owner + blob carry`
- Purpose: make the relational structure explicit — connections turn
  isolated papers into reasoning paths a clinician could traverse.
- Content:
  - eyebrow: `Connections`
  - title: `And they connect.`
  - body: `When concepts recur, the graph records a relation. Delirium,
    haloperidol, QT, lithium — the literature already reasons this way.
    The graph makes it visible.`
  - beat `info-4` / progress `01` — title: `Edges begin`
  - beat `info-5` / progress `02` — title: `Bridges form`
  - beat `info-6` / progress `03` — title: `The pattern appears`
    (centered variant)
- In-section UI:
  - `FieldStoryProgress` — beat progress rail tracking info-4 → info-6
- Overlay:
  - `connection overlay` (`FieldConnectionOverlay`) — current; deferred
    for removal once the visx overlay ships
  - `graph overlay (visx)` — Phase 2, deferred; edge stroke-draw pass
    that supersedes `FieldConnectionOverlay`

### 6. Sequence

- Section id: `section-sequence`
- Chapter key: `sequence`
- Stage state: `stream owner + blob carry`
- Purpose: show the fourth zoom level — synthesis — where clusters,
  living-knowledge articles, and educational modules emerge from the
  field as higher-order structure. Three scroll beats parallel to
  Story 1 and Story 3 so each synthesis facet has its own vertical
  airspace and its own native-physics beat on the blob.
- Content:
  - eyebrow: `Synthesis`
  - title: `Structure emerges.`
  - body: `Clusters form. Articles write themselves. Educators build
    modules on real nodes.`
  - beat `info-7` / progress `01` — title: `Clusters` — body:
    `Research communities form from embedding proximity, not predefined
    categories. The graph remembers how papers sit near each other in
    meaning — and the neighborhoods that emerge are the ones your field
    already recognizes.`
  - beat `info-8` / progress `02` — title: `Living Knowledge` — body:
    `Auto-synthesized articles per entity — definitions, key findings,
    open questions — refreshed on every build. The article doesn't
    drift from the evidence, because it's generated from the evidence.`
  - beat `info-9` / progress `03` — title: `Educational Modules`
    (centered variant) — body: `Step-through lessons anchored to real
    graph nodes. Sourced evidence illuminates around you as you
    progress.`
  - Educational Modules is currently a thesis beat only. The earlier
    three-step walkthrough ("Start where the patient is" / "Follow the
    bridges" / "Land on the lever") was pulled for rethinking; any
    future version should be re-authored from scratch rather than
    revived from this doc's history.
- In-section UI:
  - `FieldStoryProgress` — beat progress rail tracking info-7 → info-9
    (same primitive Stories 1 and 3 use).
- Overlay:
  - none. Each beat's synthesis facet is expressed natively on the
    blob — no overlay required. Beat-level native-physics grammar is
    authored in `docs/future/field-landing-native-physics.md`.

### 7. CTA

- Section id: `section-cta`
- Chapter key: `cta`
- Stage state: `blob owner`
- Purpose: resolve the zoom as a bookend — the field returns to its
  opening state — and invite the reader into the live graph.
- Content:
  - eyebrow: `End State`
  - title: `Open the graph.`
  - body: `You've seen the shape of it. The living graph is live.`
  - buttons:
    - single centered `Enter` button, routing to `/graph`; disabled
      state labels as `Graph still warming` while warmup is in flight.
      Return-to-top is delegated to the SoleMD brand pill in the top-left
      chrome, not to a second CTA button.
- Overlay: none

## Runtime Contract Notes

- Landing stage timing is driven by shared chapter progress in
  `scroll/field-scroll-state.ts`, not by controller-local ScrollTriggers.
- `BlobController` and `StreamController` consume declarative chapter
  target sets from `scroll/chapters/landing-blob-chapter.ts` and
  `scroll/chapters/landing-stream-chapter.ts`.
- `objectFormation` (object-formation surface) is defined as a stage
  item id but is not an active landing-stage controller. It is reserved
  for future module pages and authored-shape endings.
- The Phase 2 visx graph overlays read chapter progress from the same
  shared scene state — no second scroll observer.
- `FieldHotspotPool` pulse duration runs on two paired clocks:
  `BLOB_HOTSPOT_CYCLE_MS` (`controller/blob-hotspot-runtime.ts`, JS
  envelope that writes parent scale + opacity each frame) and
  `--afr-duration` (`overlay/field-hotspot-ring.css`, CSS keyframes on
  the `::before` dot and ring stroke-draw). They must match, and the
  `has-only-single` override must match `BLOB_HOTSPOT_CYCLE_SINGLE_MS`
  — a drift clips the CSS animation mid-hold and pulses read as
  shorter, not longer.

## Naming Rule

When discussing landing work, refer to chapters by:

- chapter name when the target is narrative or product-facing
- section id when the target is structural or runtime-bound
- chapter key when the target is adapter/motion-bound
- beat id when the target is inside Story 1, Story 3, or Sequence

Examples:

- `Story 2`
- `section-story-2`
- `storyTwo`
- `sequence`
- `info-5`
