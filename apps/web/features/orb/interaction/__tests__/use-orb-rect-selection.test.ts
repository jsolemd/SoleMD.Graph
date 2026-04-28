/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { GraphBundleQueries } from "@solemd/graph";

import { ORB_MANUAL_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import { useOrbPickerStore, type OrbPickerHandle } from "../orb-picker-store";
import {
  ORB_RECT_SELECTION_MAX_POINTS,
  useOrbRectSelection,
} from "../use-orb-rect-selection";

const RECT = { left: 10, top: 20, right: 50, bottom: 60 };
const CHORDS_REPLACE = {
  addToSelection: false,
  expandLinks: false,
  throughVolume: false,
};
const CHORDS_ADD = {
  addToSelection: true,
  expandLinks: false,
  throughVolume: false,
};
const CHORDS_THROUGH_VOLUME = {
  addToSelection: false,
  expandLinks: false,
  throughVolume: true,
};

function buildQueries(runReadOnlyQuery: jest.Mock): GraphBundleQueries {
  return {
    runReadOnlyQuery,
    setSelectedPointIndices: jest.fn().mockResolvedValue(undefined),
  } as unknown as GraphBundleQueries;
}

function publishPicker(
  indices: number[],
): jest.MockedFunction<OrbPickerHandle["pickRectAsync"]> {
  const pickRectAsync = jest
    .fn<
      ReturnType<OrbPickerHandle["pickRectAsync"]>,
      Parameters<OrbPickerHandle["pickRectAsync"]>
    >()
    .mockResolvedValue(indices);
  useOrbPickerStore.getState().setHandle({
    pickSync: () => -1,
    pickRectAsync,
  });
  return pickRectAsync;
}

describe("useOrbRectSelection", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
    useGraphStore.setState({ selectedNode: null, focusedPointIndex: null });
    useOrbFocusVisualStore.getState().reset();
    useOrbPickerStore.setState({ handle: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("replaces explicit selection from one rectangle pick and one batch query", async () => {
    const pickRectAsync = publishPicker([9, 3, 3]);
    const runReadOnlyQuery = jest.fn().mockResolvedValue({
      rows: [{ index: 20 }, { index: 10 }],
    });
    const queries = buildQueries(runReadOnlyQuery);
    const onSelectionCommitted = jest.fn();
    const { result } = renderHook(() =>
      useOrbRectSelection({
        queries,
        activeLayer: "corpus",
        onSelectionCommitted,
      }),
    );

    act(() => {
      result.current(RECT, CHORDS_REPLACE);
    });

    await waitFor(() => {
      expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([10, 20]);
    });
    expect(pickRectAsync).toHaveBeenCalledWith(RECT, { mode: "front-slab" });
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(runReadOnlyQuery.mock.calls[0]?.[0]).toContain("FROM selected_particles");
    expect(runReadOnlyQuery.mock.calls[0]?.[0]).toContain("JOIN paper_sample");
    expect(runReadOnlyQuery.mock.calls[0]?.[0]).toContain("(3), (9)");
    expect(useDashboardStore.getState().selectedPointCount).toBe(2);
    expect(useDashboardStore.getState().activeSelectionSourceId).toBe(
      ORB_MANUAL_SELECTION_SOURCE_ID,
    );
    expect(useDashboardStore.getState().currentPointScopeSql).toBe(
      "index IN (SELECT index FROM selected_point_indices)",
    );
    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([3, 9]);
    expect(onSelectionCommitted).toHaveBeenCalledWith(2);
  });

  it("shift-rectangle merges with existing selected_point_indices", async () => {
    publishPicker([3, 9]);
    const runReadOnlyQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ index: 10 }, { index: 20 }] })
      .mockResolvedValueOnce({ rows: [{ index: 2 }, { index: 10 }] });
    const queries = buildQueries(runReadOnlyQuery);
    const { result } = renderHook(() =>
      useOrbRectSelection({ queries, activeLayer: "corpus" }),
    );

    act(() => {
      result.current(RECT, CHORDS_ADD);
    });

    await waitFor(() => {
      expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([
        2,
        10,
        20,
      ]);
    });
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
  });

  it("Alt/Option rectangle requests through-volume GPU picking", async () => {
    const pickRectAsync = publishPicker([3, 9]);
    const runReadOnlyQuery = jest.fn().mockResolvedValue({
      rows: [{ index: 10 }],
    });
    const queries = buildQueries(runReadOnlyQuery);
    const { result } = renderHook(() =>
      useOrbRectSelection({ queries, activeLayer: "corpus" }),
    );

    act(() => {
      result.current(RECT, CHORDS_THROUGH_VOLUME);
    });

    await waitFor(() => {
      expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([10]);
    });
    expect(pickRectAsync).toHaveBeenCalledWith(RECT, {
      mode: "through-volume",
    });
  });

  it("clears explicit selection on an empty replace rectangle", async () => {
    publishPicker([]);
    const runReadOnlyQuery = jest.fn();
    const queries = buildQueries(runReadOnlyQuery);
    const onSelectionCommitted = jest.fn();
    const { result } = renderHook(() =>
      useOrbRectSelection({
        queries,
        activeLayer: "corpus",
        onSelectionCommitted,
      }),
    );

    act(() => {
      result.current(RECT, CHORDS_REPLACE);
    });

    await waitFor(() => {
      expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([]);
    });
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
    expect(useDashboardStore.getState().selectedPointCount).toBe(0);
    expect(useDashboardStore.getState().activeSelectionSourceId).toBeNull();
    expect(useDashboardStore.getState().currentPointScopeSql).toBeNull();
    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([]);
    expect(onSelectionCommitted).toHaveBeenCalledWith(0);
  });

  it("forces scope revision when replacing a selected table-backed scope", async () => {
    publishPicker([3]);
    const runReadOnlyQuery = jest.fn().mockResolvedValue({
      rows: [{ index: 10 }],
    });
    const queries = buildQueries(runReadOnlyQuery);
    useDashboardStore
      .getState()
      .setCurrentPointScopeSql("index IN (SELECT index FROM selected_point_indices)");
    const before = useDashboardStore.getState().currentScopeRevision;
    const { result } = renderHook(() =>
      useOrbRectSelection({ queries, activeLayer: "corpus" }),
    );

    act(() => {
      result.current(RECT, CHORDS_REPLACE);
    });

    await waitFor(() => {
      expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([10]);
    });
    expect(useDashboardStore.getState().currentScopeRevision).toBeGreaterThan(
      before,
    );
  });

  it("rejects oversized rectangle picks before DuckDB resolution", async () => {
    publishPicker([1, 2, 3]);
    const onSelectionTooLarge = jest.fn();
    const queries = buildQueries(jest.fn());
    const { result } = renderHook(() =>
      useOrbRectSelection({
        queries,
        activeLayer: "corpus",
        maxPoints: 2,
        onSelectionTooLarge,
      }),
    );

    act(() => {
      result.current(RECT, CHORDS_REPLACE);
    });

    await waitFor(() => {
      expect(onSelectionTooLarge).toHaveBeenCalledWith(3);
    });
    expect(queries.runReadOnlyQuery).not.toHaveBeenCalled();
    expect(queries.setSelectedPointIndices).not.toHaveBeenCalled();
  });

  it("does not pick or commit while selection is locked", async () => {
    const pickRectAsync = publishPicker([1]);
    useDashboardStore.setState({ selectionLocked: true });
    const queries = buildQueries(jest.fn());
    const { result } = renderHook(() =>
      useOrbRectSelection({ queries, activeLayer: "corpus" }),
    );

    act(() => {
      result.current(RECT, CHORDS_REPLACE);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(pickRectAsync).not.toHaveBeenCalled();
    expect(queries.setSelectedPointIndices).not.toHaveBeenCalled();
  });

  it("keeps the exported default cap stable", () => {
    expect(ORB_RECT_SELECTION_MAX_POINTS).toBe(5_000);
  });
});
