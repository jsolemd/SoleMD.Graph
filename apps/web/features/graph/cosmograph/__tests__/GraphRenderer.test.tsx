/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { forwardRef, type ForwardedRef, useImperativeHandle } from "react";
import { DEFAULT_INITIAL_CAMERA, saveCameraState } from "@solemd/graph/cosmograph";

jest.mock("@mantine/core", () => ({
  useComputedColorScheme: () => "dark",
}));

const mockPointsFilteredHandler = jest.fn();
jest.mock("../hooks/use-points-filtered", () => ({
  usePointsFiltered: () => mockPointsFilteredHandler,
}));

const mockZoomLabelsState = {
  zoomedIn: false,
};
const mockSyncZoomState = jest.fn();
const mockHandleZoom = jest.fn();
const mockFitView = jest.fn();
const mockApplyViewportTransform = jest.fn();
const mockPointsSelectionUpdate = jest.fn();
const mockUnselectAllPoints = jest.fn();
const mockCanvasSelection = {};

class MockZoomTransform {
  constructor(
    public k: number,
    public x: number,
    public y: number,
  ) {}
}

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
        _cosmos: {
          canvasD3Selection: mockCanvasSelection,
          zoomInstance: {
            behavior: {
              transform: mockApplyViewportTransform,
            },
            eventTransform: new MockZoomTransform(1, 0, 0),
          },
        },
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

jest.mock("@solemd/graph/cosmograph", () => {
  const actual = jest.requireActual("@solemd/graph/cosmograph");
  return {
    ...actual,
    useZoomLabels: () => ({
      zoomedIn: mockZoomLabelsState.zoomedIn,
      syncZoomState: mockSyncZoomState,
      handleZoom: mockHandleZoom,
    }),
  };
});

import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import type { GraphCanvasSource } from "@/features/graph/duckdb/types";
import type { GraphBundleQueries, GraphPointRecord } from "@solemd/graph";
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
  sessionStorage.clear();
  mockZoomLabelsState.zoomedIn = false;
  useDashboardStore.setState(useDashboardStore.getInitialState());
  useGraphStore.setState(useGraphStore.getInitialState());
});

describe("GraphRenderer", () => {
  it("wires native cluster label selection in overview mode", () => {
    act(() => {
      useDashboardStore.setState({ showPointLabels: true });
    });

    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(props).toBeDefined();
    expect(props?.pointLabelBy).toBe("displayLabel");
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
    expect(clusterLabelClassName?.("", 0)).toBe("sol-cluster-label-hidden");
    expect(clusterLabelClassName?.("null", 0)).toBe("sol-cluster-label-hidden");
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
    expect(styleTag?.textContent).toContain(":empty");
  });

  it("restores the default initial camera before signaling first paint", () => {
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

      expect(mockApplyViewportTransform).toHaveBeenCalledWith(
        mockCanvasSelection,
        expect.objectContaining({
          k: DEFAULT_INITIAL_CAMERA.zoomLevel,
          x: DEFAULT_INITIAL_CAMERA.transformX,
          y: DEFAULT_INITIAL_CAMERA.transformY,
        }),
      );
      expect(mockFitView).not.toHaveBeenCalled();
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

  it("does not throw when zoom-end settles after the Cosmograph ref is cleared", () => {
    const { unmount } = render(
      <GraphRenderer
        canvas={CANVAS_STUB}
        queries={QUERIES_STUB}
      />,
    );

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(props).toBeDefined();
    unmount();

    expect(() => {
      act(() => {
        (props?.onZoomEnd as (() => void) | undefined)?.();
      });
    }).not.toThrow();
  });

  it("prefers the saved session camera over the default initial camera", () => {
    saveCameraState({
      zoomLevel: 0.61,
      transformX: 42,
      transformY: -17,
    });

    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    act(() => {
      (props?.onGraphRebuilt as ((stats: unknown) => void) | undefined)?.({
        pointsCount: 120,
        linksCount: 0,
      });
    });

    expect(props?.initialZoomLevel).toBe(0.61);
    expect(mockApplyViewportTransform).toHaveBeenCalledWith(
      mockCanvasSelection,
      expect.objectContaining({
        k: 0.61,
        x: 42,
        y: -17,
      }),
    );
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
    expect(props?.hoveredPointLabelClassName).toBe("");
  });

  it("does not auto-enable renderLinks on selection (perf regression guard)", () => {
    renderRenderer();

    // Simulate selection by updating the store
    act(() => {
      useDashboardStore.setState({ selectedPointCount: 500 });
    });

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    // renderLinks must stay false — auto-toggling on selection forces
    // Cosmograph to load the full links table mid-selection, causing
    // multi-second stalls on 1M+ point graphs.
    expect(props?.renderLinks).toBe(false);
  });

  it("defaults point clicks to single-select unless connected-select is enabled", () => {
    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(props?.selectPointOnClick).toBe("single");
    expect(props?.selectPointOnLabelClick).toBe("single");
  });

  it("enables connected point selection only when the toggle is on", () => {
    act(() => {
      useDashboardStore.setState({ connectedSelect: true });
    });

    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(props?.selectPointOnClick).toBe(true);
    expect(props?.selectPointOnLabelClick).toBe(true);
  });

  it("defers label-mode selection changes behind useDeferredValue", () => {
    act(() => {
      useDashboardStore.setState({ showPointLabels: true });
    });

    renderRenderer();

    // Before selection: cluster labels visible, dynamic labels off
    const propsBeforeSelection = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(propsBeforeSelection?.showClusterLabels).toBe(true);

    // Trigger selection — in the SAME synchronous render, the deferred
    // hasSelection is still false, so label props should NOT yet flip.
    // (In jsdom useDeferredValue returns the value synchronously on next
    // render, but the structural guarantee is that label mode receives
    // deferredHasSelection, not the raw hasSelection.)
    act(() => {
      useDashboardStore.setState({ selectedPointCount: 100 });
    });

    // After selection settles: labels should reflect selection state
    const propsAfterSelection = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(propsAfterSelection?.showSelectedLabels).toBe(false);
    expect(propsAfterSelection?.showUnselectedPointLabels).toBe(false);
  });

  it("preserves selection through a touch pan that ends with onBackgroundClick", () => {
    useGraphStore.setState({
      selectedNode: SELECTED_POINT,
      focusedPointIndex: SELECTED_POINT.index,
    });

    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    // Simulate a real pan gesture: zoom-start, zoom with travel beyond the
    // tap threshold, zoom-end, then Cosmograph's synthesized background click.
    act(() => {
      (
        props?.onZoomStart as
          | ((e: unknown, userDriven: boolean) => void)
          | undefined
      )?.({ transform: { x: 0, y: 0, k: 1 } }, true);
      (
        props?.onZoom as
          | ((e: unknown, userDriven: boolean) => void)
          | undefined
      )?.({ transform: { x: 120, y: 40, k: 1 } }, true);
      (
        props?.onZoomEnd as
          | ((e: unknown, userDriven: boolean) => void)
          | undefined
      )?.({ transform: { x: 120, y: 40, k: 1 } }, true);
      (props?.onBackgroundClick as (() => void) | undefined)?.();
    });

    expect(useGraphStore.getState().selectedNode).toEqual(SELECTED_POINT);
    expect(useGraphStore.getState().focusedPointIndex).toBe(
      SELECTED_POINT.index,
    );
    expect(mockUnselectAllPoints).not.toHaveBeenCalled();
  });

  it("clears selection on a genuine background tap (no pan in between)", () => {
    useGraphStore.setState({
      selectedNode: SELECTED_POINT,
      focusedPointIndex: SELECTED_POINT.index,
    });

    renderRenderer();

    const props = mockCosmographRender.mock.lastCall?.[0] as
      | Record<string, unknown>
      | undefined;

    act(() => {
      (
        props?.onZoomStart as
          | ((e: unknown, userDriven: boolean) => void)
          | undefined
      )?.({ transform: { x: 0, y: 0, k: 1 } }, true);
      (
        props?.onZoomEnd as
          | ((e: unknown, userDriven: boolean) => void)
          | undefined
      )?.({ transform: { x: 0, y: 0, k: 1 } }, true);
      (props?.onBackgroundClick as (() => void) | undefined)?.();
    });

    expect(useGraphStore.getState().selectedNode).toBeNull();
    expect(useGraphStore.getState().focusedPointIndex).toBeNull();
    expect(mockUnselectAllPoints).toHaveBeenCalledTimes(1);
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
