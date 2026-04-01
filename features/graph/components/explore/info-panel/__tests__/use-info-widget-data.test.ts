/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import type {
  GraphBundleQueries,
  GraphInfoHistogramResult,
} from "@/features/graph/types";
import { useInfoWidgetData } from "../use-info-widget-data";

function createHistogram(
  bins: Array<{ min: number; max: number; count: number }>,
): GraphInfoHistogramResult {
  return {
    bins,
    totalCount: bins.reduce((sum, bin) => sum + bin.count, 0),
  };
}

describe("useInfoWidgetData", () => {
  it("batches selection and filtered histogram comparisons with per-column extents", async () => {
    const getInfoBarsBatch = jest.fn().mockResolvedValue({});
    const getInfoHistogramsBatch = jest.fn().mockImplementation((args: {
      scope: "dataset" | "selected" | "current";
      columns: string[];
      useQuantiles?: boolean;
      extentsByColumn?: Record<string, [number, number] | null>;
    }) => {
      if (args.scope === "dataset" && args.useQuantiles === true) {
        return Promise.resolve({
          paperReferenceCount: createHistogram([
            { min: 1, max: 10.5, count: 5 },
            { min: 10.5, max: 20, count: 4 },
          ]),
        });
      }

      if (args.scope === "dataset") {
        return Promise.resolve({
          year: createHistogram([
            { min: 2000, max: 2003, count: 3 },
            { min: 2003, max: 2006, count: 2 },
          ]),
        });
      }

      if (args.scope === "selected") {
        return Promise.resolve({
          year: createHistogram([{ min: 2000, max: 2003, count: 2 }]),
          paperReferenceCount: createHistogram([{ min: 1, max: 10.5, count: 1 }]),
        });
      }

      return Promise.resolve({
        year: createHistogram([{ min: 2003, max: 2006, count: 1 }]),
        paperReferenceCount: createHistogram([{ min: 10.5, max: 20, count: 2 }]),
      });
    });
    const getNumericStatsBatch = jest.fn().mockImplementation((args: {
      scope: "dataset" | "selected" | "current";
    }) => {
      if (args.scope === "selected") {
        return Promise.resolve({
          year: { min: 2000, median: 2001, avg: 2001, max: 2002 },
          paperReferenceCount: { min: 2, median: 3, avg: 3, max: 4 },
        });
      }

      if (args.scope === "current") {
        return Promise.resolve({
          year: { min: 2003, median: 2004, avg: 2004, max: 2005 },
          paperReferenceCount: { min: 11, median: 12, avg: 13, max: 15 },
        });
      }

      return Promise.resolve({
        year: { min: 2000, median: 2002, avg: 2002.5, max: 2006 },
        paperReferenceCount: { min: 1, median: 8, avg: 9.5, max: 20 },
      });
    });

    const queries = {
      getInfoBarsBatch,
      getInfoHistogramsBatch,
      getNumericStatsBatch,
    } as unknown as GraphBundleQueries;

    const { result } = renderHook(() =>
      useInfoWidgetData({
        queries,
        activeLayer: "corpus",
        includeSelectionLayer: true,
        includeFilteredLayer: true,
        filteredPointScopeSql: "year >= 2003",
        widgetDescriptors: [
          { column: "year", kind: "histogram" },
          { column: "paperReferenceCount", kind: "histogram" },
        ],
        requestKey: "request-key",
      }),
    );

    await waitFor(() => {
      expect(result.current.lastLoadedKey).toBe("request-key");
    });

    expect(getInfoHistogramsBatch).toHaveBeenCalledTimes(4);
    expect(getNumericStatsBatch).toHaveBeenCalledTimes(3);

    const selectedCall = getInfoHistogramsBatch.mock.calls
      .map(([args]) => args)
      .find((args) => args.scope === "selected");
    const filteredCall = getInfoHistogramsBatch.mock.calls
      .map(([args]) => args)
      .find((args) => args.scope === "current");

    expect(selectedCall).toEqual(
      expect.objectContaining({
        columns: ["year", "paperReferenceCount"],
        extentsByColumn: {
          year: [2000, 2006],
          paperReferenceCount: [1, 20],
        },
      }),
    );
    expect(filteredCall).toEqual(
      expect.objectContaining({
        columns: ["year", "paperReferenceCount"],
        extentsByColumn: {
          year: [2000, 2006],
          paperReferenceCount: [1, 20],
        },
        currentPointScopeSql: "year >= 2003",
      }),
    );

    expect(result.current.histograms.year.selection?.totalCount).toBe(2);
    expect(result.current.histograms.paperReferenceCount.filtered?.totalCount).toBe(2);
  });
});
