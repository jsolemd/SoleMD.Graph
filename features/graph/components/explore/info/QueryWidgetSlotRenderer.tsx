"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionIcon, Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
import { formatNumber } from "@/lib/helpers";
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

interface QueryWidgetSlotRendererProps {
  slot: InfoWidgetSlot;
  layer: MapLayer;
  scope: GraphInfoScope;
  currentPointIndices: number[] | null;
  currentPointScopeSql: string | null;
  selectedPointIndices: number[];
  queries: GraphBundleQueries;
}

function QueryInfoBars({
  rows,
}: {
  rows: Array<{ value: string; count: number }>;
}) {
  if (rows.length === 0) {
    return <Text style={panelTextDimStyle}>No data</Text>;
  }

  const maxCount = rows[0]?.count ?? 0;

  return (
    <Stack gap={4}>
      {rows.map((row) => (
        <div key={row.value}>
          <Group justify="space-between" mb={1}>
            <Text
              style={{
                ...panelTextStyle,
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.value}
            </Text>
            <Text style={panelTextDimStyle}>{formatNumber(row.count)}</Text>
          </Group>
          <div
            className="rounded-sm"
            style={{
              height: 4,
              backgroundColor: "var(--graph-panel-input-bg)",
            }}
          >
            <div
              className="rounded-sm"
              style={{
                height: 4,
                width: `${maxCount > 0 ? (row.count / maxCount) * 100 : 0}%`,
                backgroundColor: "var(--mode-accent)",
                opacity: 0.8,
              }}
            />
          </div>
        </div>
      ))}
    </Stack>
  );
}

function QueryInfoHistogram({
  bins,
  totalCount,
  column,
}: {
  bins: GraphInfoHistogramBin[];
  totalCount: number;
  column: string;
}) {
  const YEAR_COLUMNS = new Set(["year", "pageNumber"]);
  if (bins.length === 0) {
    return <Text style={panelTextDimStyle}>No numeric data</Text>;
  }

  const maxBinCount = Math.max(...bins.map((bin) => bin.count), 0);
  const height = 64;
  const isYearLike = YEAR_COLUMNS.has(column);
  const fmtAxis = (value: number) =>
    isYearLike
      ? String(Math.round(value))
      : formatNumber(value, { maximumFractionDigits: 1 });

  return (
    <div>
      <div className="flex items-end gap-px" style={{ height }}>
        {bins.map((bin, index) => {
          const barHeight =
            maxBinCount > 0 ? (bin.count / maxBinCount) * height : 0;
          return (
            <Tooltip
              key={`${bin.min}-${bin.max}-${index}`}
              label={`${fmtAxis(bin.min)}–${fmtAxis(bin.max)}: ${formatNumber(bin.count)}`}
              position="top"
              withArrow
            >
              <div
                className="flex-1 rounded-t-sm"
                style={{
                  height: Math.max(barHeight, 1),
                  backgroundColor:
                    bin.count > 0
                      ? "var(--mode-accent)"
                      : "var(--graph-panel-input-bg)",
                  opacity: bin.count > 0 ? 0.8 : 0.3,
                }}
              />
            </Tooltip>
          );
        })}
      </div>
      <Group justify="space-between" mt={4}>
        <Text style={panelTextDimStyle}>{fmtAxis(bins[0]?.min ?? 0)}</Text>
        <Text style={panelTextDimStyle}>{formatNumber(totalCount)} values</Text>
        <Text style={panelTextDimStyle}>
          {fmtAxis(bins[bins.length - 1]?.max ?? 0)}
        </Text>
      </Group>
    </div>
  );
}

function QueryFacetSummary({
  rows,
  scope,
}: {
  rows: GraphInfoFacetRow[];
  scope: GraphInfoScope;
}) {
  if (rows.length === 0) {
    return <Text style={panelTextDimStyle}>No data</Text>;
  }

  const isSubset = scope !== "dataset";
  const maxCount = Math.max(...rows.map((row) => row.totalCount), 0);

  return (
    <Stack gap={6}>
      {rows.map((row) => {
        const totalPct = maxCount > 0 ? (row.totalCount / maxCount) * 100 : 0;
        const scopedPct = isSubset
          ? maxCount > 0
            ? (row.scopedCount / maxCount) * 100
            : 0
          : totalPct;

        return (
          <div key={row.value}>
            <Group justify="space-between" mb={2}>
              <Text style={panelTextStyle}>{row.value}</Text>
              <Text style={panelTextDimStyle}>
                {isSubset
                  ? `${formatNumber(row.scopedCount)} / ${formatNumber(row.totalCount)}`
                  : formatNumber(row.totalCount)}
              </Text>
            </Group>
            <div className="relative" style={{ height: 4 }}>
              {isSubset && (
                <Progress
                  size={4}
                  radius="xl"
                  value={totalPct}
                  color="var(--graph-panel-border)"
                  styles={{
                    root: {
                      backgroundColor: "var(--graph-panel-input-bg)",
                      position: "absolute",
                      inset: 0,
                    },
                  }}
                />
              )}
              <Progress
                size={4}
                radius="xl"
                value={scopedPct}
                color="var(--mode-accent)"
                styles={{
                  root: {
                    backgroundColor: isSubset
                      ? "transparent"
                      : "var(--graph-panel-input-bg)",
                    position: isSubset ? "absolute" : "relative",
                    inset: isSubset ? 0 : undefined,
                  },
                }}
              />
            </div>
          </div>
        );
      })}
    </Stack>
  );
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
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        layer,
        scope,
        column: slot.column,
        kind: slot.kind,
        currentScopeSql: currentPointScopeSql,
        selectedCount: selectedPointIndices.length,
        selectedFirst: selectedPointIndices[0] ?? null,
        selectedLast:
          selectedPointIndices.length > 0
            ? selectedPointIndices[selectedPointIndices.length - 1]
            : null,
      }),
    [currentPointScopeSql, layer, scope, selectedPointIndices, slot.column, slot.kind],
  );
  const loading = lastResolvedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;

    const scopeArgs = {
      layer,
      scope,
      currentPointIndices,
      currentPointScopeSql,
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
    currentPointScopeSql,
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
        <QueryInfoHistogram
          bins={histogram.bins}
          totalCount={histogram.totalCount}
          column={slot.column}
        />
      ) : slot.kind === "facet-summary" ? (
        <QueryFacetSummary rows={rows as GraphInfoFacetRow[]} scope={scope} />
      ) : (
        <QueryInfoBars rows={rows as Array<{ value: string; count: number }>} />
      )}
    </div>
  );
}
