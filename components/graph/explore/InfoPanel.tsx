"use client";

import { useMemo } from "react";
import { Badge, Button, Group, Progress, Stack, Table, Text } from "@mantine/core";
import { CosmographSearch, useCosmograph } from "@cosmograph/react";
import { ensureCosmographSearchSafeRemove } from "@/lib/graph/cosmograph-patches";
import { useDashboardStore } from "@/lib/graph/stores";
import { formatNumber } from "@/lib/helpers";
import type { ChunkNode, GraphData } from "@/lib/graph/types";
import {
  PanelShell,
  panelBodyTextClassName,
  panelMetaTextClassName,
  panelTableHeaderStyle,
  panelTextStyle,
  panelTextDimStyle,
  panelTextMutedStyle,
  sectionLabelStyle,
} from "../PanelShell";
import { CosmographWidgetBoundary } from "../CosmographWidgetBoundary";

ensureCosmographSearchSafeRemove();

const SEARCH_FIELDS = {
  clusterLabel: "Cluster",
  paperTitle: "Paper",
  journal: "Journal",
  sectionCanonical: "Section",
  citekey: "Citekey",
  year: "Year",
  id: "Chunk ID",
} as const;

function formatSelectionSource(sourceId: string | null) {
  if (!sourceId) return "Canvas";
  if (sourceId.startsWith("filter:")) return `${sourceId.replace("filter:", "")} filter`;
  if (sourceId.startsWith("timeline:")) return `${sourceId.replace("timeline:", "")} timeline`;
  if (sourceId.startsWith("CosmographSearch")) return "Search";
  if (sourceId.startsWith("CosmographTypeColorLegend")) return "Color legend";
  if (sourceId.startsWith("CosmographRangeColorLegend")) return "Color range";
  if (sourceId.startsWith("CosmographSizeLegend")) return "Size legend";
  return sourceId;
}

export function InfoPanel({ data }: { data: GraphData }) {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const filteredPointIndices = useDashboardStore((s) => s.filteredPointIndices);
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const activeSelectionSourceId = useDashboardStore(
    (s) => s.activeSelectionSourceId
  );
  const { cosmograph } = useCosmograph();

  const { stats, nodes, clusters, clusterColors, facets } = data;
  const visibleCount = filteredPointIndices?.length ?? stats.chunks;
  const selectedCount = selectedPointIndices.length;

  const topClusters = useMemo(
    () =>
      clusters
        .filter((c) => !c.isNoise)
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 8),
    [clusters]
  );

  const sectionFacets = useMemo(() => {
    const sections = facets
      .filter((f) => f.facetName === "section_canonical")
      .sort((a, b) => b.pointCount - a.pointCount)
      .slice(0, 6);
    const maxCount = sections.length > 0 ? sections[0].pointCount : 1;
    return sections.map((f) => ({ ...f, pct: (f.pointCount / maxCount) * 100 }));
  }, [facets]);

  const yearRange = useMemo(() => {
    const years = nodes.map((n) => n.year).filter((y): y is number => y != null);
    if (years.length === 0) return null;
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [nodes]);

  const handleOpenTable = () => {
    setTableOpen(true);
    setTableView(selectedCount > 0 ? "selected" : "visible");
  };

  const handleFitSelection = () => {
    if (selectedCount > 0) {
      cosmograph?.fitViewByIndices(selectedPointIndices, 0, 0.15);
      return;
    }
    if (
      filteredPointIndices &&
      filteredPointIndices.length > 0 &&
      filteredPointIndices.length !== stats.chunks
    ) {
      cosmograph?.fitViewByIndices(filteredPointIndices, 0, 0.15);
      return;
    }
    cosmograph?.fitView(0, 0.1);
  };

  return (
    <PanelShell
      title="Info"
      side="left"
      width={320}
      onClose={() => setActivePanel(null)}
    >
      <div className="scrollbar-hidden flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="lg">
          {/* Dataset Overview */}
          <div>
            <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
              Dataset
            </Text>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Points" value={formatNumber(stats.chunks)} />
              <StatCard label="Papers" value={formatNumber(stats.papers)} />
              <StatCard label="Clusters" value={formatNumber(stats.clusters)} />
              <StatCard
                label="Years"
                value={yearRange ? `${yearRange.min}–${yearRange.max}` : "—"}
              />
            </div>
          </div>

          {/* Top Clusters */}
          {topClusters.length > 0 && (
            <div>
              <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
                Top Clusters
              </Text>
              <div
                className="scrollbar-hidden overflow-auto rounded-xl"
                style={{
                  border: "1px solid var(--graph-panel-border)",
                  maxHeight: 200,
                }}
              >
                <Table
                  style={{ fontSize: "0.7rem" }}
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
                      <Table.Th style={panelTableHeaderStyle}>
                        Cluster
                      </Table.Th>
                      <Table.Th
                        style={{ ...panelTableHeaderStyle, textAlign: "right" }}
                      >
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
                          {formatNumber(c.memberCount)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            </div>
          )}

          {/* Sections Composition */}
          {sectionFacets.length > 0 && (
            <div>
              <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
                Sections
              </Text>
              <Stack gap={6}>
                {sectionFacets.map((f) => (
                  <div key={f.facetValue}>
                    <Group justify="space-between" mb={2}>
                      <Text
                        className={panelMetaTextClassName}
                        style={panelTextStyle}
                      >
                        {f.facetLabel ?? f.facetValue}
                      </Text>
                      <Text
                        className={panelMetaTextClassName}
                        style={panelTextDimStyle}
                      >
                        {formatNumber(f.pointCount)}
                      </Text>
                    </Group>
                    <Progress
                      size={4}
                      radius="xl"
                      value={f.pct}
                      color="var(--mode-accent)"
                      styles={{
                        root: {
                          backgroundColor: "var(--graph-panel-input-bg)",
                        },
                      }}
                    />
                  </div>
                ))}
              </Stack>
            </div>
          )}

          {/* Search */}
          <div>
            <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
              Search
            </Text>
            <CosmographWidgetBoundary>
              <CosmographSearch
                style={{
                  width: "100%",
                }}
                accessor="clusterLabel"
                showAccessorsMenu
                showFooter
                preserveSelectionOnUnmount
                placeholderText="Search points, papers, or clusters..."
                suggestionFields={SEARCH_FIELDS}
                suggestionTruncationLength={72}
                onSelectAll={() => {
                  setTableOpen(true);
                  setTableView("selected");
                }}
              />
            </CosmographWidgetBoundary>
          </div>

          {/* Selection */}
          <div>
            <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
              Selection
            </Text>
            <Stack gap={4}>
              <StatRow label="Visible" value={formatNumber(visibleCount)} />
              <StatRow label="Selected" value={formatNumber(selectedCount)} />
              <StatRow
                label="Source"
                value={formatSelectionSource(activeSelectionSourceId)}
              />
            </Stack>
            {selectedCount > 0 && (
              <SelectionSummary
                nodes={nodes}
                selectedPointIndices={selectedPointIndices}
                clusterColors={clusterColors}
              />
            )}
            <Group mt="sm" grow>
              <Button size="xs" variant="light" onClick={handleOpenTable}>
                Open in table
              </Button>
              <Button size="xs" variant="subtle" onClick={handleFitSelection}>
                Fit selection
              </Button>
            </Group>
          </div>
        </Stack>
      </div>
    </PanelShell>
  );
}

/* ---------- Sub-components ---------- */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        backgroundColor: "var(--graph-panel-input-bg)",
        border: "1px solid var(--graph-panel-border)",
      }}
    >
      <Text
        size="xs"
        fw={600}
        style={{
          ...panelTextMutedStyle,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontSize: "0.6rem",
        }}
      >
        {label}
      </Text>
      <Text mt={2} size="sm" fw={600} style={panelTextStyle}>
        {value}
      </Text>
    </div>
  );
}

function SelectionSummary({
  nodes,
  selectedPointIndices,
  clusterColors,
}: {
  nodes: ChunkNode[];
  selectedPointIndices: number[];
  clusterColors: Record<number, string>;
}) {
  const summary = useMemo(() => {
    const selectedSet = new Set(selectedPointIndices);
    const selected = nodes.filter((n) => selectedSet.has(n.index));

    const paperIds = new Set<string>();
    const clusterCounts = new Map<number, { label: string; count: number }>();
    const sectionCounts = new Map<string, number>();
    const years: number[] = [];

    for (const n of selected) {
      paperIds.add(n.paperId);

      const existing = clusterCounts.get(n.clusterId);
      if (existing) {
        existing.count++;
      } else {
        clusterCounts.set(n.clusterId, {
          label: n.clusterLabel ?? `Cluster ${n.clusterId}`,
          count: 1,
        });
      }

      if (n.sectionCanonical) {
        sectionCounts.set(
          n.sectionCanonical,
          (sectionCounts.get(n.sectionCanonical) ?? 0) + 1
        );
      }

      if (n.year != null) years.push(n.year);
    }

    const topClusters = [...clusterCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([id, info]) => ({ id, ...info }));

    const topSections = [...sectionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label]) => label);

    const yearMin = years.length > 0 ? Math.min(...years) : null;
    const yearMax = years.length > 0 ? Math.max(...years) : null;

    return {
      papers: paperIds.size,
      clusters: clusterCounts.size,
      topClusters,
      topSections,
      yearRange:
        yearMin != null && yearMax != null
          ? yearMin === yearMax
            ? String(yearMin)
            : `${yearMin}–${yearMax}`
          : null,
    };
  }, [nodes, selectedPointIndices]);

  const badgeStyles = {
    root: {
      borderColor: "var(--graph-panel-border)",
      color: "var(--graph-panel-text-dim)",
    },
  } as const;

  return (
    <Stack gap={4} mt={6}>
      <Text
        fw={500}
        className={panelMetaTextClassName}
        style={panelTextMutedStyle}
      >
        Breakdown
      </Text>
      <StatRow label="Papers" value={formatNumber(summary.papers)} />
      <StatRow label="Clusters" value={formatNumber(summary.clusters)} />
      {summary.yearRange && (
        <StatRow label="Years" value={summary.yearRange} />
      )}
      {summary.topClusters.length > 0 && (
        <Group gap={4} mt={2}>
          {summary.topClusters.map((c) => (
            <Badge
              key={c.id}
              variant="outline"
              size="xs"
              styles={badgeStyles}
              leftSection={
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      clusterColors[c.id] ?? "var(--graph-panel-text-dim)",
                  }}
                />
              }
            >
              {c.label}
            </Badge>
          ))}
        </Group>
      )}
      {summary.topSections.length > 0 && (
        <Group gap={4} mt={2}>
          {summary.topSections.map((label) => (
            <Badge key={label} variant="outline" size="xs" styles={badgeStyles}>
              {label}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <Text className={panelMetaTextClassName} style={panelTextDimStyle}>
        {label}
      </Text>
      <Text className={panelBodyTextClassName} fw={600} style={panelTextStyle}>
        {value}
      </Text>
    </div>
  );
}
