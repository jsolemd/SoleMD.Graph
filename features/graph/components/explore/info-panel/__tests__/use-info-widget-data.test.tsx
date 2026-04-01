/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type {
  GraphBundleQueries,
  GraphInfoHistogramResult,
} from "@/features/graph/types";
import { useInfoWidgetData } from "../use-info-widget-data";

const DATASET_YEAR_HISTOGRAM: GraphInfoHistogramResult = {
  totalCount: 10,
  bins: [{ min: 2020, max: 2024, count: 10 }],
};

const DATASET_AUTHOR_HISTOGRAM: GraphInfoHistogramResult = {
  totalCount: 10,
  bins: [{ min: 1, max: 10, count: 10 }],
};

const WIDGET_DESCRIPTORS = [
  { column: "year", kind: "histogram" as const },
  { column: "paperAuthorCount", kind: "histogram" as const },
  { column: "journal", kind: "bars" as const },
];

function UseInfoWidgetDataHarness({
  queries,
  widgetDescriptors,
  requestKey,
}: {
  queries: GraphBundleQueries;
  widgetDescriptors: Array<{ column: string; kind: "histogram" | "bars" | "facet-summary" }>;
  requestKey: string;
}) {
  const result = useInfoWidgetData({
    queries,
    activeLayer: "corpus",
    includeSelectionLayer: true,
    includeFilteredLayer: true,
    filteredPointScopeSql: "year >= 2020",
    widgetDescriptors,
    requestKey,
  });

  return <div data-testid="loaded-key">{result.lastLoadedKey ?? "pending"}</div>;
}

function createQueriesMock() {
  return {
    getInfoBarsBatch: jest
      .fn()
      .mockResolvedValue({
        journal: [{ value: "Nature", count: 7 }],
      }),
    getInfoHistogram: jest.fn(),
    getInfoHistogramsBatch: jest
      .fn()
      .mockResolvedValueOnce({
        year: DATASET_YEAR_HISTOGRAM,
      })
      .mockResolvedValueOnce({
        paperAuthorCount: DATASET_AUTHOR_HISTOGRAM,
      })
      .mockResolvedValueOnce({
        year: { totalCount: 4, bins: [{ min: 2020, max: 2024, count: 4 }] },
        paperAuthorCount: { totalCount: 4, bins: [{ min: 1, max: 10, count: 4 }] },
      })
      .mockResolvedValueOnce({
        year: { totalCount: 6, bins: [{ min: 2020, max: 2024, count: 6 }] },
        paperAuthorCount: { totalCount: 6, bins: [{ min: 1, max: 10, count: 6 }] },
      }),
    getNumericStatsBatch: jest.fn().mockResolvedValue({
      year: { min: 2020, median: 2022, avg: 2022, max: 2024 },
      paperAuthorCount: { min: 1, median: 4, avg: 4.5, max: 10 },
    }),
  } as unknown as GraphBundleQueries & {
    getInfoBarsBatch: jest.Mock;
    getInfoHistogram: jest.Mock;
    getInfoHistogramsBatch: jest.Mock;
    getNumericStatsBatch: jest.Mock;
  };
}

describe("useInfoWidgetData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("batches selection and filtered histograms instead of issuing per-column histogram queries", async () => {
    const queries = createQueriesMock();

    render(
      <UseInfoWidgetDataHarness
        queries={queries}
        widgetDescriptors={WIDGET_DESCRIPTORS}
        requestKey="request-a"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded-key")).toHaveTextContent("request-a");
    });

    expect(queries.getInfoHistogramsBatch).toHaveBeenCalledTimes(4);
    expect(queries.getInfoHistogram).not.toHaveBeenCalled();
    expect(queries.getInfoHistogramsBatch).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        scope: "selected",
        columns: ["year", "paperAuthorCount"],
        extentsByColumn: {
          year: [2020, 2024],
          paperAuthorCount: [1, 10],
        },
      }),
    );
    expect(queries.getInfoHistogramsBatch).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        scope: "current",
        columns: ["year", "paperAuthorCount"],
        currentPointScopeSql: "year >= 2020",
        extentsByColumn: {
          year: [2020, 2024],
          paperAuthorCount: [1, 10],
        },
      }),
    );
  });

  it("does not refetch when widget descriptors are republished with equal logical contents", async () => {
    const queries = createQueriesMock();
    const { rerender } = render(
      <UseInfoWidgetDataHarness
        queries={queries}
        widgetDescriptors={WIDGET_DESCRIPTORS}
        requestKey="request-a"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded-key")).toHaveTextContent("request-a");
    });

    expect(queries.getInfoBarsBatch).toHaveBeenCalledTimes(3);
    expect(queries.getInfoHistogramsBatch).toHaveBeenCalledTimes(4);
    expect(queries.getNumericStatsBatch).toHaveBeenCalledTimes(3);

    rerender(
      <UseInfoWidgetDataHarness
        queries={queries}
        widgetDescriptors={WIDGET_DESCRIPTORS.map((descriptor) => ({ ...descriptor }))}
        requestKey="request-a"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(queries.getInfoBarsBatch).toHaveBeenCalledTimes(3);
    expect(queries.getInfoHistogramsBatch).toHaveBeenCalledTimes(4);
    expect(queries.getNumericStatsBatch).toHaveBeenCalledTimes(3);
  });
});
