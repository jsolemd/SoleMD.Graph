export function hasCurrentPointScopeSql(scopeSql?: string | null): boolean {
  return typeof scopeSql === "string" && scopeSql.trim().length > 0;
}

export function normalizeCurrentPointScopeSql(
  scopeSql?: string | null,
): string | null {
  const normalized = scopeSql?.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

interface ResolveTableSelectionStateArgs {
  tableView: "selection" | "dataset";
  currentPointScopeSql: string | null;
  currentScopeRevision: number;
  selectedPointCount: number;
  selectedPointRevision: number;
}

export interface TableSelectionQueryState {
  hasCurrentSubset: boolean;
  hasSelection: boolean;
  selectionAvailable: boolean;
  preferredSelectionQueryView: "current" | "selected" | null;
  resolvedTableView: "selection" | "dataset";
  queryTableView: "current" | "selected";
  scopedCurrentPointScopeSql: string | null;
  scopedCurrentScopeRevision: number;
  scopedSelectedPointCount: number;
  scopedSelectedPointRevision: number;
}

export function resolveTableSelectionState(
  args: ResolveTableSelectionStateArgs,
): TableSelectionQueryState {
  const hasCurrentSubset = hasCurrentPointScopeSql(args.currentPointScopeSql);
  const hasSelection = args.selectedPointCount > 0;
  const preferredSelectionQueryView: "current" | "selected" | null =
    hasCurrentSubset ? "current" : hasSelection ? "selected" : null;
  const selectionAvailable = preferredSelectionQueryView !== null;
  const resolvedTableView: "selection" | "dataset" =
    args.tableView === "dataset" || !selectionAvailable ? "dataset" : "selection";
  const queryTableView: "current" | "selected" =
    resolvedTableView === "dataset"
      ? "current"
      : preferredSelectionQueryView ?? "current";

  return {
    hasCurrentSubset,
    hasSelection,
    selectionAvailable,
    preferredSelectionQueryView,
    resolvedTableView,
    queryTableView,
    scopedCurrentPointScopeSql:
      resolvedTableView === "selection" && queryTableView === "current"
        ? normalizeCurrentPointScopeSql(args.currentPointScopeSql)
        : null,
    scopedCurrentScopeRevision:
      resolvedTableView === "selection" && queryTableView === "current"
        ? args.currentScopeRevision
        : 0,
    scopedSelectedPointCount:
      resolvedTableView === "selection" && queryTableView === "selected"
        ? args.selectedPointCount
        : 0,
    scopedSelectedPointRevision:
      resolvedTableView === "selection" && queryTableView === "selected"
        ? args.selectedPointRevision
        : 0,
  };
}
