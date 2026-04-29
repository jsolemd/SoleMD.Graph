/**
 * @jest-environment jsdom
 *
 * Wave 2B regression: useOrbClick must NOT write the canonical
 * `selectionIndices` lane optimistically. The resolver owns that lane;
 * orb-side clicks only seed the `pendingParticleIndices` lane. So
 * `setSelectionIndices` must be called AT MOST zero times during a
 * click — any non-zero count means the optimistic-then-canonical
 * double-write regressed.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GraphBundleQueries, GraphPointRecord } from "@solemd/graph";

import { useResolveAndSelectNode } from "@/features/graph/hooks/use-resolve-and-select-node";
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
    await Promise.resolve();
  });
}

describe("useOrbClick — no optimistic double-write", () => {
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

  it("never calls setSelectionIndices on a single (non-shift) click", async () => {
    const setSelectionIndicesSpy = jest.spyOn(
      useOrbFocusVisualStore.getState(),
      "setSelectionIndices",
    );
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [{ id: "point-from-sample" }] });
    const resolveAndSelect = jest
      .fn<Promise<void>, [{ id?: string }]>()
      .mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);

    const { result } = renderHook(() =>
      useOrbClick(buildQueries(runReadOnlyQuery), "corpus"),
    );

    act(() => {
      result.current(42);
    });
    await flushAsync();

    expect(resolveAndSelect).toHaveBeenCalledWith({ id: "point-from-sample" });
    expect(setSelectionIndicesSpy).not.toHaveBeenCalled();
  });

  it("never calls setSelectionIndices on shift-click; only pending lane is written", async () => {
    const node = {
      id: "point-from-sample",
      index: 9,
    } as unknown as GraphPointRecord;
    const setSelectionIndicesSpy = jest.spyOn(
      useOrbFocusVisualStore.getState(),
      "setSelectionIndices",
    );
    const setPendingSpy = jest.spyOn(
      useOrbFocusVisualStore.getState(),
      "setPendingParticleIndices",
    );
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValueOnce({ rows: [{ id: node.id }] })
      .mockResolvedValueOnce({ rows: [{ index: 9 }] });
    const resolveAndSelect = jest
      .fn<Promise<void>, [{ id?: string }]>()
      .mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);
    const queries = buildQueries(runReadOnlyQuery);
    jest
      .mocked(queries.resolvePointSelection)
      .mockResolvedValue(node);

    const { result } = renderHook(() => useOrbClick(queries, "corpus"));

    act(() => {
      result.current(42, {
        addToSelection: true,
        expandLinks: false,
        throughVolume: false,
      });
    });
    await flushAsync();
    await flushAsync();

    expect(setSelectionIndicesSpy).not.toHaveBeenCalled();
    // pending lane is written exactly once with the union of prior
    // selection (empty) and the just-clicked particle index.
    expect(setPendingSpy).toHaveBeenCalledTimes(1);
    expect(setPendingSpy.mock.calls[0]?.[0]).toEqual([42]);
  });
});
