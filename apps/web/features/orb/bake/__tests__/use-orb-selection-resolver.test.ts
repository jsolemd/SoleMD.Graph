/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { useDashboardStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import {
  SELECTED_PARTICLE_SQL,
  useOrbSelectionResolver,
} from "../use-orb-selection-resolver";

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

function buildConnection(query: jest.Mock): AsyncDuckDBConnection {
  return { query } as unknown as AsyncDuckDBConnection;
}

function buildTable(rows: QueryResult["rows"]) {
  return { toArray: () => rows };
}

async function flushRaf(count = 1): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(20);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe("useOrbSelectionResolver", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useDashboardStore.setState(useDashboardStore.getInitialState());
    useOrbFocusVisualStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    useDashboardStore.setState(useDashboardStore.getInitialState());
    useOrbFocusVisualStore.getState().reset();
  });

  it("maps selected_point_indices to resident orb particle indices", async () => {
    const query = jest
      .fn()
      .mockResolvedValue(
        buildTable([{ particleIdx: 9 }, { particleIdx: 3 }, { particleIdx: 3 }]),
      );
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbSelectionResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setSelectedPointCount(3, {
        forceRevision: true,
      });
    });
    await flushRaf(2);

    expect(query).toHaveBeenCalledWith(SELECTED_PARTICLE_SQL);
    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([3, 9]);
  });

  it("reconciles explicit selections larger than the read-only row cap", async () => {
    const query = jest.fn().mockResolvedValue(
      buildTable(
        Array.from({ length: 300 }, (_, particleIdx) => ({ particleIdx })),
      ),
    );
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbSelectionResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 300,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setSelectedPointCount(300, {
        forceRevision: true,
      });
    });
    await flushRaf(2);

    expect(query).toHaveBeenCalledTimes(1);
    expect(useOrbFocusVisualStore.getState().selectionIndices).toHaveLength(300);
    expect(useOrbFocusVisualStore.getState().selectionIndices.at(-1)).toBe(299);
  });

  it("clears visual selection immediately when the explicit set is empty", async () => {
    const query = jest.fn();
    useDashboardStore.getState().setSelectedPointCount(2, {
      forceRevision: true,
    });
    useOrbFocusVisualStore.getState().setSelectionIndices([4, 8]);
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbSelectionResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setSelectedPointCount(0, {
        forceRevision: true,
      });
    });
    await flushRaf();

    expect(query).not.toHaveBeenCalled();
    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([]);
  });

  it("drops stale in-flight results and applies the latest selection revision", async () => {
    let resolveFirst!: (result: QueryResult) => void;
    const first = new Promise<QueryResult>((resolve) => {
      resolveFirst = resolve;
    });
    const query = jest
      .fn()
      .mockReturnValueOnce(first.then((result) => buildTable(result.rows)))
      .mockResolvedValueOnce(buildTable([{ particleIdx: 6 }]));
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbSelectionResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setSelectedPointCount(1, {
        forceRevision: true,
      });
    });
    await flushRaf();

    act(() => {
      useDashboardStore.getState().setSelectedPointCount(1, {
        forceRevision: true,
      });
    });
    resolveFirst({ rows: [{ particleIdx: 2 }] });
    await flushRaf(3);

    expect(query).toHaveBeenCalledTimes(2);
    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([6]);
  });

  it("does not resolve while paper_sample is unavailable", async () => {
    const query = jest.fn();
    useDashboardStore.getState().setSelectedPointCount(1, {
      forceRevision: true,
    });
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbSelectionResolver({
        enabled: true,
        paperSampleReady: false,
        particleCount: 16,
        connection,
      }),
    );
    await flushRaf(2);

    expect(query).not.toHaveBeenCalled();
    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([]);
  });
});
