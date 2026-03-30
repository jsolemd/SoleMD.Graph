"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import {
  badgeOutlineStyles,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../../panels/PanelShell";

export interface InfoClusterRow {
  clusterId: number;
  label: string;
  totalCount: number;
  scopedCount: number;
}

interface ClusterTableProps {
  rows: InfoClusterRow[];
  clusterColors: Record<number, string>;
  subsetActive: boolean;
}

export function ClusterTable({
  rows,
  clusterColors,
  subsetActive,
}: ClusterTableProps) {
  if (rows.length === 0) return null;

  const maxCount = Math.max(
    ...rows.map((cluster) => Math.max(cluster.totalCount, cluster.scopedCount)),
    0,
  );

  return (
    <div>
      <Group gap={6} mb={4}>
        <Text fw={600} style={sectionLabelStyle}>
          Top Clusters
        </Text>
        <Badge variant="outline" size="xs" styles={badgeOutlineStyles}>
          {rows.length} shown
        </Badge>
      </Group>
      <Stack gap={6}>
        {rows.map((cluster) => {
          const safeTotalCount = Math.max(cluster.totalCount, cluster.scopedCount);
          const totalPct =
            maxCount > 0 ? (safeTotalCount / maxCount) * 100 : 0;
          const scopedPct =
            subsetActive && maxCount > 0
              ? (cluster.scopedCount / maxCount) * 100
              : totalPct;
          const subsetPct =
            safeTotalCount > 0
              ? (cluster.scopedCount / safeTotalCount) * 100
              : 0;

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
                  {subsetActive
                    ? cluster.totalCount > 0
                      ? `${formatNumber(cluster.scopedCount)} / ${formatNumber(cluster.totalCount)} (${subsetPct.toFixed(1)}%)`
                      : formatNumber(cluster.scopedCount)
                    : formatNumber(safeTotalCount)}
                </Text>
              </Group>
              <div
                className="relative overflow-hidden rounded-full"
                style={{
                  height: 6,
                  backgroundColor: "var(--graph-panel-input-bg)",
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${totalPct}%`,
                    backgroundColor:
                      clusterColors[cluster.clusterId] ??
                      "var(--filter-bar-active)",
                    opacity: subsetActive ? 0.3 : 0.95,
                  }}
                />
                {subsetActive ? (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${scopedPct}%`,
                      backgroundColor:
                        clusterColors[cluster.clusterId] ??
                        "var(--filter-bar-active)",
                      opacity: 0.98,
                    }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </Stack>
    </div>
  );
}
