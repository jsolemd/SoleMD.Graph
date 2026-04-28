"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilteringClient } from "@cosmograph/cosmograph/cosmograph/crossfilter/filtering-client";
import { Bars, type BarData } from "@cosmograph/ui";
import { Text } from "@mantine/core";
import {
  buildCategoricalFilterClause,
  buildCategoricalFilterScopeSql,
  clearSelectionClause,
  getSelectionValueForSource,
} from "@/features/graph/lib/cosmograph-selection";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoFacetRow } from "@solemd/graph";
import { formatNumber } from "@/lib/helpers";
import { panelTextDimStyle } from "@/features/graph/components/panels/PanelShell";
import { toFacetRowsFromBarCounts } from "./facet-rows";
import {
  WIDGET_DATASET_RETRY_DELAYS,
  getCachedCategoricalDataset,
  getWidgetDatasetCacheKeyWithRevision,
  setCachedCategoricalDataset,
} from "./dataset-cache";
import {
  NATIVE_BARS_DATA_LIMIT,
  setNativeBarsFacetData,
  setNativeBarsFacetHighlight,
} from "./native-bars-adapter";
import { initCrossfilterClient } from "./init-crossfilter-client";
import { useWidgetSelectors } from "./use-widget-selectors";

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
  const {
    cosmograph,
    activeLayer,
    currentScopeRevision,
    sourceId,
    source,
    tableName,
    baselineScope,
    baselineCacheKey,
    baselineCurrentPointScopeSql,
    baselineReady,
    scopeSql,
    isSubset,
  } = useWidgetSelectors("filter", column);
  const storedScopeClause = useDashboardStore(
    (state) => state.visibilityScopeClauses[sourceId],
  );
  const setVisibilityScopeClause = useDashboardStore(
    (state) => state.setVisibilityScopeClause,
  );
  const clearVisibilityScopeClause = useDashboardStore(
    (state) => state.clearVisibilityScopeClause,
  );

  const [error, setError] = useState<string | null>(null);
  const [widgetRevision, setWidgetRevision] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<Bars | null>(null);
  const clientRef = useRef<FilteringClient | null>(null);
  const datasetRequestIdRef = useRef(0);
  const scopedRequestIdRef = useRef(0);
  const datasetReadyRef = useRef(false);
  const selectedValueRef = useRef<string | null>(null);

  const selectedValue = useMemo(
    () => {
      const nativeValue = getSelectionValueForSource<string>(
        cosmograph?.pointsSelection,
        sourceId,
      );
      if (nativeValue != null) {
        return nativeValue;
      }
      return storedScopeClause?.kind === "categorical"
        ? storedScopeClause.value
        : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentScopeRevision forces re-evaluation when crossfilter state changes
    [cosmograph, currentScopeRevision, sourceId, storedScopeClause],
  );

  selectedValueRef.current = selectedValue;

  const commitCategoricalFilter = useCallback(
    (value: string | null) => {
      if (!value) {
        clearVisibilityScopeClause(sourceId);
        return;
      }

      setVisibilityScopeClause({
        kind: "categorical",
        sourceId,
        column,
        value,
        sql: buildCategoricalFilterScopeSql(column, value),
      });
    },
    [clearVisibilityScopeClause, column, setVisibilityScopeClause, sourceId],
  );

  useEffect(() => {
    if (!containerRef.current) {
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
        if (!value) {
          return;
        }

        if (selectedValueRef.current === value) {
          clearSelectionClause(cosmograph?.pointsSelection, source);
          commitCategoricalFilter(null);
          return;
        }

        commitCategoricalFilter(value);
        if (cosmograph && client) {
          cosmograph.pointsSelection.update(
            buildCategoricalFilterClause(client, column, value),
          );
        }
      },
    });
    widget.setLoadingState();

    let client: FilteringClient | null = null;
    clientRef.current = null;
    if (cosmograph) {
      void initCrossfilterClient(cosmograph, { sourceId, column, tableName }).then(
        (result) => {
          if (result) {
            client = result;
            clientRef.current = result;
          }
        },
      );
    }

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
  }, [column, commitCategoricalFilter, cosmograph, source, sourceId, tableName]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    const requestId = ++datasetRequestIdRef.current;
    if (!baselineReady) {
      widget.setLoadingState();
      datasetReadyRef.current = false;
      return;
    }

    const datasetCacheKey = getWidgetDatasetCacheKeyWithRevision(
      bundleChecksum,
      activeLayer,
      column,
      overlayRevision,
      baselineCacheKey,
    );
    const cachedDataset = getCachedCategoricalDataset(datasetCacheKey);
    const hasInitialDataset = initialDatasetRows !== undefined;
    const seededDataset = hasInitialDataset ? initialDatasetRows : cachedDataset;

    if (seededDataset !== undefined && seededDataset !== null) {
      setNativeBarsFacetData(widget, seededDataset);
      datasetReadyRef.current = true;
    } else {
      widget.setLoadingState();
      datasetReadyRef.current = false;
    }

    if (seededDataset == null && datasetLoading) {
      return;
    }

    const datasetPromise = seededDataset != null
      ? Promise.resolve(seededDataset)
      : (async () => {
          for (const delay of WIDGET_DATASET_RETRY_DELAYS) {
            if (delay > 0) {
              await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
            }

            const normalizedRows = toFacetRowsFromBarCounts(
              await queries.getInfoBars({
                layer: activeLayer,
                scope: baselineScope,
                column,
                maxItems: NATIVE_BARS_DATA_LIMIT,
                currentPointScopeSql: baselineCurrentPointScopeSql,
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
    baselineCurrentPointScopeSql,
    baselineReady,
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
      className="graph-filter-bars-widget w-full"
      style={{ minHeight: FILTER_BAR_HEIGHT }}
    />
  );
}
