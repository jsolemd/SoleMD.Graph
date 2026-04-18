"use client";

import { Badge, Group, Text } from "@mantine/core";
import type {
  GraphPaperDetail,
  GraphPointRecord,
} from "@/features/graph/types";
import { badgeAccentStyles, badgeOutlineStyles, panelScaledPx } from "@/features/graph/components/panels/PanelShell";
import { panelTextDimStyle, panelTextStyle } from "../ui";

export function DetailHeader({
  node,
  paper,
}: {
  node: GraphPointRecord;
  paper: GraphPaperDetail | null;
}) {
  const nodeColor = node.color;
  const title = paper?.title ?? node.paperTitle ?? node.displayLabel ?? "Untitled paper";

  const subtitle = [paper?.journal ?? node.journal, paper?.year ?? node.year, paper?.citekey ?? node.citekey]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <Text fw={600} lh={1.35} style={panelTextStyle}>
        {title}
      </Text>
      {subtitle && (
        <Text mt={4} style={panelTextDimStyle}>
          {subtitle}
        </Text>
      )}
      <Group gap={6} mt={10}>
        <Badge size="xs" styles={badgeAccentStyles}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: panelScaledPx(6),
              height: panelScaledPx(6),
              borderRadius: "50%",
              backgroundColor: nodeColor,
              marginRight: panelScaledPx(5),
              verticalAlign: "middle",
            }}
          />
          {node.clusterLabel ?? `Cluster ${node.clusterId}`}
        </Badge>
        {node.textAvailability && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            {node.textAvailability}
          </Badge>
        )}
      </Group>
    </div>
  );
}
