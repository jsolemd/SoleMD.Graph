import {
  clearOwnedSelectionState,
  commitSelectionState,
} from "../graph-selection-state";
import type { GraphBundleQueries } from "@solemd/graph";

describe("graph selection state", () => {
  it("commits explicit selections through one DuckDB + store update path", async () => {
    const queries = createQueries();
    const setCurrentPointScopeSql = jest.fn();
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();
    const clearNode = jest.fn();

    await commitSelectionState({
      sourceId: "lasso:selection",
      queries,
      pointIndices: [3, 5, 8],
      scopeUpdate: {
        currentPointScopeSql: "index IN (3,5,8)",
        setCurrentPointScopeSql,
      },
      setSelectedPointCount,
      setActiveSelectionSourceId,
      clearNode,
    });

    expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([3, 5, 8]);
    expect(setCurrentPointScopeSql).toHaveBeenCalledWith("index IN (3,5,8)");
    expect(setSelectedPointCount).toHaveBeenCalledWith(3);
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith("lasso:selection");
    expect(clearNode).toHaveBeenCalledTimes(1);
  });

  it("skips stale store commits after the DuckDB write resolves", async () => {
    const queries = createQueries();
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    await commitSelectionState({
      sourceId: "lasso:selection",
      queries,
      pointIndices: [1],
      setSelectedPointCount,
      setActiveSelectionSourceId,
      shouldCommitStore: () => false,
    });

    expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([1]);
    expect(setSelectedPointCount).not.toHaveBeenCalled();
    expect(setActiveSelectionSourceId).not.toHaveBeenCalled();
  });

  it("only clears selections owned by the requesting source", async () => {
    const queries = createQueries();
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    await clearOwnedSelectionState({
      sourceId: "wiki:page",
      activeSelectionSourceId: "entity:overlay",
      queries,
      setSelectedPointCount,
      setActiveSelectionSourceId,
    });

    expect(queries.setSelectedPointIndices).not.toHaveBeenCalled();

    await clearOwnedSelectionState({
      sourceId: "wiki:page",
      activeSelectionSourceId: "wiki:page",
      queries,
      setSelectedPointCount,
      setActiveSelectionSourceId,
    });

    expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([]);
    expect(setSelectedPointCount).toHaveBeenCalledWith(0);
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith(null);
  });
});

function createQueries() {
  return {
    setSelectedPointIndices: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<GraphBundleQueries>;
}
