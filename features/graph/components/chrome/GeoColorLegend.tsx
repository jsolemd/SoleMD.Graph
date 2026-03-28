"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import { useDashboardStore } from "@/features/graph/stores";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import { getPaletteColors, resolvePaletteSelection } from "@/features/graph/lib/colors";
import { getNodeProp, safeMin, safeMax } from "@/features/graph/lib/helpers";
import type { GeoNode } from "@/features/graph/types";

const MAX_LEGEND_ITEMS = 12;

export function GeoColorLegend({ geoNodes }: { geoNodes: GeoNode[] }) {
  const pointColorColumn = useDashboardStore((s) => s.pointColorColumn);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const colorScheme = useDashboardStore((s) => s.colorScheme);
  const colorTheme = useGraphColorTheme();

  const legend = useMemo(() => {
    const resolved = resolvePaletteSelection(pointColorColumn, pointColorStrategy, colorScheme, colorTheme);
    const palette = getPaletteColors(colorScheme, colorTheme);

    if (resolved.colorStrategy === "single" || resolved.colorStrategy === "direct") {
      return null; // No legend needed
    }

    if (resolved.colorStrategy === "categorical") {
      const counts = new Map<string, number>();
      for (const n of geoNodes) {
        const val = String(getNodeProp(n, resolved.colorColumn) ?? "");
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

    if (resolved.colorStrategy === "continuous") {
      const values = geoNodes
        .map((n) => getNodeProp(n, resolved.colorColumn))
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (values.length === 0) return null;

      const min = safeMin(values);
      const max = safeMax(values);
      if (min === max) return null;

      const stops = palette.slice(0, 5);
      return {
        type: "continuous" as const,
        min,
        max,
        stops,
        column: resolved.colorColumn,
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
                title={item.label}
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
