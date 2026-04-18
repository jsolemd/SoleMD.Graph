"use client";

import { useState } from "react";
import { Badge, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import { DEFAULT_INFO_ROWS } from "@/features/graph/lib/info-widgets";
import {
  panelPillStyles,
  panelScaledPx,
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
  totalClusters: number;
  clusterColors: Record<number, string>;
  comparisonState: InfoComparisonState;
}

export function ClusterTable({
  rows,
  totalClusters,
  clusterColors,
  comparisonState,
}: ClusterTableProps) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_INFO_ROWS);
  const hiddenCount = rows.length - DEFAULT_INFO_ROWS;
  const canExpand = rows.length > DEFAULT_INFO_ROWS;

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
        <Badge size="xs" styles={panelPillStyles}>
          {visibleRows.length} of {totalClusters}
        </Badge>
      </Group>
      <Stack gap={6}>
        {visibleRows.map((cluster) => {
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
                    className="graph-render-color-preview inline-block flex-shrink-0 rounded-full"
                    style={{
                      width: panelScaledPx(8),
                      height: panelScaledPx(8),
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
                  height: panelScaledPx(6),
                  backgroundColor: "var(--graph-panel-input-bg)",
                }}
              >
                <div
                  className="graph-render-color-preview absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${totalPct}%`,
                    backgroundColor: clusterColor,
                    opacity: opacities.all,
                  }}
                />
                {comparisonState.hasSelection ? (
                  <div
                    className="graph-render-color-preview absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${selectionPct}%`,
                      backgroundColor: clusterColor,
                      opacity: opacities.selection,
                    }}
                  />
                ) : null}
                {comparisonState.hasFiltered ? (
                  <div
                    className="graph-render-color-preview absolute inset-y-0 left-0 rounded-full"
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
        {canExpand && (
          <UnstyledButton
            onClick={() => setExpanded((prev) => !prev)}
            style={panelTextDimStyle}
            className="mt-0.5"
          >
            {expanded ? "show fewer" : `${hiddenCount} more…`}
          </UnstyledButton>
        )}
      </Stack>
    </div>
  );
}
