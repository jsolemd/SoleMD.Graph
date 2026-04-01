/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { forwardRef, type ForwardedRef, useImperativeHandle } from "react";

jest.mock("@mantine/core", () => ({
  useComputedColorScheme: () => "dark",
}));

const mockPointsFilteredHandler = jest.fn();
jest.mock("../hooks/use-points-filtered", () => ({
  usePointsFiltered: () => mockPointsFilteredHandler,
}));

const mockZoomLabelsState = {
  zoomedIn: false,
  isActivelyZooming: false,
};
const mockSyncZoomState = jest.fn();
const mockHandleZoomStart = jest.fn();
const mockHandleZoom = jest.fn();
const mockHandleZoomEnd = jest.fn();
const mockFitView = jest.fn();
const mockPointsSelectionUpdate = jest.fn();
const mockUnselectAllPoints = jest.fn();

jest.mock("../hooks/use-zoom-labels", () => ({
  useZoomLabels: () => ({
    zoomedIn: mockZoomLabelsState.zoomedIn,
    isActivelyZooming: mockZoomLabelsState.isActivelyZooming,
    syncZoomState: mockSyncZoomState,
    handleZoomStart: mockHandleZoomStart,
    handleZoom: mockHandleZoom,
    handleZoomEnd: mockHandleZoomEnd,
  }),
}));

jest.mock("@uwdata/mosaic-sql", () => ({
  and: jest.fn(),
  column: jest.fn(),
  duckDBCodeGenerator: { toString: jest.fn(() => "TRUE") },
  eq: jest.fn(),
  isBetween: jest.fn(),
  isNull: jest.fn(),
  literal: jest.fn(),
  or: jest.fn(),
  sql: jest.fn(),
}));

const mockCosmographRender = jest.fn();

jest.mock("@cosmograph/react", () => {
  return {
    Cosmograph: forwardRef(function MockCosmograph(
      props: Record<string, unknown>,
      ref: ForwardedRef<unknown>,
    ) {
      useImperativeHandle(ref, () => ({
        fitView: mockFitView,
        pointsSelection: {
          clauses: [],
          update: mockPointsSelectionUpdate,
        },
        unselectAllPoints: mockUnselectAllPoints,
      }));
      mockCosmographRender(props);
      return <div data-testid="cosmograph" />;
    }),
  };
});

import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import type { GraphCanvasSource } from "@/features/graph/duckdb/types";
import type { GraphBundleQueries, GraphPointRecord } from "@/features/graph/types";
import GraphRenderer from "../GraphRenderer";

const CANVAS_STUB = {
  duckDBConnection: {} as GraphCanvasSource["duckDBConnection"],
  pointCounts: { corpus: 120, entities: 0, relations: 0 },
  overlayCount: 0,
  overlayRevision: 0,
} as GraphCanvasSource;

const QUERIES_STUB = {
  resolvePointSelection: jest.fn(),
  setSelectedPointIndices: jest.fn(),
  setSelectedPointScopeSql: jest.fn(),
  getVisibilityBudget: jest.fn(),
} as unknown as GraphBundleQueries;

const SELECTED_POINT: GraphPointRecord = {
  index: 7,
  id: "paper-7",
  paperId: "paper-7",
  nodeKind: "paper",
  nodeRole: "primary",
  color: "#000000",
  colorLight: "#000000",
  x: 0,
  y: 0,
  clusterId: 4,
  clusterLabel: "Neuroinflammation",
  displayLabel: "Paper 7",
  displayPreview: "Paper 7",
  paperTitle: "Paper 7",
  citekey: null,
  journal: null,
  year: 2024,
  semanticGroups: null,
  relationCategories: null,
  textAvailability: null,
  paperAuthorCount: null,
  paperReferenceCount: null,
  paperEntityCount: null,
  paperRelationCount: null,
  isInBase: true,
  baseRank: 1,
  isOverlayActive: false,
};

function renderRenderer() {
  render(
    <GraphRenderer
      canvas={CANVAS_STUB}
      queries={QUERIES_STUB}
    />,
  );
  expect(screen.getByTestId("cosmograph")).toBeInTheDocument();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockZoomLabelsState.zoomedIn = false;
  mockZoomLabelsState.isActivelyZooming = false;
  useDashboardStore.setState(useDashboardStore.getInitialState());
  useGraphStore.setState(useGraphStore.getInitialState());
});

describe("GraphRenderer", () => {
  it("wires native cluster label selection in overview mode", () => {
    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(props).toBeDefined();
    expect(props?.pointClusterBy).toBe("clusterLabel");
    expect(props?.showClusterLabels).toBe(true);
    expect(props?.showDynamicLabels).toBe(false);
    expect(props?.selectClusterOnLabelClick).toBe(true);
    expect(props?.usePointColorStrategyForClusterLabels).toBe(true);
    expect(typeof props?.clusterLabelClassName).toBe("function");
    expect(typeof props?.onClusterLabelClick).toBe("function");
  });

  it("hides non-semantic native cluster labels while leaving semantic labels on the native style path", () => {
    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;
    const clusterLabelClassName = props?.clusterLabelClassName as
      | ((text: string, clusterIndex: number) => string)
      | undefined;

    expect(clusterLabelClassName).toBeDefined();
    expect(clusterLabelClassName?.("Neuroinflammation", 0)).toBe("");
    expect(clusterLabelClassName?.("", 0)).toBe("display: none;");
    expect(clusterLabelClassName?.("null", 0)).toBe("display: none;");
  });

  it("mounts one centralized native label theme bridge for point, hover, and cluster labels", () => {
    renderRenderer();

    const styleTag = document.querySelector<HTMLStyleElement>(
      'style[data-graph-label-theme="native-adapter"]',
    );

    expect(styleTag).toBeInTheDocument();
    expect(styleTag?.textContent).toContain(".css-label--label");
    expect(styleTag?.textContent).toContain("var(--graph-label-bg)");
    expect(styleTag?.textContent).toContain("background-color");
    expect(styleTag?.textContent).toContain("--css-label-brightness: none");
    expect(styleTag?.textContent).toContain("var(--graph-label-border)");
    expect(styleTag?.textContent).toContain("var(--graph-label-shadow)");
    expect(styleTag?.textContent).toContain("opacity: 1");
    expect(styleTag?.textContent).toContain("var(--graph-label-text-shadow)");
    expect(styleTag?.textContent).toContain("var(--graph-label-text-stroke)");
  });

  it("fits the initial viewport explicitly before signaling first paint", () => {
    const onFirstPaint = jest.fn();
    const rafCallbacks: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof globalThis.requestAnimationFrame;

    try {
      render(
        <GraphRenderer
          canvas={CANVAS_STUB}
          queries={QUERIES_STUB}
          onFirstPaint={onFirstPaint}
        />,
      );

      expect(screen.getByTestId("cosmograph")).toBeInTheDocument();

      const props = mockCosmographRender.mock.lastCall?.[0] as
        | Record<string, unknown>
        | undefined;

      expect(props).toBeDefined();
      expect(props?.fitViewOnInit).toBeUndefined();
      expect(props?.fitViewDelay).toBeUndefined();
      expect(props?.fitViewDuration).toBeUndefined();

      act(() => {
        (props?.onGraphRebuilt as ((stats: unknown) => void) | undefined)?.({
          pointsCount: 120,
          linksCount: 0,
        });
      });

      expect(mockFitView).toHaveBeenCalledWith(0, 0.1);
      expect(mockSyncZoomState).toHaveBeenCalledTimes(1);
      expect(onFirstPaint).not.toHaveBeenCalled();
      expect(rafCallbacks).toHaveLength(1);

      act(() => {
        const nextFrame = rafCallbacks.shift();
        nextFrame?.(0);
      });

      expect(onFirstPaint).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("keeps zoomed point and hover labels on Cosmograph's native style path", () => {
    mockZoomLabelsState.zoomedIn = true;

    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(props).toBeDefined();
    expect(props?.pointLabelBy).toBe("displayLabel");
    expect(props?.showClusterLabels).toBe(false);
    expect(props?.pointLabelColor).toBeUndefined();
    expect(props?.pointLabelClassName).toBeUndefined();
    expect(props?.hoveredPointLabelClassName).toBeUndefined();
  });

  it("clears stale point focus and detail when a cluster label is clicked", () => {
    useGraphStore.setState({
      selectedNode: SELECTED_POINT,
      focusedPointIndex: SELECTED_POINT.index,
    });

    renderRenderer();

    act(() => {
      const props = mockCosmographRender.mock.lastCall?.[0] as
        | Record<string, unknown>
        | undefined;
      (props?.onClusterLabelClick as
        | ((index: number, id: string, event: MouseEvent) => void)
        | undefined)?.(0, "Neuroinflammation", new MouseEvent("click"));
    });

    expect(useGraphStore.getState().selectedNode).toBeNull();
    expect(useGraphStore.getState().focusedPointIndex).toBeNull();
  });
});
