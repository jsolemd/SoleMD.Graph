"use client";

import { useMemo } from "react";
import { Badge, Group, Text } from "@mantine/core";
import { useGraphStore } from "@/features/graph/stores";
import { badgeAccentStyles } from "@/features/graph/components/panels/PanelShell";
import type { GeoSelection } from "@/features/graph/stores/dashboard-store";
import type { GeoNode, GeoLink } from "@/features/graph/types";
import { InteractiveListItem } from "./InteractiveListItem";
import {
  InlineStats,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "./ui";

export function GeoAggregateSection({
  geoSelection,
  geoNodes,
  geoLinks,
}: {
  geoSelection: GeoSelection;
  geoNodes: GeoNode[];
  geoLinks: GeoLink[];
}) {
  const selectNode = useGraphStore((s) => s.selectNode);

  // Filter nodes matching the selection
  const matchingNodes = useMemo(() => {
    return geoNodes.filter((n) => {
      if (n.countryCode !== geoSelection.countryCode) return false;
      if (geoSelection.level === "region" && geoSelection.regionName) {
        return n.region === geoSelection.regionName;
      }
      return true;
    });
  }, [geoNodes, geoSelection]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalPapers = 0;
    let totalAuthors = 0;
    let minYear = Infinity;
    let maxYear = -Infinity;
    const clusterSet = new Set<number>();
    for (const n of matchingNodes) {
      totalPapers += n.paperCount;
      totalAuthors += n.authorCount;
      if (n.firstYear != null && n.firstYear < minYear) minYear = n.firstYear;
      if (n.lastYear != null && n.lastYear > maxYear) maxYear = n.lastYear;
      if (n.clusterId > 0) clusterSet.add(n.clusterId);
    }
    return {
      institutions: matchingNodes.length,
      papers: totalPapers,
      authors: totalAuthors,
      firstYear: minYear === Infinity ? null : minYear,
      lastYear: maxYear === -Infinity ? null : maxYear,
      clusters: clusterSet.size,
    };
  }, [matchingNodes]);

  // Top institutions sorted by paperCount
  const topInstitutions = useMemo(() => {
    return [...matchingNodes].sort((a, b) => b.paperCount - a.paperCount).slice(0, 10);
  }, [matchingNodes]);

  // Lookup map for O(1) node access by id
  const nodeById = useMemo(
    () => new Map(geoNodes.map((n) => [n.id, n])),
    [geoNodes],
  );

  // Top collaborators outside the selection boundary
  const topCollaborators = useMemo(() => {
    const matchingIds = new Set(matchingNodes.map((n) => n.id));
    const countryPapers = new Map<string, number>();
    for (const link of geoLinks) {
      const srcIn = matchingIds.has(link.sourceId);
      const tgtIn = matchingIds.has(link.targetId);
      // Only count links that cross the selection boundary
      if (srcIn === tgtIn) continue;
      const outsideId = srcIn ? link.targetId : link.sourceId;
      const outsideNode = nodeById.get(outsideId);
      if (!outsideNode?.country) continue;
      const key = outsideNode.country;
      countryPapers.set(key, (countryPapers.get(key) ?? 0) + link.paperCount);
    }
    return [...countryPapers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([country, papers]) => ({ country, papers }));
  }, [matchingNodes, geoLinks, nodeById]);

  // Cluster distribution
  const clusterDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of matchingNodes) {
      if (n.clusterId <= 0) continue;
      const label = n.clusterLabel ?? `Cluster ${n.clusterId}`;
      counts.set(label, (counts.get(label) ?? 0) + n.paperCount);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, papers]) => ({ label, papers }));
  }, [matchingNodes]);

  const title =
    geoSelection.level === "region" && geoSelection.regionName
      ? `${geoSelection.regionName}, ${geoSelection.countryName}`
      : geoSelection.countryName || geoSelection.countryCode;

  return (
    <div>
      <Text fw={600} lh={1.35} style={panelTextStyle}>
        {title}
      </Text>
      <Text mt={4} style={panelTextDimStyle}>
        {geoSelection.level === "region" ? "Region" : "Country"}
      </Text>

      <div className="mt-3">
        <InlineStats
          items={[
            { label: "institutions", value: stats.institutions },
            { label: "papers", value: stats.papers },
            { label: "authors", value: stats.authors },
            { label: "from", value: stats.firstYear },
            { label: "to", value: stats.lastYear },
          ]}
        />
      </div>

      {/* Top institutions */}
      {topInstitutions.length > 0 && (
        <div className="mt-4">
          <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
            Top institutions
          </Text>
          <div className="flex flex-col gap-1.5">
            {topInstitutions.map((inst) => (
              <InteractiveListItem
                key={inst.id}
                onClick={() => selectNode(inst)}
              >
                <Text style={panelTextStyle}>{inst.institution ?? "Unknown"}</Text>
                <Text style={panelTextDimStyle}>
                  {inst.paperCount} paper{inst.paperCount !== 1 ? "s" : ""}
                </Text>
              </InteractiveListItem>
            ))}
          </div>
        </div>
      )}

      {/* Top collaborators */}
      {topCollaborators.length > 0 && (
        <div className="mt-4">
          <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
            Top collaborators
          </Text>
          <div className="flex flex-col gap-1.5">
            {topCollaborators.map((c) => (
              <div key={c.country} className="flex items-baseline justify-between gap-2">
                <Text style={panelTextStyle}>{c.country}</Text>
                <Text style={panelTextDimStyle}>
                  {c.papers} shared paper{c.papers !== 1 ? "s" : ""}
                </Text>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster distribution */}
      {clusterDist.length > 0 && (
        <div className="mt-4">
          <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
            Research topics
          </Text>
          <Group gap={6} wrap="wrap">
            {clusterDist.map((c) => (
              <Badge key={c.label} size="xs" styles={badgeAccentStyles}>
                {c.label} ({c.papers})
              </Badge>
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}
