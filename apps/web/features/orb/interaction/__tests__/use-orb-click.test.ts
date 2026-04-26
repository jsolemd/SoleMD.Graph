/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GraphBundleQueries } from "@solemd/graph";

import { useResolveAndSelectNode } from "@/features/graph/hooks/use-resolve-and-select-node";
import { useOrbClick } from "../use-orb-click";

jest.mock("@/features/graph/hooks/use-resolve-and-select-node", () => ({
  useResolveAndSelectNode: jest.fn(),
}));

const mockUseResolveAndSelectNode = jest.mocked(useResolveAndSelectNode);

interface QueryResult {
  rows: Array<{ id?: string }>;
}

function buildQueries(runReadOnlyQuery: jest.Mock): GraphBundleQueries {
  return { runReadOnlyQuery } as unknown as GraphBundleQueries;
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
});
