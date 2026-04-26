# Slice 5b — Cosmograph Selection Semantics Audit

> **Status:** Deferred. Not part of orb-as-field-particles slices 5–10.
> **Branch context:** Spun off during slice 5 of `feat/orb-as-field-particles` (2026-04-25).
> **Companion memory:** `feedback_selection_model_phase1.md` in user auto-memory.

## Why this exists

Phase-1 selection model for `/graph`:

- **Inspection focus** (single click / hover / focus) → `useGraphStore.selectedNode`. Drives detail/info/wiki panel, camera focus, visual emphasis.
- **Explicit set selection** (lasso, brush, multi-select, entity overlay, RAG, "save as scope") → DuckDB `selected_point_indices` temp table. Drives `currentPointScopeSql`, `selectedPointCount`, `activeSelectionSourceId`, scope-aware queries.

3D path (OrbSurface) implements this model cleanly. 2D Cosmograph does not — `selectPointOnClick="single"` plus `onPointsFiltered` writes single clicks into `selected_point_indices`, conflating inspection with explicit set selection.

The instinct during slice 5 was to remove the 2D mirror as a one-line cleanup. That would be a regression: the mirror is load-bearing for downstream consumers that today depend on `selected_point_indices` for *inspection-side* state (panels reading "currently selected paper", scope SQL, source attribution). Removing the writer without replacing the consumers' data source = silent breakage.

## Files implicated

- `apps/web/features/graph/cosmograph/GraphRenderer.tsx:504-506` — `selectPointOnClick={isLocked ? false : config.hasLinks && connectedSelect ? true : "single"}`. The native Cosmograph prop that turns single clicks into selection clauses.
- `apps/web/features/graph/cosmograph/GraphRenderer.tsx:520` — `onPointsFiltered={handlePointsFiltered}`. The reaction.
- `apps/web/features/graph/cosmograph/hooks/use-points-filtered.ts:131` — `void deps.queries.setSelectedPointIndices(args.pointIndices)`. The DuckDB write.
- `apps/web/features/graph/cosmograph/hooks/use-points-filtered.ts:138-140` — `setCurrentPointScopeSql / setSelectedPointCount / setActiveSelectionSourceId`. The state that travels with the write.

## Audit deliverables (in order)

### 1. Consumer map of `selected_point_indices`

Identify every reader. Codex's slice-5 trace already named the writer side; the follow-on is a **consumer** trace. Expected categories:

- **SQL helpers** (`features/graph/duckdb/sql-helpers.ts`, `features/graph/lib/cosmograph-selection.ts`) — predicate strings that other queries embed. Classify each call site.
- **Panel data hooks** — likely candidates: detail panel, info panel, wiki panel, RAG-query, entity-overlay query path. Some currently treat the table as "currently selected paper(s)" (inspection) rather than "explicit set" (filter).
- **Scope-derived state writers** — `currentPointScopeSql`, `selectedPointCount`, `activeSelectionSourceId`. Each consumer of these store fields needs the same classification.

### 2. Classification

For each consumer:

- **Inspection-side**: must move to `useGraphStore.selectedNode` (or a derived single-paper hook). Examples: "render the currently selected paper's title", "fetch paper detail for the click target".
- **Explicit-set-side**: stays on `selected_point_indices`. Examples: "filter the visible chart to the user's selection set", "run RAG against the user's saved scope".
- **Ambiguous**: surface to user before deciding.

### 3. Replacement plan

For every inspection-side consumer, write the migration:

- New data source (likely `useGraphStore.selectedNode` directly, or a thin selector).
- Behavioral change (if any) when the user has no inspection focus but a non-empty explicit set, and vice versa.
- Test plan covering the boundary cases.

### 4. Behavior change for 2D click

Only after (1)–(3) are landed:

- Either set `selectPointOnClick={false}` and route 2D clicks through `handlePointClick` → `useResolveAndSelectNode` → `selectedNode` (matching 3D), OR
- Keep `selectPointOnClick` for visual highlight only, but short-circuit the `selected_point_indices` write in `use-points-filtered.ts` for the single-click selection-source.

The choice depends on Cosmograph's internal coupling between `selectPointOnClick` and the visual highlight. May require checking `@cosmograph/react` docs (`/cosmograph` skill) for whether visual highlight can be driven without the selection clause.

## Process contract

- **Findings first, severity-tagged.** Do not implement until consumer map + classification + replacement plan are written and reviewed.
- **Codex verify-only pass on the plan** before any code change (per `feedback_codex_review_for_foundation_plans.md`).
- **`/clean` + `/codeatlas`** for the consumer trace; this is a blast-radius-heavy change.

## Out of scope for 5b

- Hover state (already surface-local, not a duplicate-state issue).
- Data-table `focusNode` bypass — separately tracked; not a `selected_point_indices` writer.
- 3D click model — already correct.
