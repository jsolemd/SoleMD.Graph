"use client";

import { type RefObject, useCallback, useRef } from "react";
import type {
  CosmographData,
  CosmographRef,
} from "@cosmograph/react";
import {
  buildCurrentPointScopeSql,
  buildIntentSelectionScopeSql,
  buildBudgetScopeSql,
  getSelectionSourceId,
  isBudgetScopeSelectionSourceId,
  isVisibilitySelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";
import type { GraphBundleQueries, GraphVisibilityBudget, MapLayer } from "@/features/graph/types";
import type { VisibilityFocus } from "@/features/graph/stores/slices/visibility-slice";

export function usePointsFiltered(deps: {
  cosmographRef: RefObject<CosmographRef | undefined>;
  activeLayer: MapLayer;
  selectionLocked: boolean;
  selectedPointCount: number;
  visibilityFocus: VisibilityFocus | null;
  selectNode: (node: null) => void;
  setCurrentPointScopeSql: (sql: string | null) => void;
  setSelectedPointCount: (count: number) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
  clearVisibilityFocus: () => void;
  applyVisibilityBudget: (layer: MapLayer, budget: GraphVisibilityBudget) => void;
  queries: GraphBundleQueries;
}) {
  const visibilityBudgetRequestId = useRef(0);
  const selectionWriteRequestId = useRef(0);

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
    const normalizedSelected =
      callbackSelectedPointIndices?.filter(
        (index): index is number => typeof index === "number",
      ) ?? [];
    const sourceId = deps.cosmographRef.current?.getActiveSelectionSourceId() ?? null;
    const isVisibilitySource = isVisibilitySelectionSourceId(sourceId);
    const hasIntentClauses = intentClauseIds.length > 0;
    const selectedPointScopeSql = buildIntentSelectionScopeSql(pointsSelection);
    const pointClauseCount =
      pointsSelection?.clauses?.length ?? 0;
    const currentPointScopeSql =
      pointClauseCount > 0
        ? buildCurrentPointScopeSql({
            selection: deps.cosmographRef.current?.pointsSelection,
            selectionLocked: deps.selectionLocked,
            hasSelectedBaseline: deps.selectedPointCount > 0,
          })
        : null;
    const shouldRefreshVisibilityBudget =
      isBudgetScopeSelectionSourceId(sourceId) &&
      deps.visibilityFocus != null &&
      deps.visibilityFocus.layer === deps.activeLayer;
    const persistSelectionIntent = async (args: {
      scopeSql?: string | null;
      pointIndices?: number[];
      selectedCount: number;
      selectionSourceId: string | null;
      clearNode: boolean;
    }) => {
      const requestId = ++selectionWriteRequestId.current;

      try {
        if (args.scopeSql && args.scopeSql.trim().length > 0) {
          await deps.queries.setSelectedPointScopeSql(args.scopeSql);
        } else {
          await deps.queries.setSelectedPointIndices(args.pointIndices ?? []);
        }
      } catch {
        return;
      }

      if (requestId !== selectionWriteRequestId.current) {
        return;
      }

      deps.setSelectedPointCount(args.selectedCount);
      deps.setActiveSelectionSourceId(args.selectionSourceId);
      if (args.clearNode) {
        deps.selectNode(null);
      }
    };

    deps.setCurrentPointScopeSql(currentPointScopeSql);

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

    // Non-filter sources update persistent intent only while they still own
    // a live selection clause. This is what prevents "clear selection under
    // active filters" from rehydrating intent from the current intersection.
    if (!hasIntentClauses) {
      void persistSelectionIntent({
        pointIndices: [],
        selectedCount: 0,
        selectionSourceId: null,
        clearNode: true,
      });
      return;
    }

    void persistSelectionIntent({
      scopeSql: selectedPointScopeSql,
      pointIndices: normalizedSelected,
      selectedCount: normalizedSelected.length,
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
