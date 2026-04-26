# M3a — Search + `focus` (the headliner, part 1)

## Scope

Wire the search bar + `focus(paperId)` + `focus(resultSet)` force
effects. Promoted from canonical M3c per
[decisions/2026-04-24-search-as-headliner.md](../decisions/2026-04-24-search-as-headliner.md).

## Acceptance

- Search bar in the persistent left panel (lifted from existing
  `apps/web/features/graph/components/explore/info/use-search-results.ts`
  and wiki search). Visible in both `/map` and `/graph`.
- `focus(paperId)` force effect ships:
  - Click select → wakes sim, focus override reserve pulls citation
    and kNN neighbors resident, rotation pauses, panel opens to single
    mode.
  - Orbital belts: cited papers form an inner band, citing papers a
    wider band, kNN-only papers a haze band. Motion is bounded and
    degrades to static rings/halos under reduced motion.
  - Hover → transient `focus`, dismisses on mouseout.
  - Generation-based retarget (rapid A → B without snap).
- `focus(resultSet)` force effect ships:
  - Search-bar commit → result set particles form score bands: top
    hits tight core, mid hits belt, lower hits haze.
  - Camera lerps to result formation via drei `<Bounds>`.
- Three-layer composition enforced (Layer 2 exclusivity per
  [11-three-layer-composition.md](../11-three-layer-composition.md)).
- Gesture decision table (M3 prerequisite, per
  [16-gesture-arbitration.md](../16-gesture-arbitration.md)).
  Test suite: every row a passing test.
- Selection parity: rectangle, lasso, brush ship; all write to
  `selected_point_indices` table on `pointerup`.
- Single state-authority assertion: `useDashboardStore` is the
  sole writer of `{hoveredPaperId, focusedPaperId,
  hoveredClusterId, selectedPointIndices, activePanelPaperId}`.

## Files

- `apps/web/features/graph/orb/sim/force-effects.ts` (new) — `focus`
  implementation.
- `apps/web/features/graph/orb/sim/effect-bindings.ts` (new) —
  store subscriptions wire `focusedPaperId` / search-result events
  to dispatches.
- `apps/web/features/graph/orb/sim/force-generation.ts` (new) —
  generation counter + retarget state.
- `apps/web/features/graph/orb/interact/gesture-arbiter.ts` (new)
- `apps/web/features/graph/orb/interact/selection.ts` (new) —
  rect / lasso / brush.
- `apps/web/features/graph/orb/interact/SelectionToolbar.tsx`
  (new — Mantine 8 ActionIcons; **not** `@cosmograph/ui`).
- `apps/web/features/graph/lib/graph-selection.ts` — renamed from
  `cosmograph-selection.ts` per canonical L1.
- `apps/web/features/graph/stores/slices/selection-slice.ts` —
  add state-authority fields as sole source of truth.
- `apps/web/features/graph/widgets/search-bar.tsx` (new - Mantine 8
  control surface; persistent panel).

## Verify

- Click a paper: 1-hop neighbors visibly pull inward; IDF-weighted
  pull harder; citation direction is legible via inner/outer bands.
- Search "BDNF receptor agonists": results land in panel; orb
  swarm forms into score bands; camera glides; alpha
  reheats; sim settles within 4 s.
- Rapid A → B click while bloom A still settling: no snap; ramp.
- Reduced-motion / Pause-motion / low-power: motion suppressed;
  panel + list still update.
- All gesture decision-table rows pass.
- Selection persists across orb ↔ map toggle.
- No DuckDB writes during drag (verify via query log).

## Blocking-on / blocks

- Blocking on: M2.
- Blocks: M3b (RAG excitation reads same `focus` plumbing).
