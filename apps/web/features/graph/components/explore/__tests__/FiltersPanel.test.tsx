/**
 * @jest-environment jsdom
 */
import { render, waitFor } from "@testing-library/react";
import type {
  GraphBundleQueries,
  GraphInfoHistogramResult,
} from "@solemd/graph";
import { useDashboardStore } from "@/features/graph/stores";
import { ORB_RESIDENT_POINT_SCOPE_SQL } from "@/features/graph/cosmograph/widgets/widget-baseline";

const mockFilterBarWidget = jest.fn(() => null);
const mockFilterHistogramWidget = jest.fn(() => null);

jest.mock("../FilterPanelShell", () => {
  const React = require("react");

  return {
    FilterPanelShell: ({
      onVisibleFiltersChange,
      renderWidget,
    }: {
      onVisibleFiltersChange?: (
        filters: Array<{ column: string; type: string }>
      ) => void;
      renderWidget: (filter: { column: string; type: string }) => React.ReactNode;
    }) => {
      React.useEffect(() => {
        onVisibleFiltersChange?.([
          { column: "year", type: "numeric" },
          { column: "journal", type: "categorical" },
        ]);
      }, [onVisibleFiltersChange]);

      return (
        <div>
          {renderWidget({ column: "year", type: "numeric" })}
          {renderWidget({ column: "journal", type: "categorical" })}
        </div>
      );
    },
  };
});

jest.mock("../../../cosmograph/widgets/FilterBarWidget", () => ({
  FilterBarWidget: (props: unknown) => mockFilterBarWidget(props),
}));

jest.mock("../../../cosmograph/widgets/FilterHistogramWidget", () => ({
  FilterHistogramWidget: (props: unknown) => mockFilterHistogramWidget(props),
}));

jest.mock("../../canvas/CosmographWidgetBoundary", () => ({
  CosmographWidgetBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

import { FiltersPanel } from "../FiltersPanel";

const HISTOGRAM_RESULT: GraphInfoHistogramResult = {
  totalCount: 12,
  bins: [{ min: 2020, max: 2024, count: 12 }],
};

describe("FiltersPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("batches visible categorical and numeric baseline fetches before hydrating widgets", async () => {
    useDashboardStore.getState().setOrbResidentPointCount(16_384);
    const queries = {
      getInfoBarsBatch: jest.fn().mockResolvedValue({
        journal: [{ value: "Nature", count: 7 }],
      }),
      getInfoHistogramsBatch: jest.fn().mockResolvedValue({
        year: HISTOGRAM_RESULT,
      }),
    } as unknown as GraphBundleQueries;

    render(
      <FiltersPanel
        queries={queries}
        bundleChecksum="bundle-checksum"
        overlayRevision={3}
      />,
    );

    await waitFor(() => {
      expect(queries.getInfoBarsBatch).toHaveBeenCalledTimes(1);
      expect(queries.getInfoHistogramsBatch).toHaveBeenCalledTimes(1);
    });
    expect(queries.getInfoBarsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "current",
        currentPointScopeSql: ORB_RESIDENT_POINT_SCOPE_SQL,
      }),
    );
    expect(queries.getInfoHistogramsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "current",
        currentPointScopeSql: ORB_RESIDENT_POINT_SCOPE_SQL,
      }),
    );

    await waitFor(() => {
      const numericProps = mockFilterHistogramWidget.mock.lastCall?.[0] as
        | { initialHistogram?: GraphInfoHistogramResult; datasetLoading?: boolean }
        | undefined;
      const categoricalProps = mockFilterBarWidget.mock.lastCall?.[0] as
        | { initialDatasetRows?: Array<{ value: string; scopedCount: number; totalCount: number }>; datasetLoading?: boolean }
        | undefined;

      expect(numericProps?.initialHistogram).toEqual(HISTOGRAM_RESULT);
      expect(numericProps?.datasetLoading).toBe(false);
      expect(categoricalProps?.initialDatasetRows).toEqual([
        { value: "Nature", scopedCount: 7, totalCount: 7 },
      ]);
      expect(categoricalProps?.datasetLoading).toBe(false);
    });
  });

  it("does not hydrate widget datasets before the 3D resident sample is ready", async () => {
    const queries = {
      getInfoBarsBatch: jest.fn().mockResolvedValue({}),
      getInfoHistogramsBatch: jest.fn().mockResolvedValue({}),
    } as unknown as GraphBundleQueries;

    render(
      <FiltersPanel
        queries={queries}
        bundleChecksum="bundle-checksum"
        overlayRevision={3}
      />,
    );

    await waitFor(() => {
      const numericProps = mockFilterHistogramWidget.mock.lastCall?.[0] as
        | { datasetLoading?: boolean }
        | undefined;
      const categoricalProps = mockFilterBarWidget.mock.lastCall?.[0] as
        | { datasetLoading?: boolean }
        | undefined;

      expect(numericProps?.datasetLoading).toBe(true);
      expect(categoricalProps?.datasetLoading).toBe(true);
    });

    expect(queries.getInfoBarsBatch).not.toHaveBeenCalled();
    expect(queries.getInfoHistogramsBatch).not.toHaveBeenCalled();
  });
});
