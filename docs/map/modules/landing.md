# Landing Module Inventory

This file is the canonical section inventory for the ambient-field landing
surface.

Use it when naming work. The goal is to let us say "work on `section-events`"
or "change Story 2 beat 02" without re-deriving the page structure from code.

## Stage Manifest

The fixed stage currently has three authored scene owners:

| Order | Anchor id | Controller | Preset | Carry window |
|---|---|---|---|---|
| 1 | `section-story-1` | `blob` | `blob` | through `section-story-2` |
| 2 | `section-graph` | `stream` | `stream` | through `section-move-new` |
| 3 | `section-cta` | `pcb` | `pcb` | CTA-local |

Supporting stage overlays:

- `AmbientFieldHotspotPool` — blob hotspot DOM pool projected into the fixed stage
- `AmbientFieldConnectionOverlay` — connection lines anchored to Story 2
- `StreamChapterShell` — hybrid DOM/SVG stream shell layered over the stream chapter

## Chapter Inventory

### 1. Welcome Hero

- Section id: `section-welcome`
- Chapter hook: `welcome`
- Stage state: blob already visible as the landing substrate
- Content:
  - eyebrow: `Ambient Field`
  - title: `Enter one living evidence field.`
  - body: one-paragraph intro to the shared evidence field
  - CTA: `Enter the field`

### 2. Clients / Evidence Surfaces

- Section id: `section-clients`
- Chapter hook: `clients`
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

### 4. Graph Ribbon / Stream Chapter

- Section id: `section-graph`
- Chapter hooks:
  - `graphRibbon`
  - stream hybrid shell via `StreamChapterShell`
- Stage owner: stream
- Content:
  - eyebrow: `Detail Story`
  - title: `Move from papers into entities, relations, and paper metadata.`
  - body: chapter intro to evidence-context inspection
  - stream shell labels:
    - `Paper signal`
    - `Entity context`
    - `Relation synthesis`
  - eight stream points:
    - `kdc`
    - `function`
    - `fpt`
    - `access`
    - `json`
    - `fou`
    - `image`
    - `framebuffer`

### 5. Story 2

- Section id: `section-story-2`
- Progress rail: Story 2 instance
- Stage state: stream carry
- Content:
  - beat `info-4` / progress `01`
    - title: `Keep the selected papers in view while entity detail starts to accumulate`
  - beat `info-5` / progress `02`
    - title: `Make the bridges between evidence neighborhoods explicit`
  - beat `info-6` / progress `03`
    - title: `Stage the wiki-facing synthesis without collapsing the shared field`

### 6. Events / Review Path

- Section id: `section-events`
- Chapter hook: `events`
- Stage state: stream carry
- Content:
  - title: `Turn raw motion into an intelligible review sequence.`
  - three review cards:
    - `01` — `Surface the paper worth opening`
    - `02` — `Expose the surrounding entity context`
    - `03` — `Connect the bridges into synthesis`

### 7. Move New / Mobile Carry

- Section id: `section-move-new`
- Chapter hook: `moveNew`
- Stage state: stream carry
- Content:
  - title: `Keep the field in motion on smaller screens without inventing a second runtime.`
  - marquee chips:
    - `Same field`
    - `Same particles`
    - `Mobile carry`
    - `Evidence context`
    - `Relation bridges`
    - `Wiki-ready synthesis`

### 8. CTA / End State

- Section id: `section-cta`
- Chapter hook: `cta`
- Stage owner: pcb
- Content:
  - eyebrow: `End State`
  - title: `Let the field reform into a clearer final shape rather than dropping away.`
  - body: one-paragraph closing statement about the learned end state
  - buttons:
    - `Go to graph`
    - `Return to top`

## Naming Rule

When discussing landing work, refer to sections by:

- section id when the target is structural or runtime-bound
- chapter hook when the target is adapter/motion-bound
- beat id when the target is inside Story 1 or Story 2

Examples:

- `section-graph`
- `events`
- `info-5`
