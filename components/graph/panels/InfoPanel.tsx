"use client";

import { Text, Stack, ActionIcon } from "@mantine/core";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { CosmographSearch, CosmographTypeColorLegend } from "@cosmograph/react";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import type { GraphStats } from "@/lib/graph/types";
import { formatNumber } from "@/lib/helpers";

export function InfoPanel({ stats }: { stats: GraphStats }) {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="absolute top-0 right-0 z-20 flex h-full w-[320px] flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        borderLeft: "1px solid var(--graph-panel-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <Text
          size="xs"
          fw={600}
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--graph-panel-text-muted)",
          }}
        >
          Info & Search
        </Text>
        <ActionIcon
          variant="subtle"
          size={28}
          radius="md"
          onClick={() => setActivePanel(null)}
          aria-label="Close info panel"
          styles={{
            root: { color: "var(--graph-panel-text-dim)" },
          }}
        >
          <X size={14} />
        </ActionIcon>
      </div>

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
            <CosmographSearch
              style={{
                width: "100%",
                borderRadius: 8,
                border: "1px solid var(--graph-panel-border)",
                backgroundColor: "var(--graph-panel-input-bg)",
              }}
              accessor="clusterLabel"
              showAccessorsMenu
            />
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
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--graph-panel-input-bg)",
                border: "1px solid var(--graph-panel-border)",
              }}
            >
              <Stack gap={4}>
                <StatRow label="Chunks" value={formatNumber(stats.chunks)} />
                <StatRow label="Papers" value={formatNumber(stats.papers)} />
                <StatRow label="Clusters" value={formatNumber(stats.clusters)} />
                <StatRow label="Noise" value={formatNumber(stats.noise)} />
              </Stack>
            </div>
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
            <CosmographTypeColorLegend
              selectOnClick
              style={{
                maxHeight: 300,
                overflow: "auto",
                borderRadius: 8,
                border: "1px solid var(--graph-panel-border)",
                backgroundColor: "var(--graph-panel-input-bg)",
                padding: 8,
              }}
            />
          </div>
        </Stack>
      </div>
    </motion.div>
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
