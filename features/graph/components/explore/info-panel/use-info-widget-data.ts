"use client";

import { useEffect, useMemo, useState } from "react";
import type { NumericStatsRow } from "@/features/graph/duckdb/queries";
import type {
  GraphBundleQueries,
  GraphInfoHistogramResult,
} from "@/features/graph/types";
import { shouldUseQuantileHistogram } from "@/features/graph/lib/histogram-strategy";
import { DEFAULT_INFO_ROWS } from "@/features/graph/lib/info-widgets";
import {
  type InfoComparisonFacetRow,
  type InfoHistogramComparison,
  mergeInfoComparisonRows,
} from "../info/comparison-layers";

type WidgetDescriptor = {
  column: string;
  kind: "histogram" | "bars" | "facet-summary";
};

const DEFAULT_BAR_ITEMS = DEFAULT_INFO_ROWS;
const DEFAULT_FACET_ITEMS = DEFAULT_INFO_ROWS;
const DEFAULT_HISTOGRAM_BINS = 16;

interface UseInfoWidgetDataArgs {
  queries: GraphBundleQueries;
  activeLayer: Parameters<GraphBundleQueries["getInfoBarsBatch"]>[0]["layer"];
  includeSelectionLayer: boolean;
  includeFilteredLayer: boolean;
  filteredPointScopeSql: string | null;
  widgetDescriptors: WidgetDescriptor[];
  requestKey: string;
}

export interface NumericStatsComparison {
  dataset: NumericStatsRow;
  selection?: NumericStatsRow;
  filtered?: NumericStatsRow;
}

interface UseInfoWidgetDataResult {
  categoricalSummaries: Record<string, InfoComparisonFacetRow[]>;
  histograms: Record<string, InfoHistogramComparison>;
  numericStats: Record<string, NumericStatsComparison>;
  widgetError: string | null;
  lastLoadedKey: string | null;
}

export function useInfoWidgetData({
  queries,
  activeLayer,
  includeSelectionLayer,
  includeFilteredLayer,
  filteredPointScopeSql,
  widgetDescriptors,
  requestKey,
}: UseInfoWidgetDataArgs): UseInfoWidgetDataResult {
  const [categoricalSummaries, setCategoricalSummaries] = useState<
    Record<string, InfoComparisonFacetRow[]>
  >({});
  const [histograms, setHistograms] = useState<
    Record<string, InfoHistogramComparison>
  >({});
  const [numericStats, setNumericStats] = useState<
    Record<string, NumericStatsComparison>
  >({});
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [lastLoadedKey, setLastLoadedKey] = useState<string | null>(null);

  const {
    categoricalColumns,
    categoricalMaxItemsByColumn,
    categoricalMergeDepth,
    histogramColumns,
    quantileHistogramColumns,
    linearHistogramColumns,
  } = useMemo(() => {
    const categoricalSlots = widgetDescriptors.filter(
      (slot) => slot.kind === "bars" || slot.kind === "facet-summary",
    );
    const categoricalColumnSet = new Set<string>();
    const nextCategoricalMaxItemsByColumn: Record<string, number> = {};

    for (const slot of categoricalSlots) {
      categoricalColumnSet.add(slot.column);
      nextCategoricalMaxItemsByColumn[slot.column] =
        slot.kind === "bars" ? DEFAULT_BAR_ITEMS : DEFAULT_FACET_ITEMS;
    }

    const uniqueHistogramColumns = [
      ...new Set(
        widgetDescriptors
          .filter((slot) => slot.kind === "histogram")
          .map((slot) => slot.column),
      ),
    ];

    return {
      categoricalColumns: [...categoricalColumnSet],
      categoricalMaxItemsByColumn: nextCategoricalMaxItemsByColumn,
      categoricalMergeDepth: Math.max(
        DEFAULT_BAR_ITEMS,
        DEFAULT_FACET_ITEMS,
        24,
      ),
      histogramColumns: uniqueHistogramColumns,
      quantileHistogramColumns: uniqueHistogramColumns.filter((column) =>
        shouldUseQuantileHistogram(column),
      ),
      linearHistogramColumns: uniqueHistogramColumns.filter(
        (column) => !shouldUseQuantileHistogram(column),
      ),
    };
  }, [widgetDescriptors]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      categoricalColumns.length > 0
        ? queries.getInfoBarsBatch({
            layer: activeLayer,
            scope: "dataset",
            columns: categoricalColumns,
            maxItems: categoricalMergeDepth,
            currentPointScopeSql: null,
          })
        : Promise.resolve<Record<string, Array<{ value: string; count: number }>>>({}),
      includeSelectionLayer && categoricalColumns.length > 0
        ? queries.getInfoBarsBatch({
            layer: activeLayer,
            scope: "selected",
            columns: categoricalColumns,
            maxItems: categoricalMergeDepth,
            currentPointScopeSql: null,
          })
        : Promise.resolve<Record<string, Array<{ value: string; count: number }>>>({}),
      includeFilteredLayer && categoricalColumns.length > 0
        ? queries.getInfoBarsBatch({
            layer: activeLayer,
            scope: "current",
            columns: categoricalColumns,
            maxItems: categoricalMergeDepth,
            currentPointScopeSql: filteredPointScopeSql,
          })
        : Promise.resolve<Record<string, Array<{ value: string; count: number }>>>({}),
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
      histogramColumns.length > 0
        ? queries.getNumericStatsBatch({
            layer: activeLayer,
            scope: "dataset",
            columns: histogramColumns,
            currentPointScopeSql: null,
          })
        : Promise.resolve<Record<string, NumericStatsRow>>({}),
    ])
      .then(async ([
        datasetBarRows,
        selectionBarRows,
        filteredBarRows,
        linearDatasetHistograms,
        quantileDatasetHistograms,
        datasetNumericStats,
      ]) => {
        const datasetHistograms = {
          ...linearDatasetHistograms,
          ...quantileDatasetHistograms,
        };
        const selectionHistogramEntries =
          includeSelectionLayer && histogramColumns.length > 0
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
                    scope: "selected",
                    column,
                    currentPointScopeSql: null,
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
        const filteredHistogramEntries =
          includeFilteredLayer && histogramColumns.length > 0
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

                  const filteredHistogram = await queries.getInfoHistogram({
                    layer: activeLayer,
                    scope: "current",
                    column,
                    currentPointScopeSql: filteredPointScopeSql,
                    bins: Math.max(
                      datasetHistogram.bins.length,
                      DEFAULT_HISTOGRAM_BINS,
                    ),
                    extent,
                  });

                  return [column, filteredHistogram] as const;
                }),
              )
            : [];

        const selectionNumericStats =
          includeSelectionLayer && histogramColumns.length > 0
            ? await queries.getNumericStatsBatch({
                layer: activeLayer,
                scope: "selected",
                columns: histogramColumns,
                currentPointScopeSql: null,
              })
            : {};
        const filteredNumericStats =
          includeFilteredLayer && histogramColumns.length > 0
            ? await queries.getNumericStatsBatch({
                layer: activeLayer,
                scope: "current",
                columns: histogramColumns,
                currentPointScopeSql: filteredPointScopeSql,
              })
            : {};

        if (cancelled) {
          return;
        }

        const selectionHistogramMap = Object.fromEntries(selectionHistogramEntries);
        const filteredHistogramMap = Object.fromEntries(filteredHistogramEntries);
        setCategoricalSummaries(
          Object.fromEntries(
            categoricalColumns.map((column) => [
              column,
              mergeInfoComparisonRows({
                datasetRows: datasetBarRows[column] ?? [],
                selectionRows: includeSelectionLayer
                  ? selectionBarRows[column] ?? []
                  : [],
                filteredRows: includeFilteredLayer
                  ? filteredBarRows[column] ?? []
                  : [],
                maxItems:
                  categoricalMaxItemsByColumn[column] ?? DEFAULT_BAR_ITEMS,
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
                selection: includeSelectionLayer
                  ? (selectionHistogramMap[column] ?? { bins: [], totalCount: 0 })
                  : null,
                filtered: includeFilteredLayer
                  ? (filteredHistogramMap[column] ?? { bins: [], totalCount: 0 })
                  : null,
              },
            ]),
          ),
        );
        setNumericStats(
          Object.fromEntries(
            histogramColumns
              .filter((column) => datasetNumericStats[column] != null)
              .map((column) => [
                column,
                {
                  dataset: datasetNumericStats[column],
                  selection: includeSelectionLayer
                    ? selectionNumericStats[column]
                    : undefined,
                  filtered: includeFilteredLayer
                    ? filteredNumericStats[column]
                    : undefined,
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
    categoricalColumns,
    categoricalMaxItemsByColumn,
    categoricalMergeDepth,
    filteredPointScopeSql,
    histogramColumns,
    includeFilteredLayer,
    includeSelectionLayer,
    linearHistogramColumns,
    queries,
    quantileHistogramColumns,
    requestKey,
  ]);

  return {
    categoricalSummaries,
    histograms,
    numericStats,
    widgetError,
    lastLoadedKey,
  };
}
