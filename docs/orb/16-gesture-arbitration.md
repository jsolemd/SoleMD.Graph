# 16 — Gesture arbitration (canonical, preserved)

## Pointer event decision table — first match wins

| Pointer event | Starts over a node | Modifier | Resolves as |
|---|---|---|---|
| pointerdown + move <5px | yes | — | click-select (on pointerup) |
| pointerdown + move ≥5px, <200ms | yes | — | tug |
| pointerdown + move ≥5px | no | — | orbit drag |
| pointerdown + move ≥5px | no | selection-tool active (rect/lasso/brush) | selection gesture |
| pointerdown + move ≥5px | yes | Shift | through-sphere lasso starting on this node |
| double-click | yes (point) | — | focus camera on paper |
| double-click | near cluster centroid | — | expand cluster |
| double-click | empty space | — | resume auto-rotation |
| scroll wheel | anywhere | — | dolly camera |

This table is the **spec**. M3a implementation must pass a test
suite that exercises each row.

## Touch-specific

| Touch event | Resolves as |
|---|---|
| Single-finger drag on node | tug (touch has no click-vs-drag ambiguity at the 200ms threshold) |
| Single-finger drag on empty | orbit |
| Two-finger pinch | dolly |
| Two-finger rotate | unused in v1 (don't conflict with orbit) |
| Long-press on node (500ms) | equivalent of desktop hover tooltip |
| Double-tap | camera focus |

## Generation-based retarget

Per canonical (preserved): Each `focus()` dispatch increments
a `focusGeneration` counter; the force function reads the current
generation each tick. Clicking B while A's bloom is still settling:
- B's dispatch cancels A in the same frame.
- A's target attractions clear.
- Positions at that frame become B's start state.
- B's target attractions ramp in over a fixed short window
  (~150 ms) to prevent a position snap.

No queued settle. No dual-focus blend.

## Empty-click semantics

Single-click on empty space:
- Clears `focusedPaperId`, `hoveredPaperId`, `hoveredClusterId`.
- Does **not** clear `scope` / `selectedPointIndices` / timeline.
- No-op on the spatial-mode force (ramp-down via alpha).

Double-click on empty space:
- Resumes auto-rotation if paused.
- No-op otherwise.

## Selection-tool modes

Tool palette in the orb chrome:

- **Default** (no tool) — pointer drag = orbit; click on node =
  select.
- **Rect** — pointer drag = rectangle selection; click on node =
  no-op (must be in default mode for clicks).
- **Lasso** — pointer drag = polygon selection.
- **Brush** — pointer drag = sphere brush.

Tool state in `useDashboardStore.view-slice.activeSelectionTool:
'none' | 'rect' | 'lasso' | 'brush'`.

## Hit testing

- Click hit area = particle render size (clamped 2–64 px).
- Hover hit area = same.
- Double-click hit area = particle render size + small radial
  buffer (~8 px) so the user doesn't have to aim perfectly twice.
- Empty-space detection = picker returns `PICK_NO_HIT`.

## Owns / doesn't own

Owns: gesture decision table, touch contract, retarget mechanism,
empty-click semantics, tool-mode arbitration.

Doesn't own:
- Selection mechanics → [07-selection.md](07-selection.md).
- Camera mechanics → [06-camera-and-rotation.md](06-camera-and-rotation.md).
- Force-effect dispatch → [10-force-vocabulary.md](10-force-vocabulary.md).

## Prerequisites

[05-picking.md](05-picking.md), [06-camera-and-rotation.md](06-camera-and-rotation.md), [07-selection.md](07-selection.md).

## Consumers

[milestones/M3a-search-and-focus.md](milestones/M3a-search-and-focus.md)
for the test-suite implementation.

## Invalidation

- Click-vs-drag threshold shifts (e.g. accessibility study
  recommends 8px, 250ms) → table updates.
- VR/AR mode added → entirely new gesture vocabulary; this table
  is desktop+touch only.
