/**
 * @jest-environment jsdom
 *
 * Wave 2B regression: when `selectionLocked === true`, useOrbClick
 * must downgrade every chord to inspection (resolveAndSelect only) and
 * touch neither commitSelectionState nor the pending visual lane.
 * Hover (separate hook) stays responsive — locked freezes commits, not
 * the picker.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GraphBundleQueries } from "@solemd/graph";

import { useResolveAndSelectNode } from "@/features/graph/hooks/use-resolve-and-select-node";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import { useOrbClick } from "../use-orb-click";
import { useOrbHover } from "../use-orb-hover";
import {
  useOrbPickerStore,
  type OrbPickerHandle,
} from "../orb-picker-store";

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

function publishHoverPicker(index: number): OrbPickerHandle {
  const handle: OrbPickerHandle = {
    pickAsync: jest
      .fn<ReturnType<OrbPickerHandle["pickAsync"]>, []>()
      .mockResolvedValue({ index, generation: 0 }),
    pickSync: () => index,
    pickRectAsync: jest
      .fn<ReturnType<OrbPickerHandle["pickRectAsync"]>, []>()
      .mockResolvedValue({ indices: [index], generation: 0 }),
    bumpPickGeneration: jest.fn(),
  };
  useOrbPickerStore.getState().setHandle(handle);
  return handle;
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useOrbClick — locked gate", () => {
  beforeEach(() => {
    mockUseResolveAndSelectNode.mockReset();
    useGraphStore.setState({ selectedNode: null, focusedPointIndex: null });
    useOrbFocusVisualStore.getState().reset();
    useDashboardStore.setState({
      currentPointScopeSql: null,
      selectedPointCount: 0,
      activeSelectionSourceId: null,
      selectionLocked: true,
    });
    useOrbPickerStore.setState({ handle: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("locked shift-click does not call commitSelectionState or setPendingParticleIndices", async () => {
    const setPendingSpy = jest.spyOn(
      useOrbFocusVisualStore.getState(),
      "setPendingParticleIndices",
    );
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [{ id: "point-from-sample" }] });
    const resolveAndSelect = jest
      .fn<Promise<void>, [{ id?: string }]>()
      .mockResolvedValue();
    mockUseResolveAndSelectNode.mockReturnValue(resolveAndSelect);
    const queries = buildQueries(runReadOnlyQuery);

    const { result } = renderHook(() => useOrbClick(queries, "corpus"));

    act(() => {
      result.current(42, {
        addToSelection: true,
        expandLinks: false,
        throughVolume: false,
      });
    });
    await flushAsync();

    // Inspection still fires (so the user can still focus a particle
    // for read-only context), but the explicit-selection branch is
    // off-limits.
    expect(resolveAndSelect).toHaveBeenCalledWith({ id: "point-from-sample" });
    expect(queries.resolvePointSelection).not.toHaveBeenCalled();
    expect(queries.setSelectedPointIndices).not.toHaveBeenCalled();
    expect(setPendingSpy).not.toHaveBeenCalled();
    // Selection store untouched.
    expect(useDashboardStore.getState().selectedPointCount).toBe(0);
    expect(useDashboardStore.getState().activeSelectionSourceId).toBeNull();
  });

  it("locked plain click still drives the inspection lane", async () => {
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
      result.current(7);
    });
    await flushAsync();

    expect(resolveAndSelect).toHaveBeenCalledWith({ id: "point-from-sample" });
  });

  it("hover keeps writing setHoverIndex while selection is locked", async () => {
    // Queued rAF: handleHoverMove enqueues, flushRaf drains. Avoids
    // the assignment-vs-callback race a synchronous rAF mock causes.
    const rafQueue: FrameRequestCallback[] = [];
    let rafId = 1;
    (window as unknown as {
      requestAnimationFrame: typeof requestAnimationFrame;
    }).requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafId++;
    }) as typeof requestAnimationFrame;

    publishHoverPicker(11);
    const setHoverIndexSpy = jest.spyOn(
      useOrbFocusVisualStore.getState(),
      "setHoverIndex",
    );

    const { result } = renderHook(() =>
      useOrbHover({ particleCount: 100, enabled: true }),
    );

    act(() => {
      result.current.handleHoverMove(120, 80);
    });
    act(() => {
      const drained = rafQueue.splice(0);
      drained.forEach((cb) => cb(0));
    });
    await flushAsync();
    await flushAsync();

    // Locked = commits frozen, picker still responsive — hoverIndex
    // must reach the focus-visual store on a hovered particle.
    const calls = setHoverIndexSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.[0]).toBe(11);
  });
});
