/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { GraphBundle, GraphBundleQueries } from "@/features/graph/types";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";

const mockGraphCanvas = jest.fn(() => <div data-testid="graph-canvas" />);
const mockCanvasControls = jest.fn(() => null);
const mockConfigPanel = jest.fn(() => null);
const mockQueryPanel = jest.fn(() => null);
const mockDetailPanel = jest.fn(() => null);

jest.mock("../../../hooks/use-graph-bundle", () => ({
  useGraphBundle: jest.fn(),
}));

jest.mock("../ModeColorSync", () => ({
  ModeColorSync: () => null,
}));

jest.mock("../chrome", () => ({
  GraphAttribution: () => null,
  TIMELINE_HEIGHT: 44,
  BottomToolbar: () => null,
}));

jest.mock("../loading", () => ({
  GraphBundleErrorState: ({ error }: { error: Error }) => <div>{error.message}</div>,
  GraphBundleLoadingOverlay: () => <div data-testid="loading-overlay" />,
}));

jest.mock("../../canvas/GraphCanvas", () => {
  const React = require("react");

  return {
    GraphCanvas: React.memo((props: unknown) => mockGraphCanvas(props)),
  };
});

jest.mock("../../chrome/Wordmark", () => ({
  Wordmark: () => null,
}));

jest.mock("../../panels/PromptBox", () => ({
  PromptBox: () => null,
}));

jest.mock("../../chrome/TimelineBar", () => ({
  TimelineBar: () => null,
}));

jest.mock("../../chrome/StatsBar", () => ({
  StatsBar: () => null,
}));

jest.mock("../../explore/CanvasControls", () => ({
  CanvasControls: require("react").memo((props: unknown) => mockCanvasControls(props)),
}));

jest.mock("../../explore/ConfigPanel", () => ({
  ConfigPanel: require("react").memo((props: unknown) => mockConfigPanel(props)),
}));

jest.mock("../../explore/FiltersPanel", () => ({
  FiltersPanel: () => null,
}));

jest.mock("../../explore/info-panel", () => ({
  InfoPanel: () => null,
}));

jest.mock("../../explore/query-panel", () => ({
  QueryPanel: require("react").memo((props: unknown) => mockQueryPanel(props)),
}));

jest.mock("../../explore/data-table", () => ({
  DataTable: () => null,
}));

jest.mock("../../panels/DetailPanel", () => ({
  DetailPanel: require("react").memo((props: unknown) => mockDetailPanel(props)),
}));

jest.mock("../../panels/AboutPanel", () => ({
  AboutPanel: () => null,
}));

jest.mock("../../../cosmograph", () => ({
  GraphShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ColorLegends: () => null,
  SizeLegend: () => null,
}));

const { useGraphBundle } = jest.requireMock("../../../hooks/use-graph-bundle") as {
  useGraphBundle: jest.Mock;
};

const CANVAS_STUB = {
  overlayRevision: 0,
  overlayCount: 0,
  pointCounts: { corpus: 120, entities: 0, relations: 0 },
} as GraphCanvasSource;

const QUERIES_STUB = {
  getInfoBarsBatch: jest.fn(),
  getInfoHistogram: jest.fn(),
  getInfoHistogramsBatch: jest.fn(),
  runReadOnlyQuery: jest.fn(),
} as unknown as GraphBundleQueries;

const BUNDLE_STUB = {
  bundleChecksum: "bundle-checksum",
  qaSummary: {
    cluster_count: 4,
    noise_count: 1,
  },
} as GraphBundle;

import { DashboardShellClient } from "../DashboardShellClient";

describe("DashboardShellClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState(useDashboardStore.getInitialState());
    useGraphStore.setState(useGraphStore.getInitialState());
    useGraphBundle.mockReturnValue({
      canvas: CANVAS_STUB,
      error: null,
      loading: false,
      progress: null,
      queries: QUERIES_STUB,
    });
  });

  it("does not re-render GraphCanvas when unrelated shell chrome state changes", () => {
    render(<DashboardShellClient bundle={BUNDLE_STUB} />);

    expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
    expect(mockGraphCanvas).toHaveBeenCalledTimes(1);

    act(() => {
      useDashboardStore.setState({ showSizeLegend: true });
    });

    expect(mockGraphCanvas).toHaveBeenCalledTimes(1);
  });

  it("does not re-render ConfigPanel, DetailPanel, or CanvasControls when unrelated shell chrome changes", () => {
    useDashboardStore.setState({ activePanel: "config" });

    render(<DashboardShellClient bundle={BUNDLE_STUB} />);

    expect(mockConfigPanel).toHaveBeenCalledTimes(1);
    expect(mockDetailPanel).toHaveBeenCalledTimes(1);
    expect(mockCanvasControls).toHaveBeenCalledTimes(1);

    act(() => {
      useDashboardStore.setState({ showSizeLegend: true });
    });

    expect(mockConfigPanel).toHaveBeenCalledTimes(1);
    expect(mockDetailPanel).toHaveBeenCalledTimes(1);
    expect(mockCanvasControls).toHaveBeenCalledTimes(1);
  });

  it("does not re-render QueryPanel when unrelated shell chrome changes", () => {
    useDashboardStore.setState({ activePanel: "query" });

    render(<DashboardShellClient bundle={BUNDLE_STUB} />);

    expect(mockQueryPanel).toHaveBeenCalledTimes(1);

    act(() => {
      useDashboardStore.setState({ showTimeline: true });
    });

    expect(mockQueryPanel).toHaveBeenCalledTimes(1);
  });

  it("batches startup numeric filter warming after the first paint", async () => {
    const requestIdleCallback = jest.fn((callback: IdleRequestCallback) => {
      callback({
        didTimeout: false,
        timeRemaining: () => 50,
      } as IdleDeadline);
      return 1;
    });
    const cancelIdleCallback = jest.fn();

    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      writable: true,
      value: requestIdleCallback,
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      writable: true,
      value: cancelIdleCallback,
    });

    QUERIES_STUB.getInfoHistogramsBatch.mockResolvedValue({});
    useDashboardStore.setState({
      filterColumns: [
        { column: "year", type: "numeric" },
        { column: "pageNumber", type: "numeric" },
      ],
    });

    render(<DashboardShellClient bundle={BUNDLE_STUB} />);

    act(() => {
      const props = mockGraphCanvas.mock.calls[0]?.[0] as { onFirstPaint?: () => void };
      props.onFirstPaint?.();
    });

    await waitFor(() => {
      expect(QUERIES_STUB.getInfoHistogramsBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          layer: "corpus",
          scope: "dataset",
          columns: ["year", "pageNumber"],
          bins: 20,
          currentPointScopeSql: null,
        }),
      );
    });
  });
});
