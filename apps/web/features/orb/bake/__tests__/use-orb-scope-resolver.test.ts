/**
 * @jest-environment jsdom
 */
jest.mock("@/features/graph/lib/cosmograph-selection", () => ({
  SELECTED_POINT_INDICES_SCOPE_SQL:
    "index IN (SELECT index FROM selected_point_indices)",
  combineScopeSqlClauses: (
    ...clauses: Array<string | null | undefined>
  ): string | null => {
    const normalized = clauses
      .map((clause) => clause?.trim())
      .filter((clause): clause is string => Boolean(clause));
    return normalized.length > 0 ? normalized.join(" AND ") : null;
  },
}));

import { act, cleanup, renderHook } from "@testing-library/react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import {
  getParticleStateData,
  PARTICLE_STATE_LANES,
  resetParticleStateTexture,
  writeLane,
} from "@/features/field/renderer/field-particle-state-texture";
import { useDashboardStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import { useOrbScopeMutationStore } from "../../stores/scope-mutation-store";
import { useOrbScopeResolver } from "../use-orb-scope-resolver";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface QueryResult {
  rows: Array<{ particleIdx: number; in_scope: boolean | 0 | 1 }>;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildConnection(query: jest.Mock): AsyncDuckDBConnection {
  return { query } as unknown as AsyncDuckDBConnection;
}

function buildTable(rows: QueryResult["rows"]) {
  return { toArray: () => rows };
}

function rByte(index: number): number {
  return index * PARTICLE_STATE_LANES;
}

async function advanceResolverWindow(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(70);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function resolveDeferred<T>(item: Deferred<T>, value: T): Promise<void> {
  await act(async () => {
    item.resolve(value);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useOrbScopeResolver", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetParticleStateTexture();
    useOrbFocusVisualStore.getState().reset();
    useOrbScopeMutationStore.getState().reset();
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    resetParticleStateTexture();
    useOrbFocusVisualStore.getState().reset();
    useOrbScopeMutationStore.getState().reset();
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("coalesces rapid scope changes and dispatches the latest SQL", async () => {
    const query = jest.fn().mockResolvedValue(buildTable([]));
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      for (let i = 0; i < 30; i += 1) {
        useDashboardStore.getState().setCurrentPointScopeSql(`year >= ${2000 + i}`);
      }
    });

    await advanceResolverWindow();

    expect(query.mock.calls.length).toBeLessThanOrEqual(2);
    expect(query.mock.calls.at(-1)?.[0]).toContain("year >= 2029");
  });

  it("clears a null scope immediately without a DuckDB read or debounce", () => {
    writeLane("R", 3, 0);
    useOrbFocusVisualStore.getState().setScopeIndices([3]);
    const query = jest.fn().mockResolvedValue(buildTable([]));
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    expect(getParticleStateData()[rByte(3)]).toBe(255);
    expect(useOrbFocusVisualStore.getState().scopeIndices).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("publishes in-scope paper particles into the focus visual pipeline", async () => {
    const query = jest.fn().mockResolvedValue(
      buildTable([
        { particleIdx: 2, in_scope: true },
        { particleIdx: 3, in_scope: false },
        { particleIdx: 7, in_scope: 1 },
      ]),
    );
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2020");
    });
    await advanceResolverWindow();

    expect(getParticleStateData()[rByte(2)]).toBe(255);
    expect(getParticleStateData()[rByte(3)]).toBe(0);
    expect(getParticleStateData()[rByte(7)]).toBe(255);
    expect(useOrbFocusVisualStore.getState().scopeIndices).toEqual([2, 7]);
  });

  it("resolves more than the read-only SQL explorer row cap", async () => {
    const rows = Array.from({ length: 300 }, (_, particleIdx) => ({
      particleIdx,
      in_scope: particleIdx % 3 === 0,
    }));
    const query = jest.fn().mockResolvedValue(buildTable(rows));
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 300,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2020");
    });
    await advanceResolverWindow();

    expect(query).toHaveBeenCalledTimes(1);
    expect(getParticleStateData()[rByte(201)]).toBe(255);
    expect(getParticleStateData()[rByte(202)]).toBe(0);
    expect(useOrbFocusVisualStore.getState().scopeIndices).toHaveLength(100);
    expect(useOrbFocusVisualStore.getState().scopeIndices.at(-1)).toBe(297);
  });

  it("does not overlap queries and discards stale in-flight results", async () => {
    const first = deferred<QueryResult>();
    const second = deferred<QueryResult>();
    const query = jest
      .fn()
      .mockReturnValueOnce(first.promise.then((result) => buildTable(result.rows)))
      .mockReturnValueOnce(second.promise.then((result) => buildTable(result.rows)));
    const connection = buildConnection(query);

    renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2000");
    });
    await advanceResolverWindow();
    expect(query).toHaveBeenCalledTimes(1);

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2024");
    });
    await resolveDeferred(first, {
      rows: [{ particleIdx: 3, in_scope: false }],
    });

    expect(getParticleStateData()[rByte(3)]).toBe(255);
    expect(query).toHaveBeenCalledTimes(1);

    await advanceResolverWindow();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("year >= 2024");

    await resolveDeferred(second, {
      rows: [{ particleIdx: 4, in_scope: false }],
    });

    expect(getParticleStateData()[rByte(3)]).toBe(255);
    expect(getParticleStateData()[rByte(4)]).toBe(0);
  });

  it("cancels pending rAF/timer work on unmount", async () => {
    const query = jest.fn().mockResolvedValue(
      buildTable([{ particleIdx: 2, in_scope: false }]),
    );
    const connection = buildConnection(query);

    const { unmount } = renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2020");
      unmount();
    });

    await advanceResolverWindow();

    expect(query).not.toHaveBeenCalled();
    expect(getParticleStateData()[rByte(2)]).toBe(255);
  });

  it("prevents writes after unmounting an in-flight query", async () => {
    const inFlight = deferred<QueryResult>();
    const query = jest.fn().mockReturnValue(
      inFlight.promise.then((result) => buildTable(result.rows)),
    );
    const connection = buildConnection(query);

    const { unmount } = renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        connection,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2020");
    });
    await advanceResolverWindow();
    expect(query).toHaveBeenCalledTimes(1);

    unmount();
    await resolveDeferred(inFlight, {
      rows: [{ particleIdx: 5, in_scope: false }],
    });

    expect(getParticleStateData()[rByte(5)]).toBe(255);
  });
});
