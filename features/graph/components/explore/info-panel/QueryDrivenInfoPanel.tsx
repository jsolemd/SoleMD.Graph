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
import {
  areInfoSummariesEquivalent,
  getInfoComparisonState,
  type InfoComparisonClusterRow,
} from "../info/comparison-layers";
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
  const selectionLocked = useDashboardStore((state) => state.selectionLocked);
  const infoWidgets = useDashboardStore((state) => state.infoWidgets);
  const colorTheme = useGraphColorTheme();

  const hasSelection = selectedPointCount > 0;
  const hasCurrentSubset =
    typeof deferredCurrentPointScopeSql === "string" &&
    deferredCurrentPointScopeSql.trim().length > 0;
  const [datasetInfo, setDatasetInfo] = useState<GraphInfoSummary | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<GraphInfoSummary | null>(null);
  const [currentInfo, setCurrentInfo] = useState<GraphInfoSummary | null>(null);
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
        hasSelection,
        hasCurrentSubset,
        filteredPointScopeSql: deferredCurrentPointScopeSql,
        currentScopeRevision,
        selectedPointCount,
        selectedPointRevision,
        selectionLocked,
        overlayRevision,
      }),
    [
      activeLayer,
      currentScopeRevision,
      deferredCurrentPointScopeSql,
      hasCurrentSubset,
      hasSelection,
      overlayRevision,
      selectedPointCount,
      selectedPointRevision,
      selectionLocked,
    ],
  );
  const includeSelectionLayer = selectedInfo != null;
  const includeFilteredLayer =
    currentInfo != null &&
    !areInfoSummariesEquivalent(selectedInfo, currentInfo) &&
    (selectedInfo == null || selectionLocked);
  const [debouncedWidgetRequestKey] = useDebouncedValue(
    JSON.stringify({
      summaryRequestKey,
      widgets: widgetDescriptors,
      includeSelectionLayer,
      includeFilteredLayer,
    }),
    180,
  );
  const deferredWidgetRequestKey = useDeferredValue(debouncedWidgetRequestKey);
  const {
    categoricalSummaries,
    histograms,
    widgetError,
    lastLoadedKey: lastWidgetKey,
  } = useInfoWidgetData({
    queries,
    activeLayer,
    includeSelectionLayer,
    includeFilteredLayer,
    filteredPointScopeSql: deferredCurrentPointScopeSql,
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
      hasSelection
        ? queries.getInfoSummary({
            layer: activeLayer,
            scope: "selected",
            currentPointScopeSql: null,
          })
        : Promise.resolve<GraphInfoSummary | null>(null),
      hasCurrentSubset
        ? queries.getInfoSummary({
            layer: activeLayer,
            scope: "current",
            currentPointScopeSql: deferredCurrentPointScopeSql,
          })
        : Promise.resolve<GraphInfoSummary | null>(null),
    ])
      .then(([nextDatasetInfo, nextSelectedInfo, nextCurrentInfo]) => {
        if (cancelled) {
          return;
        }

        setDatasetInfo(nextDatasetInfo);
        setSelectedInfo(nextSelectedInfo);
        setCurrentInfo(nextCurrentInfo);
        setSummaryError(null);
        setLastSummaryKey(summaryRequestKey);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }

        setDatasetInfo(null);
        setSelectedInfo(null);
        setCurrentInfo(null);
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
  }, [
    activeLayer,
    deferredCurrentPointScopeSql,
    hasCurrentSubset,
    hasSelection,
    queries,
    summaryRequestKey,
  ]);

  const filteredInfo = useMemo(() => {
    if (!currentInfo) {
      return null;
    }

    if (selectedInfo && !selectionLocked) {
      return null;
    }

    if (selectedInfo && areInfoSummariesEquivalent(selectedInfo, currentInfo)) {
      return null;
    }

    return currentInfo;
  }, [currentInfo, selectedInfo, selectionLocked]);

  const comparisonState = useMemo(
    () =>
      getInfoComparisonState({
        hasSelection: selectedInfo != null,
        hasFiltered: filteredInfo != null,
      }),
    [filteredInfo, selectedInfo],
  );

  const activeSubsetScope = filteredInfo
    ? "current"
    : selectedInfo
      ? "selected"
      : hasCurrentSubset
        ? "current"
        : null;

  const clusterColors = useMemo(
    () =>
      Object.fromEntries(
        [
          ...(datasetInfo?.topClusters ?? []),
          ...(selectedInfo?.topClusters ?? []),
          ...(filteredInfo?.topClusters ?? []),
        ].map((cluster) => [
          cluster.clusterId,
          getClusterColor(cluster.clusterId, colorTheme),
        ]),
      ),
    [colorTheme, datasetInfo?.topClusters, filteredInfo?.topClusters, selectedInfo?.topClusters],
  );
  const clusterRows = useMemo<InfoComparisonClusterRow[]>(() => {
    if (!datasetInfo) {
      return [];
    }

    const datasetClusters = new Map(
      datasetInfo.topClusters.map((cluster) => [cluster.clusterId, cluster] as const),
    );
    const selectedClusters = new Map(
      (selectedInfo?.topClusters ?? []).map((cluster) => [cluster.clusterId, cluster] as const),
    );
    const filteredClusters = new Map(
      (filteredInfo?.topClusters ?? []).map((cluster) => [cluster.clusterId, cluster] as const),
    );

    return Array.from(
      new Set([
        ...datasetInfo.topClusters.map((cluster) => cluster.clusterId),
        ...(selectedInfo?.topClusters ?? []).map((cluster) => cluster.clusterId),
        ...(filteredInfo?.topClusters ?? []).map((cluster) => cluster.clusterId),
      ]),
    )
      .map((clusterId) => ({
        clusterId,
        label:
          datasetClusters.get(clusterId)?.label ??
          selectedClusters.get(clusterId)?.label ??
          filteredClusters.get(clusterId)?.label ??
          `Cluster ${clusterId}`,
        totalCount: datasetClusters.get(clusterId)?.count ?? 0,
        selectionCount: selectedInfo
          ? (selectedClusters.get(clusterId)?.count ?? 0)
          : null,
        filteredCount: filteredInfo
          ? (filteredClusters.get(clusterId)?.count ?? 0)
          : null,
      }))
      .sort((left, right) =>
        filteredInfo
          ? (right.filteredCount ?? 0) === (left.filteredCount ?? 0)
            ? (right.selectionCount ?? 0) === (left.selectionCount ?? 0)
              ? right.totalCount === left.totalCount
                ? left.label.localeCompare(right.label)
                : right.totalCount - left.totalCount
              : (right.selectionCount ?? 0) - (left.selectionCount ?? 0)
            : (right.filteredCount ?? 0) - (left.filteredCount ?? 0)
          : selectedInfo
            ? (right.selectionCount ?? 0) === (left.selectionCount ?? 0)
              ? right.totalCount === left.totalCount
                ? left.label.localeCompare(right.label)
                : right.totalCount - left.totalCount
              : (right.selectionCount ?? 0) - (left.selectionCount ?? 0)
          : right.totalCount === left.totalCount
            ? left.label.localeCompare(right.label)
            : right.totalCount - left.totalCount,
      )
      .slice(
        0,
        Math.max(
          datasetInfo.topClusters.length,
          selectedInfo?.topClusters.length ?? 0,
          filteredInfo?.topClusters.length ?? 0,
        ),
      );
  }, [datasetInfo, filteredInfo, selectedInfo]);

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
              <OverviewGrid
                datasetInfo={datasetInfo}
                selectedInfo={selectedInfo}
                filteredInfo={filteredInfo}
                comparisonState={comparisonState}
              />

              <ClusterTable
                rows={clusterRows}
                clusterColors={clusterColors}
                comparisonState={comparisonState}
              />

              {infoWidgets.map((slot) => (
                <QueryWidgetSlotRenderer
                  key={slot.column}
                  slot={slot}
                  comparisonState={comparisonState}
                  prefetchedCategoricalRows={
                    slot.kind === "facet-summary" || slot.kind === "bars"
                      ? categoricalSummaries[slot.column] ?? null
                      : null
                  }
                  prefetchedHistogram={
                    slot.kind === "histogram"
                      ? histograms[slot.column] ?? null
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
                subsetScope={activeSubsetScope}
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
