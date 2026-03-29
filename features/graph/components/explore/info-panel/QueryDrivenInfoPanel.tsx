"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { SegmentedControl, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { getClusterColor } from "@/features/graph/lib/colors";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import { useDashboardStore } from "@/features/graph/stores";
import type {
  GraphBundleQueries,
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoScope,
  GraphInfoSummary,
} from "@/features/graph/types";
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
  const currentPointScopeSql = useDashboardStore((state) => state.currentPointScopeSql);
  const currentScopeRevision = useDashboardStore((state) => state.currentScopeRevision);
  const [debouncedCurrentPointScopeSql] = useDebouncedValue(currentPointScopeSql, 120);
  const deferredCurrentPointScopeSql = useDeferredValue(debouncedCurrentPointScopeSql);
  const selectedPointCount = useDashboardStore((state) => state.selectedPointCount);
  const selectedPointRevision = useDashboardStore((state) => state.selectedPointRevision);
  const activeSelectionSourceId = useDashboardStore(
    (state) => state.activeSelectionSourceId,
  );
  const infoScopeMode = useDashboardStore((state) => state.infoScopeMode);
  const setInfoScopeMode = useDashboardStore((state) => state.setInfoScopeMode);
  const infoWidgets = useDashboardStore((state) => state.infoWidgets);
  const colorTheme = useGraphColorTheme();

  const hasSelection = selectedPointCount > 0;
  const scope: GraphInfoScope =
    infoScopeMode === "selected" && !hasSelection ? "current" : infoScopeMode;

  const [info, setInfo] = useState<GraphInfoSummary | null>(null);
  const [facetSummaries, setFacetSummaries] = useState<
    Record<string, GraphInfoFacetRow[]>
  >({});
  const [barSummaries, setBarSummaries] = useState<
    Record<string, Array<{ value: string; count: number }>>
  >({});
  const [histograms, setHistograms] = useState<
    Record<string, GraphInfoHistogramResult>
  >({});
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [lastSummaryKey, setLastSummaryKey] = useState<string | null>(null);
  const [lastWidgetKey, setLastWidgetKey] = useState<string | null>(null);

  useEffect(() => {
    if (infoScopeMode === "selected" && !hasSelection) {
      setInfoScopeMode("current");
    }
  }, [hasSelection, infoScopeMode, setInfoScopeMode]);

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
  const scopedCurrentPointScopeSql =
    scope === "current" ? deferredCurrentPointScopeSql : null;
  const scopedCurrentScopeRevision =
    scope === "current" && deferredCurrentPointScopeSql ? currentScopeRevision : 0;
  const scopedSelectedPointCount = scope === "selected" ? selectedPointCount : 0;
  const scopedSelectedPointRevision =
    scope === "selected" ? selectedPointRevision : 0;

  const summaryRequestKey = useMemo(
    () =>
      JSON.stringify({
        activeLayer,
        scope,
        currentScopeSql: scopedCurrentPointScopeSql,
        currentScopeRevision: scopedCurrentScopeRevision,
        selectedCount: scopedSelectedPointCount,
        selectedPointRevision: scopedSelectedPointRevision,
        overlayRevision,
      }),
    [
      activeLayer,
      overlayRevision,
      scopedCurrentPointScopeSql,
      scopedCurrentScopeRevision,
      scopedSelectedPointCount,
      scopedSelectedPointRevision,
      scope,
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
  const loading = info == null && lastSummaryKey !== summaryRequestKey;
  const refreshing =
    (info != null && lastSummaryKey !== summaryRequestKey) ||
    lastWidgetKey !== deferredWidgetRequestKey;

  useEffect(() => {
    let cancelled = false;

    queries
      .getInfoSummary({
        layer: activeLayer,
        scope,
        currentPointScopeSql: scopedCurrentPointScopeSql,
      })
      .then((summary) => {
        if (cancelled) {
          return;
        }
        setInfo(summary);
        setSummaryError(null);
        setLastSummaryKey(summaryRequestKey);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }
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
    queries,
    scopedCurrentPointScopeSql,
    scope,
    summaryRequestKey,
  ]);

  useEffect(() => {
    let cancelled = false;

    const facetColumns = widgetDescriptors
      .filter((slot) => slot.kind === "facet-summary")
      .map((slot) => slot.column);
    const barColumns = widgetDescriptors
      .filter((slot) => slot.kind === "bars")
      .map((slot) => slot.column);
    const categoricalColumns = [...new Set([...facetColumns, ...barColumns])];
    const histogramColumns = widgetDescriptors
      .filter((slot) => slot.kind === "histogram")
      .map((slot) => slot.column);

    Promise.all([
      categoricalColumns.length > 0
        ? queries.getFacetSummaries({
            layer: activeLayer,
            scope,
            columns: categoricalColumns,
            currentPointScopeSql: scopedCurrentPointScopeSql,
          })
        : Promise.resolve<Record<string, GraphInfoFacetRow[]>>({}),
      histogramColumns.length > 0
        ? queries.getInfoHistogramsBatch({
            layer: activeLayer,
            scope,
            columns: histogramColumns,
            currentPointScopeSql: scopedCurrentPointScopeSql,
          })
        : Promise.resolve<Record<string, GraphInfoHistogramResult>>({}),
    ])
      .then(([categoricalSummaries, nextHistograms]) => {
        if (cancelled) {
          return;
        }
        const nextBarSummaries = Object.fromEntries(
          barColumns.map((column) => {
            const rows = categoricalSummaries[column] ?? [];
            return [
              column,
              rows
                .filter((row) => scope === "dataset" || row.scopedCount > 0)
                .map((row) => ({
                  value: row.value,
                  count: scope === "dataset" ? row.totalCount : row.scopedCount,
                })),
            ];
          }),
        );

        setFacetSummaries(categoricalSummaries);
        setBarSummaries(nextBarSummaries);
        setHistograms(nextHistograms);
        setWidgetError(null);
        setLastWidgetKey(deferredWidgetRequestKey);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }
        setWidgetError(
          queryError instanceof Error
            ? queryError.message
            : "Failed to load info widgets",
        );
        setLastWidgetKey(deferredWidgetRequestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeLayer,
    deferredWidgetRequestKey,
    queries,
    scopedCurrentPointScopeSql,
    scope,
    widgetDescriptors,
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
          ) : summaryError ? (
            <Text size="sm" style={panelTextDimStyle}>
              {summaryError}
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
                  scope={info.scope}
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
