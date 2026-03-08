"use client";

import { Component, type ReactNode } from "react";
import { Text, Stack } from "@mantine/core";
import { CosmographSearch, CosmographTypeColorLegend } from "@cosmograph/react";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import type { GraphStats } from "@/lib/graph/types";
import { formatNumber } from "@/lib/helpers";
import { PanelShell } from "./PanelShell";

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

export function InfoPanel({ stats }: { stats: GraphStats }) {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

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
              />
            </CosmographWidgetBoundary>
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
              Cluster Colors
            </Text>
            <CosmographWidgetBoundary>
              <CosmographTypeColorLegend
                selectOnClick
                style={{
                  maxHeight: 300,
                  overflow: "auto",
                }}
              />
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
