"use client";

import type { CSSProperties } from "react";
import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type {
  GraphInfoHistogramBin,
} from "@/features/graph/types";
import { panelTextDimStyle, panelTextStyle } from "../../panels/PanelShell";
import {
  getInfoComparisonColors,
  getInfoComparisonDisplayValue,
  getInfoComparisonOpacities,
  type InfoComparisonFacetRow,
  type InfoComparisonState,
} from "./comparison-layers";

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
  comparisonState,
}: {
  rows: InfoComparisonFacetRow[];
  comparisonState: InfoComparisonState;
}) {
  return <QueryFacetSummary rows={rows} comparisonState={comparisonState} />;
}

const YEAR_COLUMNS = new Set(["year", "pageNumber"]);

export function QueryInfoHistogram({
  bins,
  totalCount,
  column,
  comparisonState,
  selectionBins,
  selectionTotalCount,
  filteredBins,
  filteredTotalCount,
}: {
  bins: GraphInfoHistogramBin[];
  totalCount: number;
  column: string;
  comparisonState: InfoComparisonState;
  selectionBins?: GraphInfoHistogramBin[] | null;
  selectionTotalCount?: number | null;
  filteredBins?: GraphInfoHistogramBin[] | null;
  filteredTotalCount?: number | null;
}) {
  if (bins.length === 0) {
    return <Text style={panelTextDimStyle}>No numeric data</Text>;
  }

  const maxBinCount = Math.max(...bins.map((bin) => bin.count), 0);
  const selectionCountByStart = new Map(
    (selectionBins ?? []).map((bin) => [bin.min, bin.count] as const),
  );
  const filteredCountByStart = new Map(
    (filteredBins ?? []).map((bin) => [bin.min, bin.count] as const),
  );
  const height = 64;
  const isYearLike = YEAR_COLUMNS.has(column);
  const colors = getInfoComparisonColors(comparisonState);
  const opacities = getInfoComparisonOpacities(comparisonState);
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
          const comparisonLabel = getInfoComparisonDisplayValue({
            totalCount: bin.count,
            selectionCount: comparisonState.hasSelection
              ? (selectionCountByStart.get(bin.min) ?? 0)
              : null,
            filteredCount: comparisonState.hasFiltered
              ? (filteredCountByStart.get(bin.min) ?? 0)
              : null,
            format: (value) => formatNumber(value),
          });
          return (
            <Tooltip
              key={`${bin.min}-${bin.max}-${index}`}
              label={`${fmtAxis(bin.min)}\u2013${fmtAxis(bin.max)}: ${comparisonLabel}`}
              position="top"
              withArrow
            >
              <div
                className="relative flex-1 overflow-hidden rounded-t-sm"
                style={{
                  height: Math.max(barHeight, 1),
                  backgroundColor: colors.all,
                  opacity: bin.count > 0 ? opacities.all : 0.3,
                }}
              >
                {comparisonState.hasSelection ? (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-sm"
                    style={{
                      height:
                        (selectionCountByStart.get(bin.min) ?? 0) > 0 &&
                        maxBinCount > 0
                          ? Math.max(
                              ((selectionCountByStart.get(bin.min) ?? 0) /
                                maxBinCount) *
                                height,
                              1,
                            )
                          : 0,
                      backgroundColor: colors.selection,
                      opacity:
                        (selectionCountByStart.get(bin.min) ?? 0) > 0
                          ? opacities.selection
                          : 0,
                    }}
                  />
                ) : null}
                {comparisonState.hasFiltered ? (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-sm"
                    style={{
                      height:
                        (filteredCountByStart.get(bin.min) ?? 0) > 0 &&
                        maxBinCount > 0
                          ? Math.max(
                              ((filteredCountByStart.get(bin.min) ?? 0) /
                                maxBinCount) *
                                height,
                              1,
                            )
                          : 0,
                      backgroundColor: colors.filtered,
                      opacity:
                        (filteredCountByStart.get(bin.min) ?? 0) > 0
                          ? opacities.filtered
                          : 0,
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
          {`${getInfoComparisonDisplayValue({
            totalCount,
            selectionCount: selectionTotalCount ?? null,
            filteredCount: filteredTotalCount ?? null,
            format: (value) => formatNumber(value),
          })} values`}
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
  comparisonState,
}: {
  rows: InfoComparisonFacetRow[];
  comparisonState: InfoComparisonState;
}) {
  if (rows.length === 0) {
    return <Text style={panelTextDimStyle}>No data</Text>;
  }

  const maxCount = Math.max(...rows.map((row) => row.totalCount), 0);
  const colors = getInfoComparisonColors(comparisonState);
  const opacities = getInfoComparisonOpacities(comparisonState);

  return (
    <Stack gap={6}>
      {rows.map((row) => {
        const totalPct = maxCount > 0 ? (row.totalCount / maxCount) * 100 : 0;
        const selectionPct =
          comparisonState.hasSelection &&
          row.selectionCount != null &&
          maxCount > 0
            ? (row.selectionCount / maxCount) * 100
            : 0;
        const filteredPct =
          comparisonState.hasFiltered &&
          row.filteredCount != null &&
          maxCount > 0
            ? (row.filteredCount / maxCount) * 100
            : 0;

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
                {getInfoComparisonDisplayValue({
                  totalCount: row.totalCount,
                  selectionCount: row.selectionCount,
                  filteredCount: row.filteredCount,
                  format: (value) => formatNumber(value),
                })}
              </Text>
            </Group>
            <div className="relative" style={infoTrackStyle}>
              <div
                style={getInfoFillStyle(
                  totalPct,
                  colors.all,
                  opacities.all,
                )}
              />
              {comparisonState.hasSelection ? (
                <div
                  className="absolute inset-y-0 left-0"
                  style={getInfoFillStyle(
                    selectionPct,
                    colors.selection,
                    opacities.selection,
                  )}
                />
              ) : null}
              {comparisonState.hasFiltered ? (
                <div
                  className="absolute inset-y-0 left-0"
                  style={getInfoFillStyle(
                    filteredPct,
                    colors.filtered,
                    opacities.filtered,
                  )}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </Stack>
  );
}
