"use client";

import { Component, type ReactNode } from "react";
import { Button, Group, Text, Stack } from "@mantine/core";
import {
  CosmographRangeColorLegend,
  CosmographSearch,
  CosmographTypeColorLegend,
  useCosmograph,
} from "@cosmograph/react";
import { useDashboardStore } from "@/lib/graph/stores";
import type { GraphStats } from "@/lib/graph/types";
import { formatNumber } from "@/lib/helpers";
import { PanelShell } from "../PanelShell";

/** Catches DuckDB-WASM race conditions without crashing the page. */
class CosmographWidgetBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <Text size="xs" style={{ color: "var(--graph-panel-text-dim)" }}>
          Loading...
        </Text>
      );
    }
    return this.props.children;
  }
}

const SEARCH_FIELDS = {
  clusterLabel: "Cluster",
  paperTitle: "Paper",
  journal: "Journal",
  sectionCanonical: "Section",
  citekey: "Citekey",
  year: "Year",
  id: "Chunk ID",
} as const;

function formatLegendLabel(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function formatCategoryLabel(value: string) {
  return value || "Unknown";
}

function formatSelectionSource(sourceId: string | null) {
  if (!sourceId) {
    return "Canvas";
  }

  if (sourceId.startsWith("filter:")) {
    return `${sourceId.replace("filter:", "")} filter`;
  }

  if (sourceId.startsWith("timeline:")) {
    return `${sourceId.replace("timeline:", "")} timeline`;
  }

  if (sourceId.startsWith("CosmographSearch")) {
    return "Search";
  }

  if (sourceId.startsWith("CosmographTypeColorLegend")) {
    return "Color legend";
  }

  if (sourceId.startsWith("CosmographRangeColorLegend")) {
    return "Color range";
  }

  if (sourceId.startsWith("CosmographSizeLegend")) {
    return "Size legend";
  }

  return sourceId;
}

export function InfoPanel({ stats }: { stats: GraphStats }) {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const filteredPointIndices = useDashboardStore((s) => s.filteredPointIndices);
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const activeSelectionSourceId = useDashboardStore(
    (s) => s.activeSelectionSourceId
  );
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const { cosmograph } = useCosmograph();

  const visibleCount = filteredPointIndices?.length ?? stats.chunks;
  const selectedCount = selectedPointIndices.length;

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
      title="Info & Search"
      side="left"
      width={320}
      onClose={() => setActivePanel(null)}
    >
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="md">
          {/* Search */}
          <div>
            <Text
              size="xs"
              fw={500}
              mb={6}
              style={{ color: "var(--graph-panel-text-muted)" }}
            >
              Search Points
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

          <div>
            <Text
              size="xs"
              fw={500}
              mb={6}
              style={{ color: "var(--graph-panel-text-muted)" }}
            >
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
            <Group mt="sm" grow>
              <Button size="xs" variant="light" onClick={handleOpenTable}>
                Open in table
              </Button>
              <Button size="xs" variant="subtle" onClick={handleFitSelection}>
                Fit selection
              </Button>
            </Group>
          </div>

          {/* Stats */}
          <div>
            <Text
              size="xs"
              fw={500}
              mb={6}
              style={{ color: "var(--graph-panel-text-muted)" }}
            >
              Graph Stats
            </Text>
            <Stack gap={4}>
              <StatRow label="Chunks" value={formatNumber(stats.chunks)} />
              <StatRow label="Papers" value={formatNumber(stats.papers)} />
              <StatRow
                label="Clusters"
                value={formatNumber(stats.clusters)}
              />
              <StatRow label="Noise" value={formatNumber(stats.noise)} />
            </Stack>
          </div>

          {/* Cluster Color Legend */}
          <div>
            <Text
              size="xs"
              fw={500}
              mb={6}
              style={{ color: "var(--graph-panel-text-muted)" }}
            >
              Color Legend
            </Text>
            <CosmographWidgetBoundary>
              {pointColorStrategy === "continuous" ? (
                <CosmographRangeColorLegend
                  selectOnClick
                  steps={8}
                  useQuantiles
                  preserveSelectionOnUnmount
                  labelResolver="Color scale"
                  labelFormatter={formatLegendLabel}
                  extentLabels={["Low", "High"]}
                  style={{
                    maxHeight: 300,
                    overflow: "auto",
                  }}
                />
              ) : (
                <CosmographTypeColorLegend
                  selectOnClick
                  showLabel
                  hideUnknown
                  maxDisplayedItems={20}
                  resetSelectionOnCollapse={false}
                  preserveSelectionOnUnmount
                  labelResolver="Colors"
                  labelFormatter={formatCategoryLabel}
                  style={{
                    maxHeight: 300,
                    overflow: "auto",
                  }}
                />
              )}
            </CosmographWidgetBoundary>
          </div>
        </Stack>
      </div>
    </PanelShell>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <Text size="xs" style={{ color: "var(--graph-panel-text-dim)" }}>
        {label}
      </Text>
      <Text size="xs" fw={600} style={{ color: "var(--graph-panel-text)" }}>
        {value}
      </Text>
    </div>
  );
}
