"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmograph } from "@cosmograph/react";
import type { Cosmograph } from "@cosmograph/cosmograph";
import { getInternalApi } from "@cosmograph/cosmograph/cosmograph/internal";
import { FilteringClient } from "@cosmograph/cosmograph/cosmograph/crossfilter/filtering-client";
import { Bars, type BarData } from "@cosmograph/ui";
import { Text } from "@mantine/core";
import {
  buildCategoricalFilterClause,
  buildVisibilityScopeSqlExcludingSource,
  clearSelectionClause,
  createSelectionSource,
  getSelectionSourceId,
  getSelectionValueForSource,
  matchesSelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";
import { getLayerTableName } from "@/features/graph/duckdb/sql-helpers";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoFacetRow } from "@/features/graph/types";
import { formatNumber } from "@/lib/helpers";
import { panelTextDimStyle } from "@/features/graph/components/panels/PanelShell";
import { toFacetRowsFromBarCounts } from "./facet-rows";
import {
  getCachedCategoricalDataset,
  getWidgetDatasetCacheKeyWithRevision,
  setCachedCategoricalDataset,
} from "./dataset-cache";
import {
  NATIVE_BARS_DATA_LIMIT,
  setNativeBarsFacetData,
  setNativeBarsFacetHighlight,
} from "./native-bars-adapter";
import { resolveWidgetBaselineScope } from "./widget-baseline";

const FILTER_BAR_HEIGHT = 120;

export function FilterBarWidget({
  column,
  queries,
  bundleChecksum,
  overlayRevision,
  initialDatasetRows,
  datasetLoading = false,
}: {
  column: string;
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
  initialDatasetRows?: GraphInfoFacetRow[];
  datasetLoading?: boolean;
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
  const widgetRef = useRef<Bars | null>(null);
  const clientRef = useRef<FilteringClient | null>(null);
  const datasetRequestIdRef = useRef(0);
  const scopedRequestIdRef = useRef(0);
  const datasetReadyRef = useRef(false);
  const selectedValueRef = useRef<string | null>(null);
  const sourceId = `filter:${column}`;
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
  const selectedValue = useMemo(
    () =>
      getSelectionValueForSource<string>(cosmograph?.pointsSelection, sourceId),
    [cosmograph, currentScopeRevision, sourceId],
  );
  const isSubset = typeof scopeSql === "string" && scopeSql.trim().length > 0;

  selectedValueRef.current = selectedValue;

  useEffect(() => {
    if (!containerRef.current || !cosmograph) {
      return;
    }

    const widget = new Bars(containerRef.current, {
      maxDisplayedItems: 10,
      showSearch: true,
      showSortingBlock: true,
      showTotalWhenFiltered: true,
      noDataMessage: false,
      loadingMessage: "Loading filters...",
      countFormatter: (count) => formatNumber(count),
      onClick: (item?: BarData) => {
        const client = clientRef.current;
        const value = item?.label;
        if (!client || !value) {
          return;
        }

        if (selectedValueRef.current === value) {
          clearSelectionClause(cosmograph.pointsSelection, source);
          return;
        }

        cosmograph.pointsSelection.update(
          buildCategoricalFilterClause(client, column, value),
        );
      },
    });
    widget.setLoadingState();

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
    datasetReadyRef.current = false;
    setWidgetRevision((current) => current + 1);

    return () => {
      widget.destroy();
      widgetRef.current = null;
      datasetReadyRef.current = false;
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
    const cachedDataset = getCachedCategoricalDataset(datasetCacheKey);
    const seededDataset =
      initialDatasetRows && initialDatasetRows.length > 0
        ? initialDatasetRows
        : cachedDataset;

    if (seededDataset) {
      setNativeBarsFacetData(widget, seededDataset);
      datasetReadyRef.current = true;
    } else {
      widget.setLoadingState();
      datasetReadyRef.current = false;
    }

    if (!seededDataset && datasetLoading) {
      return;
    }

    const datasetPromise = seededDataset
      ? Promise.resolve(seededDataset)
      : (async () => {
          const delays = [0, 150, 450];

          for (const delay of delays) {
            if (delay > 0) {
              await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
            }

            const normalizedRows = toFacetRowsFromBarCounts(
              await queries.getInfoBars({
                layer: activeLayer,
                scope: baselineScope,
                column,
                maxItems: NATIVE_BARS_DATA_LIMIT,
                currentPointScopeSql: null,
              }),
            );

            if (normalizedRows.length > 0) {
              return normalizedRows;
            }
          }

          return [];
        })();

    datasetPromise.then((datasetValues: GraphInfoFacetRow[]) => {
        if (requestId !== datasetRequestIdRef.current) {
          return;
        }

        const resolvedDataset =
          datasetValues.length > 0
            ? datasetValues
            : (getCachedCategoricalDataset(datasetCacheKey) ?? []);

        setCachedCategoricalDataset(datasetCacheKey, resolvedDataset);
        if (!widgetRef.current) {
          return;
        }

        setError(null);
        if (resolvedDataset.length === 0) {
          datasetReadyRef.current = false;
          widget.showState("No bars data");
          return;
        }
        setNativeBarsFacetData(widget, resolvedDataset);
        datasetReadyRef.current = true;
        widget.setSelectedItem(
          selectedValueRef.current
            ? { label: selectedValueRef.current, count: 0 }
            : undefined,
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
  }, [
    activeLayer,
    baselineCacheKey,
    baselineScope,
    bundleChecksum,
    column,
    datasetLoading,
    initialDatasetRows,
    overlayRevision,
    queries,
    widgetRevision,
  ]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    if (!datasetReadyRef.current) {
      return;
    }

    if (!isSubset || !scopeSql) {
      setNativeBarsFacetHighlight(widget, undefined);
      return;
    }

    const requestId = ++scopedRequestIdRef.current;
    queries
      .getInfoBars({
        layer: activeLayer,
        scope: "current",
        column,
        maxItems: NATIVE_BARS_DATA_LIMIT,
        currentPointScopeSql: scopeSql,
      })
      .then((scopedValues) => {
        if (requestId !== scopedRequestIdRef.current || !widgetRef.current) {
          return;
        }

        setError(null);
        setNativeBarsFacetHighlight(
          widget,
          toFacetRowsFromBarCounts(scopedValues),
        );
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
    widgetRef.current?.setSelectedItem(
      selectedValue
        ? { label: selectedValue, count: 0 }
        : undefined,
    );
  }, [selectedValue, widgetRevision]);

  if (error) {
    return <Text style={panelTextDimStyle}>{error}</Text>;
  }

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ minHeight: FILTER_BAR_HEIGHT }}
    />
  );
}
