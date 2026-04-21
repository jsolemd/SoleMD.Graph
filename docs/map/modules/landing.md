# Landing Module Inventory

This file is the canonical section inventory for the field landing
surface.

Use it when naming work. The goal is to let us say "work on `section-sequence`"
or "change Story 2 beat 02" without re-deriving the page structure from code.

The landing runtime architecture itself lives in
`.claude/skills/module/SKILL.md`.

This file is intentionally the inventory/contract view of `Module Zero`, not a
duplicate of the full runtime manual.

## Terminology Bridge

Use these names when discussing landing changes.

Preferred author-facing chapter names:

- `Hero`
- `Surface Rail`
- `Story 1`
- `Story 2`
- `Story 3`
- `Sequence`
- `Mobile Carry`
- `CTA`

Canonical landing chapter keys:

- `hero`
- `surfaceRail`
- `storyTwo`
- `sequence`
- `mobileCarry`
- `cta`

Retired landing aliases kept only for historical lookup:

- `welcome` -> `hero`
- `clients` -> `surfaceRail`
- `graphRibbon` -> `storyTwo`
- `events` -> `sequence`
- `moveNew` -> `mobileCarry`

Preferred controller-family names:

- `blob`
- `stream`
- `object-formation surface`

Current stage item ids:

- `blob`
- `stream`
- `objectFormation`

Rule:

- use the author-facing names in chapter discussion and module contracts
- use canonical section ids and chapter keys in current implementation work
- use retired aliases only when tracing older notes or migration history

## Stage Manifest

The fixed stage now has one continuous landing substrate plus one overlapping
middle-chapter carrier:

| Order | Section id | Owner family | Preset id | Carry window |
|---|---|---|---|---|
| 1 | `section-hero` | `blob` | `blob` | through `section-surface-rail` |
| 2 | `section-surface-rail` | `blob` | `blob` | through `section-story-1` |
| 3 | `section-story-1` | `blob` | `blob` | through `section-story-2` |
| 4 | `section-story-2` | `blob` | `blob` | through `section-story-3` |
| 5 | `section-story-2` | `stream` | `stream` | through `section-story-3` |
| 6 | `section-story-3` | `blob` | `blob` | through `section-sequence` |
| 7 | `section-story-3` | `stream` | `stream` | through `section-sequence` |
| 8 | `section-sequence` | `blob` | `blob` | through `section-mobile-carry` |
| 9 | `section-sequence` | `stream` | `stream` | through `section-mobile-carry` |
| 10 | `section-mobile-carry` | `blob` | `blob` | through `section-cta` |
| 11 | `section-mobile-carry` | `stream` | `stream` | through `section-cta` |
| 12 | `section-cta` | `blob` | `blob` | CTA-local bookend |

Supporting stage overlays:

- `FieldHotspotPool` — blob hotspot DOM pool projected into the fixed stage
- `FieldConnectionOverlay` — connection lines keyed off shared Story 3 chapter progress

## Chapter Inventory

### 1. Hero

- Narrative role: `hero`
- Section id: `section-hero`
- Chapter key: `hero`
- Stage state: blob already visible as the landing substrate
- Content:
  - eyebrow: `Field`
  - title: `Enter one living evidence field.`
  - body: one-paragraph intro to the shared evidence field
  - CTA: `Enter the field`

### 2. Surface Rail

- Narrative role: `orientation`
- Section id: `section-surface-rail`
- Chapter key: `surfaceRail`
- Stage state: blob carry
- Content:
  - title: `Keep trusted surface types close to the field instead of cutting away.`
  - six cards:
    - `Ranked paper clusters`
    - `Entity neighborhoods`
    - `Relation paths`
    - `Evidence claim cards`
    - `Wiki-ready narratives`
    - `Graph continuation`

### 3. Story 1

- Narrative role: `focus`
- Section id: `section-story-1`
- Progress rail: Story 1 instance
- Stage owner: blob
- Content:
  - beat `info-1` / progress `01`
    - title: `Highlight the papers that should pull the reader deeper`
  - beat `info-2` / progress `02`
    - title: `Use context to separate high-value papers from the wider field`
  - beat `info-3` / progress `03`
    - title: `Prepare the jump from selected papers into paper details and relations`

### 4. Story 2

- Narrative role: `detail`
- Section id: `section-story-2`
- Chapter key: `storyTwo`
- Stage state: blob + stream overlap; stream becomes the forward carrier while blob stays visible underneath
- Content:
  - eyebrow: `Detail Story`
  - title: `Move from papers into entities, relations, and paper metadata.`
  - body: chapter intro to evidence-context inspection
  - note: open chapter state intended to reveal the stream-owned field directly
  - deferred asset pass: any future DOM/SVG stream shell is user-authored and not currently part of the shipped landing structure

### 5. Story 3

- Narrative role: `synthesis`
- Section id: `section-story-3`
- Progress rail: Story 2 instance
- Stage state: blob + stream overlap
- Content:
  - beat `info-4` / progress `01`
    - title: `Keep the selected papers in view while entity detail starts to accumulate`
  - beat `info-5` / progress `02`
    - title: `Make the bridges between evidence neighborhoods explicit`
  - beat `info-6` / progress `03`
    - title: `Stage the wiki-facing synthesis without collapsing the shared field`

### 6. Sequence

- Narrative role: `review path`
- Section id: `section-sequence`
- Chapter key: `sequence`
- Stage state: blob + stream overlap
- Content:
  - title: `Turn raw motion into an intelligible review sequence.`
  - three review cards:
    - `01` — `Surface the paper worth opening`
    - `02` — `Expose the surrounding entity context`
    - `03` — `Connect the bridges into synthesis`

### 7. Mobile Carry

- Narrative role: `mobile carry`
- Section id: `section-mobile-carry`
- Chapter key: `mobileCarry`
- Stage state: blob + stream overlap, with stream fading out toward CTA
- Content:
  - title: `Keep the field in motion on smaller screens without inventing a second runtime.`
  - marquee chips:
    - `Same field`
    - `Same particles`
    - `Mobile carry`
    - `Evidence context`
    - `Relation bridges`
    - `Wiki-ready synthesis`

### 8. CTA

- Narrative role: `end state`
- Section id: `section-cta`
- Chapter key: `cta`
- Stage owner: blob
- Content:
  - eyebrow: `End State`
  - title: `Close on the same globe the reader met at the start.`
  - body: one-paragraph closing statement about the blob returning to a stable bookend state
  - buttons:
    - `Go to graph`
    - `Return to top`

## Runtime Contract Notes

- Landing stage timing is now driven by shared chapter progress in
  `scroll/field-scroll-state.ts`, not by controller-local
  ScrollTriggers.
- `BlobController` and `StreamController` consume declarative chapter target
  sets from `scroll/chapters/landing-blob-chapter.ts` and
  `scroll/chapters/landing-stream-chapter.ts`.
- `objectFormation` remains the current stage item id for the
  object-formation surface family used by future module pages and
  authored-shape endings, but it is not an active landing-stage owner.

## Naming Rule

When discussing landing work, refer to sections by:

- chapter name when the target is narrative or product-facing
- section id when the target is structural or runtime-bound
- chapter key when the target is adapter/motion-bound
- beat id when the target is inside Story 1 or Story 2

Examples:

- `Story 2`
- `section-story-2`
- `storyTwo`
- `sequence`
- `info-5`
