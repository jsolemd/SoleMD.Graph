"use client";

import { Table, Text } from "@mantine/core";
import type { InfoScope } from "@/lib/graph/hooks/use-info-stats";
import { formatNumber } from "@/lib/helpers";
import type { ClusterStat } from "@/lib/graph/hooks/use-info-stats";
import {
  panelTableHeaderStyle,
  panelTextDimStyle,
  sectionLabelStyle,
} from "../../PanelShell";

interface ClusterTableProps {
  topClusters: ClusterStat[];
  clusterColors: Record<number, string>;
  scope: InfoScope;
}

export function ClusterTable({
  topClusters,
  clusterColors,
  scope,
}: ClusterTableProps) {
  if (topClusters.length === 0) return null;

  const scopeLabel =
    scope === "selected" ? " (selected)" : scope === "current" ? " (current)" : "";

  return (
    <div>
      <Text fw={600} mb={4} style={sectionLabelStyle}>
        Top Clusters{scopeLabel}
      </Text>
      <div
        className="overflow-auto rounded-xl"
        style={{
          border: "1px solid var(--graph-panel-border)",
          maxHeight: 200,
        }}
      >
        <Table
          style={{ fontSize: "0.65rem" }}
          styles={{
            table: { borderColor: "transparent" },
            th: {
              backgroundColor: "var(--graph-panel-input-bg)",
              borderColor: "var(--graph-panel-border)",
            },
            td: { borderColor: "var(--graph-panel-border)" },
            tr: { backgroundColor: "transparent" },
          }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={panelTableHeaderStyle}>Cluster</Table.Th>
              <Table.Th style={{ ...panelTableHeaderStyle, textAlign: "right" }}>
                Points
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {topClusters.map((c) => (
              <Table.Tr key={c.clusterId}>
                <Table.Td>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          clusterColors[c.clusterId] ??
                          "var(--graph-panel-text-dim)",
                      }}
                    />
                    <span
                      className="truncate"
                      style={{
                        color: "var(--graph-panel-text)",
                        maxWidth: 180,
                      }}
                    >
                      {c.label}
                    </span>
                  </div>
                </Table.Td>
                <Table.Td
                  style={{
                    ...panelTextDimStyle,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatNumber(c.count)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </div>
  );
}
