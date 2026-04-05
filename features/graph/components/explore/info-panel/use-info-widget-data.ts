"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  requestVersion: number;
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
  lastLoadedVersion: number;
}

export function useInfoWidgetData({
  queries,
  activeLayer,
  includeSelectionLayer,
  includeFilteredLayer,
  filteredPointScopeSql,
  widgetDescriptors,
  requestVersion,
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
  const [lastLoadedVersion, setLastLoadedVersion] = useState(0);

  const queryPlan = useMemo(() => {
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
  const queryPlanRef = useRef(queryPlan);
  queryPlanRef.current = queryPlan;

  useEffect(() => {
    let cancelled = false;
    const {
      categoricalColumns,
      categoricalMaxItemsByColumn,
      categoricalMergeDepth,
      histogramColumns,
      quantileHistogramColumns,
      linearHistogramColumns,
    } = queryPlanRef.current;

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
        const histogramBins = Math.max(
          DEFAULT_HISTOGRAM_BINS,
          ...histogramColumns.map(
            (column) => datasetHistograms[column]?.bins.length ?? 0,
          ),
        );
        const histogramExtentsByColumn = Object.fromEntries(
          histogramColumns.map((column) => {
            const datasetHistogram = datasetHistograms[column] ?? {
              bins: [],
              totalCount: 0,
            };
            const extent =
              datasetHistogram.bins.length > 0
                ? ([
                    datasetHistogram.bins[0].min,
                    datasetHistogram.bins[datasetHistogram.bins.length - 1].max,
                  ] as [number, number])
                : null;

            return [column, extent];
          }),
        ) as Record<string, [number, number] | null>;
        const [
          selectionHistogramMap,
          filteredHistogramMap,
          selectionNumericStats,
          filteredNumericStats,
        ] = await Promise.all([
          includeSelectionLayer && histogramColumns.length > 0
            ? queries.getInfoHistogramsBatch({
                layer: activeLayer,
                scope: "selected",
                columns: histogramColumns,
                bins: histogramBins,
                currentPointScopeSql: null,
                extentsByColumn: histogramExtentsByColumn,
              })
            : Promise.resolve<Record<string, GraphInfoHistogramResult>>({}),
          includeFilteredLayer && histogramColumns.length > 0
            ? queries.getInfoHistogramsBatch({
                layer: activeLayer,
                scope: "current",
                columns: histogramColumns,
                bins: histogramBins,
                currentPointScopeSql: filteredPointScopeSql,
                extentsByColumn: histogramExtentsByColumn,
              })
            : Promise.resolve<Record<string, GraphInfoHistogramResult>>({}),
          includeSelectionLayer && histogramColumns.length > 0
            ? queries.getNumericStatsBatch({
                layer: activeLayer,
                scope: "selected",
                columns: histogramColumns,
                currentPointScopeSql: null,
              })
            : Promise.resolve<Record<string, NumericStatsRow>>({}),
          includeFilteredLayer && histogramColumns.length > 0
            ? queries.getNumericStatsBatch({
                layer: activeLayer,
                scope: "current",
                columns: histogramColumns,
                currentPointScopeSql: filteredPointScopeSql,
              })
            : Promise.resolve<Record<string, NumericStatsRow>>({}),
        ]);

        if (cancelled) {
          return;
        }

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
        setLastLoadedVersion(requestVersion);
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
        setLastLoadedVersion(requestVersion);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeLayer,
    filteredPointScopeSql,
    includeFilteredLayer,
    includeSelectionLayer,
    queries,
    requestVersion,
  ]);

  return {
    categoricalSummaries,
    histograms,
    numericStats,
    widgetError,
    lastLoadedVersion,
  };
}
