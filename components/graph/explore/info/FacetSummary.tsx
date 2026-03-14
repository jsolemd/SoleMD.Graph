"use client";

import { useMemo } from "react";
import { Group, Progress, Stack, Text } from "@mantine/core";
import type { GraphNode } from "@/lib/graph/types";
import { readNodeColumnValue } from "@/lib/graph/info-widgets";
import { formatNumber } from "@/lib/helpers";
import { panelTextStyle, panelTextDimStyle } from "../../PanelShell";

interface FacetSummaryProps {
  column: string;
  scopedNodes: GraphNode[];
  allNodes: GraphNode[];
  /** Explicit selection flag — single source of truth from orchestrator. */
  hasSelection: boolean;
  maxItems?: number;
}

interface FacetRow {
  value: string;
  scopedCount: number;
  allCount: number;
}

export function FacetSummary({
  column,
  scopedNodes,
  allNodes,
  hasSelection,
  maxItems = 6,
}: FacetSummaryProps) {
  const rows = useMemo(() => {
    // Count values across all nodes (for ghost track denominator)
    const allCounts = new Map<string, number>();
    for (const n of allNodes) {
      const v = readNodeColumnValue(n, column);
      if (v == null) continue;
      const key = String(v);
      allCounts.set(key, (allCounts.get(key) ?? 0) + 1);
    }

    // Count values in scoped nodes when selection is active
    const scopedCounts = new Map<string, number>();
    if (hasSelection) {
      for (const n of scopedNodes) {
        const v = readNodeColumnValue(n, column);
        if (v == null) continue;
        const key = String(v);
        scopedCounts.set(key, (scopedCounts.get(key) ?? 0) + 1);
      }
    }

    if (hasSelection) {
      // Selection-first: rank by scoped counts so rare-but-selected values surface.
      // Start with values present in the selection, then fill remaining slots
      // from the full dataset to provide context.
      const selectedRows: FacetRow[] = [...scopedCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxItems)
        .map(([value, scopedCount]) => ({
          value,
          scopedCount,
          allCount: allCounts.get(value) ?? 0,
        }));

      // If selection has fewer values than maxItems, fill with top dataset values
      if (selectedRows.length < maxItems) {
        const selectedValues = new Set(selectedRows.map((r) => r.value));
        const remaining = [...allCounts.entries()]
          .filter(([v]) => !selectedValues.has(v))
          .sort((a, b) => b[1] - a[1])
          .slice(0, maxItems - selectedRows.length)
          .map(([value, allCount]) => ({
            value,
            scopedCount: 0,
            allCount,
          }));
        selectedRows.push(...remaining);
      }

      return selectedRows;
    }

    // No selection: rank by full-dataset frequency
    return [...allCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxItems)
      .map(([value, allCount]) => ({
        value,
        scopedCount: allCount,
        allCount,
      }));
  }, [column, scopedNodes, allNodes, hasSelection, maxItems]);

  if (rows.length === 0) return null;

  const maxCount = Math.max(...rows.map((r) => r.allCount));

  return (
    <Stack gap={6}>
      {rows.map((row) => {
        const allPct = maxCount > 0 ? (row.allCount / maxCount) * 100 : 0;
        const scopedPct = hasSelection
          ? maxCount > 0
            ? (row.scopedCount / maxCount) * 100
            : 0
          : allPct;

        return (
          <div key={row.value}>
            <Group justify="space-between" mb={2}>
              <Text style={panelTextStyle}>{row.value}</Text>
              <Text style={panelTextDimStyle}>
                {hasSelection
                  ? `${formatNumber(row.scopedCount)} / ${formatNumber(row.allCount)}`
                  : formatNumber(row.allCount)}
              </Text>
            </Group>
            <div className="relative" style={{ height: 4 }}>
              {/* Ghost track — full dataset proportion */}
              {hasSelection && (
                <Progress
                  size={4}
                  radius="xl"
                  value={allPct}
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
              {/* Accent track — scoped proportion */}
              <Progress
                size={4}
                radius="xl"
                value={scopedPct}
                color="var(--mode-accent)"
                styles={{
                  root: {
                    backgroundColor: hasSelection
                      ? "transparent"
                      : "var(--graph-panel-input-bg)",
                    position: hasSelection ? "absolute" : "relative",
                    inset: hasSelection ? 0 : undefined,
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
