"use client";

import { useDeferredValue } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import {
  hasCurrentPointScopeSql,
  normalizeCurrentPointScopeSql,
  resolveTableSelectionState,
  type TableSelectionQueryState,
} from "@/features/graph/lib/selection-query-state";

export interface SelectionQueryState {
  currentPointScopeSql: string | null;
  deferredCurrentPointScopeSql: string | null;
  currentScopeRevision: number;
  selectedPointCount: number;
  deferredSelectedPointCount: number;
  selectedPointRevision: number;
  deferredSelectedPointRevision: number;
  selectionLocked: boolean;
  hasCurrentSubset: boolean;
  deferredHasCurrentSubset: boolean;
  hasSelection: boolean;
  deferredHasSelection: boolean;
}

interface DashboardSelectionSnapshot {
  currentPointScopeSql: string | null;
  currentScopeRevision: number;
  selectedPointCount: number;
  selectedPointRevision: number;
  selectionLocked: boolean;
}

export interface ResolvedTableSelectionQueryState
  extends TableSelectionQueryState {
  selectedPointCount: number;
}

export function useSelectionQueryState(): SelectionQueryState {
  const {
    currentPointScopeSql,
    currentScopeRevision,
    selectedPointCount,
    selectedPointRevision,
    selectionLocked,
  } = useDashboardStore(
    useShallow(
      (state): DashboardSelectionSnapshot => ({
        currentPointScopeSql: state.currentPointScopeSql,
        currentScopeRevision: state.currentScopeRevision,
        selectedPointCount: state.selectedPointCount,
        selectedPointRevision: state.selectedPointRevision,
        selectionLocked: state.selectionLocked,
      }),
    ),
  );

  const deferredCurrentPointScopeSql = useDeferredValue(currentPointScopeSql);
  const deferredSelectedPointCount = useDeferredValue(selectedPointCount);
  const deferredSelectedPointRevision = useDeferredValue(selectedPointRevision);

  return {
    currentPointScopeSql: normalizeCurrentPointScopeSql(currentPointScopeSql),
    deferredCurrentPointScopeSql: normalizeCurrentPointScopeSql(
      deferredCurrentPointScopeSql,
    ),
    currentScopeRevision,
    selectedPointCount,
    deferredSelectedPointCount,
    selectedPointRevision,
    deferredSelectedPointRevision,
    selectionLocked,
    hasCurrentSubset: hasCurrentPointScopeSql(currentPointScopeSql),
    deferredHasCurrentSubset: hasCurrentPointScopeSql(
      deferredCurrentPointScopeSql,
    ),
    hasSelection: selectedPointCount > 0,
    deferredHasSelection: deferredSelectedPointCount > 0,
  };
}

export function useTableSelectionQueryState(
  tableView: "selection" | "dataset",
): ResolvedTableSelectionQueryState {
  const selectionState = useSelectionQueryState();
  const [currentPointScopeSql] = useDebouncedValue(
    selectionState.deferredCurrentPointScopeSql,
    120,
  );
  const [selectedPointRevision] = useDebouncedValue(
    selectionState.deferredSelectedPointRevision,
    120,
  );

  return {
    ...resolveTableSelectionState({
      tableView,
      currentPointScopeSql,
      currentScopeRevision: selectionState.currentScopeRevision,
      selectedPointCount: selectionState.selectedPointCount,
      selectedPointRevision,
    }),
    selectedPointCount: selectionState.selectedPointCount,
  };
}
