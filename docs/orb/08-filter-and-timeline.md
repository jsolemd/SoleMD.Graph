# 08 — Filter and timeline

## Architecture

Filter / timeline state lives in DuckDB tables + Zustand slices,
renderer-agnostic. Both `/graph` (orb) and `/map` (2D) subscribe.
Today's `/map` widgets wrap native `@cosmograph/ui` components
(`FilterBarWidget.tsx:4`, `FilterHistogramWidget.tsx:4`,
`TimelineWidget.tsx:4`); they import Cosmograph internal
crossfilter API (`init-crossfilter-client.ts:3`).

The **Mosaic crossfilter pipeline is portable** (canonical M1
correction), but native Cosmograph widgets remain the preferred 2D
lens implementation. Do not replace optimized Cosmograph widgets with
visx unless a measured product/performance gap proves the native widget
cannot carry the requirement.

## Mosaic-vs-widget split (per Codex round 1 #6)

| Layer | Disposition | Files |
|---|---|---|
| `init-crossfilter-client.ts` | KEEP_ADAPTERIZED — allowed only inside `features/graph/cosmograph/**`; wrap any private Cosmograph API here | current adapter |
| `buildCategoricalFilterClause`, `buildNumericRangeFilterClause`, `buildCurrentPointScopeSql`, `buildBudgetScopeSql` | KEEP_RENDERER_AGNOSTIC | `apps/web/features/graph/lib/cosmograph-selection.ts` today; rename to `graph-selection.ts` only when actively touched |
| `FilterBarWidget`, `FilterHistogramWidget`, `TimelineWidget`, `SelectionToolbar` shells | KEEP_NATIVE — use `@cosmograph/ui` / `@cosmograph/react` while they satisfy the requirement | current widgets |
| `useWidgetSelectors` calling `useCosmograph()` | KEEP_ADAPTERIZED — do not leak `useCosmograph()` outside the Cosmograph feature boundary | current hook |

Contingency-only in-house widget stack if native widgets fail a
measured requirement:
- **FilterBar** - native bar chart with brush only after measuring
  Cosmograph parity requirements.
- **FilterHistogram** - direct Mosaic + canvas/SVG only if the native
  widget is unavailable.
- **Timeline** - direct Mosaic + brush only if the native
  `CosmographTimeline` cannot be used.
- **SelectionToolbar** - Mantine 8 ActionIcons; tool state remains in
  `useDashboardStore`.

## paperId ↔ particleIdx mask writer (per Codex round 1 #5)

Today's orb uses a reservoir-sampled `particleIdx`
(`use-paper-attributes-baker.ts:190`); `/map`'s filter widgets work
over graph point indices via `cosmograph-selection.ts:222`. There's
no implicit translation — the orb's particleIdx is *not* the
2D map's pointIndex.

Resolution: a `paperId → particleIdx` map is the canonical
translator. Maintained alongside the resident-set rebuild (see
[02-data-contract.md](02-data-contract.md) § Resident-set
construction).

```
const paperToParticle = new Map<string, number>();
const particleToPaper = new Map<number, string>();

function rebuildResidentMaps(rows: ResidentRow[]) {
  paperToParticle.clear();
  particleToPaper.clear();
  for (let i = 0; i < rows.length; i++) {
    paperToParticle.set(rows[i].paperId, i);
    particleToPaper.set(i, rows[i].paperId);
  }
}
```

**Filter mask writer**: subscribes to `currentPointScopeSql`. When
filter changes, query the resident set with the new scope, mark
each resident particle as in/out:

```
async function updateFilterMask() {
  const sql = buildCurrentPointScopeSql();
  const inScopeIds = await duckdb.query<string>(`
    SELECT paper_id FROM (${sql}) WHERE paper_id IN (${residentIds.join(',')})
  `);
  const inScope = new Set(inScopeIds);
  const mask = new Float32Array(residentBudget);  // R16F as float
  for (const [paperId, particleIdx] of paperToParticle) {
    mask[particleIdx] = inScope.has(paperId) ? 1.0 : 0.0;
  }
  filterMaskTexture.image.data.set(mask);
  filterMaskTexture.needsUpdate = true;
}
```

## Continuous timeline mass (Q7 from original handoff)

Timeline range writes a *smooth-step* multiplier into
`filterMask`, not a binary 0/1:

```
mask[i] = smoothstep(yearLo, yearLo + window, year[i])
        * (1 - smoothstep(yearHi - window, yearHi, year[i]));
```

`window` = ~3 years for soft edges. Galaxy gradually re-coalesces
as the user scrubs. Force kernel reads `filterMask[i]` as a
multiplier (≤ 1.0); particles outside the timeline window have
~zero force contribution and drift to origin under weak center
pull.

## Debouncing under fast scrub (per canonical M3b correction H6)

`scope` force effect debounces on `currentScopeRevision` changes.
While the revision advances faster than 300 ms (user is scrubbing
timeline), visual `filterMask` updates immediately, but the
*force-field reshape* (alpha reheat) waits until scrub-idle. This
prevents sim thrash during drag.

```
const debouncedReheatAlpha = debounce(() => {
  if (alphaTarget === 0 && filterChanged) {
    forceKernel.reheat(0.3);
  }
}, 300);
```

Visual fade is instant; physics settle is on idle.

Resident-set rebuilds follow the same generation rule: mask writes are
immediate, but buffer/kNN/edge rewrites commit only after the current
scope generation is still valid. Fast scrub must not fetch and install
every intermediate resident set.

## Filter UI surface

Filter widgets sit in the persistent left or top panel — visible
when either `/graph` or `/map` is active. Same surface, same
state. Per the canonical's "search-first ingress" principle, the
search bar is more prominent than the filter widgets on cold-load.

## Owns / doesn't own

Owns: Mosaic-vs-widget split, paperId↔particleIdx mask writer,
filter mask shape, continuous-timeline mass, scrub debouncing.

Doesn't own:
- 2D lens runtime posture ->
  [13-2d-map-vendor-replacement.md](13-2d-map-vendor-replacement.md).
- The `scope` force-effect itself → [10-force-vocabulary.md](10-force-vocabulary.md).
- Selection (separate state) → [07-selection.md](07-selection.md).

## Prerequisites

[01-architecture.md](01-architecture.md), [02-data-contract.md](02-data-contract.md).

## Consumers

[10-force-vocabulary.md](10-force-vocabulary.md) `scope` force,
[13-2d-map-vendor-replacement.md](13-2d-map-vendor-replacement.md)
for the 2D lens posture and contingency plan.

## Invalidation

- Mosaic crossfilter replaced with a different state-management
  layer → all clause builders need port.
- Resident set redefined to be sticky (not rebuilt on scope
  change) → mask writer becomes simpler but loses scope parity.
