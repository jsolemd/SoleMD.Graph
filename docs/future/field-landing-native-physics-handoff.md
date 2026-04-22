# Field Landing — Native-Physics Phase A1 Build Handoff

> Copy-paste into a new context. Use `/team` to split the three workstreams
> below (Stream 1 / Stream 2 / Stream 3) across parallel agents; Phase A1
> coordinator integrates, runs a visible-Chrome tune, typechecks, lints.
>
> **Full plan**: `docs/future/field-landing-native-physics.md`
> **Module contract**: `docs/map/modules/landing.md`
> **Runtime skill**: `.claude/skills/module/SKILL.md`
> **Baseline commit**: `f99bee2` (Landing Module Zero storyboard + Phase 1.5 cleanups)

---

## Intended End State — ASCII

### Scroll arc / chapter states

```
           ┌────────────────────────────────────────────────────────┐
SCROLL ↓   │                     END STATE                          │
─────────  │                                                        │
           │  Hero                      wrapperScale 1.00           │
  0        │  ● tight living substrate                              │
           │     no emphasis, no labels, slow idle spin             │
           ├────────────────────────────────────────────────────────┤
           │  Surface Rail              wrapperScale 1.00 → 1.10    │
  +        │  ● slight swell                                        │
           │     4 zoom labels: Papers/Entities/Connections/Syn     │
           ├────────────────────────────────────────────────────────┤
           │  Story 1 — Papers          wrapperScale 1.10 → 1.70    │
           │  info-1 "Papers emerge"      ○ ○ ○ ← papers brighten   │
  ++       │  info-2 "Context narrows"      ○ ○   + larger          │
           │  info-3 "Ready to connect"     ○ ○ ○ ← 10 labels drift │
           │  [FieldStoryProgress rail 01 02 03, left side]         │
           ├────────────────────────────────────────────────────────┤
           │  Story 2 — Entities        wrapperScale 1.70 → 1.90    │
  +++      │  ⊙ ⊙ ⊙  ← 7 entities brighter & larger, labeled        │
           │  ○ ○ ○    papers soft ambient                          │
           ├────────────────────────────────────────────────────────┤
           │  Story 3 — Connections     wrapperScale 1.90 → 2.10    │
           │  info-4 "Edges begin"     ⊙──⊙                         │
  ++++     │  info-5 "Bridges form"    ⊙──⊙──⊙──⊙                   │
           │  info-6 "Pattern appears" ⊙══⊙══⊙══⊙══⊙                │
           │  [6-12 native <Line> edges stroke-draw]                │
           │  [FieldStoryProgress rail 01 02 03, left side]         │
           ├────────────────────────────────────────────────────────┤
           │  Sequence                                              │
           │  info-7 "Clusters"          wrapperScale 2.10 hold     │
           │    ☁ ☁ ☁ emergent neighborhoods                        │
           │           (brightness + motion coherence,              │
           │            NO color segments, NO buckets)              │
           │                                                        │
  +++++    │  info-8 "Living Knowledge"  2.10 → 2.00                │
           │    ⊙★ ← single entity spotlighted + label              │
           │           member papers softly persist as context      │
           │                                                        │
           │  info-9 "Educational Modules"  2.00 → 1.80             │
           │   ┌──────────────────────┐                             │
           │   │ Step N               │ ← teaching card floats      │
           │   │ heading + body       │   pinned to projected focus │
           │   │ 1-2 sentences        │   entity particle position, │
           │   └──╲───────────────────┘   stage-level DOM (z-6),    │
           │      ╲                       same mechanism as         │
           │       ⊙★  ← focus entity     FieldHotspotPool cards.   │
           │       │   at this step       Scroll through info-9     │
           │       │                      drives step index 1/2/3,  │
           │       │                      card follows the lit node.│
           │  [FieldStoryProgress rail 01 02 03, left side]         │
           ├────────────────────────────────────────────────────────┤
           │  Mobile Carry               wrapperScale 1.80 → 1.20   │
  ++++     │  ● contracting, lighting returns to uniform            │
           ├────────────────────────────────────────────────────────┤
           │  CTA — Open the graph      wrapperScale 1.20 → 1.00    │
  +        │  ● bookend: same tight blob we opened on               │
           │     [single centered "Enter" button]                   │
           └────────────────────────────────────────────────────────┘
```

### Runtime stack / z-layers

```
Z-INDEX  LAYER                          OWNED BY
─────────────────────────────────────────────────────────────
  10     Main scrolling <main>          FieldLandingShellContent
         ├─ Hero / Rail / Story 1/2/3    (section copy + progress
         │  Sequence (info-7/8/9)         rails + FieldModuleIn
         │  Mobile Carry / CTA            Module DOM inside info-9)

   6     Stage overlay                  FieldHotspotPool +
         ├─ hotspot DOM pool            FieldCategoryLabelPool
         ├─ paper labels (Story 1)      (projection from
         ├─ entity labels (Story 2       particle positions,
         │  + info-8 focus + info-9)     DOM anchors, no click)

   3     (vacant — formerly visx;       (open slot)
          now unused)

   1     Vignette placeholder           (transparent)

   0     FieldCanvas (R3F stage)        FieldScene
         ├─ blob.model                  BlobController
         │  ├─ THREE.Points(16384)      (drift-blend per-frame
         │  │  ShaderMaterial            uniform writes)
         │  │  uniforms:                 field-shaders.ts
         │  │   uPapersSelection          (category-aware
         │  │   uEntitiesSelection         selection + brighten
         │  │   uRelationsSelection        + size boost)
         │  │   uEvidenceSelection
         │  │   uSelectionBoostColor
         │  │   uSelectionBoostSize
         │  │   uSize, uAlpha, uTime, ...
         │  └─ <Line> children          FieldConnectionLayer
         │     (6-12 edges,              (Phase A3 only; A1 omits)
         │      CPU-recomputed
         │      endpoints,
         │      stroke-draw)
         └─ PerspectiveCamera (fixed z=400, fov=45)
```

### Per-frame data flow

```
           scroll position
                │
                ▼
    ┌────────────────────────────────┐
    │  ScrollTrigger                 │  field-scroll-state.ts
    │  per-chapter progress 0..1     │
    └──────────────┬─────────────────┘
                   ▼
    ┌────────────────────────────────┐
    │  FieldSceneState               │  scene/visual-presets.ts
    │   .chapters[sectionId].progress│
    │   .items.blob.{vis,prog,emp}   │
    │   .sequenceFocusStep  ← NEW    │
    └──────────────┬─────────────────┘
                   ▼
    ┌────────────────────────────────┐
    │  landing-blob-chapter.ts       │
    │  resolves chapter targets:     │
    │   wrapperScale                 │
    │   papers/entities/relations/   │
    │     evidenceSelection (floors) │
    │   selectionBoostColor / Size   │
    │   focusIndex (info-8)          │
    │   focusStep (info-9)           │
    └──────────────┬─────────────────┘
                   ▼
    ┌────────────────────────────────┐
    │  BlobController.tick(context)  │
    │  drift-blends chapter targets  │
    │  into material.uniforms        │
    │  writes wrapper.scale          │
    └──────┬─────────────────┬───────┘
           ▼                 ▼
  ┌──────────────┐   ┌──────────────────────┐
  │  GLSL shader │   │  FieldModuleInModule │
  │  per-particle│   │  reads info-9 progress│
  │  lighting    │   │  → active step index  │
  │  (category-  │   │  → renders step DOM   │
  │   aware)     │   │  → writes sequence-   │
  │              │   │    FocusStep back     │
  └──────┬───────┘   └──────────────────────┘
         ▼
  ┌──────────────┐
  │  Canvas      │
  │  16k points, │
  │  specific    │
  │  category    │
  │  brightened  │
  └──────────────┘
```

---

## TL;DR

Phase 2 originally shipped an SVG/visx overlay on top of the particle field.
User rejected as "not native enough to the physics." Phase A1 (this handoff)
rebuilds the four story chapters as **native-physics storytelling inside
the WebGL blob**: progressive zoom escalation creates airspace, per-category
selection uniforms brighten paper/entity/relation particles in their chapter,
and Sequence is restructured from a grid of three cards into three scroll
beats (parallel to Stories 1 and 3) with info-9 as an embedded "module in
the module" mini-walkthrough. Phase A2 (labels) and A3 (native edges via
drei `<Line>`) layer on top after A1 validates the aesthetic in visible
Chrome.

Visx / SVG / overlay subsystems are **forbidden on the field surface**
going forward. Visx stays available for future panel-graph / chart surfaces
inside module shells.

---

## Read First (in order)

1. `docs/future/field-landing-native-physics.md` — full plan, authoritative.
   Read §Thesis, §Proposed Chapter Arc, §Review Notes (Codex critique —
   non-negotiable corrections), §Technical Deliverables, §Architecture +
   Folder Layout.
2. `docs/map/modules/landing.md` — Module Zero contract. Sequence is now
   three scroll beats (info-7 Clusters / info-8 Living Knowledge /
   info-9 Educational Modules); Stage Manifest table + overlay list
   update in Phase A5.
3. `.claude/skills/module/SKILL.md` — runtime architecture; §Canonical
   Particle Parity Rules and §Non-Negotiables apply.
4. Memory entries that must be honored:
   - `feedback_native_over_overlay.md`
   - `feedback_landing_native_physics.md`
   - `feedback_foundational_plans_need_deep_recon.md`
   - `feedback_codex_review_for_foundation_plans.md`

---

## Approved Decisions (locked)

- **Plan A alone** — native physics through all eight chapters. No image
  conformation (Plan B variants B1/B2/B3 shelved). Bookend-return ending
  pattern stays locked.
- **Zoom ceiling 2.10** at Story 3 peak. Codex-revised escalation:
  1.70 / 1.90 / 2.10 across Story 1/2/3. Mobile cap ~1.6 via explicit
  preset override.
- **No visual "buckets"** — per-category selection must read as subset
  emphasis inside one living cloud, never as color-segmented groups.
  Uniform names: `uPapersSelection / uEntitiesSelection /
  uRelationsSelection / uEvidenceSelection`.
- **Sequence → 3 scroll beats** (info-7/8/9) paralleling Stories 1 and 3.
  Grid-of-3-cards retired.
- **info-9 is a module-in-the-module, integrated into the particles** —
  pre-authored 3-step embedded walkthrough. Step DOM is **stage-level**
  (z-6, sibling of `FieldHotspotPool`), **pinned to the projected
  position of the active step's focus entity particle** — same mechanism
  hotspot cards already use in Story 1, same pattern Maze uses for its
  stream popups. Step card is NOT a stacked in-flow DOM block. info-9's
  section owns the vertical scroll space but renders thin DOM; scroll
  progress inside info-9 drives step index 1/2/3, which rotates focus
  entity and swaps the visible step card. Reader sees a teaching card
  appear next to the lit particle, not next to a sidebar.
- **Phasing**: ship Phase A1 alone first. Validate under visible Chrome.
  Phase A2 (labels) and A3 (native `<Line>` edges) layer on after.

---

## Current State (Baseline)

Working tree matches commit `f99bee2`. The landing page renders today's
shipped state: blob + hotspot pool + FieldConnectionOverlay + all eight
chapters. No visx overlay. Sequence still renders as FieldSequenceSection
grid of three cards (changes in Phase A1 Stream 3).

Verify before starting:
```bash
git rev-parse HEAD          # should be f99bee2 or a descendant
git status                  # should be clean for apps/web/features/field/
npm run typecheck           # must pass
npm run dev                 # http://localhost:3000 should render landing
```

---

## Phase A1 Scope

Five deliverables:

1. **Shader extension** — category-aware selection gate + brighten +
   size boost (4 new floor uniforms + 2 new boost uniforms + `aBucket`
   attribute binding).
2. **Preset + chapter state extension** — new `FieldShaderPreset` fields;
   extend `FieldSceneState` with a `sequenceFocusStep` field.
3. **Chapter timeline authoring** — `landing-blob-chapter.ts` drives the
   new per-category floors + boost params + revised `wrapperScale` peaks
   across every chapter.
4. **Sequence restructure** — swap `FieldSequenceSection` (grid of cards)
   for `FieldStoryChapter` on the `sequence` chapter key with three new
   beats `info-7 / info-8 / info-9`.
5. **info-9 module-in-module** — new `FieldModuleInModule` component
   renders the three-step embedded walkthrough and writes
   `sequenceFocusStep` back to scene state based on scroll position
   inside info-9.

**Not in A1** (defer to A2/A3):
- Paper/entity labels via `FieldCategoryLabelPool`. Stories 1 and 2 read
  with just the per-category brighten until labels arrive.
- Native `<Line>` edges via `FieldConnectionLayer`. Story 3 keeps the
  existing `FieldConnectionOverlay` until A3; info-9's Step 2/3 edge
  draws come in A3 (A1 describes them in content but doesn't render).

---

## Phase A1 Workstreams (for `/team`)

Three parallel streams + a coordinator. Streams 2 and 3 depend on the
contracts Stream 1 declares — but those contracts are small and can be
published up front so all three can progress in parallel.

### Stream 1 — Shader + Preset Infrastructure

**Files owned (write):**
- `apps/web/features/field/renderer/field-shaders.ts`
- `apps/web/features/field/renderer/FieldScene.tsx` (uniform bindings only)
- `apps/web/features/field/scene/visual-presets.ts` (`FieldShaderPreset`
  type + preset defaults)

**Deliverables:**
1. Extend vertex shader with category-aware selection floor lookup +
   brighten + size boost per plan §Technical Deliverables §1. Keep the
   Maze-style `if (aSelection > floor) vAlpha = 0.0;` cull grammar, add
   the `else` branch with `smoothstep(0.0, floor, floor - aSelection)`
   boost (monotonic strongest at deepest-survivors, zero at cull edge —
   per Codex R1).
2. Bind `aBucket` as `attribute float` in the shader (already baked on
   geometry via `field-attribute-baker.ts:174`, just not yet consumed).
3. Add six new uniforms to `FieldShaderPreset` + material creation:
   `papersSelection`, `entitiesSelection`, `relationsSelection`,
   `evidenceSelection`, `selectionBoostColor`, `selectionBoostSize`.
4. Defaults: all four category floors = 1.0, boost color = [1,1,1],
   boost size = 1.0 — no visual change until Stream 2 drives them.
5. Verify existing Maze-parity dim-rest grammar still works at default
   uniform values (i.e., `uSelection` path unchanged for blob's hotspots
   beat at `uSelection = 0.3`).

**Contract published (other streams consume):**
- Uniform names, preset field names, chapter-state interface stub:
  ```ts
  interface BlobChapterState {
    // existing: selection, amplitude, depth, frequency, alpha, ...
    papersSelection: number;        // 0..1
    entitiesSelection: number;
    relationsSelection: number;
    evidenceSelection: number;
    selectionBoostColor: [number, number, number];
    selectionBoostSize: number;
  }
  ```

**Done when:** typecheck + lint pass; `npm run dev` renders the
landing with baseline uniforms (no visible change from today); DevTools
shows the new uniforms on the blob material with default values.

### Stream 2 — Chapter Timelines + Controller Wiring

**Files owned (write):**
- `apps/web/features/field/controller/BlobController.ts`
- `apps/web/features/field/scroll/chapters/landing-blob-chapter.ts`
- `apps/web/features/field/scene/visual-presets.ts` (add
  `sequenceFocusStep` to `FieldSceneState` — coordinate with Stream 1)

**Deliverables:**
1. Extend `BlobController.tick()` to drift-blend the six new uniforms
   (four floors + two boost) from `chapterState.*` each frame — mirror
   the existing `uSelection` pattern at `BlobController.ts:217-218`.
   Drift-blend constant stays at existing `DECAY.standard`.
2. Extend chapter-state resolver in `landing-blob-chapter.ts` to produce
   per-chapter targets for the new fields. See plan §Technical
   Deliverables §3 for concrete values per chapter. Summary:
   - Hero / Surface Rail: all floors = 1, boost = 1 (no change).
   - Story 1: `papersSelection` 1 → 0.1 across entrance; ambient ~0.6
     through later chapters. `selectionBoostSize` 1 → 1.6.
   - Story 2: `entitiesSelection` 1 → 0.12 across entrance; ambient 0.6
     thereafter.
   - Story 3: `relationsSelection` 1 → 0.08 across entrance.
   - `evidenceSelection` held at 0.3 ambient through all story chapters.
   - Sequence info-7: all floors ambient — no category foregrounded.
     Drive the info-7 "emergent clusters" effect via one of the three
     Phase A1 options (pick one; document the pick in the plan doc):
     (a) amplify existing FBM noise regions via a new
         `uClusterEmergence` uniform that modulates fragment brightness
         spatially; (b) spatial sine modulation keyed to `aPosition`;
         (c) phase coupling via `aIndex` modulo. Try (a) first — it
         reuses the FBM pass the shader already runs.
   - Sequence info-8: new `uFocusEntityIndex: int` + `uFocusMembers[N]`
     + `uFocusActive: float` uniforms in Stream 1's deliverable (add in
     this extension) so one pre-authored entity survives at max boost
     regardless of `aSelection`, plus its member papers at softer boost.
   - Sequence info-9: same `uFocusEntityIndex` mechanism but the index
     rotates across three values based on `sequenceFocusStep` from
     scene state. Write the resolver to read `sequenceFocusStep` and
     swap focus index mid-beat.
   - Mobile Carry / CTA: all floors back to 1, boost back to 1.
3. Update `wrapperScale` escalation in the timeline per Codex-revised
   table: Story 1 peak 1.70, Story 2 peak 1.90, Story 3 peak 2.10,
   Sequence info-7 hold 2.10 → info-8 2.00 → info-9 1.80, Mobile Carry
   1.80 → 1.20, CTA 1.20 → 1.00.
4. Add `sequenceFocusStep: 0 | 1 | 2 | 3` field to `FieldSceneState`
   (0 = inactive; 1/2/3 = active step index). Coordinate with Stream 3
   which writes it.
5. Reduced motion: all floors snap to 1, all boost factors snap to 1
   (cloud reads as uniform static substrate).
6. Mobile: wrapperScale cap 1.6 across the whole arc via explicit
   preset override (not via assuming `sizeMobile` / `alphaMobile`
   inheritance — Codex R6 flagged that `alphaMobile` isn't read by
   BlobController today).

**Contract consumed:** Stream 1's uniform names + preset fields.
**Contract published:** scene-state field `sequenceFocusStep` for
Stream 3.

**Done when:** typecheck + lint pass; scrolling through landing in
visible Chrome shows specific particles brightening + growing at the
right chapters; `wrapperScale` escalates smoothly to 2.10 at Story 3
peak; Sequence info-7/8/9 drive their respective per-category /
focus-index patterns.

### Stream 3 — Sequence Restructure + info-9 Module-in-Module

**Files owned (write):**
- `apps/web/features/field/surfaces/FieldLandingPage/field-landing-content.ts`
- `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx`
- `apps/web/features/field/surfaces/FieldLandingPage/FieldModuleInModule.tsx` (NEW)
- `apps/web/features/field/surfaces/FieldLandingPage/field-lit-particle-indices.ts` (NEW, info-9 scope only for A1)
- `apps/web/features/field/surfaces/FieldLandingPage/FieldSequenceSection.tsx` (DELETE after swap)

**Deliverables:**
1. Add `fieldSequenceBeats` to `field-landing-content.ts` paralleling
   `fieldStoryOneBeats` and `fieldStoryTwoBeats`. See "info-9 Content
   Draft" section below for the three beats' titles + bodies. Set
   `info-9.variant = "centered"` to match the Story 1/3 closing beat
   style.
2. Add `sequenceInfoNineSteps` array in the same file:
   ```ts
   export const sequenceInfoNineSteps = [
     { heading: "Start where the patient is",
       body: "…",
       focusEntityId: "catatonia",
       memberPaperIds: ["p4", "p7", "p10"],
       edges: [] },
     { heading: "Follow the bridges",
       body: "…",
       focusEntityId: "nms",
       memberPaperIds: ["p5"],
       edges: [{ from: "catatonia", to: "nms" },
               { from: "delirium",  to: "catatonia" }] },
     { heading: "Land on the lever",
       body: "…",
       focusEntityId: "catatonia",
       memberPaperIds: ["p10"],
       edges: [{ from: "catatonia", to: "p10" }] },
   ] as const;
   ```
3. Create `field-lit-particle-indices.ts` with the authored particle
   indices for info-9 step focus entities + member papers (deterministic
   index picks — e.g., `FOCUS_INDEX_CATATONIA = 4917`, authored once and
   stable). A2/A3 will extend this file with Story 1/2/3 indices; A1
   only needs info-9's set.
4. Create `FieldModuleInModule.tsx` (~120 lines — higher than earlier
   estimate now that it owns projected DOM cards):

   **Mount location**: stage-level, z-6, sibling of `FieldHotspotPool`,
   mounted inside `FieldLandingShellContent` next to the existing
   hotspot pool — NOT inside the scrolling `<main>`. This matches
   Maze's stream-popup architecture: DOM content integrated with the
   particle scene via projection, not stacked alongside it.

   **Responsibilities**:
   - Subscribes to the scene store (same pattern as `FieldStoryProgress`
     and `FieldConnectionOverlay`).
   - Reads info-9 sub-progress: find the beat DOM node via
     `document.getElementById("info-9")`, compute its progress
     relative to the viewport pivot (same math `FieldStoryProgress`
     uses per beat). Derive active step index from progress quartiles:
     0.0-0.33 = step 1, 0.33-0.66 = step 2, 0.66-1.0 = step 3.
     info-9 inactive → step = 0 (no card visible).
   - Writes `sequenceFocusStep` (0/1/2/3) to `FieldSceneState`, calls
     `sceneStore.notify()`.
   - Projects the active step's focus entity particle to screen coords
     via `projectPointSourceVertex` (same pipe `FieldHotspotPool` cards
     use — see `BlobController.projectHotspots` + `field-anchor-projector.ts`).
   - Renders three step cards (one per step), only the active one has
     `opacity > 0`. Each card:
     * Width ~320px, rounded corners, dark panel aesthetic matching
       hotspot cards (reuse the card style from `FieldHotspotPool` —
       do not introduce a new card primitive).
     * Contents: `<h3>` heading + `<p>` body from `sequenceInfoNineSteps[i]`.
     * Position: imperative `translate3d(x, y, 0)` writes each frame
       based on projected entity position. Offset the card ~24px to
       the right of the particle (or left, based on which side has
       more viewport room — mirror the card-placement logic from
       hotspot cards).
     * Fade: `opacity` tween ~250ms when step index changes. Inactive
       cards translate to `-9999px, -9999px` (same cull pattern
       hotspot cards use when their frame is invisible).
   - Accessibility: each card has a stable `id`, `role="region"`,
     `aria-label` set from step heading. `aria-hidden={step !== activeStep}`.

   **Why stage-level, not inside info-9's section flow**:
   Cards pinned to particle positions must be `position: fixed` (or
   equivalent absolute inside a fixed-viewport parent) to track the
   live-projected coordinates of the blob's particles as the blob
   rotates + the wrapper scales. In-flow DOM would misalign the moment
   the canvas rotates or scales. This is the same architectural
   reason `FieldHotspotPool` sits at stage level, not inside Story 1's
   section — per `.claude/skills/module/SKILL.md` §"Canonical Layer
   Ownership" and `docs/map/modules/landing.md` §"Landing stage
   overlays (pinned to the stage, Plane A)".

5. info-9 beat's DOM inside `FieldStoryChapter` is **thin**: just the
   beat id (`id="info-9"`) providing the scroll anchor for progress
   calculation. Rendering the beat's `title` + `body` inline is optional
   — since the card carries the teaching, the in-section copy can be
   minimal or omitted. Propose keeping a small scroll-cue caption
   ("Step through the module ↓") and letting the vertical space do the
   work. Total info-9 section height ~`180svh` so the reader has room
   to scroll through three-step transitions smoothly.

6. In `FieldLandingPage.tsx`, swap the Sequence render:
   ```tsx
   // BEFORE
   <FieldSequenceSection section={sequenceSection} />

   // AFTER
   <FieldStoryChapter
     beats={fieldSequenceBeats}
     chapterKey="sequence"
     section={sequenceSection}
   />
   ```
   AND at stage level (next to `<FieldHotspotPool />`):
   ```tsx
   <FieldModuleInModule />
   ```
   The card pool mounts ONCE at shell level; info-9's scroll progress
   is the signal that decides which card is visible and which entity
   it pins to.
7. Delete `FieldSequenceSection.tsx`.

**Contract consumed:** Stream 2's `sequenceFocusStep` field on scene
state + existing `fieldStoryOneBeats` / `FieldStoryChapter` primitives.
**Contract published:** `field-lit-particle-indices.ts` shape (for A2/A3
extension).

**Done when:** typecheck + lint pass; scrolling through Sequence in
visible Chrome shows three distinct full-height scroll beats with the
progress rail on the left cycling 01/02/03; scrolling through info-9
reveals the three step blocks one at a time; scene state's
`sequenceFocusStep` updates correctly per browser DevTools inspection.

### Coordinator

Responsible for:
- Publishing Stream 1's uniform/preset contract before Streams 2 and 3
  begin (paste the contract into a shared pinned message in the team
  channel).
- Integrating the three streams as they complete. Merge conflict
  surface is tiny — streams own disjoint files except for
  `visual-presets.ts` (coordinate shared field additions).
- Running `npm run typecheck` + `npm run lint` after each stream lands.
- Visible-Chrome tune pass after all three streams merge:
  1. Walk Hero → Surface Rail → Story 1 — papers brighten + grow as
     progress advances.
  2. Walk Story 2 — entities brighter + larger than papers; papers
     soft ambient.
  3. Walk Story 3 — relations brighten; edges via `FieldConnectionOverlay`
     still render (A3 replaces it later).
  4. Walk Sequence info-7 — cluster emergence feels organic (not
     segmented).
  5. Walk Sequence info-8 — one entity visibly spotlighted.
  6. Walk Sequence info-9 — scroll through three steps; blob responds
     to each step's focus entity.
  7. Walk Mobile Carry / CTA — blob returns to baseline.
  8. Verify at `http://localhost:3000/?landingGraphReady=1` → CTA
     Enter button renders with graph-ready state.
- Post-tune: commit the full A1 delta as one commit with a message like
  `Phase A1: native-physics per-category lighting + Sequence 3-beat
  restructure + info-9 module-in-module`.

---

## info-9 Content Draft

### fieldSequenceBeats

```ts
export const fieldSequenceBeats: readonly FieldStoryBeat[] = [
  {
    id: "info-7",
    title: "Clusters",
    body: "Research communities form from embedding proximity, not predefined categories. The graph remembers how papers sit near each other in meaning — and the neighborhoods that emerge are the ones your field already recognizes.",
    variant: "default",
  },
  {
    id: "info-8",
    title: "Living Knowledge",
    body: "Auto-synthesized articles per entity — definitions, key findings, open questions — refreshed on every build. The article doesn't drift from the evidence, because it's generated from the evidence.",
    variant: "default",
  },
  {
    id: "info-9",
    title: "Educational Modules",
    body: "Step-through lessons anchored to real graph nodes. Sourced evidence illuminates around you as you progress. Here's one.",
    variant: "centered",
  },
] as const;
```

### sequenceInfoNineSteps

```ts
export const sequenceInfoNineSteps = [
  {
    heading: "Start where the patient is",
    body: "Your patient is altered — delirium, catatonia, encephalopathy. The syndrome you name is where the module begins. The graph lights the evidence attached to that label.",
    focusEntityId: "catatonia",
    memberPaperIds: ["p4", "p7", "p10"],
    edges: [],
  },
  {
    heading: "Follow the bridges",
    body: "Catatonia bridges to NMS. Delirium bridges to both. The literature already crossed these edges — the graph makes the trail visible instead of implied. The module walks the trail with you.",
    focusEntityId: "nms",
    memberPaperIds: ["p5"],
    edges: [
      { from: "catatonia", to: "nms" },
      { from: "delirium", to: "catatonia" },
    ],
  },
  {
    heading: "Land on the lever",
    body: "A lorazepam challenge distinguishes catatonia from NMS — and treats it in the same move. Where evidence converges, the module ends on the next action, sourced to the paper that earned it.",
    focusEntityId: "catatonia",
    memberPaperIds: ["p10"],
    edges: [
      { from: "catatonia", to: "nms" },
      { from: "delirium", to: "catatonia" },
      { from: "catatonia", to: "p10" },
    ],
  },
] as const;
```

The `focusEntityId` and `memberPaperIds` are symbolic — Stream 3 maps
them to stable particle indices in `field-lit-particle-indices.ts`.
Edge `from`/`to` fields are also symbolic; Phase A3 resolves them to
particle-index pairs when native `<Line>` edges ship. A1 renders the
step DOM content; the edge draws arrive in A3.

---

## Definition of Done — Phase A1

- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` clean (only pre-existing warnings allowed).
- [ ] Visible-Chrome walkthrough: every chapter renders correctly per
      the Scroll arc diagram above.
- [ ] `wrapperScale` reaches 2.10 at Story 3 peak. No desktop cropping
      at 1920-wide viewport.
- [ ] Sequence renders as three vertical scroll beats with the
      `FieldStoryProgress` rail at left (same visual as Stories 1 and 3).
- [ ] info-7 reads as emergent neighborhoods (no visible color
      segments / borders).
- [ ] info-8 reads as one distinct entity spotlighted with member
      papers softly visible.
- [ ] info-9 scrolling through the three steps: each step's teaching
      card appears **pinned next to its focus entity particle on the
      blob** (not stacked in a sidebar). Card position tracks the
      projected entity particle as the blob rotates / scales. Fade
      transitions between steps are smooth (~250ms). Blob's
      per-category + focus lighting shifts to match the active step.
- [ ] Reduced motion: all floors snap to 1, all boost to 1, blob reads
      as uniform static substrate.
- [ ] Mobile viewport: wrapperScale caps at ~1.6, labels (when A2
      arrives) remain in viewport.
- [ ] Console clean (no errors, no warnings).
- [ ] Commit message references this handoff doc.

---

## Followups (Phases A2 / A3 / A4 / A5, A1 does NOT block on)

**Phase A2** — Paper/entity labels via `FieldCategoryLabelPool`.
Generalize `FieldHotspotPool`'s projection pattern to drive label
anchors for ~10 paper labels (Story 1) + ~7 entity labels (Story 2)
+ info-8 focus entity + info-9 step focus entities. Small DOM text
tags, `text-[11px] uppercase tracking-[0.2em]`, no cards / no rings.

**Phase A3** — Native `<Line>` edges via `FieldConnectionLayer`.
6-12 edges between pre-authored entity-tagged particle indices.
CPU-recomputed endpoints via shader-mirror math (per Codex R2 — do
NOT mount as R3F children without recomputation). Drei `<Line>` with
`segments + dashed + linewidth`. Stroke-draw via `strokeDashoffset`
driven by Story 3 chapter progress + info-9 step progress. When
shipped: delete `FieldConnectionOverlay.tsx` + `field-connection-pairs.ts`.

**Phase A4** (optional) — per-category motion signatures via
`aStreamFreq` + `aRandomness`. Currently baked per-category but inert
on the blob (`uStream = 0`). Activating them gives papers/entities/
relations subtly different drift textures. Preset-only — no shader
surgery. Codex R7.

**Phase A5** — Update `docs/map/modules/landing.md` contract to reflect
the shipped native-physics grammar. Rewrite the Phase 2 "Deferred
Overlays" section from scratch (do not iterate on v1's half-revised
state). Document the shader extension, the `FieldCategoryLabelPool` and
`FieldConnectionLayer` when A2/A3 ship, and info-9's module-in-module
structure.

---

## Non-Negotiables (all phases)

- **No SVG / visx on the field surface.** Visx stays out. Any
  illustrative overlay that sits above the canvas is a violation of the
  native-physics directive.
- **No color-segmented "buckets."** Per-category selection must read as
  emphasis inside one living cloud.
- **No R3F children for edges** without CPU-recomputed endpoints
  (Codex R2).
- **No `wrapperScale > 2.20` on desktop, > 1.6 on mobile** without
  explicit reviewed justification (Codex R3).
- **No assuming `alphaMobile` works** on the blob — it doesn't (Codex R6).
- **Commit after each Stream lands**, not a single end-of-phase commit.
  Streams are small enough for independent commits; keeps bisect clean.
