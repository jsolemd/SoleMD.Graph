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
- Surface kind: `landing | wiki module | expanded module | bridge surface`
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
  - which controllers/states carry through the middle chapters
- Clarified ending state:
  - bookend return vs new formed object
- Chapter landmarks:
  - ordered list of section/chapter names
- Overlay / shell expectations:
  - DOM shell, progress rail, hotspots, SVG rails, none
- Interaction expectations:
  - passive scroll, click/tap interactions, hover, graph actions
- Data / graph coupling:
  - none, ambient only, or specific graph/data bridge
- Mobile path:
  - same runtime, alternate shell, density swap, or other explicit rule
- Reduced-motion path:
  - what is removed, what remains visible, and what becomes static
- Reference surfaces:
  - `landing.md`, an Obsidian note, Maze parity, or other explicit analogs
- Open questions still unresolved:
  - `none` if cleared before implementation

## Terminology Bridge

Use this section when the clearest author-facing chapter or controller-family
name differs from the current runtime alias.

If the surface is still being storyboarded, prefer stable structural names and
carry the current meaning in `narrative role` plus `content`.

- Canonical chapter names:
  - `Hero`
  - `Surface Rail`
  - `Story 1`
  - `Story 2`
  - `Story 3`
  - `Sequence`
  - `Mobile Carry`
  - `CTA`
- Canonical chapter keys:
  - `hero`
  - `surfaceRail`
  - `storyTwo`
  - `sequence`
  - `mobileCarry`
  - `cta`
- Preferred controller-family names:
  - `blob`
  - `stream`
  - `object-formation surface`
- Current stage item ids used in code:
  - `blob`
  - `stream`
  - `objectFormation`
- Historical aliases or runtime-only names:
  - `none`

If no bridge is needed, write:

- `none`

## Stage Manifest

| Order | Section id | Owner family | Ownership mode | Stage item id | Preset id | Carry window | Particle behavior | Overlay status |
|---|---|---|---|---|---|---|---|---|
| 1 | `section-example` | `blob` | `owner` | `blob` | `blob` | through `section-next` | highlighted paper field | `progress` |

Notes:

- `Owner family` is the preferred author-facing runtime term.
- `Ownership mode` should be one of:
  - `owner`
  - `carry`
  - `overlap`
- `Stage item id` is the code identifier when traceability matters.
- `Particle behavior` should describe what the particles are doing in product
  terms, not just the slug name.
- `Overlay status` should be one of:
  - `none`
  - `hotspots`
  - `progress`
  - `DOM shell`
  - `future`

## Chapter Inventory

### 1. Chapter Name

- Narrative role: `hero | orientation | focus | detail | bridge | synthesis | review path | mobile carry | end state`
- Section id: `section-example`
- Historical alias or runtime alias: `none`
- Chapter key or runtime alias: `example`
- Stage owner or state: `blob owner`, `blob carry`, or `blob + stream overlap`
- Purpose:
  - one sentence about why this chapter exists
- Content:
  - title or headline
  - key cards, beats, or supporting text
- Particle behavior:
  - what the particles do in this chapter
  - examples:
    - `remain a persistent blob while selected papers pulse`
    - `stream points bridge between evidence neighborhoods`
    - `object-formation plane reforms into a closing silhouette`
- DOM overlay:
  - `none`
  - or describe the intended overlay:
    - `progress rail`
    - `hotspot cards`
    - `future DOM shell`
- Interaction / motion intent:
  - what animates
  - what scrubs
  - what should remain static
- Mobile path:
  - what changes on narrow/coarse input
- Reduced-motion path:
  - what becomes static, fades only, or disappears
- Data dependencies:
  - any content/data/graph dependency the chapter needs
- Deferred items:
  - what is intentionally not built yet
- Locked deviations:
  - any user-locked behavior that intentionally differs from parity

### 2. Beatful Chapter Example

- Narrative role: `bridge`
- Section id: `section-story`
- Historical alias or runtime alias: `none`
- Chapter key or runtime alias: `story`
- Stage owner or state: `stream carry`
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
- DOM overlay:
  - story progress rail
- Interaction / motion intent:
  - background particles scrub
  - foreground copy reveals on chapter entry
- Mobile path:
  - same runtime, simplified overlay
- Reduced-motion path:
  - static rail, no scrubbed reveal
- Data dependencies:
  - highlighted paper subset
  - relation bridge summary
- Deferred items:
  - future object-formation surface
- Locked deviations:
  - points remain visible through detail story

## Naming Rule

When discussing work on this module, refer to:

- `chapter name` for story intent
- `section id` for structure/runtime ownership
- `chapter key` only when adapter code is the target
- `beat id` for sub-beat copy or progression changes

Examples:

- `Story 2`
- `section-story-2`
- `storyTwo`
- `sequence`
- `info-5`
