"use client";

import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Stack, Text } from "@mantine/core";
import { getGraphClusterColor } from "@/features/graph/lib/colors";
import { useSelectionQueryState } from "@/features/graph/hooks/use-selection-query-state";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoSummary } from "@/features/graph/types";
import { useShallow } from "zustand/react/shallow";
import { PanelBody, PanelDivider, PanelInlineLoader, PanelShell, panelTextDimStyle } from "../../panels/PanelShell";
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

interface InfoPanelSnapshot {
  activeLayer: ReturnType<typeof useDashboardStore.getState>["activeLayer"];
  infoWidgets: ReturnType<typeof useDashboardStore.getState>["infoWidgets"];
  closePanel: ReturnType<typeof useDashboardStore.getState>["closePanel"];
}

export function QueryDrivenInfoPanel({
  queries,
  overlayRevision,
  overlayCount,
}: QueryDrivenInfoPanelProps) {
  const selectionState = useSelectionQueryState();
  const { activeLayer, infoWidgets, closePanel } = useDashboardStore(
    useShallow(
      (state): InfoPanelSnapshot => ({
        activeLayer: state.activeLayer,
        infoWidgets: state.infoWidgets,
        closePanel: state.closePanel,
      }),
    ),
  );
  const selectionLocked = selectionState.selectionLocked;
  // useSelectionQueryState batches current-scope and selected-point updates through
  // React's deferred scheduler so the info panel reacts once per logical selection change.
  const deferredCurrentPointScopeSql = selectionState.deferredCurrentPointScopeSql;
  const hasSelection = selectionState.deferredHasSelection;
  const deferredSelectedPointRevision =
    selectionState.deferredSelectedPointRevision;
  const hasCurrentSubset = selectionState.deferredHasCurrentSubset;
  const [datasetInfo, setDatasetInfo] = useState<GraphInfoSummary | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<GraphInfoSummary | null>(null);
  const [currentInfo, setCurrentInfo] = useState<GraphInfoSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [lastSummaryVersion, setLastSummaryVersion] = useState(0);

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

  // Monotonic version counter — bumps when any summary query input changes.
  // Replaces JSON.stringify: zero allocation, primitives only.
  const summaryVersionRef = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the trigger inputs; the callback intentionally ignores them and just bumps the counter
  const summaryVersion = useMemo(() => ++summaryVersionRef.current, [
    activeLayer,
    deferredCurrentPointScopeSql,
    deferredSelectedPointRevision,
    selectionLocked,
    overlayRevision,
  ]);
  const includeSelectionLayer = selectedInfo != null;
  const includeFilteredLayer =
    currentInfo != null &&
    !areInfoSummariesEquivalent(selectedInfo, currentInfo) &&
    (selectedInfo == null || selectionLocked);
  const widgetVersionRef = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- same pattern as summaryVersion
  const widgetVersion = useMemo(() => ++widgetVersionRef.current, [
    summaryVersion,
    widgetDescriptors,
    includeSelectionLayer,
    includeFilteredLayer,
  ]);
  const deferredWidgetVersion = useDeferredValue(widgetVersion);
  const {
    categoricalSummaries,
    histograms,
    numericStats,
    widgetError,
    lastLoadedVersion: lastWidgetVersion,
  } = useInfoWidgetData({
    queries,
    activeLayer,
    includeSelectionLayer,
    includeFilteredLayer,
    filteredPointScopeSql: deferredCurrentPointScopeSql,
    widgetDescriptors,
    requestVersion: deferredWidgetVersion,
  });
  const loading = datasetInfo == null && lastSummaryVersion !== summaryVersion;
  const refreshing =
    (datasetInfo != null && lastSummaryVersion !== summaryVersion) ||
    lastWidgetVersion !== deferredWidgetVersion;
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
        setLastSummaryVersion(summaryVersion);
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
        setLastSummaryVersion(summaryVersion);
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
    summaryVersion,
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
      .map((clusterId) => {
        const source =
          datasetClusters.get(clusterId) ??
          selectedClusters.get(clusterId) ??
          filteredClusters.get(clusterId);
        return {
          clusterId,
          label: source?.label ?? `Cluster ${clusterId}`,
          totalCount: datasetClusters.get(clusterId)?.count ?? 0,
          selectionCount: selectedClustersArr != null
            ? (selectedClusters.get(clusterId)?.count ?? 0)
            : null,
          filteredCount: filteredClustersArr != null
            ? (filteredClusters.get(clusterId)?.count ?? 0)
            : null,
        };
      })
      .sort((left, right) => {
        const keys: Array<(row: typeof left) => number | string> = [];
        if (filteredClustersArr != null) keys.push((r) => -(r.filteredCount ?? 0));
        if (selectedClustersArr != null) keys.push((r) => -(r.selectionCount ?? 0));
        keys.push((r) => -r.totalCount, (r) => r.label);

        for (const key of keys) {
          const a = key(left);
          const b = key(right);
          if (a < b) return -1;
          if (a > b) return 1;
        }
        return 0;
      })
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
      id="info"
      title="Info"
      defaultWidth={320}
      headerActions={
        showHeaderLoader ? <PanelInlineLoader /> : null
      }
      onClose={() => closePanel("info")}
    >
      <PanelBody panelId="info">
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
      </PanelBody>
    </PanelShell>
  );
}
