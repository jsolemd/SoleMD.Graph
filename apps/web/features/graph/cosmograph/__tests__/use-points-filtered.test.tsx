/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { ENTITY_OVERLAY_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";
import { usePointsFiltered } from "../hooks/use-points-filtered";

jest.mock("@/features/graph/lib/cosmograph-selection", () => ({
  buildCurrentPointScopeSql: jest.fn(() => null),
  buildBudgetScopeSql: jest.fn(() => null),
  getSelectionSourceId: (source: { id?: string } | null | undefined) =>
    typeof source?.id === "string" ? source.id : null,
  isBudgetScopeSelectionSourceId: jest.fn(() => false),
  isVisibilitySelectionSourceId: jest.fn(() => false),
}));

describe("usePointsFiltered", () => {
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;

  beforeEach(() => {
    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
    jest.clearAllMocks();
  });

  it("does not mirror store-managed programmatic selection sources back into DuckDB", async () => {
    const deps = createDeps(ENTITY_OVERLAY_SELECTION_SOURCE_ID);
    const { result } = renderHook(() => usePointsFiltered(deps));

    await act(async () => {
      result.current({} as never, [3, 5, 8]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deps.queries.setSelectedPointIndices).not.toHaveBeenCalled();
    expect(deps.setSelectedPointCount).not.toHaveBeenCalled();
    expect(deps.setActiveSelectionSourceId).not.toHaveBeenCalled();
  });

  it("still mirrors canvas-owned intent selections into DuckDB", async () => {
    const deps = createDeps("lasso:selection");
    const { result } = renderHook(() => usePointsFiltered(deps));

    await act(async () => {
      result.current({} as never, [3, 5, 8]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deps.queries.setSelectedPointIndices).toHaveBeenCalledWith([3, 5, 8]);
    expect(deps.setCurrentPointScopeSql).toHaveBeenCalledWith(null);
    expect(deps.setSelectedPointCount).toHaveBeenCalledWith(3);
    expect(deps.setActiveSelectionSourceId).toHaveBeenCalledWith("lasso:selection");
  });

  it("logs DuckDB write failures via console.error instead of swallowing them", async () => {
    const deps = createDeps("lasso:selection");
    const failure = new Error("duckdb write rejected");
    deps.queries.setSelectedPointIndices.mockReset();
    deps.queries.setSelectedPointIndices.mockRejectedValueOnce(failure);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const { result } = renderHook(() => usePointsFiltered(deps));

      await act(async () => {
        result.current({} as never, [1, 2]);
        // Flush promise microtasks so the rejected write surfaces.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "[usePointsFiltered] setSelectedPointIndices failed",
        failure,
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

function createDeps(sourceId: string | null) {
  const queries = {
    setSelectedPointIndices: jest.fn().mockResolvedValue(undefined),
    getVisibilityBudget: jest.fn(),
  };

  return {
    cosmographRef: {
      current: {
        pointsSelection: {
          clauses: sourceId
            ? [{ source: { id: sourceId }, predicate: { type: "SQL" } }]
            : [],
        },
        getActiveSelectionSourceId: () => sourceId,
      },
    },
    activeLayer: "corpus" as const,
    selectionLocked: false,
    hasSelection: true,
    visibilityFocus: null,
    selectNode: jest.fn(),
    setCurrentPointScopeSql: jest.fn(),
    setSelectedPointCount: jest.fn(),
    setActiveSelectionSourceId: jest.fn(),
    clearVisibilityFocus: jest.fn(),
    applyVisibilityBudget: jest.fn(),
    queries,
  };
}
