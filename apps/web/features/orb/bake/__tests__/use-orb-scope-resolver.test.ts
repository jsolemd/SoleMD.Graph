/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GraphBundleQueries } from "@solemd/graph";

import {
  getParticleStateData,
  PARTICLE_STATE_LANES,
  resetParticleStateTexture,
} from "@/features/field/renderer/field-particle-state-texture";
import { useDashboardStore } from "@/features/graph/stores";
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

function buildQueries(runReadOnlyQuery: jest.Mock): GraphBundleQueries {
  return { runReadOnlyQuery } as unknown as GraphBundleQueries;
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
    useOrbScopeMutationStore.getState().reset();
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    resetParticleStateTexture();
    useOrbScopeMutationStore.getState().reset();
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("coalesces rapid scope changes and dispatches the latest SQL", async () => {
    const runReadOnlyQuery = jest.fn<Promise<QueryResult>, [string]>().mockResolvedValue({
      rows: [],
    });
    const queries = buildQueries(runReadOnlyQuery);

    renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      }),
    );

    act(() => {
      for (let i = 0; i < 30; i += 1) {
        useDashboardStore.getState().setCurrentPointScopeSql(`year >= ${2000 + i}`);
      }
    });

    await advanceResolverWindow();

    expect(runReadOnlyQuery.mock.calls.length).toBeLessThanOrEqual(2);
    expect(runReadOnlyQuery.mock.calls.at(-1)?.[0]).toContain("year >= 2029");
  });

  it("does not overlap queries and discards stale in-flight results", async () => {
    const first = deferred<QueryResult>();
    const second = deferred<QueryResult>();
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const queries = buildQueries(runReadOnlyQuery);

    renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2000");
    });
    await advanceResolverWindow();
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2024");
    });
    await resolveDeferred(first, {
      rows: [{ particleIdx: 3, in_scope: false }],
    });

    expect(getParticleStateData()[rByte(3)]).toBe(255);
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);

    await advanceResolverWindow();
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
    expect(runReadOnlyQuery.mock.calls[1]?.[0]).toContain("year >= 2024");

    await resolveDeferred(second, {
      rows: [{ particleIdx: 4, in_scope: false }],
    });

    expect(getParticleStateData()[rByte(3)]).toBe(255);
    expect(getParticleStateData()[rByte(4)]).toBe(0);
  });

  it("cancels pending rAF/timer work on unmount", async () => {
    const runReadOnlyQuery = jest.fn<Promise<QueryResult>, [string]>().mockResolvedValue({
      rows: [{ particleIdx: 2, in_scope: false }],
    });
    const queries = buildQueries(runReadOnlyQuery);

    const { unmount } = renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2020");
      unmount();
    });

    await advanceResolverWindow();

    expect(runReadOnlyQuery).not.toHaveBeenCalled();
    expect(getParticleStateData()[rByte(2)]).toBe(255);
  });

  it("prevents writes after unmounting an in-flight query", async () => {
    const inFlight = deferred<QueryResult>();
    const runReadOnlyQuery = jest.fn<Promise<QueryResult>, [string]>().mockReturnValue(
      inFlight.promise,
    );
    const queries = buildQueries(runReadOnlyQuery);

    const { unmount } = renderHook(() =>
      useOrbScopeResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      }),
    );

    act(() => {
      useDashboardStore.getState().setCurrentPointScopeSql("year >= 2020");
    });
    await advanceResolverWindow();
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);

    unmount();
    await resolveDeferred(inFlight, {
      rows: [{ particleIdx: 5, in_scope: false }],
    });

    expect(getParticleStateData()[rByte(5)]).toBe(255);
  });
});
