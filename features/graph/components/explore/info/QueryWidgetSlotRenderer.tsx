"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { X } from "lucide-react";
import type {
  GraphBundleQueries,
  GraphInfoFacetRow,
  GraphInfoHistogramBin,
  GraphInfoScope,
  MapLayer,
} from "@/features/graph/types";
import type { InfoWidgetSlot } from "@/features/graph/lib/info-widgets";
import { useDashboardStore } from "@/features/graph/stores";
import { iconBtnStyles, panelTextDimStyle, panelTextStyle } from "../../panels/PanelShell";
import { QueryInfoBars, QueryInfoHistogram, QueryFacetSummary } from "./QueryWidgetVisualizations";

interface QueryWidgetSlotRendererProps {
  slot: InfoWidgetSlot;
  layer: MapLayer;
  scope: GraphInfoScope;
  currentPointIndices: number[] | null;
  currentPointScopeSql: string | null;
  selectedPointIndices: number[];
  queries: GraphBundleQueries;
}

export function QueryWidgetSlotRenderer({
  slot,
  layer,
  scope,
  currentPointIndices,
  currentPointScopeSql,
  selectedPointIndices,
  queries,
}: QueryWidgetSlotRendererProps) {
  const removeInfoWidget = useDashboardStore((state) => state.removeInfoWidget);
  const [rows, setRows] = useState<
    Array<{ value: string; count: number }> | GraphInfoFacetRow[]
  >([]);
  const [histogram, setHistogram] = useState<{
    bins: GraphInfoHistogramBin[];
    totalCount: number;
  }>({ bins: [], totalCount: 0 });
  const [error, setError] = useState<string | null>(null);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const [debouncedCurrentPointScopeSql] = useDebouncedValue(currentPointScopeSql, 120);
  const deferredCurrentPointScopeSql = useDeferredValue(debouncedCurrentPointScopeSql);
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        layer,
        scope,
        column: slot.column,
        kind: slot.kind,
        currentScopeSql: deferredCurrentPointScopeSql,
        selectedCount: selectedPointIndices.length,
        selectedFirst: selectedPointIndices[0] ?? null,
        selectedLast:
          selectedPointIndices.length > 0
            ? selectedPointIndices[selectedPointIndices.length - 1]
            : null,
      }),
    [deferredCurrentPointScopeSql, layer, scope, selectedPointIndices, slot.column, slot.kind],
  );
  const hasData =
    slot.kind === "histogram" ? histogram.bins.length > 0 : rows.length > 0;
  const loading = !hasData && lastResolvedKey !== requestKey;
  const refreshing = hasData && lastResolvedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;

    const scopeArgs = {
      layer,
      scope,
      currentPointIndices,
      currentPointScopeSql: deferredCurrentPointScopeSql,
      selectedPointIndices,
      column: slot.column,
    };

    const request =
      slot.kind === "histogram"
        ? queries.getInfoHistogram(scopeArgs)
        : slot.kind === "facet-summary"
          ? queries.getFacetSummary(scopeArgs)
          : queries.getInfoBars(scopeArgs);

    Promise.resolve(request)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (slot.kind === "histogram") {
          setHistogram(result as { bins: GraphInfoHistogramBin[]; totalCount: number });
        } else {
          setRows(result as Array<{ value: string; count: number }> | GraphInfoFacetRow[]);
        }
        setError(null);
        setLastResolvedKey(requestKey);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(
          queryError instanceof Error ? queryError.message : "Failed to load widget"
        );
        setLastResolvedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentPointIndices,
    deferredCurrentPointScopeSql,
    layer,
    queries,
    scope,
    selectedPointIndices,
    requestKey,
    slot.column,
    slot.kind,
  ]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Text size="xs" fw={600} style={panelTextStyle}>
          {slot.label}
        </Text>
        <Tooltip label={`Remove ${slot.label}`} position="left" withArrow>
          <ActionIcon
            variant="subtle"
            size={18}
            radius="sm"
            onClick={() => removeInfoWidget(slot.column)}
            aria-label={`Remove ${slot.label} widget`}
            styles={iconBtnStyles}
          >
            <X size={10} />
          </ActionIcon>
        </Tooltip>
      </div>

      {loading ? (
        <Text style={panelTextDimStyle}>Querying DuckDB…</Text>
      ) : error ? (
        <Text style={panelTextDimStyle}>{error}</Text>
      ) : slot.kind === "histogram" ? (
        <>
          {refreshing && <Text style={panelTextDimStyle}>Updating…</Text>}
          <QueryInfoHistogram
            bins={histogram.bins}
            totalCount={histogram.totalCount}
            column={slot.column}
          />
        </>
      ) : slot.kind === "facet-summary" ? (
        <>
          {refreshing && <Text style={panelTextDimStyle}>Updating…</Text>}
          <QueryFacetSummary rows={rows as GraphInfoFacetRow[]} scope={scope} />
        </>
      ) : (
        <>
          {refreshing && <Text style={panelTextDimStyle}>Updating…</Text>}
          <QueryInfoBars rows={rows as Array<{ value: string; count: number }>} />
        </>
      )}
    </div>
  );
}
