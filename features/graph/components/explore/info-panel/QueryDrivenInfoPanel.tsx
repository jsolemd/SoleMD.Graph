"use client";

import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { getGraphClusterColor } from "@/features/graph/lib/colors";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoSummary } from "@/features/graph/types";
import { PANEL_BODY_CLASS, PanelDivider, PanelInlineLoader, PanelShell, panelTextDimStyle } from "../../panels/PanelShell";
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
  // Debounce selection signals so they settle together with the scope SQL
  // debounce (120ms), preventing staggered query bursts where immediate
  // revision bumps fire one batch and the debounced SQL fires another.
  const [debouncedSelectedPointCount] = useDebouncedValue(selectedPointCount, 120);
  const [debouncedSelectedPointRevision] = useDebouncedValue(selectedPointRevision, 120);
  const selectionLocked = useDashboardStore((state) => state.selectionLocked);
  const infoWidgets = useDashboardStore((state) => state.infoWidgets);
  const hasSelection = debouncedSelectedPointCount > 0;
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
        selectedPointCount: debouncedSelectedPointCount,
        selectedPointRevision: debouncedSelectedPointRevision,
        selectionLocked,
        overlayRevision,
      }),
    [
      activeLayer,
      debouncedSelectedPointCount,
      debouncedSelectedPointRevision,
      deferredCurrentPointScopeSql,
      hasCurrentSubset,
      hasSelection,
      overlayRevision,
      selectionLocked,
    ],
  );
  const includeSelectionLayer = selectedInfo != null;
  const includeFilteredLayer =
    currentInfo != null &&
    !areInfoSummariesEquivalent(selectedInfo, currentInfo) &&
    (selectedInfo == null || selectionLocked);
  const widgetKey = useMemo(
    () => infoWidgets.map(w => `${w.column}:${w.kind}`).sort().join(","),
    [infoWidgets],
  );
  const [debouncedWidgetRequestKey] = useDebouncedValue(
    JSON.stringify({
      summaryRequestKey,
      widgets: widgetKey,
      includeSelectionLayer,
      includeFilteredLayer,
    }),
    180,
  );
  const deferredWidgetRequestKey = useDeferredValue(debouncedWidgetRequestKey);
  const {
    categoricalSummaries,
    histograms,
    numericStats,
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

  const clusterIdKey = useMemo(
    () =>
      [
        ...(datasetInfo?.topClusters ?? []),
        ...(selectedInfo?.topClusters ?? []),
        ...(filteredInfo?.topClusters ?? []),
      ]
        .map((c) => c.clusterId)
        .sort()
        .join(","),
    [datasetInfo?.topClusters, selectedInfo?.topClusters, filteredInfo?.topClusters],
  );

  const clusterColors = useMemo(
    () =>
      Object.fromEntries(
        [
          ...(datasetInfo?.topClusters ?? []),
          ...(selectedInfo?.topClusters ?? []),
          ...(filteredInfo?.topClusters ?? []),
        ].map((cluster) => [
          cluster.clusterId,
          getGraphClusterColor(cluster.clusterId),
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clusterIdKey is a stable string proxy for the topClusters arrays; re-computing only when cluster IDs actually change
    [clusterIdKey],
  );
  const datasetClustersArr = datasetInfo?.topClusters;
  const selectedClustersArr = selectedInfo?.topClusters;
  const filteredClustersArr = filteredInfo?.topClusters;

  const clusterRows = useMemo<InfoComparisonClusterRow[]>(() => {
    if (!datasetClustersArr) {
      return [];
    }

    const datasetClusters = new Map(
      datasetClustersArr.map((cluster) => [cluster.clusterId, cluster] as const),
    );
    const selectedClusters = new Map(
      (selectedClustersArr ?? []).map((cluster) => [cluster.clusterId, cluster] as const),
    );
    const filteredClusters = new Map(
      (filteredClustersArr ?? []).map((cluster) => [cluster.clusterId, cluster] as const),
    );

    return Array.from(
      new Set([
        ...datasetClustersArr.map((cluster) => cluster.clusterId),
        ...(selectedClustersArr ?? []).map((cluster) => cluster.clusterId),
        ...(filteredClustersArr ?? []).map((cluster) => cluster.clusterId),
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
        selectionCount: selectedClustersArr != null
          ? (selectedClusters.get(clusterId)?.count ?? 0)
          : null,
        filteredCount: filteredClustersArr != null
          ? (filteredClusters.get(clusterId)?.count ?? 0)
          : null,
      }))
      .sort((left, right) =>
        filteredClustersArr != null
          ? (right.filteredCount ?? 0) === (left.filteredCount ?? 0)
            ? (right.selectionCount ?? 0) === (left.selectionCount ?? 0)
              ? right.totalCount === left.totalCount
                ? left.label.localeCompare(right.label)
                : right.totalCount - left.totalCount
              : (right.selectionCount ?? 0) - (left.selectionCount ?? 0)
            : (right.filteredCount ?? 0) - (left.filteredCount ?? 0)
          : selectedClustersArr != null
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
          datasetClustersArr.length,
          selectedClustersArr?.length ?? 0,
          filteredClustersArr?.length ?? 0,
        ),
      );
  }, [datasetClustersArr, selectedClustersArr, filteredClustersArr]);

  return (
    <PanelShell
      title="Info"
      side="left"
      width={320}
      headerActions={
        showHeaderLoader ? <PanelInlineLoader /> : null
      }
      onClose={() => setActivePanel(null)}
    >
      <div className={PANEL_BODY_CLASS}>
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
              {/* Flat sections array — dividers auto-interleaved */}
              {(
                [
                  <OverviewGrid
                    key="overview"
                    datasetInfo={datasetInfo}
                    selectedInfo={selectedInfo}
                    filteredInfo={filteredInfo}
                    comparisonState={comparisonState}
                  />,

                  clusterRows.length > 0 ? (
                    <ClusterTable
                      key="clusters"
                      rows={clusterRows}
                      totalClusters={datasetInfo.clusters}
                      clusterColors={clusterColors}
                      comparisonState={comparisonState}
                    />
                  ) : null,

                  /* Each widget is its own section so dividers work when added/removed */
                  ...infoWidgets.map((slot) => (
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
                      prefetchedNumericStats={
                        slot.kind === "histogram"
                          ? numericStats[slot.column] ?? null
                          : null
                      }
                    />
                  )),

                  widgetError ? (
                    <Text key="widget-error" size="xs" style={panelTextDimStyle}>
                      {widgetError}
                    </Text>
                  ) : null,

                  <AddInsightButton key="add-insight" />,

                  <SearchSection key={`search-${activeLayer}`} queries={queries} />,

                  <SelectionActions
                    key="actions"
                    subsetScope={activeSubsetScope}
                    queries={queries}
                    overlayCount={overlayCount}
                  />,
                ] as (ReactNode | null)[]
              )
                .filter(Boolean)
                .flatMap((section, i) =>
                  i > 0
                    ? [<PanelDivider key={`div-${i}`} />, section]
                    : [section],
                )}
            </>
          ) : null}
        </Stack>
      </div>
    </PanelShell>
  );
}
