"use client";

import { useMemo } from "react";
import { Group, Stack, Text } from "@mantine/core";
import type { GraphNode } from "@/features/graph/types";
import { readNodeColumnValue } from "@/features/graph/lib/info-widgets";
import { formatNumber } from "@/lib/helpers";
import { panelTextStyle, panelTextDimStyle } from "../../panels/PanelShell";

interface InfoBarsProps {
  column: string;
  scopedNodes: GraphNode[];
  maxItems?: number;
}

export function InfoBars({
  column,
  scopedNodes,
  maxItems = 8,
}: InfoBarsProps) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of scopedNodes) {
      const v = readNodeColumnValue(n, column);
      if (v == null) continue;
      const key = String(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxItems)
      .map(([value, count]) => ({ value, count }));
  }, [column, scopedNodes, maxItems]);

  if (rows.length === 0) {
    return (
      <Text style={panelTextDimStyle}>No data</Text>
    );
  }

  const maxCount = rows[0].count;

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
                width: `${(row.count / maxCount) * 100}%`,
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
