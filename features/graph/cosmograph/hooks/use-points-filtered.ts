"use client";

import { type RefObject, useCallback, useRef } from "react";
import type {
  CosmographData,
  CosmographRef,
} from "@cosmograph/react";
import {
  buildBudgetScopeSql,
  buildVisibilityScopeSql,
  getSelectionSourceId,
  isBudgetScopeSelectionSourceId,
  isVisibilitySelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";
import type { GraphBundleQueries, GraphVisibilityBudget, MapLayer } from "@/features/graph/types";
import type { VisibilityFocus } from "@/features/graph/stores/slices/visibility-slice";

function getFilteredPointIndices(filteredPoints: CosmographData): number[] {
  const indexColumn = filteredPoints.getChild("index");
  if (!indexColumn) {
    return [];
  }

  return Array.from(indexColumn.toArray()).filter(
    (index): index is number => typeof index === "number" && Number.isFinite(index),
  );
}

export function usePointsFiltered(deps: {
  cosmographRef: RefObject<CosmographRef | undefined>;
  activeLayer: MapLayer;
  totalPointCount: number;
  tableOpen: boolean;
  selectedPointIndices: number[];
  lockedSelection: ReadonlySet<number> | null;
  visibilityFocus: VisibilityFocus | null;
  selectNode: (node: null) => void;
  setCurrentPointIndices: (indices: number[] | null) => void;
  setCurrentPointScopeSql: (sql: string | null) => void;
  setSelectedPointIndices: (indices: number[]) => void;
  setHighlightedPointIndices: (indices: number[]) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
  clearVisibilityFocus: () => void;
  applyVisibilityBudget: (layer: MapLayer, budget: GraphVisibilityBudget) => void;
  queries: GraphBundleQueries;
}) {
  const visibilityBudgetRequestId = useRef(0);

  // Stable ref that always points to the latest onPointsFiltered logic.
  // This avoids Cosmograph re-registering the handler every time any of
  // the 15+ dependencies change (selection state, visibility focus, etc.).
  const handlePointsFilteredRef = useRef<
    (filteredPoints: CosmographData, selectedIndices: number[] | null | undefined) => void
  >(undefined);

  // eslint-disable-next-line react-hooks/refs -- intentional stable-ref pattern for Cosmograph
  handlePointsFilteredRef.current = (
    filteredPoints: CosmographData,
    callbackSelectedPointIndices: number[] | null | undefined,
  ) => {
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
        deps.activeLayer === "geo" ||
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
    let filteredIndicesCache: number[] | null = null;
    const getFilteredIndices = () => {
      if (filteredIndicesCache === null) {
        filteredIndicesCache = getFilteredPointIndices(filteredPoints);
      }
      return filteredIndicesCache;
    };

    const pointsSelection = deps.cosmographRef.current?.pointsSelection ?? null;
    const normalizedSelected =
      callbackSelectedPointIndices?.filter(
        (index): index is number => typeof index === "number",
      ) ?? [];
    const sourceId = deps.cosmographRef.current?.getActiveSelectionSourceId() ?? null;
    const isVisibilitySource = isVisibilitySelectionSourceId(sourceId);
    const hasIntentClauses = intentClauseIds.length > 0;
    const pointClauseCount =
      pointsSelection?.clauses?.length ?? 0;
    const linkClauseCount =
      deps.cosmographRef.current?.linksSelection?.clauses?.length ?? 0;
    const currentPointScopeSql =
      pointClauseCount > 0
        ? buildVisibilityScopeSql(deps.cosmographRef.current?.pointsSelection)
        : null;
    const hasCurrentScope =
      (currentPointScopeSql != null &&
        currentPointScopeSql.trim().length > 0) ||
      linkClauseCount > 0;
    const shouldRefreshVisibilityBudget =
      isBudgetScopeSelectionSourceId(sourceId) &&
      deps.visibilityFocus != null &&
      deps.visibilityFocus.layer === deps.activeLayer;
    const shouldKeepCurrentIndices =
      hasCurrentScope &&
      (deps.activeLayer === "geo" || currentPointScopeSql == null);
    const shouldTrackHighlights =
      deps.activeLayer === "geo" || deps.tableOpen;

    const filteredIndices =
      shouldKeepCurrentIndices || shouldTrackHighlights
        ? getFilteredIndices()
        : [];
    const hasPartialCurrent =
      filteredIndices.length > 0 && filteredIndices.length < deps.totalPointCount;
    const nextHighlight =
      normalizedSelected.length > 0
        ? normalizedSelected
        : hasPartialCurrent
          ? filteredIndices
          : [];

    deps.setCurrentPointScopeSql(currentPointScopeSql);
    deps.setCurrentPointIndices(shouldKeepCurrentIndices ? filteredIndices : null);

    // Locked mode freezes persistent intent and lets filters only alter the
    // currently visible/highlighted subset. Intent-changing widgets should
    // be disabled natively while locked, but this keeps the store resilient.
    if (deps.lockedSelection && deps.lockedSelection.size > 0) {
      if (isVisibilitySource) {
        if (shouldRefreshVisibilityBudget) {
          void refreshVisibilityBudget();
        }
        deps.setHighlightedPointIndices(shouldTrackHighlights ? nextHighlight : []);
        return;
      }

      deps.setHighlightedPointIndices(
        shouldTrackHighlights ? deps.selectedPointIndices : [],
      );
      return;
    }

    // Filters and timeline always define visibility/highlight only. They never
    // overwrite the user's persistent selection intent.
    if (isVisibilitySource) {
      if (shouldRefreshVisibilityBudget) {
        void refreshVisibilityBudget();
      }
      deps.setHighlightedPointIndices(shouldTrackHighlights ? nextHighlight : []);
      return;
    }

    // Non-filter sources update persistent intent only while they still own
    // a live selection clause. This is what prevents "clear selection under
    // active filters" from rehydrating intent from the current intersection.
    if (!hasIntentClauses) {
      deps.setSelectedPointIndices([]);
      deps.setHighlightedPointIndices(shouldTrackHighlights ? nextHighlight : []);
      deps.setActiveSelectionSourceId(null);
      deps.selectNode(null);
      return;
    }

    deps.setSelectedPointIndices(normalizedSelected);
    deps.setHighlightedPointIndices(normalizedSelected);
    deps.setActiveSelectionSourceId(sourceId);
  };

  // Stable wrapper — identity never changes, so Cosmograph never re-registers
  return useCallback(
    (filteredPoints: CosmographData, selectedIndices: number[] | null | undefined) => {
      handlePointsFilteredRef.current?.(filteredPoints, selectedIndices);
    },
    [],
  );
}
