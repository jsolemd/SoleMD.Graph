"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FilteringClient } from "@cosmograph/cosmograph/cosmograph/crossfilter/filtering-client";
import { Histogram } from "@cosmograph/ui";
import { Text } from "@mantine/core";
import {
  buildNumericRangeFilterClause,
  clearSelectionClause,
  getSelectionValueForSource,
} from "@/features/graph/lib/cosmograph-selection";
import type { GraphBundleQueries, GraphInfoHistogramResult } from "@/features/graph/types";
import { formatNumber } from "@/lib/helpers";
import { panelTextDimStyle } from "@/features/graph/components/panels/PanelShell";
import {
  getHistogramExtent,
  setNativeHistogramData,
  setNativeHistogramHighlight,
} from "./native-histogram-adapter";
import {
  WIDGET_DATASET_RETRY_DELAYS,
  getCachedHistogramDataset,
  getWidgetDatasetCacheKeyWithRevision,
  setCachedHistogramDataset,
} from "./dataset-cache";
import { initCrossfilterClient } from "./init-crossfilter-client";
import { useWidgetSelectors } from "./use-widget-selectors";
import { normalizeRange, rangesEqual } from "./widget-range-utils";

const YEAR_LIKE_COLUMNS = new Set(["year", "pageNumber"]);
const FILTER_HISTOGRAM_HEIGHT = 72;

function hasRenderableHistogramData(result: GraphInfoHistogramResult): boolean {
  return result.totalCount > 1 && getHistogramExtent(result) !== null;
}

export function FilterHistogramWidget({
  column,
  queries,
  bundleChecksum,
  overlayRevision,
}: {
  column: string;
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
}) {
  const {
    cosmograph,
    activeLayer,
    currentScopeRevision,
    sourceId,
    source,
    tableName,
    baselineScope,
    baselineCacheKey,
    scopeSql,
    isSubset,
  } = useWidgetSelectors("filter", column);

  const [error, setError] = useState<string | null>(null);
  const [widgetRevision, setWidgetRevision] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<Histogram | null>(null);
  const clientRef = useRef<FilteringClient | null>(null);
  const datasetRequestIdRef = useRef(0);
  const scopedRequestIdRef = useRef(0);
  const extentRef = useRef<[number, number] | null>(null);
  const renderedDatasetKeyRef = useRef<string | null>(null);

  const selectedRange = useMemo(
    () =>
      getSelectionValueForSource<[number, number]>(
        cosmograph?.pointsSelection,
        sourceId,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentScopeRevision forces re-evaluation when crossfilter state changes
    [cosmograph, currentScopeRevision, sourceId],
  );

  useEffect(() => {
    if (!containerRef.current || !cosmograph) {
      return;
    }

    const step = YEAR_LIKE_COLUMNS.has(column) ? 1 : 0.01;
    const widget = new Histogram(containerRef.current, {
      barCount: 20,
      allowSelection: true,
      stickySelection: true,
      formatter: (value) =>
        YEAR_LIKE_COLUMNS.has(column)
          ? String(Math.round(value))
          : formatNumber(value, { maximumFractionDigits: 2 }),
      onBrush: (range) => {
        const client = clientRef.current;
        const extent = extentRef.current;
        if (!client || !extent) {
          return;
        }

        if (!range) {
          clearSelectionClause(cosmograph.pointsSelection, source);
          return;
        }

        const normalized = normalizeRange(range, extent, step);
        if (rangesEqual(normalized, extent)) {
          clearSelectionClause(cosmograph.pointsSelection, source);
          return;
        }

        cosmograph.pointsSelection.update(
          buildNumericRangeFilterClause(client, column, normalized),
        );
      },
    });

    let client: FilteringClient | null = null;
    void initCrossfilterClient(cosmograph, { sourceId, column, tableName }).then(
      (result) => {
        if (result) {
          client = result;
          clientRef.current = result;
        }
      },
    );

    widgetRef.current = widget;
    setWidgetRevision((current) => current + 1);

    return () => {
      widget.destroy();
      widgetRef.current = null;
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [column, cosmograph, source, sourceId, tableName]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    const requestId = ++datasetRequestIdRef.current;
    const datasetCacheKey = getWidgetDatasetCacheKeyWithRevision(
      bundleChecksum,
      activeLayer,
      column,
      overlayRevision,
      baselineCacheKey,
    );
    const cachedDataset = getCachedHistogramDataset(datasetCacheKey);
    if (cachedDataset && hasRenderableHistogramData(cachedDataset)) {
      const cachedExtent = getHistogramExtent(cachedDataset);
      extentRef.current = cachedExtent;
      if (renderedDatasetKeyRef.current !== datasetCacheKey) {
        setNativeHistogramData(widget, cachedDataset);
        renderedDatasetKeyRef.current = datasetCacheKey;
      }
    } else {
      widget.setLoadingState();
    }

    const datasetPromise = cachedDataset
      ? Promise.resolve(cachedDataset)
      : (async () => {
          let latestHistogram: GraphInfoHistogramResult = { bins: [], totalCount: 0 };

          for (const delay of WIDGET_DATASET_RETRY_DELAYS) {
            if (delay > 0) {
              await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
            }

            latestHistogram = await queries.getInfoHistogram({
              layer: activeLayer,
              scope: baselineScope,
              column,
              bins: 20,
              currentPointScopeSql: null,
            });

            if (hasRenderableHistogramData(latestHistogram)) {
              return latestHistogram;
            }
          }

          return latestHistogram;
        })();

    datasetPromise
      .then((datasetHistogram: GraphInfoHistogramResult) => {
        if (requestId !== datasetRequestIdRef.current) {
          return;
        }

        const extent = getHistogramExtent(datasetHistogram);
        extentRef.current = extent;
        if (hasRenderableHistogramData(datasetHistogram)) {
          setCachedHistogramDataset(datasetCacheKey, datasetHistogram);
        }
        if (!widgetRef.current) {
          return;
        }

        setError(null);
        setNativeHistogramData(widget, datasetHistogram);
        renderedDatasetKeyRef.current = hasRenderableHistogramData(datasetHistogram)
          ? datasetCacheKey
          : null;
        widget.setSelection(
          selectedRange && extent
            ? normalizeRange(selectedRange, extent, YEAR_LIKE_COLUMNS.has(column) ? 1 : 0.01)
            : undefined,
          true,
        );
      })
      .catch((queryError: unknown) => {
        if (requestId !== datasetRequestIdRef.current) {
          return;
        }

        setError(
          queryError instanceof Error ? queryError.message : "Failed to load filter",
        );
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedRange is read for initial widget setup only; the dedicated selectedRange effect (below) handles ongoing updates
  }, [
    activeLayer,
    baselineCacheKey,
    baselineScope,
    bundleChecksum,
    column,
    overlayRevision,
    queries,
    widgetRevision,
  ]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    if (!isSubset || !scopeSql) {
      setNativeHistogramHighlight(widget, undefined);
      return;
    }

    const requestId = ++scopedRequestIdRef.current;
    queries
      .getInfoHistogram({
        layer: activeLayer,
        scope: "current",
        column,
        bins: 20,
        currentPointScopeSql: scopeSql,
        extent: extentRef.current,
      })
      .then((scopedHistogram: GraphInfoHistogramResult) => {
        if (requestId !== scopedRequestIdRef.current || !widgetRef.current) {
          return;
        }

        setError(null);
        setNativeHistogramHighlight(widget, scopedHistogram);
      })
      .catch((queryError: unknown) => {
        if (requestId !== scopedRequestIdRef.current) {
          return;
        }

        setError(
          queryError instanceof Error ? queryError.message : "Failed to update filter scope",
        );
      });
  }, [activeLayer, column, isSubset, queries, scopeSql, widgetRevision]);

  useEffect(() => {
    const widget = widgetRef.current;
    const extent = extentRef.current;
    if (!widget || !extent) {
      return;
    }

    widget.setSelection(
      selectedRange
        ? normalizeRange(selectedRange, extent, YEAR_LIKE_COLUMNS.has(column) ? 1 : 0.01)
        : undefined,
      true,
    );
  }, [column, selectedRange, widgetRevision]);

  if (error) {
    return <Text style={panelTextDimStyle}>{error}</Text>;
  }

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: FILTER_HISTOGRAM_HEIGHT }}
    />
  );
}
