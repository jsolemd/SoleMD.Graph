import {
  clearOwnedSelectionState,
  clearSelectionState,
  commitSelectionState,
  mergeSelectionPointIndices,
  readCommittedSelectedPointIndices,
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
    expect(setCurrentPointScopeSql).toHaveBeenCalledWith("index IN (3,5,8)", {
      forceRevision: undefined,
    });
    expect(setSelectedPointCount).toHaveBeenCalledWith(3, {
      forceRevision: true,
    });
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith("lasso:selection");
    expect(clearNode).toHaveBeenCalledTimes(1);
  });

  it("skips stale selection commits before writing DuckDB", async () => {
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

    expect(queries.setSelectedPointIndices).not.toHaveBeenCalled();
    expect(setSelectedPointCount).not.toHaveBeenCalled();
    expect(setActiveSelectionSourceId).not.toHaveBeenCalled();
  });

  it("commits an empty explicit selection through the same path", async () => {
    const queries = createQueries();
    const setCurrentPointScopeSql = jest.fn();
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    await commitSelectionState({
      sourceId: null,
      queries,
      pointIndices: [],
      scopeUpdate: {
        currentPointScopeSql: null,
        setCurrentPointScopeSql,
      },
      setSelectedPointCount,
      setActiveSelectionSourceId,
    });

    expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([]);
    expect(setCurrentPointScopeSql).toHaveBeenCalledWith(null, {
      forceRevision: undefined,
    });
    expect(setSelectedPointCount).toHaveBeenCalledWith(0, {
      forceRevision: true,
    });
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith(null);
  });

  it("clears store state before the DuckDB write settles", async () => {
    let resolveWrite!: () => void;
    const queries = {
      setSelectedPointIndices: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveWrite = resolve;
          }),
      ),
    } as unknown as jest.Mocked<GraphBundleQueries>;
    const setCurrentPointScopeSql = jest.fn();
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();
    const clearNode = jest.fn();

    const clearPromise = clearSelectionState({
      queries,
      setSelectedPointCount,
      setActiveSelectionSourceId,
      scopeUpdate: {
        currentPointScopeSql: null,
        setCurrentPointScopeSql,
        forceRevision: true,
      },
      clearNode,
    });

    expect(setCurrentPointScopeSql).toHaveBeenCalledWith(null, {
      forceRevision: true,
    });
    expect(setSelectedPointCount).toHaveBeenCalledWith(0, {
      forceRevision: true,
    });
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith(null);
    expect(clearNode).toHaveBeenCalledTimes(1);
    expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([]);

    resolveWrite();
    await clearPromise;
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
    expect(setSelectedPointCount).toHaveBeenCalledWith(0, {
      forceRevision: true,
    });
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith(null);
  });

  it("reads committed selected_point_indices in stable order", async () => {
    const queries = createQueries({
      rows: [{ index: 3 }, { index: "7" }, { index: null }, { index: -1 }],
    });

    await expect(readCommittedSelectedPointIndices(queries)).resolves.toEqual([
      3,
      7,
    ]);
    expect(queries.runReadOnlyQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM selected_point_indices"),
    );
  });

  it("merges explicit selection indices with dedupe and stable sort", () => {
    expect(mergeSelectionPointIndices([9, 2, 2], [7, 9, 1])).toEqual([
      1,
      2,
      7,
      9,
    ]);
  });
});

function createQueries(result: { rows: Array<Record<string, unknown>> } = { rows: [] }) {
  return {
    setSelectedPointIndices: jest.fn().mockResolvedValue(undefined),
    runReadOnlyQuery: jest.fn().mockResolvedValue(result),
  } as unknown as jest.Mocked<GraphBundleQueries>;
}
