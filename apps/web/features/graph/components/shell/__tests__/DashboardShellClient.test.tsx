/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { GraphBundle, GraphBundleQueries } from "@solemd/graph";
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

jest.mock("../preload-chrome-chunks", () => ({
  preloadChromeChunks: jest.fn(),
}));

jest.mock("../chrome", () => ({
  TIMELINE_HEIGHT: 44,
  BottomToolbar: () => null,
  useBottomChromeFloat: () => ({
    initial: { bottom: 12 },
    animate: { bottom: 12 },
    transition: { bottom: {} },
  }),
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
  useGraphSelection: () => ({
    selectPointsByIndices: jest.fn(),
  }),
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
  getInfoSummary: jest.fn(),
  getNumericStatsBatch: jest.fn(),
  getTablePage: jest.fn(),
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
  function stubResolvedQueries() {
    (QUERIES_STUB.getInfoBarsBatch as jest.Mock).mockResolvedValue({});
    (QUERIES_STUB.getInfoHistogramsBatch as jest.Mock).mockResolvedValue({});
    (QUERIES_STUB.getInfoSummary as jest.Mock).mockResolvedValue({
      baseCount: 0,
      hasSelection: false,
      isSubset: false,
      overlayCount: 0,
      papers: 0,
      scopedCount: 0,
      scope: "dataset",
      totalCount: 0,
    });
    (QUERIES_STUB.getNumericStatsBatch as jest.Mock).mockResolvedValue({});
    (QUERIES_STUB.getTablePage as jest.Mock).mockResolvedValue({
      page: 1,
      pageSize: 100,
      rows: [],
      totalRows: 0,
    });
  }

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

  it("does not re-render GraphCanvas when unrelated shell chrome state changes", async () => {
    await act(async () => {
      render(<DashboardShellClient bundle={BUNDLE_STUB} />);
    });

    expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
    expect(mockGraphCanvas).toHaveBeenCalledTimes(1);

    act(() => {
      useDashboardStore.setState({ showSizeLegend: true });
    });

    expect(mockGraphCanvas).toHaveBeenCalledTimes(1);
  });

  it("does not re-render ConfigPanel, DetailPanel, or CanvasControls when unrelated shell chrome changes", async () => {
    useDashboardStore.getState().openPanel("config");

    await act(async () => {
      render(<DashboardShellClient bundle={BUNDLE_STUB} />);
    });

    await waitFor(() => {
      expect(mockConfigPanel).toHaveBeenCalledTimes(1);
      expect(mockDetailPanel).toHaveBeenCalledTimes(1);
      expect(mockCanvasControls).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useDashboardStore.setState({ showSizeLegend: true });
    });

    expect(mockConfigPanel).toHaveBeenCalledTimes(1);
    expect(mockDetailPanel).toHaveBeenCalledTimes(1);
    expect(mockCanvasControls).toHaveBeenCalledTimes(1);
  });

  it("does not re-render QueryPanel when unrelated shell chrome changes", async () => {
    useDashboardStore.getState().openPanel("query");

    await act(async () => {
      render(<DashboardShellClient bundle={BUNDLE_STUB} />);
    });

    await waitFor(() => {
      expect(mockQueryPanel).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useDashboardStore.setState({ showTimeline: true });
    });

    expect(mockQueryPanel).toHaveBeenCalledTimes(1);
  });

  it("does not trigger hidden query work after first paint", async () => {
    await act(async () => {
      render(<DashboardShellClient bundle={BUNDLE_STUB} />);
    });

    act(() => {
      const props = mockGraphCanvas.mock.calls[0]?.[0] as { onFirstPaint?: () => void };
      props.onFirstPaint?.();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("loading-overlay")).not.toBeInTheDocument();
    });

    expect(QUERIES_STUB.getInfoBarsBatch).not.toHaveBeenCalled();
    expect(QUERIES_STUB.getInfoHistogramsBatch).not.toHaveBeenCalled();
    expect(QUERIES_STUB.getInfoSummary).not.toHaveBeenCalled();
    expect(QUERIES_STUB.getNumericStatsBatch).not.toHaveBeenCalled();
    expect(QUERIES_STUB.getTablePage).not.toHaveBeenCalled();
  });
});
