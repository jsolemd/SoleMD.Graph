# Module Template

Use this template for any new field module contract.

The user may author the source note in Obsidian, but the agent should mirror
the durable implementation contract into this repo before coding.

General runtime architecture lives in `.claude/skills/module/SKILL.md`.
Authoring vocabulary lives in `docs/map/modules/module-terminology.md`.

This template is for module-specific declarations, not for restating the full
runtime manual.

## Module Identity

- Module id: `module-id`
- Module kind: `landing | wiki module | expanded module | bridge surface`
- Runtime family: `Field`
- Ending pattern: `bookend return | persistent carry | authored formation`
- Human authoring source: `Obsidian/wiki path or note name`
- Checked-in contract: `docs/map/modules/module-id.md`
- Global locked deviations:
  - `none yet`
- Mobile path:
  - `same runtime, density swap only`
- Reduced-motion path:
  - `static copy + reduced field motion`

## Discovery Snapshot

Fill this in before coding if the source brief started as a vague idea,
metaphor, or motion direction.

- Source prompt:
  - `short quote or paraphrase of the user's initial request`
- Clarified opening state:
  - what the reader sees first
- Clarified middle-state behavior:
  - which controllers carry through the middle chapters
- Clarified ending state:
  - `bookend return`, `persistent carry`, or `authored formation`
- Chapter landmarks:
  - ordered list of chapter names
- Overlay expectations:
  - progress rail, hotspot cards, connection lines, future overlays, or none
- Interaction expectations:
  - passive scroll, click/tap, hover, graph actions
- Data coupling:
  - none, ambient only, or specific graph/data bridge
- Mobile path:
  - same runtime, alternate shell, density swap, or other explicit rule
- Reduced-motion path:
  - what is removed, what remains visible, and what becomes static
- Reference modules:
  - `landing.md`, an Obsidian note, Maze parity, or other explicit analogs
- Open questions still unresolved:
  - `none` if cleared before implementation

## Terminology Bridge

Fill this in only when the module intentionally diverges from the canonical
names in `module-terminology.md`. If the module uses canonical vocabulary
throughout, write:

- `none`

If a bridge is needed, state it as one mapping per line:

- author-facing name `->` canonical term in `module-terminology.md`

## Stage Manifest

| Order | Section id | Controller family | Ownership | Carry window |
|---|---|---|---|---|
| 1 | `section-example` | `blob` | `owner` | through `section-next` |

Notes:

- `Ownership` is either `owner` or `carry`. When a chapter runs two
  families at once, list two rows — one `owner`, one `carry`, or both
  `owner`. Do not use a third ownership state.
- When describing a two-row chapter in prose, lead with the owning
  family: `stream owner + blob carry`, never `blob carry + stream owner`.
- `Carry window` is the section id the row persists through (the
  runtime field is `endSectionId`). Leave empty for the final row.
- `presetId` is assumed to equal `stageItemId`. If a module intentionally
  diverges, add a `Preset` column and record the deviation as a module-
  level `locked deviation`.

## Chapter Inventory

### 1. Chapter Name

- Section id: `section-example`
- Chapter key: `example` (or `none` if not adapter-wired)
- Stage state: `blob owner`, `blob carry`, or `stream owner + blob carry`
- Purpose:
  - one sentence about what this chapter is *for*. Required.
  - load-bearing for generic structural names like `Story 1` and
    `Story 2`, where the chapter name alone does not convey intent.
- Content:
  - title, headline, cards, beats, supporting text
- Particle behavior:
  - what the particles do in this chapter, in product terms
  - examples:
    - `remain a persistent blob while selected papers pulse`
    - `stream points bridge between evidence neighborhoods`
    - `object-formation plane reforms into a closing silhouette`
- Overlay:
  - `none`, or describe the overlay:
    - `progress rail` (`FieldStoryProgress`)
    - `hotspot cards` (`FieldHotspotPool`)
    - `connection overlay` (`FieldConnectionOverlay`)
    - `future overlay` with a short description of what is deferred
- Interaction / motion intent:
  - what animates, what scrubs, what stays static
- Mobile path:
  - what changes on narrow or coarse-input viewports
- Reduced-motion path:
  - what becomes static, fades only, or disappears
- Data bridge:
  - any live graph/data dependency the chapter needs
- Deferred items:
  - what is intentionally not built yet
- Locked deviations:
  - any user-locked behavior that intentionally differs from parity

### 2. Beatful Chapter Example

- Section id: `section-story`
- Chapter key: `story`
- Stage state: `stream owner + blob carry`
- Purpose:
  - narrative bridge from one scene meaning to the next
- Content:
  - beat `info-1`
    - title: `First stable beat`
  - beat `info-2`
    - title: `Second stable beat`
  - beat `info-3`
    - title: `Third stable beat`
- Particle behavior:
  - points stay visible while bridges become explicit
- Overlay:
  - `progress rail` for beat tracking
- Interaction / motion intent:
  - background particles scrub
  - foreground copy reveals on chapter entry
- Mobile path:
  - same runtime, simplified overlay
- Reduced-motion path:
  - static rail, no scrubbed reveal
- Data bridge:
  - highlighted paper subset
  - relation bridge summary
- Deferred items:
  - future authored formation
- Locked deviations:
  - points remain visible through the detail chapter

## Naming Rule

When discussing work on this module, refer to:

- `chapter name` for story intent
- `section id` for structure/runtime ownership
- `chapter key` when adapter code is the target
- `beat id` for sub-beat copy or progression changes

Examples:

- `Story 2`
- `section-story-2`
- `storyTwo`
- `sequence`
- `info-5`
