"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import {
  badgeOutlineStyles,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../../panels/PanelShell";
import {
  getInfoComparisonDisplayValue,
  getInfoComparisonOpacities,
  type InfoComparisonClusterRow,
  type InfoComparisonState,
} from "./comparison-layers";

interface ClusterTableProps {
  rows: InfoComparisonClusterRow[];
  clusterColors: Record<number, string>;
  comparisonState: InfoComparisonState;
}

export function ClusterTable({
  rows,
  clusterColors,
  comparisonState,
}: ClusterTableProps) {
  if (rows.length === 0) return null;

  const maxCount = Math.max(
    ...rows.map((cluster) =>
      Math.max(
        cluster.totalCount,
        cluster.selectionCount ?? 0,
        cluster.filteredCount ?? 0,
      ),
    ),
    0,
  );
  const opacities = getInfoComparisonOpacities(comparisonState);

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
          const totalPct = maxCount > 0 ? (cluster.totalCount / maxCount) * 100 : 0;
          const selectionPct =
            comparisonState.hasSelection &&
            cluster.selectionCount != null &&
            maxCount > 0
              ? (cluster.selectionCount / maxCount) * 100
              : 0;
          const filteredPct =
            comparisonState.hasFiltered &&
            cluster.filteredCount != null &&
            maxCount > 0
              ? (cluster.filteredCount / maxCount) * 100
              : 0;
          const clusterColor =
            clusterColors[cluster.clusterId] ?? "var(--filter-bar-active)";

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
                  {getInfoComparisonDisplayValue({
                    totalCount: cluster.totalCount,
                    selectionCount: cluster.selectionCount,
                    filteredCount: cluster.filteredCount,
                    format: (value) => formatNumber(value),
                  })}
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
                    backgroundColor: clusterColor,
                    opacity: opacities.all,
                  }}
                />
                {comparisonState.hasSelection ? (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${selectionPct}%`,
                      backgroundColor: clusterColor,
                      opacity: opacities.selection,
                    }}
                  />
                ) : null}
                {comparisonState.hasFiltered ? (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${filteredPct}%`,
                      backgroundColor: clusterColor,
                      opacity: opacities.filtered,
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
