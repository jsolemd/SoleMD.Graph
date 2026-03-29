"use client";

import { Badge, Group, Text } from "@mantine/core";
import type {
  AliasNode,
  GeoNode,
  GraphNode,
  GraphPaperDetail,
  RelationAssertionNode,
  TermNode,
} from "@/features/graph/types";
import { badgeAccentStyles, badgeOutlineStyles } from "@/features/graph/components/panels/PanelShell";
import { panelTextDimStyle, panelTextStyle } from "../ui";

export function DetailHeader({
  node,
  paper,
}: {
  node: GraphNode;
  paper: GraphPaperDetail | null;
}) {
  const nodeColor = node.color;
  const isGeo = node.nodeKind === "institution";
  const geo = isGeo ? (node as GeoNode) : null;

  const title = isGeo
    ? (geo!.institution ?? "Unknown institution")
    : node.nodeKind === "term"
      ? (node.displayLabel ?? node.canonicalName ?? "Unknown term")
      : node.nodeKind === "alias"
        ? (node.aliasText ?? node.displayLabel ?? "Alias")
        : node.nodeKind === "relation_assertion"
          ? (node.relationType ?? node.displayLabel ?? "Relation")
          : (paper?.title ?? node.paperTitle ?? node.displayLabel);

  const subtitle = isGeo
    ? [geo!.city, geo!.region, geo!.country].filter(Boolean).join(", ")
    : node.nodeKind === "term"
      ? [node.category, node.semanticGroups, node.organSystems].filter(Boolean).join(" · ")
      : node.nodeKind === "alias"
        ? [node.canonicalName, node.aliasType, node.aliasSource].filter(Boolean).join(" · ")
        : node.nodeKind === "relation_assertion"
          ? [
              node.relationCategory,
              node.relationDirection,
              node.relationCertainty,
            ]
              .filter(Boolean)
              .join(" · ")
          : [paper?.journal ?? node.journal, paper?.year ?? node.year, paper?.citekey ?? node.citekey]
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
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: nodeColor,
              marginRight: 5,
              verticalAlign: "middle",
            }}
          />
          {node.clusterLabel ?? `Cluster ${node.clusterId}`}
        </Badge>
        {node.nodeKind === "chunk" && node.sectionCanonical && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            {node.sectionCanonical}
          </Badge>
        )}
        {node.nodeKind === "chunk" && node.pageNumber != null && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            p. {node.pageNumber}
          </Badge>
        )}
        {node.nodeKind === "term" && node.category && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            {node.category}
          </Badge>
        )}
        {node.nodeKind === "alias" && node.aliasType && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            {node.aliasType}
          </Badge>
        )}
        {node.nodeKind === "relation_assertion" && node.relationCertainty && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            {node.relationCertainty}
          </Badge>
        )}
      </Group>
    </div>
  );
}
