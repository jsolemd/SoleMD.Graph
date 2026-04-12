/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";

const mockFitViewByIndices = jest.fn();
const mockZoomToPoint = jest.fn();
const mockSelectPointsByIndices = jest.fn();
const mockClearSelectionBySource = jest.fn();
const mockFocusNode = jest.fn().mockReturnValue(true);
const mockCommitSelectionState = jest.fn().mockResolvedValue(undefined);
const mockClearOwnedSelectionState = jest.fn().mockResolvedValue(undefined);

const dashboardState = {
  activeSelectionSourceId: null as string | null,
  setSelectedPointCount: jest.fn(),
  setActiveSelectionSourceId: jest.fn(),
};

jest.mock("@/features/graph/cosmograph", () => ({
  useGraphCamera: () => ({
    fitViewByIndices: mockFitViewByIndices,
    zoomToPoint: mockZoomToPoint,
  }),
  useGraphFocus: () => ({
    focusNode: mockFocusNode,
  }),
  useGraphSelection: () => ({
    selectPointsByIndices: mockSelectPointsByIndices,
    clearSelectionBySource: mockClearSelectionBySource,
  }),
}));

jest.mock("@/features/graph/stores", () => ({
  useDashboardStore: (selector: (state: typeof dashboardState) => unknown) =>
    selector(dashboardState),
}));

jest.mock("@/features/graph/lib/graph-selection-state", () => ({
  commitSelectionState: (...args: unknown[]) =>
    mockCommitSelectionState(...args),
  clearOwnedSelectionState: (...args: unknown[]) =>
    mockClearOwnedSelectionState(...args),
}));

const mockResolveWikiOverlay = jest.fn();
const mockCommitWikiOverlay = jest.fn();
const mockCacheWikiGraphNodes = jest.fn();
const mockClearWikiGraphOverlay = jest.fn();

jest.mock("@/features/wiki/lib/wiki-graph-sync", () => ({
  resolveWikiOverlay: (...args: unknown[]) => mockResolveWikiOverlay(...args),
  commitWikiOverlay: (...args: unknown[]) => mockCommitWikiOverlay(...args),
  cacheWikiGraphNodes: (...args: unknown[]) =>
    mockCacheWikiGraphNodes(...args),
  clearWikiGraphOverlay: (...args: unknown[]) =>
    mockClearWikiGraphOverlay(...args),
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
    setOverlayProducerPointIds: jest
      .fn()
      .mockResolvedValue({ overlayCount: 0 }),
    clearOverlayProducer: jest.fn().mockResolvedValue({ overlayCount: 0 }),
    setSelectedPointIndices: jest.fn().mockResolvedValue(undefined),
  } as unknown as GraphBundleQueries;
}

describe("useWikiGraphSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dashboardState.activeSelectionSourceId = null;
    mockResolveWikiOverlay.mockResolvedValue({
      availability: {},
      pointIds: ["point-1"],
    });
    mockCommitWikiOverlay.mockResolvedValue(undefined);
    mockCacheWikiGraphNodes.mockResolvedValue({
      "ref-1": { index: 42, id: "ref-1-node" },
    });
    mockClearWikiGraphOverlay.mockResolvedValue(undefined);
  });

  it("does not mutate overlay on mount", async () => {
    const queries = createMockQueries();

    renderHook(() =>
      useWikiGraphSync({
        queries,
        pageGraphRefs: ["ref-1"],
        currentSlug: "entities/test",
      }),
    );

    await act(async () => {});

    expect(mockResolveWikiOverlay).not.toHaveBeenCalled();
    expect(mockCommitWikiOverlay).not.toHaveBeenCalled();
    expect(mockCommitSelectionState).not.toHaveBeenCalled();
  });

  it("shows page evidence on graph explicitly and fits multi-paper results", async () => {
    const queries = createMockQueries();
    mockCacheWikiGraphNodes.mockResolvedValue({
      "ref-1": { index: 42, id: "ref-1-node" },
      "ref-2": { index: 84, id: "ref-2-node" },
    });

    const { result } = renderHook(() =>
      useWikiGraphSync({
        queries,
        pageGraphRefs: ["ref-1", "ref-2"],
        currentSlug: "entities/test",
      }),
    );

    await act(async () => {
      await result.current.showPageOnGraph();
    });

    expect(mockResolveWikiOverlay).toHaveBeenCalledWith({
      queries,
      graphPaperRefs: ["ref-1", "ref-2"],
    });
    expect(mockCommitWikiOverlay).toHaveBeenCalledWith({
      producerId: "wiki:page",
      queries,
      pointIds: ["point-1"],
    });
    expect(mockCacheWikiGraphNodes).toHaveBeenCalledWith({
      queries,
      graphPaperRefs: ["ref-1", "ref-2"],
    });
    expect(mockCommitSelectionState).toHaveBeenCalledWith({
      sourceId: "wiki:page",
      queries,
      pointIndices: [42, 84],
      setSelectedPointCount: dashboardState.setSelectedPointCount,
      setActiveSelectionSourceId: dashboardState.setActiveSelectionSourceId,
    });
    expect(mockSelectPointsByIndices).toHaveBeenCalledWith({
      sourceId: "wiki:page",
      pointIndices: [42, 84],
    });
    expect(mockFitViewByIndices).toHaveBeenCalledWith([42, 84], 400, 0.15);
    expect(mockZoomToPoint).not.toHaveBeenCalled();
  });

  it("reuses cached nodes for single-paper selection without overfitting the viewport", async () => {
    const queries = createMockQueries();
    const { result } = renderHook(() =>
      useWikiGraphSync({
        queries,
        pageGraphRefs: ["ref-1"],
        currentSlug: "entities/test",
      }),
    );

    await act(async () => {
      await result.current.showPageOnGraph();
    });
    mockFitViewByIndices.mockClear();
    mockZoomToPoint.mockClear();

    await act(async () => {
      result.current.onPaperClick("ref-1");
      await Promise.resolve();
    });

    expect(mockCommitSelectionState).toHaveBeenCalledWith({
      sourceId: "wiki:page",
      queries,
      pointIndices: [42],
      setSelectedPointCount: dashboardState.setSelectedPointCount,
      setActiveSelectionSourceId: dashboardState.setActiveSelectionSourceId,
    });
    expect(mockSelectPointsByIndices).toHaveBeenLastCalledWith({
      sourceId: "wiki:page",
      pointIndices: [42],
    });
    expect(mockFocusNode).toHaveBeenCalledWith(
      expect.objectContaining({ index: 42, id: "ref-1-node" }),
      { zoomDuration: 250, selectPoint: false },
    );
    expect(mockFitViewByIndices).not.toHaveBeenCalled();
  });

  it("clears owned overlay and selection state explicitly", async () => {
    const queries = createMockQueries();
    dashboardState.activeSelectionSourceId = "wiki:page";

    const { result } = renderHook(() =>
      useWikiGraphSync({
        queries,
        pageGraphRefs: ["ref-1"],
        currentSlug: "entities/test",
      }),
    );

    act(() => {
      result.current.clearPageGraph();
    });

    expect(mockClearWikiGraphOverlay).toHaveBeenCalledWith({
      producerId: "wiki:page",
      queries,
    });
    expect(mockClearSelectionBySource).toHaveBeenCalledWith("wiki:page");
    expect(mockClearOwnedSelectionState).toHaveBeenCalledWith({
      sourceId: "wiki:page",
      activeSelectionSourceId: "wiki:page",
      queries,
      setSelectedPointCount: dashboardState.setSelectedPointCount,
      setActiveSelectionSourceId: dashboardState.setActiveSelectionSourceId,
    });
  });
});
