# Field Landing — Native-Physics Story Chapters (Phase 2 Redux)

> Status: Planning — under Codex review
> Supersedes: Phase 2 visx overlays (`FieldChapterGraphOverlay`, `field-graph-fixture.ts`)
> Contract: updates `docs/map/modules/landing.md`
> Skill: `.claude/skills/module/SKILL.md` — honors the "hijack native uniforms over parallel overlays" rule

## Thesis

Module Zero's four story chapters (Story 1 Papers, Story 2 Entities, Story 3
Connections, Sequence Synthesis) tell the clinical-connectome arc **inside the
WebGL particle field itself**, not on an SVG layer above it. Specific particles
light up as papers / entities / relations via the per-particle category tag
that's already baked (`aBucket` internally; papers/entities/relations/evidence
semantically). In Story 3 a handful of native `<Line>` primitives connect
entity-tagged particles as visible edges. CTA returns the blob to its opening
state as a bookend.

### Category ≠ segmented group

The word "bucket" is an implementation detail — the `aBucket` attribute name
inside `field-attribute-baker.ts`. In the visual, particles must **never read
as compartmentalized buckets**: no hard color segments, no visible borders
between paper-tagged and entity-tagged regions, no fenced groupings. The
category tag is how the shader knows which particles to emphasize at each
beat; the viewer sees an organic, fluid field where some particles simply
become more prominent while staying part of the same living cloud. "Papers"
aren't a color-blocked team — they're a subset of the cloud that happens to
read as individually lit and labeled at the right chapter.

### Motion means something — expansion is affordance, not decoration

The zoom escalation is the load-bearing idea. Every chapter's expansion has a
mechanical job: to **create the visual room the next layer needs to appear
legibly**.

- **Hero**: blob is tight — one living substrate, no discernible individuals.
- **Story 1 Papers**: particles expand so each paper has breathing room. You
  can see papers AS papers because they aren't overlapping. Without room,
  they're a fuzzy cloud; with room, they're citable units.
- **Story 2 Entities**: particles expand further so the entity tier has room
  to float between/above papers and be distinguishable as a higher layer.
- **Story 3 Connections**: particles expand further so edges drawn between
  them read as legible lines, not a tangle. Connections need airspace or they
  self-obscure.
- **Sequence Synthesis**: maximum expansion. Everything visible at once
  without overlap — the graph fully resolved.
- **Mobile Carry / CTA**: contract back. Not a rewind but a fold — the graph
  closes back on itself for the bookend, as if the reader has seen inside and
  is returning to the outside view.

This is beyond what Maze itself does — Maze's "selection" is uniform thinning
with a single `wrapperScale: 1 → 1.8 → 1` spike at one beat, and its
"connections" live in inline SVG rails in the stream chapter, not on the blob.
We're inventing past Maze by using native primitives SoleMD already has
(the baked category attribute, `drei <Line>`, the hotspot projection path) to
carry semantic meaning through continuous expansion instead of a single
visual spike.

## Why Not Overlays

Phase 2 as originally shipped mounted `FieldChapterGraphOverlay` — a single SVG
overlay at `z-[3]` above the particle canvas, rendering a fictional paper /
entity / edge / cluster graph from a fixed viewBox fixture. It read chapter
progress from shared scene state and reveal-curved four layers on top of the
field.

The user's feedback: not native enough to the physics. Visx/SVG belongs on
panel graphs and inline charts, not on the landing's field storytelling. The
particles themselves are the substrate.

## What's Already Plumbed

- `SOLEMD_DEFAULT_BUCKETS` bakes per-vertex `aBucket` with
  `paper 10% / entity 12% / relation 8% / evidence 70%` at geometry build
  (`field-attribute-baker.ts:21-63` + `:174`). Category axis is already
  baked per-particle; we just haven't wired a shader path that reads it.
- `aSelection` is already `Math.random()` per particle
  (`field-attribute-baker.ts:166`), identical to Maze.
- `uSelection` already gates alpha via `aSelection > uSelection → vAlpha = 0`
  (`field-shaders.ts:280-282`). Today only the whole cloud is thinned.
- `wrapperScale` already tweens per chapter in
  `landing-blob-chapter.ts` — Story 1 peaks at 1.72, Story 2 at 1.28,
  Story 3 at 1.34. The seam exists; we just need larger values.
- 40 hotspot indices authored in `field-hotspot-overlay.ts:12-33`. First 3
  are named cards (papers / entities / relations); remaining 37 are
  decorative red dots. Story 1 already uses them.
- `projectPointSourceVertex` (`field-anchor-projector.ts:130-172`) projects
  a particle index through the blob's live transform to world/screen
  coordinates. Same pipe can drive native line endpoints.
- `drei <Line>` (via three-stdlib Line2/LineMaterial, already transitive)
  supports thick lines + dashing with device-DPI-correct stroke width. No
  new dependency required.

## Proposed Chapter Arc

Each row's wrapperScale is a hypothesis; actual values are live-tuned in a
visible-Chrome walkthrough. The principle is monotonic progressive expansion
through Story 1→2→3→Sequence (every new layer needs more room than the last),
then a bookend contraction through Mobile Carry → CTA. Sequence is now
authored as three scroll beats (info-7/8/9) parallel to Story 1 and Story 3,
so each synthesis facet has its own vertical airspace and its own native
physics grammar.

> This table was written before Codex review; the authoritative revised
> zoom escalation lives in the Codex Review Notes section below (R3).
> Read that table, not this one, for final values.

| Chapter / Beat | wrapperScale | Expansion does what | Category emphasis | Edges |
|---|---|---|---|---|
| Hero | 1.00 | nothing — tight, legible as one living substrate | no emphasis; all particles lit uniformly | — |
| Surface Rail | 1.00 → 1.10 | tiny swell as we preview the four layers | no emphasis | — |
| Story 1 Papers (info-1/2/3) | 1.10 → 1.70 | creates room for individual papers to stop overlapping | paper-tagged particles brighter + larger ; others dim to soft ambient | — |
| Story 2 Entities | 1.70 → 1.90 | creates the airspace entities need to float above the paper tier | entity-tagged particles brighter + larger ; papers ambient ; others dim further | — |
| Story 3 Connections (info-4/5/6) | 1.90 → 2.10 | creates the space edges need to draw as legible lines without tangling | relation-tagged particles brighter ; entities + papers ambient | 6–12 entity↔entity native `<Line>` edges; stroke-draw via dashoffset |
| Sequence ► info-7 Clusters | 2.10 hold | neighborhoods emerge inside the blob via coherent motion + warm/cool density variation | no hard category emphasis — the cluster effect is spatial/motion, not color-grouped | edges persist, dim slightly |
| Sequence ► info-8 Living Knowledge | 2.10 → 2.00 | slight zoom-toward as we narrow to one entity | one entity-tagged particle spotlighted at max boost + label; its member papers softly persist as the "article context" | edges dim |
| Sequence ► info-9 Educational Modules | 2.00 → 1.80 | partial pullback; the embedded mini-module's walkthrough plays out across the beat's scroll range | cascading brightness sweep across a pre-authored ~3-5 entity step sequence, synced to the embedded module's step-content scroll progress | edges dim further |
| Mobile Carry | 1.80 → 1.20 | contracts — the graph begins folding back on itself | return to broad uniform lighting | fade |
| CTA | 1.20 → 1.00 | bookend contraction — same tight blob we opened on | no emphasis; all uniform | gone |

Each Sequence beat has a distinct native-physics job instead of three cards
crammed into one grid:

- **info-7 Clusters** — neighborhoods **emerge** inside the blob instead of
  being imposed as hard-bordered groups. No color-tinted segments; no
  visible "team papers vs team entities" compartments. Clusters appear as
  **warm and cool regions** — subtle brightness + motion-coherence variation
  across the blob's surface — three or four soft neighborhoods that feel
  organically formed. Implementation options (to tune in Phase A1): amplify
  the existing FBM noise bands in the fragment pipeline, add a slow spatial
  sine modulation to particle brightness keyed to `aPosition`, or couple
  per-particle phase with `aIndex` modulo so nearby particles drift
  together. The visual principle is fluidity — clusters feel alive, not
  labeled.
- **info-8 Living Knowledge** — one entity-tagged particle spotlighted at
  max `uSelectionBoostSize` + boost color, with a `FieldCategoryLabelPool`
  label anchored to its projected position. Its member papers (pre-authored
  as a small set in `field-lit-particle-indices.ts`) softly persist as the
  "article context." Narrows from the wider Sequence view toward a single
  entity's knowledge surface. Uses the same primitives as Phase A1 + A2.
- **info-9 Educational Modules — a module in the module, integrated
  into the particles** — the beat embeds a real example educational
  module rather than describing the concept abstractly. Content is
  pre-authored (~3 steps), drawn from a clinical scenario in
  `vision.md §Clinical grounding` (delirium / lithium / catatonia
  spine). The DOM step cards are **NOT stacked in the scroll flow of
  info-9's section**. They're stage-level, pinned to projected
  particle positions — same mechanism the existing `FieldHotspotPool`
  uses for Story 1 hotspot cards, same pattern Maze uses for its
  stream popups. The reader sees a teaching card float next to the lit
  entity particle, not beside a sidebar; DOM and WebGL feel like one
  composition.

  Each step:
  - Short heading + 1-2 sentence teaching paragraph rendered inside a
    card pinned to the step's focus entity particle (width ~320px,
    reuse the hotspot-card visual primitive).
  - Synchronized native-physics response on the blob: the step's focus
    entity brightens at max boost, member papers light around it; if
    later steps introduce connections, native `<Line>` edges
    (Phase A3) draw between the current entity and prior steps'
    entities.
  - Progression tied to scroll position inside info-9's vertical
    airspace (beat progress 0.0-0.33 = step 1; 0.33-0.66 = step 2;
    0.66-1.0 = step 3). As the reader scrolls, the step card fades
    between positions pinned to different entities — reading
    visually as "the module walks across the blob."
  - info-9's in-section DOM is deliberately thin (the teaching lives
    on the card, not in the section flow) — the section provides
    vertical scroll space (~180svh) for the sub-progression to
    unfold smoothly.
  - Ends with lightly-implicit CTA "this is what you build in SoleMD"
    via the brand-pill or the Sequence's tail copy.

None of these require a new overlay, a new asset, or a new geometry.
info-7 and info-8 ride on the Phase A1 shader extension. info-9 adds a
small sub-beat progression inside one chapter beat — authored in
`field-landing-content.ts` (new `sequenceInfoNineSteps` structure)
and consumed by a small `FieldModuleInModule` pool component mounted
at stage level (new, Phase A1 — scoped to info-9 only, ~120 lines —
larger than earlier estimate now that it owns projected DOM cards).

Why the peaks matter: today's peak is 1.72 (Story 1). Empirically that's
only borderline-enough for native edges or entity labels to read —
particles are still close enough that a line between two entity-tagged
particles would pass through dense ambient cloud. The Codex-revised
(safer) peaks 1.70 / 1.90 / 2.10 are the working hypothesis, validated
under a visible Chrome tune.

## Technical Deliverables

### 1. Shader extension — brighten-selected + per-category gating

Extend `field-shaders.ts` vertex shader (~10-20 lines). The visual target
is "brighten specific particles tagged as papers / entities / relations";
the implementation reads the existing per-particle `aBucket` attribute
(integer tag 0-3) and applies a per-category selection floor + boost.

- Add uniforms (one per category):
  - `uPapersSelection: float` (floor for category tag 0 = paper)
  - `uEntitiesSelection: float` (tag 1 = entity)
  - `uRelationsSelection: float` (tag 2 = relation)
  - `uEvidenceSelection: float` (tag 3 = evidence, ambient background)
  - `uSelectionBoostColor: vec3` (RGB brighten factor)
  - `uSelectionBoostSize: float` (point-size multiplier ceiling)
- Replace the single `if (aSelection > uSelection) vAlpha = 0.0;` with a
  category-aware floor lookup:
  ```glsl
  float categoryFloor =
    aBucket < 0.5 ? uPapersSelection :
    aBucket < 1.5 ? uEntitiesSelection :
    aBucket < 2.5 ? uRelationsSelection :
    uEvidenceSelection;
  if (aSelection > categoryFloor) {
    vAlpha = 0.0;
  } else {
    // Brighten deepest survivors; monotonic falloff toward cull edge.
    float boost = smoothstep(0.0, categoryFloor, categoryFloor - aSelection);
    vColor = mix(vColor, vColor * uSelectionBoostColor, boost);
    gl_PointSize *= mix(1.0, uSelectionBoostSize, boost);
  }
  ```
- Bind `aBucket` to the shader attribute declarations (already baked on
  geometry; `field-shaders.ts` currently doesn't `attribute float aBucket`).

This keeps the "thin the rest" grammar Maze ships with AND adds "brighten the
survivors" so the lit category reads as actively highlighted, not just the
leftovers. No color-tinting of tagged groups — the viewer sees particles
with the same palette becoming more prominent, never segmented into labeled
colored teams.

### 2. Preset + chapter state extension

- Add to `FieldShaderPreset` in `visual-presets.ts`:
  - `papersSelection: number` (default 1 = all visible)
  - `entitiesSelection: number`
  - `relationsSelection: number`
  - `evidenceSelection: number`
  - `selectionBoostColor: Vec3` (default [1,1,1] = no boost)
  - `selectionBoostSize: number` (default 1 = no size boost)
- Add to `BlobController`'s chapter state (currently carries `selection`,
  `amplitude`, `depth`, etc. at `BlobController.ts:217-218`): the same
  four per-category selection floors. Drift-blend them each tick just like
  existing uniforms.

### 3. Chapter timeline authoring

Update `landing-blob-chapter.ts` timelines to drive:

- `wrapperScale` per the Codex-revised escalation: Story 1 peak 1.70,
  Story 2 peak 1.90, Story 3 peak 2.10, Sequence info-7 hold at 2.10 →
  info-8 2.00 → info-9 1.80, Mobile Carry 1.80 → 1.20, CTA 1.20 → 1.00.
- `papersSelection` tweened 1 → 0.1 at Story 1 entrance; back to a soft
  ambient (e.g., 0.6) through Story 2 / 3 / Sequence.
- `entitiesSelection` tweened 1 → 0.12 at Story 2 entrance; ambient
  through Story 3 / Sequence.
- `relationsSelection` tweened 1 → 0.08 at Story 3 entrance; ambient
  through Sequence.
- `evidenceSelection` held at ambient ~0.3 through all story chapters so
  the background reads without overwhelming the lit category at each beat.
- `selectionBoostSize` tweened 1 → ~1.6 per active chapter so lit
  particles grow subtly rather than just brighten.
- **info-7 Clusters** — all per-category floors held at ambient (no one
  category foregrounded); the cluster emergence is expressed through a
  new small shader or controller pass that amplifies spatial brightness
  variation. See info-7 note in Proposed Chapter Arc for the three
  technical options (FBM amplification, spatial sine modulation, phase
  coupling); Phase A1 picks one after a live Chrome test.
- **info-8 Living Knowledge** — one pre-authored entity index
  (`field-lit-particle-indices.ts`) has its `aSelection` cooled to
  effectively 0 via a targeted uniform; its `selectionBoostSize` +
  `selectionBoostColor` go to max. Its member-paper indices (also
  pre-authored) receive a secondary boost at softer levels. Mechanism is
  a small `uFocusIndex` + `uFocusMembers[N]` uniform set that the shader
  treats as "always survive, always brightened."
- **info-9 Educational Modules** — three pre-authored focus-index
  sequences cascade across beat progress (0.0-0.33 = step 1, etc.).
  `FieldModuleInModule` presentation renders the step heading/body DOM
  synced to the same progress. Reuses info-8's `uFocusIndex` mechanism
  but swaps the focus index mid-beat by writing scene state from the
  embedded-module component.
- All selection floors return to 1 and boost factors return to 1 through
  Mobile Carry / CTA bookend.

### 4. Native connection edges — Story 3 (Phase A3)

New component `FieldConnectionLayer`:

- 6-12 edges between pre-chosen entity-tagged particle indices
  (authored in `field-lit-particle-indices.ts`).
- **Endpoints are CPU-recomputed per frame** via a shader-mirror helper
  (`recomputeDisplacedLocalPosition(index, uTime)`) that runs the same
  `aPosition + aMove * aSpeed * snoise_1_2(...)` math the vertex shader
  applies (`field-shaders.ts:238-242`), returning local-space Vector3 for
  each of the ~24 endpoint indices. Cost is negligible against the 16k-
  vertex shader pass, and it keeps edges unified with particle jitter —
  rejected the simpler "mount under `blob.model`" option per Codex R2
  because rigid endpoints next to visibly-jittering particles would read
  as broken.
- Rendered as drei `<Line>` children of the R3F stage (inside
  `blob.model`'s wrapper so scale + rotation still propagate;
  positions are set per frame from the CPU-recomputed values).
- `segments={true}`, `linewidth={1.5}`, `dashed={true}`.
- Stroke-draw via per-line `strokeDashoffset` animation driven off
  Story 3 chapter progress (same scene-store subscription pattern
  existing overlays use).
- Colors keyed off accent tokens (`--color-soft-blue` for bridges,
  cluster accents for intra-topic edges).

### 5. Named labels — papers + entities (Phase A2)

Generalize the existing `FieldHotspotPool` pattern into
`FieldCategoryLabelPool` to project ~10 paper labels (Story 1) + ~7
entity labels (Story 2) + info-8's focus entity (Sequence) + info-9's
step entities (Sequence) using pre-authored particle indices. Labels are
minimal: `text-[11px] uppercase tracking-[0.2em]`, no card, no ring.
Subtle tags — "delirium", "lithium", "QT", etc. — that appear at
projected particle positions during their chapter.

Uses the existing `projectPointSourceVertex` screen-space projector
(`field-anchor-projector.ts:126-172`) — same pipe Story 1 hotspot cards
already use. Different authored index sets per chapter.

### 6. Module-in-module presentation (Phase A1)

`FieldModuleInModule` (~80 lines) renders the info-9 embedded mini-module.
Structure:

- Three step-content blocks authored in `field-landing-content.ts` as
  `sequenceInfoNineSteps: readonly { heading: string; body: string;
  focusEntityId: string; memberPaperIds: readonly string[]; edges?:
  readonly { from: string; to: string }[] }[]`.
- Each step renders as a Story-1-beat-style DOM block (heading, body).
- Component reads info-9 beat progress from shared scene state and
  derives the active step index (0/1/2) from progress quartiles.
- Writes to a `sequenceFocusStep` field on the scene state so
  `landing-blob-chapter.ts` can drive `uFocusIndex` + `uFocusMembers`
  based on the active step.
- Scroll progress inside info-9 IS the module's progress — no click,
  no tap, no replay controls. The scroll drives the step; the step
  drives the blob; the blob shows the teaching.

### 7. Unmount visx — DONE

Already executed. Plan originally scoped this as Phase A4; user
requested early removal after reviewing the v1 plan. Working tree is
back to commit `f99bee2`: no `FieldChapterGraphOverlay.tsx`, no
`field-graph-fixture.ts`; `FieldConnectionOverlay` + `field-connection-pairs`
restored; `landing.md` Phase 2 section restored to the as-shipped
deferred-overlays text. Phase A5 (update `landing.md` contract to
native physics) will rewrite the Phase 2 section fresh rather than
iterating on v1's half-revised state.

## Risks + Unknowns

- **Zoom ceiling feel.** User has accepted the conservative 2.10 Story 3
  peak. If Phase A1 tuning finds it still cramped, the escape valves are
  `uSize` + `uAmplitude` (per Codex R3), not pushing wrapperScale past
  ~2.2 where desktop cropping starts hurting.
- **Category-count readability.** At the 16384-point blob baseline
  (Codex R4): floor 0.1 gives ~164 lit paper particles, floor 0.12 ~236
  lit entity particles, floor 0.08 ~105 lit relation particles. All
  above "single-dot" and below "crowd." Labels do the pointing-at. If
  Phase A1 finds any of these densities wrong, floors are a live dial.
- **Label density.** 10 paper labels + 7 entity labels + 1 info-8 focus
  + 3 info-9 steps = up to 21 active DOM anchors across the full page.
  Existing hotspot pool handles 40; comfortably in budget.
- **Edge jitter-coherence.** CPU-recomputed endpoints (per Codex R2)
  track the shader displacement exactly. Risk is just CPU cost for
  24 indices × 60fps — in practice a handful of microseconds.
- **Maze parity.** SoleMD's per-category selection is a superset of
  Maze's uniform thinning. No regression on the runtime rebuild
  checklist; we're adding an axis, not replacing the grammar.
- **Reduced motion.** All per-category floors snap to 1 and boost
  factors snap to 1 in reduced motion; the full cloud renders as a
  static snapshot. info-8 / info-9 focus mechanisms also disable
  (no step cascade).
- **Mobile.** Codex R6: `alphaMobile` is NOT read by BlobController
  today. Do not assume "inherit the sizeMobile pattern" — if mobile
  needs different alpha or selection behavior, the controller must be
  extended explicitly. Propose a mobile-only `wrapperScale` cap of
  ~1.6 across the whole arc (from the existing mobile preset override
  point) and verify label legibility live.

## Open Questions for User — resolved

1. ~~**Zoom magnitude.**~~ **Resolved:** 2.10 peak at Story 3; tune live
   if that's still cramped.
2. ~~**Named labels?**~~ Keeping — labels are Phase A2; they give
   clinicians real words to anchor meaning to.
3. ~~**Sequence cluster halos?**~~ **Resolved:** no halos. Clusters are
   emergent (info-7 native-physics approach), not authored enclosures.
4. ~~**Keep the `FieldChapterGraphOverlay` code as archive?**~~
   **Resolved:** removed entirely per user direction. Fixture + overlay
   live only in git history now. If future panel-graph work wants them,
   we'll re-author fresh from the current plan's design.

## Sequencing

1. Plan review (Codex rescue) — **complete, critique folded in below.**
2. **Visx removal — done.** Working tree restored to commit `f99bee2`;
   `FieldChapterGraphOverlay.tsx` + `field-graph-fixture.ts` deleted;
   `FieldConnectionOverlay.tsx` + `field-connection-pairs.ts` restored;
   `landing.md` Phase 2 deferred section restored as-shipped. Baseline is
   clean before any Phase A work begins.
3. Approval via plan mode.
4. Implementation order (revised per Codex):
   - **Phase A1**: shader extension + per-category uniforms + conservative zoom
     tuning. The whole user-asked "particles light up, expand, mean
     something" is inside this slice. Validate aesthetic in visible Chrome
     before any further layer is added.
   - **Phase A2** *(conditional on A1 feeling right)*: Paper/entity labels
     via generalized hotspot pool (anchor projection already exists).
   - **Phase A3** *(conditional on A2 reading well)*: native edges via
     CPU-recomputed endpoints (see Review Notes §2 for why not R3F
     children). When shipped, retires the current `FieldConnectionOverlay`
     wiring on Story 3.
   - **Phase A4**: optional per-category motion signatures via
     `aStreamFreq` / `aRandomness` — zero shader surgery, preset-only.
   - **Phase A5**: update `landing.md` contract to reflect the native
     grammar (per-category lighting + labels + native edges replace the deferred
     visx overlays; Phase 2 section retired).
   - **Plan B (image conformation)**: parallel/optional per user choice.

---

## Architecture + Folder Layout

### Runtime boundaries

Three separate runtimes live in `apps/web`:

```
Field runtime      (THREE.js, R3F 9, custom ShaderMaterial, 16k points)
  ↓ navigation + warm handoff via /graph route
Cosmograph runtime (@cosmograph/react 2.1, DuckDB-WASM, graph bundle)
  ↓ Mantine + Tailwind tokens
Wiki/Module runtime (DOM + visx + Framer)
```

The native-physics plan touches **only the Field runtime**. Cosmograph is
untouched. The wiki runtime is untouched. Visx stays out of the field
entirely — it's a wiki/module/panel primitive, per the feedback memory
`feedback_landing_native_physics.md`.

### Field runtime folder layout (Phase A state)

Files the plan modifies or adds are marked; everything else stays exactly
as it is today.

```
apps/web/features/field/
├── asset/
│   ├── field-attribute-baker.ts            (no change — bakes `aBucket` we'll use)
│   ├── field-geometry.ts                   (no change)
│   ├── image-point-source.ts               (no change — only Plan B touches this)
│   ├── model-point-source.ts               (no change)
│   └── point-source-registry.ts            (no change)
├── controller/
│   ├── FieldController.ts                  (no change)
│   ├── BlobController.ts                   (MODIFY — drift-blend four new per-category selection uniforms + boost params per frame)
│   ├── StreamController.ts                 (no change)
│   └── ObjectFormationController.ts        (no change unless Plan B activates)
├── renderer/
│   ├── field-shaders.ts                    (MODIFY — add category-aware selection gate + brighten + size boost)
│   ├── FieldScene.tsx                      (MODIFY — surface new uniforms to material)
│   ├── FieldCanvas.tsx                     (no change)
│   ├── field-loop-clock.ts                 (no change)
│   └── field-anchor-projector.ts           (no change — projectPointSourceVertex stays DOM-only)
├── scene/
│   ├── visual-presets.ts                   (MODIFY — extend FieldShaderPreset with per-category selection floors + boost + baseline values)
│   └── accent-palette.ts                   (no change)
├── scroll/
│   ├── chapters/
│   │   ├── landing-blob-chapter.ts         (MODIFY — timelines drive per-category selection floors + higher wrapperScale peaks per Codex-revised table)
│   │   └── landing-stream-chapter.ts       (no change)
│   ├── field-chapter-timeline.ts           (no change)
│   ├── field-scroll-state.ts               (no change)
│   └── ...                                 (no change)
└── surfaces/
    └── FieldLandingPage/
        ├── FieldLandingPage.tsx            (MODIFY — Phase A1 swaps FieldSequenceSection for FieldStoryChapter on sequence key with info-7/8/9 beats + mounts FieldModuleInModule inside info-9; Phase A3 mounts <FieldConnectionLayer/>, retires FieldConnectionOverlay)
        ├── FieldSequenceSection.tsx        (DELETE at Phase A1 — replaced by FieldStoryChapter with new sequenceBeats)
        ├── FieldConnectionOverlay.tsx      (DELETE at Phase A3 — replaced by FieldConnectionLayer)
        ├── field-connection-pairs.ts       (DELETE at Phase A3 — replaced by field-lit-particle-indices.ts)
        ├── FieldConnectionLayer.tsx        (NEW — Phase A3 — R3F <Line> under blob.model, CPU-recomputed endpoints)
        ├── FieldCategoryLabelPool.tsx      (NEW — Phase A2 — generalized hotspot pool for paper/entity label DOM anchors)
        ├── FieldModuleInModule.tsx         (NEW — Phase A1 — ~120-line stage-level pool for the info-9 embedded mini-module: projects step cards pinned to focus entity particle positions via the same mechanism FieldHotspotPool uses; reads info-9 sub-progress to rotate active step + focus entity)
        ├── field-lit-particle-indices.ts   (NEW — Phase A2/A3 — authored index arrays: paper indices, entity indices, edge endpoint pairs, info-8 focus-entity index, info-9 per-step focus indices + their member paper sets)
        ├── field-landing-content.ts        (MODIFY — Phase A1 adds fieldSequenceBeats (info-7/8/9) paralleling fieldStoryOneBeats and fieldStoryTwoBeats, plus sequenceInfoNineSteps authoring array)
        └── FieldHero…FieldStoryProgress    (no change — all other existing landing sections untouched)
```

**Four new files total** (`FieldConnectionLayer`, `FieldCategoryLabelPool`,
`FieldModuleInModule`, `field-lit-particle-indices`), **six files modified**
(`field-shaders.ts`, `visual-presets.ts`, `BlobController.ts`,
`FieldScene.tsx`, `landing-blob-chapter.ts`, `field-landing-content.ts`,
`FieldLandingPage.tsx`), and **three deletions** (`FieldSequenceSection.tsx`,
`FieldConnectionOverlay.tsx`, `field-connection-pairs.ts`). No restructuring
of the existing field-runtime package layout. No new deps (drei already
provides `<Line>`; no Nano Banana asset unless Plan B is chosen).

### Sequence restructure (Phase A1)

`FieldSequenceSection` currently renders three synthesis cards in a grid —
inconsistent with how Stories 1 and 3 render their 01/02/03 beats (each beat
is its own full-height scroll chapter with the shared `FieldStoryProgress`
rail on the left). Sequence restructures to match: three scroll beats
(`info-7` Clusters / `info-8` Living Knowledge / `info-9` Educational
Modules), each with its own vertical airspace, each with its own
native-physics grammar per the Proposed Chapter Arc table. Mechanical
change is surgical:

1. Add `fieldSequenceBeats` to `field-landing-content.ts` (shape parallel
   to `fieldStoryOneBeats` / `fieldStoryTwoBeats` — id, title, body,
   variant).
2. In `FieldLandingPage.tsx` replace
   `<FieldSequenceSection section={sequenceSection} />` with
   `<FieldStoryChapter beats={fieldSequenceBeats} chapterKey="sequence" section={sequenceSection} />`.
3. Delete `FieldSequenceSection.tsx`.

`FieldStoryProgress`'s chapter-adapter wiring already supports the
`sequence` chapter key (see `FIELD_CHAPTER_SECTION_IDS` in
`scroll/chapter-adapters/types.ts`), so the beat rail lights up for Sequence
the same way it does for Stories 1 and 3 — no new plumbing. Blob chapter
timeline authoring extends naturally from the existing `sequenceTimeline`
in `landing-blob-chapter.ts`.

### Data flow per frame

```
scroll position
  → ScrollTrigger (field-scroll-state.ts, per-chapter progress 0..1)
  → FieldSceneState.chapters[sectionId].progress
  → landing-blob-chapter.ts resolves chapter targets (per-category
    selection floors, scale, amplitude, etc.)
  → FieldSceneState.items.blob exposed via FrameContext
  → BlobController.tick(context) drift-blends chapterState.* into
    material.uniforms.uPapersSelection/EntitiesSelection/RelationsSelection/EvidenceSelection, uSize,
    uAlpha, etc.
  → wrapper.scale lerped toward chapterState.wrapperScale
  → FieldConnectionLayer reads chapterState + particle indices,
    recomputes 24 endpoint positions via shader-mirror math,
    writes drei <Line> geometry
  → FieldCategoryLabelPool reads projected DOM coords from BlobController
    and writes label transforms
```

Single scene state, single scroll observer, single render loop. No new
subsystems — the plan extends existing seams.

### Contract boundaries

- **landing.md** (`docs/map/modules/landing.md`) — Module Zero
  authoring contract; Phase A5 rewrites the Phase 2 section from
  deferred visx overlays to shipped native-physics grammar.
- **SKILL.md** (`.claude/skills/module/SKILL.md`) — runtime architecture;
  no change required by Plan A (we're extending existing primitives, not
  introducing new runtime subsystems).
- **reference docs** under `.claude/skills/module/references/` — if Plan B
  is chosen, `image-particle-conformation.md` + `object-formation-surface.md`
  are authoritative; Plan A alone touches none.

---

## Bridge to Cosmograph 2D

The landing ↔ graph bridge today is **navigation + warm handoff**, not
visual continuity. Plan A preserves that boundary — Field and Cosmograph
are independent renderers sharing only design tokens and the graph bundle
asset.

### Current bridge (unchanged by Plan A)

```
apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx
  │
  │ bundle: GraphBundle | null                   ← passed in from page.tsx
  │ useGraphWarmup(bundle)                       ← warms DuckDB + graph
  │   → status: "idle" | "warming" | "ready"
  │   → graphReady boolean drives CTA button state
  │
  ↓  on CTA click (graphReady ? router.push("/graph") : no-op)
  ↓
apps/web/app/graph/page.tsx → Cosmograph shell + DuckDB + graph bundle
```

Three mechanisms already plumbed:

1. **Warm handoff**: `useGraphWarmup(bundle)` (in
   `features/graph/hooks/use-graph-warmup`) fetches + prepares the graph
   bundle during landing idle. By the time the user reaches CTA, the graph
   is typically ready — navigation to `/graph` is near-instant.
2. **CTA gate**: the CTA button is disabled with "Graph still warming"
   until warmup completes, then unlocks to "Enter."
3. **Shared design tokens**: both runtimes read the same CSS variables
   (`--color-soft-blue`, `--color-soft-lavender`, `--color-golden-yellow`,
   `--color-teal`, `--graph-bg`, `--graph-panel-text`, etc. in
   `apps/web/app/styles/tokens.css`). So the palette + light/dark
   behavior carries cleanly across the route boundary without any shared
   runtime code.

### Plan A doesn't change the bridge — it strengthens it

The native-physics storytelling makes the promise the graph fulfills more
legible. Before Plan A: landing shows particles that look loosely graph-ish.
After Plan A: landing shows particles that ARE categorized papers,
entities, and relations with drawn edges — same taxonomy Cosmograph
renders, stated in the same visual language. The reader arrives at `/graph`
having already been told the graph's grammar.

### Optional bridge extensions (out of Plan A scope, noted for future)

These are **not in Plan A** but are the natural next steps if we want
tighter visual continuity later:

1. **Scope-bridge via URL param**
   On CTA click, pass the Story 2 entity label set as a `scope=` query
   param. `/graph` can initialize its Cosmograph camera filtered to those
   entities so the first frame the reader sees on the graph is the same
   set they just saw lit on the landing. Needs a Cosmograph-side handler,
   which the graph runtime already supports via its focus/scope state.
2. **Route transition**
   Next 16's View Transitions API (supported in Next 16.1) can crossfade
   between the blob and Cosmograph's opening frame during the
   `router.push("/graph")` transition. Requires a shared transition-name
   element on both pages. Non-trivial but supported natively — no new
   runtime.
3. **Pre-render first Cosmograph frame during Sequence**
   Warm the Cosmograph canvas off-screen at Sequence chapter progress > 0.7
   so the first frame is already painted when /graph loads. Requires a
   hidden WebGL context. Moderate complexity; delivers near-zero
   navigation flash.

### What does NOT cross the runtime boundary

- **No shared geometry.** Field's point cloud is 16k THREE.js points.
  Cosmograph's graph is N nodes + M edges in its own WebGL context. They
  never touch.
- **No shared scene state.** `FieldSceneState` (chapter progress,
  per-category selection floors, blob scroll state) stays inside the field runtime. `/graph`
  reads its own graph bundle state from DuckDB and Cosmograph's stores.
- **No shared camera.** Field has a fixed THREE camera at
  `(0, 0, 400)`. Cosmograph manages its own 2D camera.
- **Nano Banana Pro assets** (Plan B only) go in `apps/web/public/field/` as
  bitmap assets. They're consumed exclusively by `createImagePointGeometry`
  on the field side — Cosmograph doesn't know they exist.

This split is deliberate: the landing tells the graph's story, Cosmograph
renders the graph itself. Coupling them runtime-to-runtime would invite
shell-forking regressions that the SKILL contract specifically forbids.

---

## Review Notes — Codex Critique (folded in)

Codex rescue reviewed the Plan A v1 draft against live source. Headline:
plan direction is sound, but several load-bearing numbers and two mechanism
claims were wrong. Corrections below are authoritative — the prose above
has NOT been rewritten yet to match; this section supersedes any conflict
with it until implementation.

### R1. Shader brighten direction — minor wording fix

Proposed `smoothstep(0.0, bucketFloor, bucketFloor - aSelection)` is
**not center-peaked of the surviving band** as the plan's prose said. It
is monotonically strongest at `aSelection = 0` (deepest survivors) and
falls to 0 at the cull edge. That's fine narratively — "most-selected
particles are brightest" — but the plan text needs to match. Perf risk is
low; blob hot-path already runs 5-octave FBM + simplex drift per vertex
(`field-shaders.ts:210-242`). Four-way bucket branch adds nothing.

### R2. Edge endpoint tracking — ship CPU recompute, not R3F children

Plan v1 suggested mounting `<Line>` under `blob.model` so scale/rotation
inherit, accepting that per-particle shader displacement wouldn't.
Codex rejects: for 6-12 edges (24 endpoints) the mismatch between
edge-rigid endpoints and visibly-jittering neighbors will read as broken.
Per-frame CPU recomputation of the shader's displacement for 24 endpoint
indices is negligible against 16k vertex shader workload. Ship that.

Also correct a plan mistake: `projectPointSourceVertex`
(`field-anchor-projector.ts:126-172`) returns **CSS-pixel screen
coordinates** for DOM overlays and culls back-facing/out-of-viewport
points. It **cannot** directly drive R3F `<Line>` endpoints, which need
world-space positions. We'll need a sibling helper — e.g.,
`recomputeDisplacedLocalPosition(index, uTime)` — that runs the same
`aPosition + aMove * aSpeed * snoise_1_2(...)` math the vertex shader
uses (`field-shaders.ts:238-242`) and returns a local-space Vector3 ready
for `<Line>` geometry inside `blob.model`.

### R3. Zoom magnitude — plan's peaks were catastrophic

Camera is `fov=45, z=400` (`FieldCanvas.tsx:53-56`). Blob
`sourceHeight ≈ 2` (radius-1 sphere, `field-geometry.ts:78-92`). Vertical
`sceneUnits ≈ 331`. Desktop `sceneScale = 0.75`. Effective blob screen
diameter ≈ `2 × sceneUnits × sceneScale × wrapperScale`:

| wrapperScale | Screen diameter (desktop) | % of ~1000-tall viewport |
|---|---|---|
| 1.0 | 248 px | 25% |
| 1.72 (today's Story 1 peak) | 427 px | 43% |
| 2.0 | 497 px | 50% |
| 2.5 | 621 px | 62% |
| 3.0 | 746 px | 75% |

Codex: "Scales 2.5 and 3.0 are not mild risks — they are guaranteed heavy
viewport crop on desktop, catastrophic on mobile."
`frustumCulled={false}` (`FieldScene.tsx:85`) avoids object culling, not
off-screen loss.

**Revised zoom escalation** (conservative; authoritative — supersedes the
earlier table):

| Chapter / Beat | wrapperScale (revised) | Notes |
|---|---|---|
| Hero | 1.00 | unchanged |
| Surface Rail | 1.00 → 1.10 | unchanged |
| Story 1 Papers (info-1/2/3) | 1.10 → **1.70** | hold today's peak; add paper lighting + labels instead of pushing scale |
| Story 2 Entities | **1.70 → 1.90** | modest escalation; entity layer is the new element, not more zoom |
| Story 3 Connections (info-4/5/6) | **1.90 → 2.10** | ceiling — edges need room but 2.1 is safe |
| Sequence ► info-7 Clusters | 2.10 (hold) | *(v1 plan suggested color-tinting; user rejected as "literal buckets." See Proposed Chapter Arc for the revised emergent-neighborhoods approach.)* |
| Sequence ► info-8 Living Knowledge | **2.10 → 2.00** | spotlight one entity; subtle pullback focuses attention |
| Sequence ► info-9 Educational Modules | **2.00 → 1.80** | partial pullback; cascade animation benefits from slightly wider view |
| Mobile Carry | 1.80 → 1.20 | contract |
| CTA | 1.20 → 1.00 | bookend |

Mobile should cap earlier — propose a mobile peak of **1.6** across the
whole arc, inherited by preset override (matches the existing `sizeMobile`
/ `alphaMobile` pattern — note caveat R6).

If we want "see deeper" more than 2.1 gives us, the right levers are
**`uSize`** (make surviving points bigger) and **`uAmplitude`** (spread
within-cloud, not whole-cloud). Those don't exit the frustum.

### R4. Bucket distribution math — blob is 16k, not 50k

The Plan v1 math was 3x overstated. The blob is `16384` points
(`point-source-registry.ts:23,114`). Corrected survival counts at the
proposed floors:

| Bucket | Share | Base count | Floor | Lit count |
|---|---|---|---|---|
| paper | 10% | ~1638 | 0.1 | **~164** |
| entity | 12% | ~1966 | 0.12 | **~236** |
| relation | 8% | ~1311 | 0.08 | **~105** |
| evidence | 70% | ~11467 | 0.3 ambient | ~3440 (soft background) |

~164 lit paper particles is borderline-readable as "many papers," not
"individual papers." Options: (a) accept it and lean on labels to pick
out specific papers; (b) tighten floor to 0.05 for ~82 paper survivors;
(c) add a second `uBucketPapersDensity` uniform as a within-bucket
thinner (Codex: this is art-control, not mathematical fix — bucketFloor
already thins within-bucket).

Recommend: (a) at floor 0.08 → ~131 lit papers. Tune live.

### R5. Phasing — ship shader + buckets + zoom alone FIRST

Codex: edges and labels add independent risks (endpoint motion parity,
anchor projection density) that do NOT help determine the zoom ceiling.
Validate the aesthetic before layering more. Revised sequencing is in
the Sequencing section above.

### R6. Small factual corrections

- **Blob point count**: `16384`, not `~50k`. All downstream density
  discussions in this plan should use 16384.
- **`alphaMobile`**: BlobController uses `sizeMobile` but never reads
  `alphaMobile` (`BlobController.ts:196-205`). Stream and
  objectFormation do. If we want mobile-specific blob alpha, the plan
  needs a preset/controller extension, not "inherit existing pattern."
- **Mobile zoom ceiling**: explicit preset override, not assumed
  inheritance.

### R7. Missing levers — `aStreamFreq` + `aRandomness` are dead on blob

Codex flags two per-bucket motion levers that are **baked but inert**
on the blob today:

- `aStreamFreq` is bucket-specific
  (`field-attribute-baker.ts:169-174`) but inert because `uStream = 0`
  on blob preset (`visual-presets.ts:163-169`;
  `field-shaders.ts:223-224`).
- `aRandomness` is also inert on blob — only activates inside
  `if (uStream > 0.0)` (`field-shaders.ts:244-263`).

These are **live levers for per-bucket motion signatures** (papers
drift slow, entities drift faster, relations pulse) with no shader
surgery — preset changes only. Adds to Phase A5 as an optional layer.

### R8. Overall verdict

Plan A's direction is sound. Implement it in the revised phasing with
the corrected zoom values and bucket math. The core user-asked
experience (particles light up, expand to mean something, buckets
carry categories) sits entirely in Phase A1 and should validate or
reject the aesthetic before anything else is added.

**Codex did NOT review Plan B (image conformation options).** If the
user selects B3 (CTA formation ending) or B1 (Story 3 conformation),
hand that variant back to Codex for a second pass before
implementation.

---

## Alternative B — Image Conformation (Maze PCB pattern)

User flagged this as a live option: "i'm also open to implementing something
like mazehq where they used a base image and had particle embed into that — we
can generate the images with nanobanana pro, just something else to consider."

Maze's actual homepage uses a `pcb.png` bitmap as the CTA ending pattern —
particles converge into the shape of a circuit-board illustration
(`data-gfx="pcb"` on `#section-cta`, `index.html:1067`). This is an **authored
formation ending**, not a bookend return. The mechanism is already supported
in SoleMD:

- `ObjectFormationController` exists in
  `apps/web/features/field/controller/ObjectFormationController.ts`.
- `createImagePointGeometry` in `asset/image-point-source.ts` builds particle
  geometry from a bitmap.
- `visualPresets.objectFormation` is defined (`visual-presets.ts:215-260`)
  but `objectFormation` is "not an active landing-stage controller" per
  `landing.md:289-291`.
- Reference contract: `.claude/skills/module/references/image-particle-conformation.md`
  (required read before adding any bitmap-derived particle layer).
- Reference contract: `.claude/skills/module/references/object-formation-surface.md`
  (rebuild recipe including the two current user-locked deviations).

### Why this is on the table

The user's principle — motion means something, expansion is affordance — has a
second natural reading: particles don't just spread to make room, they
**reorganize to become meaning**. A graph-shaped particle cloud IS the graph,
not a point cloud with edges drawn over it. The physics carry the meaning more
directly.

### Candidate insertion points

**B1. Story 3 as the conformation moment.**
Story 3's "The pattern appears" beat is the natural place. Particles conform
from a sphere blob into a stylized graph-shape illustration (nodes + edges
drawn by particle density), hold for the chapter, then release back to blob
for Sequence / Mobile Carry / CTA.

- Pros: dramatic payoff for Story 3's "connections" theme; no need for drei
  `<Line>` primitives; image generation carries all the content authoring.
- Cons: Sequence would then have to either (a) release back to blob or (b)
  conform into a *second* image (synthesis shape). Neither is free — (a) means
  Sequence is a quieter chapter; (b) means two image assets.
- Asset generation: Nano Banana Pro generates a ~1k×1k high-contrast line-art
  illustration of a small biomedical graph (delirium / lithium / QT /
  haloperidol cluster). Points are sampled from dark pixels via
  `createImagePointGeometry`.

**B2. Sequence as the conformation moment.**
Story 1/2/3 stay as native-physics per-category lighting + zoom per Plan A. At Sequence,
particles conform into a "synthesis shape" (three cluster blobs with soft
enclosures drawn in the illustration, or a stylized emergent-structure
image). Holds through Sequence. Releases through Mobile Carry back to blob.

- Pros: synthesis chapter earns the shape change; Story 3 can still use
  native `<Line>` edges, keeping both mechanisms.
- Cons: highest complexity — every mechanism is live.

**B3. CTA as a new ending pattern (break the bookend).**
Swap the locked `bookend return` ending for `authored formation`. Particles
conform into a final "you're in the graph" shape (brain / connectome / SoleMD
logo) at CTA instead of returning to the opening blob.

- Pros: highest narrative impact; mirrors Maze's own PCB ending exactly.
- Cons: requires updating `landing.md` Module Identity "Ending pattern" and
  the locked global deviation. Needs explicit user sign-off.

### Cost model

| Option | Code delta | Asset work | Mechanism complexity |
|---|---|---|---|
| Plan A (per-category lighting + edges) | shader ext, new uniforms, drei Line, timelines | — | reuses hotspot projection, adds line layer |
| B1 (Story 3 conformation) | activate objectFormation controller, add transition, drop drei Line | 1 image (graph illustration, ~1k×1k) | add blob→image→blob transition |
| B2 (Sequence conformation + Plan A) | all of Plan A + B1 | 1 image (synthesis shape) | highest |
| B3 (CTA formation ending) | smallest — activate objectFormation at CTA, retire blob-bookend tween | 1 image (ending shape) | lowest if we accept ending-pattern change |

### Recommendation

Decision belongs to user. If I had to pick one:

1. **B3 + Plan A** — keep Plan A's native-physics storytelling through Stories
   1/2/3/Sequence, and use image conformation at CTA as the authored-formation
   ending. This honors "motion means something" on the story chapters (expansion
   as affordance) AND on the ending (particles resolve into meaning, not just
   shrink back). Lowest asset burden (one image), lowest mechanism complexity,
   highest narrative payoff at the end. Requires updating `landing.md` ending
   pattern and the locked deviation.

2. **B1 alone** — drop the brighten + edges work and make Story 3 the
   conformation moment. Simplest all-around; fewer new mechanisms to maintain.
   Risk: Story 1 / Story 2 need their own storytelling beats, and if they stay
   as "slight zoom + copy" the arc may feel flat before Story 3's drama.

3. **Plan A alone** — stay with per-category lighting + edges, no images.
   Works if user wants to keep bookend return locked.

Deferring until user picks direction. Codex review currently targeting Plan A;
if user selects B3 or B1, I'll hand the chosen plan back to Codex for a second
pass before implementation.
