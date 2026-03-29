"use client";

import { Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type {
  GraphInfoFacetRow,
  GraphInfoHistogramBin,
  GraphInfoScope,
} from "@/features/graph/types";
import { panelTextDimStyle, panelTextStyle } from "../../panels/PanelShell";

export function QueryInfoBars({
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

const YEAR_COLUMNS = new Set(["year", "pageNumber"]);

export function QueryInfoHistogram({
  bins,
  totalCount,
  column,
}: {
  bins: GraphInfoHistogramBin[];
  totalCount: number;
  column: string;
}) {
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
              label={`${fmtAxis(bin.min)}\u2013${fmtAxis(bin.max)}: ${formatNumber(bin.count)}`}
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

export function QueryFacetSummary({
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
