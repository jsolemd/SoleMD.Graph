"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmograph } from "@cosmograph/react";
import type { Cosmograph } from "@cosmograph/cosmograph";
import { getInternalApi } from "@cosmograph/cosmograph/cosmograph/internal";
import { FilteringClient } from "@cosmograph/cosmograph/cosmograph/crossfilter/filtering-client";
import { Timeline } from "@cosmograph/ui";
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
import type { GraphBundleQueries } from "@/features/graph/types";
import { panelTextDimStyle } from "@/features/graph/components/panels/PanelShell";
import {
  getCachedNumericDataset,
  getWidgetDatasetCacheKeyWithRevision,
  setCachedNumericDataset,
} from "./dataset-cache";
import { resolveWidgetBaselineScope } from "./widget-baseline";

const TIMELINE_THEME: React.CSSProperties = {
  "--cosmograph-ui-background": "transparent",
  "--cosmograph-ui-text": "var(--text-tertiary)",
  "--cosmograph-ui-tick-font-size": "10px",
  "--cosmograph-ui-font-size": "10px",
  "--cosmograph-ui-element-color": "var(--filter-bar-base)",
  "--cosmograph-ui-highlighted-element-color": "var(--mode-accent)",
  "--cosmograph-ui-selection-control-color": "color-mix(in srgb, var(--mode-accent) 45%, transparent)",
  "--cosmograph-timeline-background": "transparent",
  "--cosmograph-timeline-bar-color": "var(--filter-bar-base)",
  "--cosmograph-timeline-highlighted-bar-color": "var(--mode-accent)",
  "--cosmograph-timeline-axis-color": "var(--text-tertiary)",
  "--cosmograph-timeline-font-size": "10px",
} as React.CSSProperties;
const TIMELINE_DATASET_RETRY_DELAYS_MS = [0, 150, 450];

function rangesEqual(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6;
}

function getExtent(values: number[]): [number, number] | null {
  if (values.length === 0) {
    return null;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) && min < max
    ? [min, max]
    : null;
}

function normalizeRange(
  value: [number, number],
  extent: [number, number],
): [number, number] {
  return [
    Math.max(extent[0], Math.round(Math.min(value[0], value[1]))),
    Math.min(extent[1], Math.round(Math.max(value[0], value[1]))),
  ];
}

function hasRenderableTimelineData(values: number[]): boolean {
  return values.length > 1 && getExtent(values) !== null;
}

export function TimelineWidget({
  column,
  queries,
  bundleChecksum,
  overlayRevision,
  onSelection,
}: {
  column: string;
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
  onSelection: (selection: [number, number] | undefined) => void;
}) {
  const { cosmograph } = useCosmograph();
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const currentScopeRevision = useDashboardStore((state) => state.currentScopeRevision);
  const selectionLocked = useDashboardStore((state) => state.selectionLocked);
  const selectedPointCount = useDashboardStore((state) => state.selectedPointCount);
  const selectedPointRevision = useDashboardStore((state) => state.selectedPointRevision);
  const [error, setError] = useState<string | null>(null);
  const [widgetRevision, setWidgetRevision] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<Timeline | null>(null);
  const clientRef = useRef<FilteringClient | null>(null);
  const datasetRequestIdRef = useRef(0);
  const scopedRequestIdRef = useRef(0);
  const extentRef = useRef<[number, number] | null>(null);
  const renderedDatasetKeyRef = useRef<string | null>(null);
  const sourceId = `timeline:${column}`;
  const source = useMemo(() => createSelectionSource(sourceId), [sourceId]);
  const tableName = useMemo(() => getLayerTableName(activeLayer), [activeLayer]);
  const { scope: baselineScope, cacheKey: baselineCacheKey } = useMemo(
    () =>
      resolveWidgetBaselineScope({
        selectionLocked,
        selectedPointCount,
        selectedPointRevision,
      }),
    [selectedPointCount, selectedPointRevision, selectionLocked],
  );
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
    onSelection(selectedRange ?? undefined);
  }, [onSelection, selectedRange]);

  useEffect(() => {
    if (!containerRef.current || !cosmograph) {
      return;
    }

    const widget = new Timeline(containerRef.current, {
      barCount: 32,
      allowSelection: true,
      stickySelection: true,
      showAnimationControls: false,
      formatter: (value) => String(Math.round(Number(value))),
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

        const normalized = normalizeRange(
          [Number(range[0]), Number(range[1])],
          extent,
        );
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
  }, [column, cosmograph, onSelection, source, sourceId, tableName]);

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
    const cachedDataset = getCachedNumericDataset(datasetCacheKey);
    if (cachedDataset && hasRenderableTimelineData(cachedDataset)) {
      const cachedExtent = getExtent(cachedDataset);
      extentRef.current = cachedExtent;
      if (renderedDatasetKeyRef.current !== datasetCacheKey) {
        widget.setTimeData(cachedDataset);
        renderedDatasetKeyRef.current = datasetCacheKey;
      }
    } else {
      widget.setLoadingState();
    }

    const datasetPromise = cachedDataset
      ? Promise.resolve(cachedDataset)
      : (async () => {
          let latestValues: number[] = [];

          for (const delay of TIMELINE_DATASET_RETRY_DELAYS_MS) {
            if (delay > 0) {
              await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
            }

            latestValues = await queries.getNumericValues({
              layer: activeLayer,
              scope: baselineScope,
              column,
              currentPointScopeSql: null,
            });

            if (hasRenderableTimelineData(latestValues)) {
              return latestValues;
            }
          }

          return latestValues;
        })();

    datasetPromise
      .then((datasetValues) => {
        if (requestId !== datasetRequestIdRef.current) {
          return;
        }

        const extent = getExtent(datasetValues);
        extentRef.current = extent;
        if (hasRenderableTimelineData(datasetValues)) {
          setCachedNumericDataset(datasetCacheKey, datasetValues);
        }
        if (!widgetRef.current) {
          return;
        }

        setError(null);
        widget.setTimeData(datasetValues);
        renderedDatasetKeyRef.current = hasRenderableTimelineData(datasetValues)
          ? datasetCacheKey
          : null;
        widget.setSelection(
          selectedRange && extent ? normalizeRange(selectedRange, extent) : undefined,
          true,
        );
      })
      .catch((queryError: unknown) => {
        if (requestId !== datasetRequestIdRef.current) {
          return;
        }

        setError(
          queryError instanceof Error ? queryError.message : "Failed to load timeline",
        );
      });
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
      widget.setHighlightedData(undefined);
      return;
    }

    const requestId = ++scopedRequestIdRef.current;
    queries
      .getNumericValues({
        layer: activeLayer,
        scope: "current",
        column,
        currentPointScopeSql: scopeSql,
      })
      .then((scopedValues) => {
        if (requestId !== scopedRequestIdRef.current || !widgetRef.current) {
          return;
        }

        setError(null);
        widget.setHighlightedData(scopedValues);
      })
      .catch((queryError: unknown) => {
        if (requestId !== scopedRequestIdRef.current) {
          return;
        }

        setError(
          queryError instanceof Error ? queryError.message : "Failed to update timeline scope",
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
      selectedRange ? normalizeRange(selectedRange, extent) : undefined,
      true,
    );
  }, [selectedRange, widgetRevision]);

  if (error) {
    return (
      <div className="flex h-full items-center px-3">
        <Text style={panelTextDimStyle}>{error}</Text>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full min-w-0 flex-1"
      style={TIMELINE_THEME}
    />
  );
}
