"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type { GraphInfoClusterStat, GraphInfoScope } from "@/features/graph/types";
import {
  badgeOutlineStyles,
  panelCardStyle,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../../panels/PanelShell";

interface ClusterTableProps {
  topClusters: GraphInfoClusterStat[];
  clusterColors: Record<number, string>;
  scope: GraphInfoScope;
}

export function ClusterTable({
  topClusters,
  clusterColors,
  scope,
}: ClusterTableProps) {
  if (topClusters.length === 0) return null;

  const scopeLabel =
    scope === "selected" ? " (selected)" : scope === "current" ? " (current)" : "";
  const maxCount = Math.max(...topClusters.map((cluster) => cluster.count), 0);

  return (
    <div>
      <Group gap={6} mb={4}>
        <Text fw={600} style={sectionLabelStyle}>
          Top Clusters{scopeLabel}
        </Text>
        <Badge variant="outline" size="xs" styles={badgeOutlineStyles}>
          {topClusters.length} shown
        </Badge>
      </Group>
      <Stack gap={6}>
        {topClusters.map((cluster) => {
          const widthPct =
            maxCount > 0 ? (cluster.count / maxCount) * 100 : 0;
          return (
            <div key={cluster.clusterId}>
              <Group justify="space-between" mb={2} gap={8}>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        clusterColors[cluster.clusterId] ??
                        "var(--graph-panel-text-dim)",
                    }}
                  />
                  <Text
                    className="truncate"
                    style={{
                      ...panelTextStyle,
                      maxWidth: 190,
                    }}
                  >
                    {cluster.label}
                  </Text>
                </div>
                <Text
                  style={{
                    ...panelTextDimStyle,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatNumber(cluster.count)}
                </Text>
              </Group>
              <div
                className="overflow-hidden rounded-full"
                style={panelCardStyle}
              >
                <div
                  className="rounded-full"
                  style={{
                    height: 6,
                    width: `${widthPct}%`,
                    backgroundColor:
                      clusterColors[cluster.clusterId] ??
                      "var(--filter-bar-active)",
                    opacity: 0.95,
                  }}
                />
              </div>
            </div>
          );
        })}
      </Stack>
    </div>
  );
}
