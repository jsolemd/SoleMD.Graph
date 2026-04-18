import {
  hasCurrentPointScopeSql,
  normalizeCurrentPointScopeSql,
  resolveTableSelectionState,
} from "../selection-query-state";

describe("selection-query-state", () => {
  it("normalizes current point scope SQL", () => {
    expect(hasCurrentPointScopeSql(null)).toBe(false);
    expect(hasCurrentPointScopeSql("   ")).toBe(false);
    expect(hasCurrentPointScopeSql(" paper_id IN (1) ")).toBe(true);
    expect(normalizeCurrentPointScopeSql(" paper_id IN (1) ")).toBe(
      "paper_id IN (1)",
    );
  });

  it("prefers the current subset for selection table queries", () => {
    expect(
      resolveTableSelectionState({
        tableView: "selection",
        currentPointScopeSql: " paper_id IN (1) ",
        currentScopeRevision: 4,
        selectedPointCount: 7,
        selectedPointRevision: 9,
      }),
    ).toEqual({
      hasCurrentSubset: true,
      hasSelection: true,
      selectionAvailable: true,
      preferredSelectionQueryView: "current",
      resolvedTableView: "selection",
      queryTableView: "current",
      scopedCurrentPointScopeSql: "paper_id IN (1)",
      scopedCurrentScopeRevision: 4,
      scopedSelectedPointCount: 0,
      scopedSelectedPointRevision: 0,
    });
  });

  it("falls back to manual selection when no current subset exists", () => {
    expect(
      resolveTableSelectionState({
        tableView: "selection",
        currentPointScopeSql: null,
        currentScopeRevision: 4,
        selectedPointCount: 3,
        selectedPointRevision: 8,
      }),
    ).toEqual({
      hasCurrentSubset: false,
      hasSelection: true,
      selectionAvailable: true,
      preferredSelectionQueryView: "selected",
      resolvedTableView: "selection",
      queryTableView: "selected",
      scopedCurrentPointScopeSql: null,
      scopedCurrentScopeRevision: 0,
      scopedSelectedPointCount: 3,
      scopedSelectedPointRevision: 8,
    });
  });

  it("falls back to dataset mode when no selection scope is available", () => {
    expect(
      resolveTableSelectionState({
        tableView: "selection",
        currentPointScopeSql: null,
        currentScopeRevision: 2,
        selectedPointCount: 0,
        selectedPointRevision: 0,
      }),
    ).toEqual({
      hasCurrentSubset: false,
      hasSelection: false,
      selectionAvailable: false,
      preferredSelectionQueryView: null,
      resolvedTableView: "dataset",
      queryTableView: "current",
      scopedCurrentPointScopeSql: null,
      scopedCurrentScopeRevision: 0,
      scopedSelectedPointCount: 0,
      scopedSelectedPointRevision: 0,
    });
  });
});
