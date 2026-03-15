"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import { useDashboardStore } from "@/lib/graph/stores";
import { useGraphColorTheme } from "@/lib/graph/hooks/use-graph-color-theme";
import { getPaletteColors } from "@/lib/graph/colors";
import type { GeoNode } from "@/lib/graph/types";

/** Type-safe dynamic property access on a GeoNode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNodeProp(node: GeoNode, key: string): any {
  return (node as never as Record<string, unknown>)[key];
}

const MAX_LEGEND_ITEMS = 12;

export function GeoColorLegend({ geoNodes }: { geoNodes: GeoNode[] }) {
  const pointColorColumn = useDashboardStore((s) => s.pointColorColumn);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const colorScheme = useDashboardStore((s) => s.colorScheme);
  const colorTheme = useGraphColorTheme();

  const legend = useMemo(() => {
    const palette = getPaletteColors(colorScheme, colorTheme);

    if (pointColorStrategy === "single" || pointColorStrategy === "direct") {
      return null; // No legend needed
    }

    if (pointColorStrategy === "categorical") {
      const counts = new Map<string, number>();
      for (const n of geoNodes) {
        const val = String(getNodeProp(n, pointColorColumn) ?? "");
        if (!val) continue;
        counts.set(val, (counts.get(val) ?? 0) + 1);
      }
      // Sort by count descending, take top N
      const entries = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_LEGEND_ITEMS);
      if (entries.length === 0) return null;

      return {
        type: "categorical" as const,
        items: entries.map(([label, count], i) => ({
          label,
          count,
          color: palette[i % palette.length],
        })),
        overflow: counts.size > MAX_LEGEND_ITEMS ? counts.size - MAX_LEGEND_ITEMS : 0,
      };
    }

    if (pointColorStrategy === "continuous") {
      const values = geoNodes
        .map((n) => getNodeProp(n, pointColorColumn))
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (values.length === 0) return null;

      const min = Math.min(...values);
      const max = Math.max(...values);
      if (min === max) return null;

      const stops = palette.slice(0, 5);
      return {
        type: "continuous" as const,
        min,
        max,
        stops,
        column: pointColorColumn,
      };
    }

    return null;
  }, [geoNodes, pointColorColumn, pointColorStrategy, colorScheme, colorTheme]);

  if (!legend) return null;

  return (
    <div
      className="flex flex-col gap-1"
      style={{
        borderRadius: 12,
        border: "1px solid var(--graph-panel-border)",
        backgroundColor: "var(--graph-panel-bg)",
        boxShadow: "var(--graph-panel-shadow)",
        padding: "8px 10px",
        minWidth: 120,
        maxWidth: 200,
      }}
    >
      <Text
        size="xs"
        fw={600}
        style={{
          color: "var(--graph-panel-text-muted)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {pointColorColumn}
      </Text>

      {legend.type === "categorical" && (
        <>
          {legend.items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: item.color,
                  flexShrink: 0,
                }}
              />
              <Text
                size="xs"
                style={{
                  color: "var(--graph-panel-text)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </Text>
              <Text
                size="xs"
                style={{
                  color: "var(--graph-panel-text-muted)",
                  flexShrink: 0,
                }}
              >
                {item.count}
              </Text>
            </div>
          ))}
          {legend.overflow > 0 && (
            <Text size="xs" style={{ color: "var(--graph-panel-text-muted)" }}>
              + {legend.overflow} more
            </Text>
          )}
        </>
      )}

      {legend.type === "continuous" && (
        <>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: `linear-gradient(to right, ${legend.stops.join(", ")})`,
            }}
          />
          <div className="flex justify-between">
            <Text size="xs" style={{ color: "var(--graph-panel-text-muted)" }}>
              {legend.min}
            </Text>
            <Text size="xs" style={{ color: "var(--graph-panel-text-muted)" }}>
              {legend.max}
            </Text>
          </div>
        </>
      )}
    </div>
  );
}
