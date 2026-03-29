"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { SegmentedControl, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { getClusterColor } from "@/features/graph/lib/colors";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import type { InfoScope } from "@/features/graph/hooks/use-info-stats";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoSummary } from "@/features/graph/types";
import { PanelShell, panelTextDimStyle } from "../../panels/PanelShell";
import {
  ScopeIndicator,
  OverviewGrid,
  ClusterTable,
  AddInsightButton,
  SearchSection,
  SelectionActions,
} from "../info";
import { QueryWidgetSlotRenderer } from "../info";

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
  const currentPointIndices = useDashboardStore((state) => state.currentPointIndices);
  const currentPointScopeSql = useDashboardStore((state) => state.currentPointScopeSql);
  const [debouncedCurrentPointScopeSql] = useDebouncedValue(currentPointScopeSql, 120);
  const deferredCurrentPointScopeSql = useDeferredValue(debouncedCurrentPointScopeSql);
  const selectedPointIndices = useDashboardStore((state) => state.selectedPointIndices);
  const activeSelectionSourceId = useDashboardStore(
    (state) => state.activeSelectionSourceId,
  );
  const infoScopeMode = useDashboardStore((state) => state.infoScopeMode);
  const setInfoScopeMode = useDashboardStore((state) => state.setInfoScopeMode);
  const infoWidgets = useDashboardStore((state) => state.infoWidgets);
  const colorTheme = useGraphColorTheme();

  const hasSelection = selectedPointIndices.length > 0;
  const scope: InfoScope =
    infoScopeMode === "selected" && !hasSelection ? "current" : infoScopeMode;

  const [info, setInfo] = useState<GraphInfoSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);

  useEffect(() => {
    if (infoScopeMode === "selected" && !hasSelection) {
      setInfoScopeMode("current");
    }
  }, [hasSelection, infoScopeMode, setInfoScopeMode]);

  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        scope,
        currentScopeSql: deferredCurrentPointScopeSql,
        selectedCount: selectedPointIndices.length,
        selectedFirst: selectedPointIndices[0] ?? null,
        selectedLast:
          selectedPointIndices.length > 0
            ? selectedPointIndices[selectedPointIndices.length - 1]
            : null,
        overlayRevision,
      }),
    [activeLayer, deferredCurrentPointScopeSql, overlayRevision, scope, selectedPointIndices],
  );
  const loading = info == null && lastResolvedKey !== requestKey;
  const refreshing = info != null && lastResolvedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;

    queries
      .getInfoSummary({
        layer: activeLayer,
        scope,
        currentPointIndices,
        currentPointScopeSql: deferredCurrentPointScopeSql,
        selectedPointIndices,
      })
      .then((summary) => {
        if (cancelled) {
          return;
        }
        setInfo(summary);
        setError(null);
        setLastResolvedKey(requestKey);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(
          queryError instanceof Error
            ? queryError.message
            : "Failed to load info summary",
        );
        setLastResolvedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeLayer,
    currentPointIndices,
    deferredCurrentPointScopeSql,
    queries,
    requestKey,
    scope,
    selectedPointIndices,
  ]);

  const clusterColors = useMemo(
    () =>
      Object.fromEntries(
        (info?.topClusters ?? []).map((cluster) => [
          cluster.clusterId,
          getClusterColor(cluster.clusterId, colorTheme),
        ]),
      ),
    [colorTheme, info?.topClusters],
  );

  return (
    <PanelShell
      title="Info"
      side="left"
      width={320}
      onClose={() => setActivePanel(null)}
    >
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <Stack gap="md">
          <SegmentedControl
            size="xs"
            fullWidth
            data={[
              { label: "Current", value: "current" },
              {
                label: "Selected",
                value: "selected",
                disabled: !hasSelection,
              },
              { label: "Dataset", value: "dataset" },
            ]}
            value={scope}
            onChange={(value) => setInfoScopeMode(value as typeof infoScopeMode)}
          />

          {loading ? (
            <Text size="sm" style={panelTextDimStyle}>
              Querying DuckDB summaries…
            </Text>
          ) : error ? (
            <Text size="sm" style={panelTextDimStyle}>
              {error}
            </Text>
          ) : info ? (
            <>
              {refreshing && (
                <Text size="xs" style={panelTextDimStyle}>
                  Updating summaries…
                </Text>
              )}
              <ScopeIndicator
                scopedCount={info.scopedCount}
                totalCount={info.totalCount}
                scope={info.scope}
                isSubset={info.isSubset}
                selectionSource={
                  info.scope === "selected" ? activeSelectionSourceId : null
                }
              />

              <OverviewGrid info={info} layer={activeLayer} />

              <ClusterTable
                topClusters={info.topClusters}
                clusterColors={clusterColors}
                scope={info.scope}
              />

              {infoWidgets.map((slot) => (
                <QueryWidgetSlotRenderer
                  key={slot.column}
                  slot={slot}
                  layer={activeLayer}
                  scope={info.scope}
                  currentPointIndices={currentPointIndices}
                  currentPointScopeSql={deferredCurrentPointScopeSql}
                  selectedPointIndices={selectedPointIndices}
                  queries={queries}
                />
              ))}

              <AddInsightButton />
              <SearchSection key={activeLayer} queries={queries} />
              <SelectionActions
                scope={info.scope}
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
