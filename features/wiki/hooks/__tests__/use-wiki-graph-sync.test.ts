/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";

// Mock cosmograph camera
const mockFitViewByIndices = jest.fn();
jest.mock("@/features/graph/cosmograph", () => ({
  useGraphCamera: () => ({ fitViewByIndices: mockFitViewByIndices }),
}));

// Mock overlay producers
jest.mock("@/features/graph/lib/overlay-producers", () => ({
  WIKI_ENTITY_OVERLAY_PRODUCER: "wiki:entity",
}));

// Mock the pure sync functions
const mockResolveWikiOverlay = jest.fn();
const mockCommitWikiOverlay = jest.fn();
const mockCacheWikiNodeIndices = jest.fn();
const mockClearWikiGraphOverlay = jest.fn();
jest.mock("@/features/wiki/lib/wiki-graph-sync", () => ({
  resolveWikiOverlay: (...args: unknown[]) => mockResolveWikiOverlay(...args),
  commitWikiOverlay: (...args: unknown[]) => mockCommitWikiOverlay(...args),
  cacheWikiNodeIndices: (...args: unknown[]) => mockCacheWikiNodeIndices(...args),
  clearWikiGraphOverlay: (...args: unknown[]) => mockClearWikiGraphOverlay(...args),
}));

import { useWikiGraphSync } from "../use-wiki-graph-sync";
import type { GraphBundleQueries } from "@/features/graph/types";

function createMockQueries(): GraphBundleQueries {
  return {
    ensureGraphPaperRefsAvailable: jest.fn().mockResolvedValue({
      activeGraphPaperRefs: [],
      universePointIdsByGraphPaperRef: {},
      unresolvedGraphPaperRefs: [],
    }),
    getPaperNodesByGraphPaperRefs: jest.fn().mockResolvedValue({}),
    setOverlayProducerPointIds: jest.fn().mockResolvedValue({ overlayCount: 0 }),
    clearOverlayProducer: jest.fn().mockResolvedValue({ overlayCount: 0 }),
  } as unknown as GraphBundleQueries;
}

describe("useWikiGraphSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveWikiOverlay.mockResolvedValue({ availability: {}, pointIds: ["p1"] });
    mockCommitWikiOverlay.mockResolvedValue(undefined);
    mockCacheWikiNodeIndices.mockResolvedValue({ "ref-1": 42 });
    mockClearWikiGraphOverlay.mockResolvedValue(undefined);
  });

  it("runs resolve → commit → cache on mount with paper refs", async () => {
    const queries = createMockQueries();
    const paperGraphRefs = { 12345: "ref-1" };

    renderHook(() =>
      useWikiGraphSync({ queries, paperGraphRefs, currentSlug: "entities/test" }),
    );

    // Let all microtasks flush
    await act(async () => {});

    expect(mockResolveWikiOverlay).toHaveBeenCalledWith({
      queries,
      graphPaperRefs: ["ref-1"],
    });
    expect(mockCommitWikiOverlay).toHaveBeenCalledWith({
      producerId: "wiki:entity",
      queries,
      pointIds: ["p1"],
    });
    expect(mockCacheWikiNodeIndices).toHaveBeenCalledWith({
      queries,
      graphPaperRefs: ["ref-1"],
    });
  });

  it("clears overlay when paperGraphRefs is empty", async () => {
    const queries = createMockQueries();

    renderHook(() =>
      useWikiGraphSync({ queries, paperGraphRefs: {}, currentSlug: "entities/test" }),
    );

    await act(async () => {});

    expect(mockClearWikiGraphOverlay).toHaveBeenCalled();
    expect(mockResolveWikiOverlay).not.toHaveBeenCalled();
  });

  it("clears overlay on unmount", async () => {
    const queries = createMockQueries();
    const { unmount } = renderHook(() =>
      useWikiGraphSync({
        queries,
        paperGraphRefs: { 1: "ref-1" },
        currentSlug: "entities/test",
      }),
    );

    await act(async () => {});
    mockClearWikiGraphOverlay.mockClear();

    unmount();
    await act(async () => {});
    expect(mockClearWikiGraphOverlay).toHaveBeenCalledWith({
      producerId: "wiki:entity",
      queries,
    });
  });

  it("onPaperClick uses cached index for fitViewByIndices", async () => {
    const queries = createMockQueries();
    const { result } = renderHook(() =>
      useWikiGraphSync({
        queries,
        paperGraphRefs: { 1: "ref-1" },
        currentSlug: "entities/test",
      }),
    );

    await act(async () => {});

    act(() => {
      result.current.onPaperClick("ref-1");
    });

    expect(mockFitViewByIndices).toHaveBeenCalledWith([42], 400, 0.15);
  });

  it("onPaperClick falls back to live query when cache misses", async () => {
    const queries = createMockQueries();
    (queries.getPaperNodesByGraphPaperRefs as jest.Mock).mockResolvedValue({
      "ref-2": { index: 99 },
    });

    const { result } = renderHook(() =>
      useWikiGraphSync({
        queries,
        paperGraphRefs: { 1: "ref-1" },
        currentSlug: "entities/test",
      }),
    );

    await act(async () => {});

    await act(async () => {
      result.current.onPaperClick("ref-2");
    });

    expect(queries.ensureGraphPaperRefsAvailable).toHaveBeenCalledWith(["ref-2"]);
    expect(queries.getPaperNodesByGraphPaperRefs).toHaveBeenCalledWith(["ref-2"]);
    expect(mockFitViewByIndices).toHaveBeenCalledWith([99], 400, 0.15);
  });

  it("serializes stale clear before the next generation commits overlay", async () => {
    const queries = createMockQueries();
    let resolveClear: (() => void) | null = null;

    mockClearWikiGraphOverlay.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveClear = resolve;
        }),
    );

    const { rerender } = renderHook(
      ({ paperGraphRefs, currentSlug }) =>
        useWikiGraphSync({ queries, paperGraphRefs, currentSlug }),
      {
        initialProps: {
          paperGraphRefs: {} as Record<number, string>,
          currentSlug: "entities/empty",
        },
      },
    );

    await act(async () => {});
    expect(mockClearWikiGraphOverlay).toHaveBeenCalledTimes(1);

    rerender({
      paperGraphRefs: { 1: "ref-1" },
      currentSlug: "entities/test",
    });

    await act(async () => {});
    expect(mockCommitWikiOverlay).not.toHaveBeenCalled();

    await act(async () => {
      resolveClear?.();
    });

    expect(mockCommitWikiOverlay).toHaveBeenCalledWith({
      producerId: "wiki:entity",
      queries,
      pointIds: ["p1"],
    });
  });
});
