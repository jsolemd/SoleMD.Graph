"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  GraphBundleQueries,
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoScope,
} from "@/features/graph/types";

type WidgetDescriptor = {
  column: string;
  kind: "histogram" | "bars" | "facet-summary";
};

interface UseInfoWidgetDataArgs {
  queries: GraphBundleQueries;
  activeLayer: Parameters<GraphBundleQueries["getFacetSummaries"]>[0]["layer"];
  scope: GraphInfoScope;
  currentPointScopeSql: string | null;
  widgetDescriptors: WidgetDescriptor[];
  requestKey: string;
}

interface UseInfoWidgetDataResult {
  facetSummaries: Record<string, GraphInfoFacetRow[]>;
  barSummaries: Record<string, Array<{ value: string; count: number }>>;
  histograms: Record<string, GraphInfoHistogramResult>;
  widgetError: string | null;
  lastLoadedKey: string | null;
}

export function useInfoWidgetData({
  queries,
  activeLayer,
  scope,
  currentPointScopeSql,
  widgetDescriptors,
  requestKey,
}: UseInfoWidgetDataArgs): UseInfoWidgetDataResult {
  const [facetSummaries, setFacetSummaries] = useState<
    Record<string, GraphInfoFacetRow[]>
  >({});
  const [barSummaries, setBarSummaries] = useState<
    Record<string, Array<{ value: string; count: number }>>
  >({});
  const [histograms, setHistograms] = useState<
    Record<string, GraphInfoHistogramResult>
  >({});
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [lastLoadedKey, setLastLoadedKey] = useState<string | null>(null);

  const { facetColumns, barColumns, histogramColumns } = useMemo(() => {
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

    return {
      facetColumns: uniqueFacetColumns,
      barColumns: uniqueBarColumns,
      histogramColumns: uniqueHistogramColumns,
    };
  }, [widgetDescriptors]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      facetColumns.length > 0
        ? queries.getFacetSummaries({
            layer: activeLayer,
            scope,
            columns: facetColumns,
            currentPointScopeSql,
          })
        : Promise.resolve<Record<string, GraphInfoFacetRow[]>>({}),
      barColumns.length > 0
        ? queries.getInfoBarsBatch({
            layer: activeLayer,
            scope,
            columns: barColumns,
            currentPointScopeSql,
          })
        : Promise.resolve<Record<string, Array<{ value: string; count: number }>>>(
            {},
          ),
      histogramColumns.length > 0
        ? queries.getInfoHistogramsBatch({
            layer: activeLayer,
            scope,
            columns: histogramColumns,
            currentPointScopeSql,
          })
        : Promise.resolve<Record<string, GraphInfoHistogramResult>>({}),
    ])
      .then(([nextFacetSummaries, nextBarSummaries, nextHistograms]) => {
        if (cancelled) {
          return;
        }

        setFacetSummaries(nextFacetSummaries);
        setBarSummaries(nextBarSummaries);
        setHistograms(nextHistograms);
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
    currentPointScopeSql,
    facetColumns,
    histogramColumns,
    queries,
    requestKey,
    scope,
  ]);

  return {
    facetSummaries,
    barSummaries,
    histograms,
    widgetError,
    lastLoadedKey,
  };
}
