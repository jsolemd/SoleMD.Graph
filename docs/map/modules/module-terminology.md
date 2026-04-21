# Module Terminology

This file is the canonical vocabulary for field module authoring.

Use it when translating:

```text
plain-language brief
  ->
docs/map/modules/<module>.md
  ->
runtime data and code identifiers
```

Author-facing names win in module contracts.

Runtime aliases are still recorded when they matter for implementation
traceability, but they should not be the primary language we use with the
user when a clearer product term exists.

## Translation Rule

Every durable change request should be translated into named module parts
before code changes begin.

The minimal conversion path is:

1. identify the target surface
2. identify the target chapter or beat
3. identify the fixed-stage ownership change
4. identify the particle/motion change
5. identify the overlay or DOM shell change
6. identify the data-bridge change, if any
7. identify the ending pattern
8. identify locked deviations or non-goals

If a request cannot be expressed in those terms yet, the brief is still too
vague for implementation.

## Named Authoring Components

| Term | Meaning | What it should answer |
|---|---|---|
| `surface` | The full landing/module experience being authored. | Which page or module is changing? |
| `module contract` | The checked-in implementation spec in `docs/map/modules/<module>.md`. | What should be built? |
| `chapter` | A named story segment with one structural anchor. | Which narrative block is changing? |
| `beat` | A stable sub-step inside a chapter. | Which sub-moment is changing? |
| `section id` | The DOM anchor id for a chapter. | Which scroll anchor owns progress? |
| `stage manifest row` | One authored controller window in the fixed stage. | Which controller family is active where? |
| `stage owner` | The controller family currently leading the fixed stage. | What carries the scene in this chapter? |
| `stage carry` | A controller family that remains visible without being the sole owner. | What persists underneath or alongside the owner? |
| `stage overlap` | A chapter window where two families are intentionally visible together. | Where do the scene families coexist? |
| `controller family` | A reusable stage archetype such as `blob`, `stream`, or an object-formation surface. | Which runtime family renders this behavior? |
| `point source` | The particle distribution source for a controller family. | Where do the particles come from? |
| `visual preset` | The low-level render and motion tuning for a controller family. | How does the family look and feel? |
| `chapter timeline` | The authored target curve across chapter progress. | What should scrub as progress moves from 0 to 1? |
| `chapter hook` | The adapter key for DOM/SVG-only choreography. | Which non-canvas chapter choreography runs here? |
| `overlay` | DOM/SVG/UI layered with the fixed stage. | What shell content must stay synchronized? |
| `data bridge` | Live graph or data coupling a chapter depends on. | Is this ambient-only, or data-aware? |
| `ending pattern` | The way a surface resolves at the end. | Does it bookend, persist, or form a new object? |
| `locked deviation` | An intentional difference from a reference surface or parity target. | What are we deliberately not changing? |

## Vocabulary Layers

### 1. Narrative Vocabulary

Use these terms when discussing story intent with the user:

- `opening state`
- `middle carrier`
- `chapter`
- `beat`
- `narrative role`
- `ending pattern`

Recommended narrative-role labels:

- `hero`
- `orientation`
- `focus`
- `detail`
- `bridge`
- `synthesis`
- `review path`
- `mobile carry`
- `end state`

Modules may use more specific chapter names, but the role should still be
clear.

If a surface is still being storyboarded, prefer stable structural chapter
names such as:

- `Hero`
- `Story 1`
- `Story 2`
- `Story 3`
- `Sequence`
- `CTA`

Then let `narrative role`, `content`, and `stage state` carry the current
meaning.

### 2. Fixed-Stage Vocabulary

Use these terms when discussing the runtime ownership model:

- `section id`
- `stage manifest row`
- `stage owner`
- `stage carry`
- `stage overlap`
- `controller family`
- `stage item id`
- `visual preset`
- `point source`

Important distinction:

- `controller family` is the author-facing runtime concept
- `stage item id` is the exact code identifier used in the manifest and scene
  state when traceability matters

### 3. Overlay Vocabulary

Use these terms when discussing non-canvas elements synchronized to the stage:

- `progress rail`
- `hotspot pool`
- `connection overlay`
- `DOM shell`
- `section chrome`

These are overlays. They are not stage owners.

### 4. Bridge Vocabulary

Use these terms when discussing external coupling or behavior constraints:

- `interaction mode`
- `data bridge`
- `reduced-motion path`
- `mobile path`
- `locked deviation`

## Ending Patterns

Every module contract should name the ending pattern explicitly.

Use one of these terms:

- `bookend return`
  The surface resolves back to its opening state.
- `persistent carry`
  The same family remains load-bearing through the close.
- `authored formation`
  Particles converge into a specific target shape or surface.

Do not describe an ending only as "more active" or "feels resolved." Name the
pattern.

## Historical Alias Map

Most Maze-era landing chapter aliases have been removed from the current
landing code. Keep this map only for migration work and historical note lookup.

| Canonical term | Retired alias | How to think about it |
|---|---|---|
| `hero` chapter key | `welcome` | Landing hero adapter key before the canonical rename pass. |
| `surfaceRail` chapter key | `clients` | Landing surface-rail adapter key before the canonical rename pass. |
| `storyTwo` chapter key | `graphRibbon` | Landing Story 2 adapter key before the canonical rename pass. |
| `sequence` chapter key | `events` | Landing sequence adapter key before the canonical rename pass. |
| `mobileCarry` chapter key | `moveNew` | Landing mobile-carry adapter key before the canonical rename pass. |

Current generic runtime terms that still matter:

- `object-formation surface` currently uses stage item id `objectFormation`
- manifest rows use `sectionId` for the section id field
- manifest rows use `stageItemId` for the controller-family id field
- manifest rows use `endSectionId` for carry-window end ids
- manifest rows use `presetId` for the visual preset id field

## Authoring Rules

### 1. Prefer product language over inherited Maze language

Good:

- `Detail Story`
- `Review Path`
- `Mobile Carry`
- `object-formation surface`
- `Story 2` with `narrative role: detail`

Avoid as the primary authoring term:

- `graphRibbon`
- `events`
- `moveNew`
- `pcb`

Those names are valid only when pointing to archived Maze source notes or
historical migration material.

### 2. Name the ownership state, not only the visual

Good:

- `blob owner`
- `blob carry`
- `blob + stream overlap`

Too vague:

- `blob section`
- `stream moment`
- `particles get busier`

### 3. Name the overlay separately from the stage owner

Good:

- `blob owner with progress rail`
- `blob + stream overlap with connection overlay`

Bad:

- `the overlay chapter`

The overlay is not the chapter owner. It is an attached layer.

### 4. Name the ending pattern explicitly

Good:

- `CTA uses a bookend return to the opening blob`
- `Story 3 ends in an authored formation`

Bad:

- `make the ending feel like Maze`

## Natural Language To Contract Fields

Use this mapping whenever a conversational brief becomes a checked-in module
contract.

| If the user says... | Record it as... |
|---|---|
| "the blob should stay through the whole page" | `stage owner` / `stage carry` decision |
| "the points should become a molecule at the end" | `ending pattern: authored formation` plus `controller family` choice |
| "the copy cards should appear over the field" | `overlay` requirement |
| "this section should feel like inspection, not synthesis" | `chapter name` plus `narrative role` |
| "it should move more on scroll" | `chapter timeline` / `particle behavior` / `interaction or motion intent` |
| "this should work the same on mobile" | `mobile path` requirement |
| "don't make it disappear like Maze" | `locked deviation` |
| "tie this to the graph selection" | `data bridge` requirement |

## Minimum Required Names Per Change Request

If a change is durable enough to touch code or the checked-in module contract,
it should be expressible with at least these names:

- `surface`
- `chapter`
- `section id`
- `stage owner or stage state`
- `particle behavior`
- `overlay`
- `ending pattern`
- `locked deviation`, if one exists

If the request touches a sub-step, add:

- `beat id`

If the request touches DOM/SVG chapter choreography, add:

- `chapter hook`
- `historical alias`, if you are tracing an older landing note or migration

## Landing Reference Map

When the landing storyboard is still moving, use stable structural chapter
names and let the narrative role explain what the chapter currently means.

| Structural chapter name | Narrative role | Section id | Chapter key, if any | Stage state |
|---|---|---|---|---|
| `Hero` | `hero` | `section-hero` | `hero` | `blob owner` |
| `Surface Rail` | `orientation` | `section-surface-rail` | `surfaceRail` | `blob carry` |
| `Story 1` | `focus` | `section-story-1` | none | `blob owner` |
| `Story 2` | `detail` | `section-story-2` | `storyTwo` | `blob + stream overlap` |
| `Story 3` | `synthesis` | `section-story-3` | none | `blob + stream overlap` |
| `Sequence` | `review path` | `section-sequence` | `sequence` | `blob + stream overlap` |
| `Mobile Carry` | `mobile carry` | `section-mobile-carry` | `mobileCarry` | `blob + stream overlap` |
| `CTA` | `end state` | `section-cta` | `cta` | `blob owner` |

`objectFormation` is not a landing chapter. In current SoleMD language it is
the stage item id for the object-formation surface family, reserved for future
modules or authored-shape endings.
