"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  GraphBundleQueries,
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
} from "@/features/graph/types";
import { useQuantileHistogram } from "@/features/graph/lib/histogram-strategy";

type WidgetDescriptor = {
  column: string;
  kind: "histogram" | "bars" | "facet-summary";
};

export interface InfoHistogramOverlay {
  dataset: GraphInfoHistogramResult;
  subset: GraphInfoHistogramResult | null;
}

const DEFAULT_BAR_ITEMS = 8;
const DEFAULT_HISTOGRAM_BINS = 16;

function mergeBarRows(args: {
  datasetRows: GraphInfoFacetRow[];
  subsetRows: GraphInfoFacetRow[];
}): GraphInfoFacetRow[] {
  const datasetMap = new Map(
    args.datasetRows.map((row) => [row.value, row.totalCount] as const),
  );
  const subsetMap = new Map(
    args.subsetRows.map((row) => [row.value, row.scopedCount] as const),
  );
  const values = new Set<string>([
    ...args.datasetRows.map((row) => row.value),
    ...args.subsetRows.map((row) => row.value),
  ]);

  return Array.from(values)
    .map((value) => ({
      value,
      scopedCount: subsetMap.get(value) ?? datasetMap.get(value) ?? 0,
      totalCount: datasetMap.get(value) ?? 0,
    }))
    .sort((left, right) =>
      right.scopedCount === left.scopedCount
        ? right.totalCount === left.totalCount
          ? left.value.localeCompare(right.value)
          : right.totalCount - left.totalCount
        : right.scopedCount - left.scopedCount,
    )
    .slice(0, DEFAULT_BAR_ITEMS);
}

interface UseInfoWidgetDataArgs {
  queries: GraphBundleQueries;
  activeLayer: Parameters<GraphBundleQueries["getFacetSummaries"]>[0]["layer"];
  subsetScope: "current" | "selected" | null;
  currentPointScopeSql: string | null;
  widgetDescriptors: WidgetDescriptor[];
  requestKey: string;
}

interface UseInfoWidgetDataResult {
  facetSummaries: Record<string, GraphInfoFacetRow[]>;
  barSummaries: Record<string, GraphInfoFacetRow[]>;
  histograms: Record<string, InfoHistogramOverlay>;
  widgetError: string | null;
  lastLoadedKey: string | null;
}

export function useInfoWidgetData({
  queries,
  activeLayer,
  subsetScope,
  currentPointScopeSql: subsetCurrentPointScopeSql,
  widgetDescriptors,
  requestKey,
}: UseInfoWidgetDataArgs): UseInfoWidgetDataResult {
  const [facetSummaries, setFacetSummaries] = useState<
    Record<string, GraphInfoFacetRow[]>
  >({});
  const [barSummaries, setBarSummaries] = useState<
    Record<string, GraphInfoFacetRow[]>
  >({});
  const [histograms, setHistograms] = useState<
    Record<string, InfoHistogramOverlay>
  >({});
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [lastLoadedKey, setLastLoadedKey] = useState<string | null>(null);

  const { facetColumns, barColumns, histogramColumns, quantileHistogramColumns, linearHistogramColumns } = useMemo(() => {
      const uniqueFacetColumns = [
        ...new Set(
          widgetDescriptors
            .filter((slot) => slot.kind === "facet-summary")
            .map((slot) => slot.column),
        ),
      ];
      const uniqueBarColumns = [
        ...new Set(
          widgetDescriptors
            .filter((slot) => slot.kind === "bars")
            .map((slot) => slot.column),
        ),
      ];
      const uniqueHistogramColumns = [
        ...new Set(
          widgetDescriptors
            .filter((slot) => slot.kind === "histogram")
            .map((slot) => slot.column),
        ),
      ];
      const uniqueQuantileHistogramColumns = uniqueHistogramColumns.filter((column) =>
        useQuantileHistogram(column),
      );
      const uniqueLinearHistogramColumns = uniqueHistogramColumns.filter(
        (column) => !useQuantileHistogram(column),
      );

      return {
        facetColumns: uniqueFacetColumns,
        barColumns: uniqueBarColumns,
        histogramColumns: uniqueHistogramColumns,
        quantileHistogramColumns: uniqueQuantileHistogramColumns,
        linearHistogramColumns: uniqueLinearHistogramColumns,
      };
    }, [widgetDescriptors]);

  useEffect(() => {
    let cancelled = false;

    const activeCategoricalScope = subsetScope ?? "dataset";

    Promise.all([
      facetColumns.length > 0
        ? queries.getFacetSummaries({
            layer: activeLayer,
            scope: activeCategoricalScope,
            columns: facetColumns,
            currentPointScopeSql:
              activeCategoricalScope === "current"
                ? subsetCurrentPointScopeSql
                : null,
          })
        : Promise.resolve<Record<string, GraphInfoFacetRow[]>>({}),
      barColumns.length > 0
        ? queries.getFacetSummaries({
            layer: activeLayer,
            scope: "dataset",
            columns: barColumns,
            maxItems: DEFAULT_BAR_ITEMS,
            currentPointScopeSql: null,
          })
        : Promise.resolve<Record<string, GraphInfoFacetRow[]>>({}),
      subsetScope && barColumns.length > 0
        ? queries.getFacetSummaries({
            layer: activeLayer,
            scope: subsetScope,
            columns: barColumns,
            maxItems: DEFAULT_BAR_ITEMS,
            currentPointScopeSql:
              subsetScope === "current" ? subsetCurrentPointScopeSql : null,
          })
        : Promise.resolve<Record<string, GraphInfoFacetRow[]>>({}),
      linearHistogramColumns.length > 0
        ? queries.getInfoHistogramsBatch({
            layer: activeLayer,
            scope: "dataset",
            columns: linearHistogramColumns,
            bins: DEFAULT_HISTOGRAM_BINS,
            currentPointScopeSql: null,
          })
        : Promise.resolve<Record<string, GraphInfoHistogramResult>>({}),
      quantileHistogramColumns.length > 0
        ? queries.getInfoHistogramsBatch({
            layer: activeLayer,
            scope: "dataset",
            columns: quantileHistogramColumns,
            bins: DEFAULT_HISTOGRAM_BINS,
            useQuantiles: true,
            currentPointScopeSql: null,
          })
        : Promise.resolve<Record<string, GraphInfoHistogramResult>>({}),
    ])
      .then(async ([
        nextFacetSummaries,
        datasetBarRows,
        subsetBarRows,
        linearDatasetHistograms,
        quantileDatasetHistograms,
      ]) => {
        const datasetHistograms = {
          ...linearDatasetHistograms,
          ...quantileDatasetHistograms,
        };
        const subsetHistogramEntries =
          subsetScope && histogramColumns.length > 0
            ? await Promise.all(
                histogramColumns.map(async (column) => {
                  const datasetHistogram = datasetHistograms[column] ?? {
                    bins: [],
                    totalCount: 0,
                  };
                  const extent =
                    datasetHistogram.bins.length > 0
                      ? ([
                          datasetHistogram.bins[0].min,
                          datasetHistogram.bins[datasetHistogram.bins.length - 1]
                            .max,
                        ] as [number, number])
                      : null;

                  const subsetHistogram = await queries.getInfoHistogram({
                    layer: activeLayer,
                    scope: subsetScope,
                    column,
                    currentPointScopeSql:
                      subsetScope === "current"
                        ? subsetCurrentPointScopeSql
                        : null,
                    bins: Math.max(
                      datasetHistogram.bins.length,
                      DEFAULT_HISTOGRAM_BINS,
                    ),
                    extent,
                  });

                  return [column, subsetHistogram] as const;
                }),
              )
            : [];

        if (cancelled) {
          return;
        }

        const subsetHistogramMap = Object.fromEntries(subsetHistogramEntries);
        setFacetSummaries(
          nextFacetSummaries,
        );
        setBarSummaries(
          Object.fromEntries(
            barColumns.map((column) => [
              column,
              mergeBarRows({
                datasetRows: datasetBarRows[column] ?? [],
                subsetRows: subsetBarRows[column] ?? [],
              }),
            ]),
          ),
        );
        setHistograms(
          Object.fromEntries(
            histogramColumns.map((column) => [
              column,
              {
                dataset: datasetHistograms[column] ?? { bins: [], totalCount: 0 },
                subset: subsetScope
                  ? (subsetHistogramMap[column] ?? { bins: [], totalCount: 0 })
                  : null,
              },
            ]),
          ),
        );
        setWidgetError(null);
        setLastLoadedKey(requestKey);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }

        setWidgetError(
          queryError instanceof Error
            ? queryError.message
            : "Failed to load info widgets",
        );
        setLastLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeLayer,
    barColumns,
    facetColumns,
    histogramColumns,
    linearHistogramColumns,
    queries,
    quantileHistogramColumns,
    requestKey,
    subsetCurrentPointScopeSql,
    subsetScope,
  ]);

  return {
    facetSummaries,
    barSummaries,
    histograms,
    widgetError,
    lastLoadedKey,
  };
}
