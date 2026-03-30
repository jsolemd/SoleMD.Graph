"use client";

import type { CSSProperties } from "react";
import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type {
  GraphInfoFacetRow,
  GraphInfoHistogramBin,
} from "@/features/graph/types";
import { panelTextDimStyle, panelTextStyle } from "../../panels/PanelShell";

const INFO_BAR_HEIGHT = 6;

const infoTrackStyle: CSSProperties = {
  height: INFO_BAR_HEIGHT,
  backgroundColor: "var(--graph-panel-input-bg)",
  borderRadius: 999,
  overflow: "hidden",
};

const getInfoFillStyle = (widthPct: number, color: string, opacity = 1) =>
  ({
    height: INFO_BAR_HEIGHT,
    width: `${widthPct}%`,
    backgroundColor: color,
    borderRadius: 999,
    opacity,
  }) as CSSProperties;

export function QueryInfoBars({
  rows,
  subsetActive,
}: {
  rows: GraphInfoFacetRow[];
  subsetActive: boolean;
}) {
  return <QueryFacetSummary rows={rows} subsetActive={subsetActive} />;
}

const YEAR_COLUMNS = new Set(["year", "pageNumber"]);

export function QueryInfoHistogram({
  bins,
  totalCount,
  column,
  highlightBins,
  highlightTotalCount,
}: {
  bins: GraphInfoHistogramBin[];
  totalCount: number;
  column: string;
  highlightBins?: GraphInfoHistogramBin[] | null;
  highlightTotalCount?: number | null;
}) {
  if (bins.length === 0) {
    return <Text style={panelTextDimStyle}>No numeric data</Text>;
  }

  const maxBinCount = Math.max(...bins.map((bin) => bin.count), 0);
  const highlightCountByStart = new Map(
    (highlightBins ?? []).map((bin) => [bin.min, bin.count] as const),
  );
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
          const highlightedCount = highlightCountByStart.get(bin.min) ?? 0;
          return (
            <Tooltip
              key={`${bin.min}-${bin.max}-${index}`}
              label={
                highlightCountByStart.size > 0
                  ? `${fmtAxis(bin.min)}\u2013${fmtAxis(bin.max)}: ${formatNumber(
                      highlightedCount,
                    )} / ${formatNumber(bin.count)}`
                  : `${fmtAxis(bin.min)}\u2013${fmtAxis(bin.max)}: ${formatNumber(bin.count)}`
              }
              position="top"
              withArrow
            >
              <div
                className="relative flex-1 overflow-hidden rounded-t-sm"
                style={{
                  height: Math.max(barHeight, 1),
                  backgroundColor:
                    bin.count > 0
                      ? highlightCountByStart.size > 0
                        ? "var(--filter-bar-base)"
                        : "var(--filter-bar-active)"
                      : "var(--graph-panel-input-bg)",
                  opacity: bin.count > 0 ? 0.92 : 0.3,
                }}
              >
                {highlightCountByStart.size > 0 ? (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-sm"
                    style={{
                      height:
                        highlightedCount > 0 && maxBinCount > 0
                          ? Math.max((highlightedCount / maxBinCount) * height, 1)
                          : 0,
                      backgroundColor: "var(--filter-bar-active)",
                      opacity: highlightedCount > 0 ? 0.95 : 0,
                    }}
                  />
                ) : null}
              </div>
            </Tooltip>
          );
        })}
      </div>
      <Group justify="space-between" mt={4}>
        <Text style={panelTextDimStyle}>{fmtAxis(bins[0]?.min ?? 0)}</Text>
        <Text style={panelTextDimStyle}>
          {highlightCountByStart.size > 0 && highlightTotalCount != null
            ? `${formatNumber(highlightTotalCount)} / ${formatNumber(totalCount)} values`
            : `${formatNumber(totalCount)} values`}
        </Text>
        <Text style={panelTextDimStyle}>
          {fmtAxis(bins[bins.length - 1]?.max ?? 0)}
        </Text>
      </Group>
    </div>
  );
}

export function QueryFacetSummary({
  rows,
  subsetActive,
}: {
  rows: GraphInfoFacetRow[];
  subsetActive: boolean;
}) {
  if (rows.length === 0) {
    return <Text style={panelTextDimStyle}>No data</Text>;
  }

  const maxCount = Math.max(...rows.map((row) => row.totalCount), 0);
  const totalFacetCount = rows.reduce((sum, row) => sum + row.totalCount, 0);

  return (
    <Stack gap={6}>
      {rows.map((row) => {
        const totalPct = maxCount > 0 ? (row.totalCount / maxCount) * 100 : 0;
        const scopedPct = subsetActive
          ? maxCount > 0
            ? (row.scopedCount / maxCount) * 100
            : 0
          : totalPct;
        const subsetPct =
          row.totalCount > 0 ? (row.scopedCount / row.totalCount) * 100 : 0;

        return (
          <div key={row.value}>
            <Group justify="space-between" mb={2}>
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
              <Text style={panelTextDimStyle}>
                {subsetActive
                  ? `${formatNumber(row.scopedCount)} / ${formatNumber(row.totalCount)} (${subsetPct.toFixed(1)}%)`
                  : `${formatNumber(row.totalCount)} (${totalFacetCount > 0 ? ((row.totalCount / totalFacetCount) * 100).toFixed(1) : "0.0"}%)`}
              </Text>
            </Group>
            <div className="relative" style={infoTrackStyle}>
              {subsetActive ? (
                <div
                  style={getInfoFillStyle(
                    totalPct,
                    "var(--filter-bar-base)",
                    1,
                  )}
                />
              ) : null}
              <div
                className={subsetActive ? "absolute inset-0" : undefined}
                style={getInfoFillStyle(
                  scopedPct,
                  "var(--filter-bar-active)",
                  0.95,
                )}
              />
            </div>
          </div>
        );
      })}
    </Stack>
  );
}
