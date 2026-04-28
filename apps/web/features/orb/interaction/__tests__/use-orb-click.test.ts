/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GraphBundleQueries, GraphPointRecord } from "@solemd/graph";

import { useResolveAndSelectNode } from "@/features/graph/hooks/use-resolve-and-select-node";
import { ORB_MANUAL_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import { useOrbClick } from "../use-orb-click";

jest.mock("@/features/graph/hooks/use-resolve-and-select-node", () => ({
  useResolveAndSelectNode: jest.fn(),
}));

const mockUseResolveAndSelectNode = jest.mocked(useResolveAndSelectNode);

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

function buildQueries(runReadOnlyQuery: jest.Mock): GraphBundleQueries {
  return {
    runReadOnlyQuery,
    resolvePointSelection: jest.fn(),
    setSelectedPointIndices: jest.fn().mockResolvedValue(undefined),
  } as unknown as GraphBundleQueries;
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useOrbClick", () => {
  beforeEach(() => {
    mockUseResolveAndSelectNode.mockReset();
    useGraphStore.setState({ selectedNode: null, focusedPointIndex: null });
    useOrbFocusVisualStore.getState().reset();
    useDashboardStore.setState({
      currentPointScopeSql: null,
      selectedPointCount: 0,
      activeSelectionSourceId: null,
      selectionLocked: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("resolves sampled orb particle indices through paper_sample before selecting", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [{ id: "point-from-sample" }] });
    const resolveAndSelect = jest.fn<Promise<void>, [{ id?: string }]>().mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);
    const queries = buildQueries(runReadOnlyQuery);

    const { result } = renderHook(() => useOrbClick(queries, "corpus"));

    act(() => {
      result.current(42);
    });
    await flushAsync();

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(runReadOnlyQuery.mock.calls[0]?.[0]).toContain("FROM paper_sample");
    expect(runReadOnlyQuery.mock.calls[0]?.[0]).toContain("particleIdx = 42");
    expect(resolveAndSelect).toHaveBeenCalledWith({ id: "point-from-sample" });
    expect(resolveAndSelect).not.toHaveBeenCalledWith({ index: 42 });
  });

  it("does not select when the sampled particle has no paper row", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [] });
    const resolveAndSelect = jest.fn<Promise<void>, [{ id?: string }]>().mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);

    const { result } = renderHook(() =>
      useOrbClick(buildQueries(runReadOnlyQuery), "corpus"),
    );

    act(() => {
      result.current(7);
    });
    await flushAsync();

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(resolveAndSelect).not.toHaveBeenCalled();
  });

  it("ignores null, negative, and cold-bundle picks", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [{ id: "point-from-sample" }] });
    const resolveAndSelect = jest.fn<Promise<void>, [{ id?: string }]>().mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);

    const { result, rerender } = renderHook(
      ({ queries }: { queries: GraphBundleQueries | null }) =>
        useOrbClick(queries, "corpus"),
      { initialProps: { queries: buildQueries(runReadOnlyQuery) } },
    );

    act(() => {
      result.current(null);
      result.current(-1);
    });
    rerender({ queries: null });
    act(() => {
      result.current(5);
    });
    await flushAsync();

    expect(runReadOnlyQuery).not.toHaveBeenCalled();
    expect(resolveAndSelect).not.toHaveBeenCalled();
  });

  it("shift-click appends the clicked paper to explicit selected_point_indices", async () => {
    const node = {
      id: "point-from-sample",
      index: 9,
    } as unknown as GraphPointRecord;
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValueOnce({ rows: [{ id: node.id }] })
      .mockResolvedValueOnce({ rows: [{ index: 2 }, { index: 9 }] });
    const resolveAndSelect = jest.fn<Promise<void>, [{ id?: string }]>().mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);
    const queries = buildQueries(runReadOnlyQuery);
    const resolvePointSelection = jest.mocked(queries.resolvePointSelection);
    const setSelectedPointIndices = jest.mocked(queries.setSelectedPointIndices);
    resolvePointSelection.mockResolvedValue(node);

    const { result } = renderHook(() => useOrbClick(queries, "corpus"));

    act(() => {
      result.current(42, {
        addToSelection: true,
        expandLinks: false,
        throughVolume: false,
      });
    });
    await flushAsync();

    expect(resolveAndSelect).not.toHaveBeenCalled();
    expect(resolvePointSelection).toHaveBeenCalledWith("corpus", {
      id: "point-from-sample",
    });
    expect(setSelectedPointIndices).toHaveBeenCalledWith([2, 9]);
    expect(useGraphStore.getState().selectedNode).toEqual(node);
    expect(useGraphStore.getState().focusedPointIndex).toBe(9);
    expect(useDashboardStore.getState().selectedPointCount).toBe(2);
    expect(useDashboardStore.getState().activeSelectionSourceId).toBe(
      ORB_MANUAL_SELECTION_SOURCE_ID,
    );
    expect(useDashboardStore.getState().currentPointScopeSql).toBe(
      "index IN (SELECT index FROM selected_point_indices)",
    );
    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([42]);
  });

  it("does not write an explicit selection when only the future expand-links chord is active", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [{ id: "point-from-sample" }] });
    const resolveAndSelect = jest.fn<Promise<void>, [{ id?: string }]>().mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);
    const queries = buildQueries(runReadOnlyQuery);

    const { result } = renderHook(() => useOrbClick(queries, "corpus"));

    act(() => {
      result.current(42, {
        addToSelection: false,
        expandLinks: true,
        throughVolume: false,
      });
    });
    await flushAsync();

    expect(resolveAndSelect).toHaveBeenCalledWith({ id: "point-from-sample" });
    expect(queries.resolvePointSelection).not.toHaveBeenCalled();
    expect(queries.setSelectedPointIndices).not.toHaveBeenCalled();
  });
});
