"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmograph } from "@cosmograph/react";
import type { Cosmograph } from "@cosmograph/cosmograph";
import { getInternalApi } from "@cosmograph/cosmograph/cosmograph/internal";
import { FilteringClient } from "@cosmograph/cosmograph/cosmograph/crossfilter/filtering-client";
import { Histogram } from "@cosmograph/ui";
import { Text } from "@mantine/core";
import {
  buildVisibilityScopeSqlExcludingSource,
  clearSelectionClause,
  createSelectionSource,
  getSelectionSourceId,
  getSelectionValueForSource,
  matchesSelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";
import { getLayerTableName } from "@/features/graph/duckdb/sql-helpers";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoHistogramResult } from "@/features/graph/types";
import { formatNumber } from "@/lib/helpers";
import { panelTextDimStyle } from "@/features/graph/components/panels/PanelShell";
import {
  getHistogramExtent,
  setNativeHistogramData,
  setNativeHistogramHighlight,
} from "./native-histogram-adapter";

const YEAR_LIKE_COLUMNS = new Set(["year", "pageNumber"]);
const FILTER_HISTOGRAM_HEIGHT = 72;
const HISTOGRAM_DATASET_RETRY_DELAYS_MS = [0, 150, 450];

function normalizeRange(
  value: [number, number],
  extent: [number, number],
  step: number,
): [number, number] {
  const min = Math.max(extent[0], Math.min(value[0], value[1]));
  const max = Math.min(extent[1], Math.max(value[0], value[1]));

  if (step >= 1) {
    return [Math.round(min), Math.round(max)];
  }

  return [Number(min.toFixed(3)), Number(max.toFixed(3))];
}

function rangesEqual(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6;
}

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
  const { cosmograph } = useCosmograph();
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const currentScopeRevision = useDashboardStore((state) => state.currentScopeRevision);
  const [error, setError] = useState<string | null>(null);
  const [widgetRevision, setWidgetRevision] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<Histogram | null>(null);
  const clientRef = useRef<FilteringClient | null>(null);
  const datasetRequestIdRef = useRef(0);
  const scopedRequestIdRef = useRef(0);
  const extentRef = useRef<[number, number] | null>(null);
  const renderedDatasetKeyRef = useRef<string | null>(null);
  const sourceId = `filter:${column}`;
  const source = useMemo(() => createSelectionSource(sourceId), [sourceId]);
  const tableName = useMemo(() => getLayerTableName(activeLayer), [activeLayer]);
  const scopeSql = useMemo(
    () =>
      buildVisibilityScopeSqlExcludingSource(
        cosmograph?.pointsSelection,
        sourceId,
      ),
    [cosmograph, currentScopeRevision, sourceId],
  );
  const isSubset = typeof scopeSql === "string" && scopeSql.trim().length > 0;
  const selectedRange = useMemo(
    () =>
      getSelectionValueForSource<[number, number]>(
        cosmograph?.pointsSelection,
        sourceId,
      ),
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

        client.applyRangeFilter(normalized);
      },
    });

    const internalApi = getInternalApi(cosmograph as unknown as Cosmograph);
    let client: FilteringClient | null = null;

    const initializeClient = async () => {
      await internalApi.dbReady();
      if (!internalApi.dbCoordinator) {
        return;
      }

      client = FilteringClient.getOrCreateClient({
        coordinator: internalApi.dbCoordinator,
        getTableName: () => tableName,
        getSelection: () => internalApi.crossfilter.pointsSelection,
        getAccessor: () => column,
        includeFields: () => [internalApi.config.pointIndexBy].filter(Boolean) as string[],
        onFiltered: (result) => {
          if (
            client &&
            matchesSelectionSourceId(
              getSelectionSourceId(
                internalApi.crossfilter.pointsSelection.active?.source,
              ),
              sourceId,
            )
          ) {
            internalApi.crossfilter.onPointsFiltered(result);
          }
        },
        id: sourceId,
      });
      client.setActive(true);
      clientRef.current = client;
    };

    void initializeClient();

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
    const datasetKey = `${bundleChecksum}:${activeLayer}:${column}:${overlayRevision}:histogram`;
    widget.setLoadingState();

    const datasetPromise = (async () => {
      let latestHistogram: GraphInfoHistogramResult = { bins: [], totalCount: 0 };

      for (const delay of HISTOGRAM_DATASET_RETRY_DELAYS_MS) {
        if (delay > 0) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
        }

        latestHistogram = await queries.getInfoHistogram({
          layer: activeLayer,
          scope: "dataset",
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
        if (!widgetRef.current) {
          return;
        }

        setError(null);
        setNativeHistogramData(widget, datasetHistogram);
        renderedDatasetKeyRef.current = hasRenderableHistogramData(datasetHistogram)
          ? datasetKey
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
  }, [activeLayer, bundleChecksum, column, overlayRevision, queries, widgetRevision]);

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
