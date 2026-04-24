"use client";

import { type RefObject, useCallback, useRef } from "react";
import type {
  CosmographData,
  CosmographRef,
} from "@cosmograph/react";
import {
  buildCurrentPointScopeSql,
  buildBudgetScopeSql,
  getSelectionSourceId,
  isBudgetScopeSelectionSourceId,
  isVisibilitySelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";
import { isSelectedPointBaselineSelectionSourceId } from "@/features/graph/lib/overlay-producers";
import type { GraphBundleQueries, GraphVisibilityBudget, GraphLayer } from "@solemd/graph";
import type { VisibilityFocus } from "@/features/graph/stores/slices/visibility-slice";

export function usePointsFiltered(deps: {
  cosmographRef: RefObject<CosmographRef | undefined>;
  activeLayer: GraphLayer;
  selectionLocked: boolean;
  hasSelection: boolean;
  visibilityFocus: VisibilityFocus | null;
  selectNode: (node: null) => void;
  setCurrentPointScopeSql: (sql: string | null) => void;
  setSelectedPointCount: (count: number) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
  clearVisibilityFocus: () => void;
  applyVisibilityBudget: (layer: GraphLayer, budget: GraphVisibilityBudget) => void;
  queries: GraphBundleQueries;
}) {
  const visibilityBudgetRequestId = useRef(0);
  const selectionWriteRequestId = useRef(0);
  const deferredWriteHandle = useRef(0);
  const deferredScopeHandle = useRef(0);

  // Stable ref that always points to the latest onPointsFiltered logic.
  // This avoids Cosmograph re-registering the handler every time any of
  // the 15+ dependencies change (selection state, visibility focus, etc.).
  const handlePointsFilteredRef = useRef<
    (filteredPoints: CosmographData, selectedIndices: number[] | null | undefined) => void
  >(undefined);

  handlePointsFilteredRef.current = (
    filteredPoints: CosmographData,
    callbackSelectedPointIndices: number[] | null | undefined,
  ) => {
    void filteredPoints;
    // --- getIntentClauseIds (inlined) ---
    const clauses = deps.cosmographRef.current?.pointsSelection?.clauses ?? [];
    const intentClauseIds = clauses
      .map((clause) =>
        typeof clause === "object" && clause !== null && "source" in clause
          ? getSelectionSourceId(clause.source)
          : null,
      )
      .filter(
        (sourceId): sourceId is string =>
          sourceId !== null &&
          !isVisibilitySelectionSourceId(sourceId),
      );

    // --- refreshVisibilityBudget (inlined as local async) ---
    const refreshVisibilityBudget = async () => {
      if (
        !deps.visibilityFocus ||
        deps.visibilityFocus.layer !== deps.activeLayer
      ) {
        return;
      }

      const requestId = ++visibilityBudgetRequestId.current;
      const scopeSql = buildBudgetScopeSql(deps.cosmographRef.current?.pointsSelection);
      const budget = await deps.queries.getVisibilityBudget({
        layer: deps.activeLayer,
        selector: { index: deps.visibilityFocus.seedIndex },
        scopeSql,
      });

      if (requestId !== visibilityBudgetRequestId.current) {
        return;
      }

      if (!budget) {
        deps.clearVisibilityFocus();
        return;
      }

      deps.applyVisibilityBudget(deps.activeLayer, budget);
    };

    // --- Main handler logic ---
    const pointsSelection = deps.cosmographRef.current?.pointsSelection ?? null;
    const selectedCount = callbackSelectedPointIndices?.length ?? 0;
    const sourceId = deps.cosmographRef.current?.getActiveSelectionSourceId() ?? null;
    const isVisibilitySource = isVisibilitySelectionSourceId(sourceId);
    const hasIntentClauses = intentClauseIds.length > 0;
    const pointClauseCount =
      pointsSelection?.clauses?.length ?? 0;
    const currentPointScopeSql =
      pointClauseCount > 0
        ? buildCurrentPointScopeSql({
            selection: deps.cosmographRef.current?.pointsSelection,
            selectionLocked: deps.selectionLocked,
            hasSelectedBaseline: deps.hasSelection,
          })
        : null;
    const shouldRefreshVisibilityBudget =
      isBudgetScopeSelectionSourceId(sourceId) &&
      deps.visibilityFocus != null &&
      deps.visibilityFocus.layer === deps.activeLayer;
    // Defer the DuckDB selection write by one animation frame so
    // Cosmograph's WebGL render and internal DuckDB reads complete
    // first. The shared connection is sequential — an immediate write
    // would block Cosmograph's rendering queries and freeze the
    // selection visual on 1M+ points.
    const persistSelectionIntent = (args: {
      pointIndices: number[];
      selectedCount: number;
      selectionSourceId: string | null;
      clearNode: boolean;
    }) => {
      // Cancel any pending scope-only update — we'll include it below
      // so both store mutations land in one frame (one React render).
      cancelAnimationFrame(deferredScopeHandle.current);
      cancelAnimationFrame(deferredWriteHandle.current);
      deferredWriteHandle.current = requestAnimationFrame(() => {
        const requestId = ++selectionWriteRequestId.current;

        void deps.queries.setSelectedPointIndices(args.pointIndices).then(() => {
          if (requestId !== selectionWriteRequestId.current) {
            return;
          }

          // Batch all store updates in one synchronous block so React
          // renders once, firing one info-panel query cycle instead of two.
          deps.setCurrentPointScopeSql(currentPointScopeSql);
          deps.setSelectedPointCount(args.selectedCount);
          deps.setActiveSelectionSourceId(args.selectionSourceId);
          if (args.clearNode) {
            deps.selectNode(null);
          }
        }).catch((error: unknown) => {
          // Superseded writes (requestId mismatch) resolve on the then()
          // branch, so any rejection here is a real DuckDB write failure
          // (data-layer error, bundle teardown, etc.). Surface it loudly —
          // silent swallowing hid selection/store desync bugs for weeks.
          // TODO: route through central logger once plan 01 C1 lands.
          console.error(
            "[usePointsFiltered] setSelectedPointIndices failed",
            error,
          );
        });
      });
    };

    // For non-intent paths (locked, visibility-only) that return early
    // without calling persistSelectionIntent, defer the scope-SQL update
    // on its own so Cosmograph's WebGL render still runs uncontested.
    cancelAnimationFrame(deferredScopeHandle.current);
    deferredScopeHandle.current = requestAnimationFrame(() => {
      deps.setCurrentPointScopeSql(currentPointScopeSql);
    });

    // Locked mode freezes persistent intent and lets filters only alter the
    // currently visible/highlighted subset. Intent-changing widgets should
    // be disabled natively while locked, but this keeps the store resilient.
    if (deps.selectionLocked) {
      if (isVisibilitySource) {
        if (shouldRefreshVisibilityBudget) {
          void refreshVisibilityBudget();
        }
        return;
      }

      return;
    }

    // Filters and timeline always define visibility/highlight only. They never
    // overwrite the user's persistent selection intent.
    if (isVisibilitySource) {
      if (shouldRefreshVisibilityBudget) {
        void refreshVisibilityBudget();
      }
      return;
    }

    // Programmatic sources that already own selected_point_indices should not
    // round-trip their callback indices back into DuckDB/store. They use the
    // baseline table as the canonical selection contract and the native clause
    // only for graph-side highlighting.
    if (isSelectedPointBaselineSelectionSourceId(sourceId)) {
      return;
    }

    // Non-filter sources update persistent intent only while they still own
    // a live selection clause. This is what prevents "clear selection under
    // active filters" from rehydrating intent from the current intersection.
    if (!hasIntentClauses) {
      persistSelectionIntent({
        pointIndices: [],
        selectedCount: 0,
        selectionSourceId: null,
        clearNode: true,
      });
      return;
    }

    // Always prefer raw indices from the callback for the DuckDB write —
    // they're already computed by Cosmograph and a direct VALUES INSERT
    // avoids scanning 1M rows. Scope SQL may be a giant IN(...) clause
    // (cluster selections) which forces a full-table scan to re-derive
    // the same indices we already have.
    const pointIndices = callbackSelectedPointIndices?.filter(
      (index): index is number => typeof index === "number",
    ) ?? [];

    void persistSelectionIntent({
      pointIndices,
      selectedCount,
      selectionSourceId: sourceId,
      clearNode: false,
    });
  };

  // Stable wrapper — identity never changes, so Cosmograph never re-registers
  return useCallback(
    (filteredPoints: CosmographData, selectedIndices: number[] | null | undefined) => {
      handlePointsFilteredRef.current?.(filteredPoints, selectedIndices);
    },
    [],
  );
}
