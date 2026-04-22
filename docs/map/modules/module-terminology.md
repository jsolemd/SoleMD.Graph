# Module Terminology

Canonical vocabulary for authoring field modules.

Use it when translating:

```text
plain-language brief
  ->
docs/map/modules/<module>.md
  ->
runtime data and code identifiers
```

This file is the author-facing vocabulary. Deep runtime-tuning terms
(`visual preset`, `point source`, `chapter hook`, `shell variant`) live
in the runtime manual at `.claude/skills/module/SKILL.md` and should not
appear in module contracts unless a module actually diverges from
defaults.

## Translation Rule

Every durable change request should be expressible as named module
parts before code changes begin. The minimal path:

1. identify the target `module`
2. identify the target `chapter` (and `beat`, if any)
3. identify the stage ownership change (`owner` / `carry` rows)
4. identify the `overlay` change, if any
5. identify the `ending pattern`
6. identify the `data bridge`, if any
7. identify `locked deviations`

If a request cannot be expressed in those terms, the brief is too
vague for implementation.

## Core Vocabulary

### Identity

- `module` — the checked-in spec under `docs/map/modules/<module>.md`.
  Answers: what is being authored.

### Narrative

- `chapter` — a named story segment. Example: `Story 2`.
- `beat` — a stable substep inside a chapter. Example: `info-5` is
  the second beat of Story 3.
- `purpose` — the semantic role of the chapter, written as a single
  sentence. Required for every chapter. It replaces the retired
  `narrative role` label: instead of tagging Story 1 as `focus`, write
  what Story 1 is *for* ("introduce selection without losing the
  globe"). Generic structural names like `Story 1` and `Story 2` must
  carry a purpose line — the name alone does not convey intent.

### Structural ids

- `section id` — DOM anchor for a chapter. Example: `section-story-2`.
- `chapter key` — adapter key when it differs from the section id.
  Example: `storyTwo` is the adapter key for `section-story-2`.

### Stage

- `stage` — the fixed, pinned plane that carries the canvas and its
  overlays. Does not scroll.
- `controller family` — the reusable stage archetype.
  Current families: `blob`, `stream`, `object-formation surface`.
- `owner` — a controller family leading the stage in a chapter.
- `carry` — a controller family that remains visible without leading.
- `overlay` — DOM or SVG layered on top of the stage.
  Current overlays on landing: `FieldHotspotPool`,
  `FieldConnectionOverlay`, `FieldStoryProgress`.

If a chapter runs two families at once, list them as two manifest rows
and describe the state with the **leading family first**:
`stream owner + blob carry`, never `blob carry + stream owner`.
There is no separate `overlap` term — overlap is what two rows in the
same window already describe.

### Runtime wiring

- `chapter progress` — the 0→1 number a chapter publishes as the
  reader scrolls through it. Controllers and overlays consume this
  number to drive behavior.
- `chapter adapter` — the code that translates `chapter progress` into
  controller and overlay behavior. Example:
  `scroll/chapters/landing-blob-chapter.ts`. Usually an implementation
  detail, not named in module contracts.

### Qualifiers

- `ending pattern` — how the module resolves at the end. One of:
  - `bookend return` — resolves to the opening state
  - `persistent carry` — same family stays load-bearing through the close
  - `authored formation` — particles converge into a specific target shape
- `data bridge` — live graph or data coupling the module depends on.
  Default: ambient-only, no bridge.
- `mobile path` — what changes on narrow or coarse-input viewports.
  Required field in every module contract and every chapter entry.
- `reduced-motion path` — what is removed, what stays visible, what
  becomes static when the user prefers reduced motion. Required field
  in every module contract and every chapter entry.
- `locked deviation` — an intentional break from a reference module or
  parity target.

## Manifest Row Fields

When editing a stage manifest row in code, the field names are:

| Code field | Authoring term |
|---|---|
| `sectionId` | section id |
| `stageItemId` | controller family |
| `endSectionId` | carry window end |
| `presetId` | visual preset (usually same as `stageItemId`) |

`presetId` and `stageItemId` diverge only when a module intentionally
swaps visual tuning for a family. On landing they match for every row.

## Chapter Key Bridge

When adapter code targets a chapter it uses a `FieldChapterKey`
(`apps/web/features/field/scroll/chapter-adapters/types.ts`). Each key
maps 1:1 to a section id. Use the key in code, the section id in the
module contract.

| Chapter key | Section id |
|---|---|
| `hero` | `section-hero` |
| `surfaceRail` | `section-surface-rail` |
| `storyOne` | `section-story-1` |
| `storyTwo` | `section-story-2` |
| `storyThree` | `section-story-3` |
| `sequence` | `section-sequence` |
| `mobileCarry` | `section-mobile-carry` |
| `cta` | `section-cta` |

## Landing Reference Map

| Chapter | Section id | Key | Stage state |
|---|---|---|---|
| `Hero` | `section-hero` | `hero` | blob owner |
| `Surface Rail` | `section-surface-rail` | `surfaceRail` | blob carry |
| `Story 1` | `section-story-1` | `storyOne` | blob owner |
| `Story 2` | `section-story-2` | `storyTwo` | stream owner + blob carry |
| `Story 3` | `section-story-3` | `storyThree` | stream owner + blob carry |
| `Sequence` | `section-sequence` | `sequence` | stream owner + blob carry |
| `Mobile Carry` | `section-mobile-carry` | `mobileCarry` | stream owner + blob carry |
| `CTA` | `section-cta` | `cta` | blob owner |

`object-formation surface` (stage item id `objectFormation`) is not a
landing stage owner. It is reserved for future module pages and
authored-shape endings.

## Authoring Rules

### 1. Prefer product language

Good: `Detail Story`, `Review Path`, `Mobile Carry`.
Avoid as primary authoring terms: `graphRibbon`, `events`, `moveNew`,
`pcb`.

### 2. Name ownership, not only visual

Good: `blob owner`, `blob carry`, `stream owner + blob carry`.
Too vague: `blob section`, `stream moment`, `particles get busier`.

Always lead with the owning family when two are present. The reader
should know in one glance which family is driving the scene.

### 3. Name overlays separately from the stage

Good: `blob owner with progress rail`.
Bad: `the progress-rail chapter`. The overlay is not the chapter owner.

### 4. Name the ending pattern explicitly

Good: `CTA uses a bookend return to the opening blob`.
Bad: `make the ending feel like Maze`.

### 5. Write a purpose line, even for generic chapter names

Good (Story 1): *"Introduce paper selection without losing the globe."*
Bad (Story 1): no purpose line, relying on the name.

`Story 1`, `Story 2`, and `Story 3` are structural names and do not
carry semantic content on their own. The purpose line is where the
reader learns what the chapter is *for*.

## Natural Language to Contract Fields

| If the user says... | Record it as... |
|---|---|
| "the blob should stay through the whole page" | owner / carry decision |
| "the points should become a molecule at the end" | `ending pattern: authored formation` + controller family |
| "the copy cards should appear over the field" | `overlay` requirement |
| "this section should feel like inspection, not synthesis" | chapter `purpose` line |
| "it should move more on scroll" | chapter progress curve |
| "this should work the same on mobile" | mobile-path note in the module contract |
| "don't make it disappear like Maze" | `locked deviation` |
| "tie this to the graph selection" | `data bridge` requirement |

## Minimum Named Parts Per Change Request

If a change is durable enough to touch code or the module contract, it
should be expressible with at least:

- `module`
- `chapter` (with a `purpose` line)
- `section id`
- `owner` / `carry` for the stage
- `overlay`, if any
- `ending pattern`, if the change touches the close

If the change touches a substep, add:

- `beat id`

## Retired Terminology

These terms were retired in favor of the core vocabulary above. Kept
here only so older notes and migration docs remain decodable.

| Retired | Replaced by |
|---|---|
| `surface` | `module` |
| `module contract` (as noun) | `module` |
| `stage overlap` | two manifest rows (one owner + one carry, or two owners) |
| `stage item id` | `controller family` (as authoring term) |
| `visual preset` / `preset id` / `point source` | runtime tuning — see runtime manual |
| `chapter timeline` | `chapter progress` (the curve is described, not named) |
| `chapter hook` | `chapter adapter` (DOM/SVG choreography is an adapter) |
| `DOM shell` / `section chrome` | `overlay` |
| `narrative role` | `purpose` line on every chapter |
| `shell variant` / `interaction mode` | runtime concerns — see runtime manual |

Retired chapter-key aliases (Maze migration):

| Canonical | Retired alias |
|---|---|
| `hero` | `welcome` |
| `surfaceRail` | `clients` |
| `storyTwo` | `graphRibbon` |
| `sequence` | `events` |
| `mobileCarry` | `moveNew` |
