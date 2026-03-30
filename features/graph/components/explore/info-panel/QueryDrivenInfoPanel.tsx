"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Loader, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { getClusterColor } from "@/features/graph/lib/colors";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoSummary } from "@/features/graph/types";
import { PanelShell, panelTextDimStyle } from "../../panels/PanelShell";
import {
  AddInsightButton,
  ClusterTable,
  OverviewGrid,
  QueryWidgetSlotRenderer,
  SearchSection,
  SelectionActions,
} from "../info";
import { useInfoWidgetData } from "./use-info-widget-data";

interface QueryDrivenInfoPanelProps {
  queries: GraphBundleQueries;
  overlayRevision: number;
  overlayCount: number;
}

export function QueryDrivenInfoPanel({
  queries,
  overlayRevision,
  overlayCount,
}: QueryDrivenInfoPanelProps) {
  const setActivePanel = useDashboardStore((state) => state.setActivePanel);
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const currentPointScopeSql = useDashboardStore(
    (state) => state.currentPointScopeSql,
  );
  const currentScopeRevision = useDashboardStore(
    (state) => state.currentScopeRevision,
  );
  const [debouncedCurrentPointScopeSql] = useDebouncedValue(
    currentPointScopeSql,
    120,
  );
  const deferredCurrentPointScopeSql = useDeferredValue(
    debouncedCurrentPointScopeSql,
  );
  const selectedPointCount = useDashboardStore((state) => state.selectedPointCount);
  const selectedPointRevision = useDashboardStore(
    (state) => state.selectedPointRevision,
  );
  const infoWidgets = useDashboardStore((state) => state.infoWidgets);
  const colorTheme = useGraphColorTheme();

  const hasSelection = selectedPointCount > 0;
  const hasCurrentSubset =
    typeof deferredCurrentPointScopeSql === "string" &&
    deferredCurrentPointScopeSql.trim().length > 0;
  const subsetScope = hasCurrentSubset
    ? "current"
    : hasSelection
      ? "selected"
      : null;
  const subsetScopeSql =
    subsetScope === "current" ? deferredCurrentPointScopeSql : null;
  const subsetScopeRevision =
    subsetScope === "current" && subsetScopeSql ? currentScopeRevision : 0;
  const subsetSelectionCount = subsetScope === "selected" ? selectedPointCount : 0;
  const subsetSelectionRevision =
    subsetScope === "selected" ? selectedPointRevision : 0;

  const [datasetInfo, setDatasetInfo] = useState<GraphInfoSummary | null>(null);
  const [subsetInfo, setSubsetInfo] = useState<GraphInfoSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [lastSummaryKey, setLastSummaryKey] = useState<string | null>(null);

  const widgetDescriptors = useMemo(
    () =>
      infoWidgets
        .map((slot) => ({ column: slot.column, kind: slot.kind }))
        .sort((left, right) =>
          left.column === right.column
            ? left.kind.localeCompare(right.kind)
            : left.column.localeCompare(right.column),
        ),
    [infoWidgets],
  );

  const summaryRequestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        subsetScope,
        subsetScopeSql,
        subsetScopeRevision,
        subsetSelectionCount,
        subsetSelectionRevision,
        overlayRevision,
      }),
    [
      activeLayer,
      overlayRevision,
      subsetScope,
      subsetScopeRevision,
      subsetScopeSql,
      subsetSelectionCount,
      subsetSelectionRevision,
    ],
  );
  const [debouncedWidgetRequestKey] = useDebouncedValue(
    JSON.stringify({
      summaryRequestKey,
      widgets: widgetDescriptors,
    }),
    180,
  );
  const deferredWidgetRequestKey = useDeferredValue(debouncedWidgetRequestKey);
  const {
    facetSummaries,
    barSummaries,
    histograms,
    widgetError,
    lastLoadedKey: lastWidgetKey,
  } = useInfoWidgetData({
    queries,
    activeLayer,
    subsetScope,
    currentPointScopeSql: subsetScopeSql,
    widgetDescriptors,
    requestKey: deferredWidgetRequestKey,
  });
  const loading = datasetInfo == null && lastSummaryKey !== summaryRequestKey;
  const refreshing =
    (datasetInfo != null && lastSummaryKey !== summaryRequestKey) ||
    lastWidgetKey !== deferredWidgetRequestKey;
  const showHeaderLoader = loading || refreshing;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      queries.getInfoSummary({
        layer: activeLayer,
        scope: "dataset",
        currentPointScopeSql: null,
      }),
      subsetScope
        ? queries.getInfoSummary({
            layer: activeLayer,
            scope: subsetScope,
            currentPointScopeSql: subsetScopeSql,
          })
        : Promise.resolve<GraphInfoSummary | null>(null),
    ])
      .then(([nextDatasetInfo, nextSubsetInfo]) => {
        if (cancelled) {
          return;
        }

        setDatasetInfo(nextDatasetInfo);
        setSubsetInfo(nextSubsetInfo);
        setSummaryError(null);
        setLastSummaryKey(summaryRequestKey);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }

        setDatasetInfo(null);
        setSubsetInfo(null);
        setSummaryError(
          queryError instanceof Error
            ? queryError.message
            : "Failed to load info summary",
        );
        setLastSummaryKey(summaryRequestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [activeLayer, queries, subsetScope, subsetScopeSql, summaryRequestKey]);

  const clusterColors = useMemo(
    () =>
      Object.fromEntries(
        [...(datasetInfo?.topClusters ?? []), ...(subsetInfo?.topClusters ?? [])].map(
          (cluster) => [
            cluster.clusterId,
            getClusterColor(cluster.clusterId, colorTheme),
          ],
        ),
      ),
    [colorTheme, datasetInfo?.topClusters, subsetInfo?.topClusters],
  );
  const clusterRows = useMemo(() => {
    if (!datasetInfo) {
      return [];
    }

    const datasetClusters = new Map(
      datasetInfo.topClusters.map((cluster) => [cluster.clusterId, cluster] as const),
    );
    const subsetClusters = new Map(
      (subsetInfo?.topClusters ?? []).map((cluster) => [cluster.clusterId, cluster] as const),
    );

    return Array.from(
      new Set([
        ...datasetInfo.topClusters.map((cluster) => cluster.clusterId),
        ...(subsetInfo?.topClusters ?? []).map((cluster) => cluster.clusterId),
      ]),
    )
      .map((clusterId) => ({
        clusterId,
        label:
          datasetClusters.get(clusterId)?.label ??
          subsetClusters.get(clusterId)?.label ??
          `Cluster ${clusterId}`,
        totalCount: datasetClusters.get(clusterId)?.count ?? 0,
        scopedCount: subsetInfo
          ? (subsetClusters.get(clusterId)?.count ?? 0)
          : (datasetClusters.get(clusterId)?.count ?? 0),
      }))
      .sort((left, right) =>
        subsetInfo
          ? right.scopedCount === left.scopedCount
            ? right.totalCount === left.totalCount
              ? left.label.localeCompare(right.label)
              : right.totalCount - left.totalCount
            : right.scopedCount - left.scopedCount
          : right.totalCount === left.totalCount
            ? left.label.localeCompare(right.label)
            : right.totalCount - left.totalCount,
      )
      .slice(
        0,
        Math.max(
          datasetInfo.topClusters.length,
          subsetInfo?.topClusters.length ?? 0,
        ),
      );
  }, [datasetInfo, subsetInfo]);

  return (
    <PanelShell
      title="Info"
      side="left"
      width={320}
      headerActions={
        showHeaderLoader ? (
          <Loader size={12} color="var(--graph-panel-text-dim)" />
        ) : null
      }
      onClose={() => setActivePanel(null)}
    >
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <Stack gap="sm">
          {loading ? (
            <Text size="sm" style={panelTextDimStyle}>
              Querying DuckDB summaries…
            </Text>
          ) : summaryError ? (
            <Text size="sm" style={panelTextDimStyle}>
              {summaryError}
            </Text>
          ) : datasetInfo ? (
            <>
              <OverviewGrid datasetInfo={datasetInfo} subsetInfo={subsetInfo} />

              <ClusterTable
                rows={clusterRows}
                clusterColors={clusterColors}
                subsetActive={subsetInfo != null}
              />

              {infoWidgets.map((slot) => (
                <QueryWidgetSlotRenderer
                  key={slot.column}
                  slot={slot}
                  subsetActive={subsetInfo != null}
                  prefetchedFacetRows={
                    slot.kind === "facet-summary"
                      ? facetSummaries[slot.column] ?? null
                      : null
                  }
                  prefetchedBarRows={
                    slot.kind === "bars"
                      ? barSummaries[slot.column] ?? null
                      : null
                  }
                  prefetchedDatasetHistogram={
                    slot.kind === "histogram"
                      ? histograms[slot.column]?.dataset ?? null
                      : null
                  }
                  prefetchedSubsetHistogram={
                    slot.kind === "histogram"
                      ? histograms[slot.column]?.subset ?? null
                      : null
                  }
                />
              ))}

              {widgetError && (
                <Text size="xs" style={panelTextDimStyle}>
                  {widgetError}
                </Text>
              )}

              <AddInsightButton />
              <SearchSection key={activeLayer} queries={queries} />
              <SelectionActions
                subsetScope={subsetScope}
                queries={queries}
                overlayCount={overlayCount}
              />
            </>
          ) : null}
        </Stack>
      </div>
    </PanelShell>
  );
}
