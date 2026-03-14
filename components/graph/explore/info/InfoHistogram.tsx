"use client";

import { useMemo } from "react";
import { Group, Text, Tooltip } from "@mantine/core";
import type { GraphNode } from "@/lib/graph/types";
import { readNodeColumnValue } from "@/lib/graph/info-widgets";
import { formatNumber } from "@/lib/helpers";
import { panelTextDimStyle } from "../../PanelShell";

/** Columns whose values should never have thousand separators (e.g. 2025 not 2,025). */
const YEAR_COLUMNS = new Set(["year", "pageNumber"]);

interface InfoHistogramProps {
  column: string;
  scopedNodes: GraphNode[];
  bins?: number;
}

interface Bin {
  min: number;
  max: number;
  count: number;
}

export function InfoHistogram({
  column,
  scopedNodes,
  bins: binCount = 16,
}: InfoHistogramProps) {
  const { bins, totalCount } = useMemo(() => {
    const values: number[] = [];
    for (const n of scopedNodes) {
      const v = readNodeColumnValue(n, column);
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }

    if (values.length === 0) return { bins: [] as Bin[], totalCount: 0 };

    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }

    // Single value — one bin
    if (min === max) {
      return {
        bins: [{ min, max, count: values.length }],
        totalCount: values.length,
      };
    }

    const step = (max - min) / binCount;
    const result: Bin[] = Array.from({ length: binCount }, (_, i) => ({
      min: min + step * i,
      max: min + step * (i + 1),
      count: 0,
    }));

    for (const v of values) {
      const idx = Math.min(Math.floor((v - min) / step), binCount - 1);
      result[idx].count++;
    }

    return { bins: result, totalCount: values.length };
  }, [column, scopedNodes, binCount]);

  if (bins.length === 0) {
    return (
      <Text style={panelTextDimStyle}>No numeric data</Text>
    );
  }

  const maxBinCount = Math.max(...bins.map((b) => b.count));
  const height = 64;
  const isYearLike = YEAR_COLUMNS.has(column);
  const fmtAxis = (v: number) =>
    isYearLike
      ? String(Math.round(v))
      : formatNumber(v, { maximumFractionDigits: 1 });

  return (
    <div>
      <div
        className="flex items-end gap-px"
        style={{ height }}
      >
        {bins.map((bin, i) => {
          const barHeight =
            maxBinCount > 0 ? (bin.count / maxBinCount) * height : 0;
          return (
            <Tooltip
              key={i}
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
        <Text style={panelTextDimStyle}>
          {fmtAxis(bins[0].min)}
        </Text>
        <Text style={panelTextDimStyle}>
          {formatNumber(totalCount)} values
        </Text>
        <Text style={panelTextDimStyle}>
          {fmtAxis(bins[bins.length - 1].max)}
        </Text>
      </Group>
    </div>
  );
}
