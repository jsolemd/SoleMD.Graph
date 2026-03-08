"use client";

import { Text } from "@mantine/core";

export function SimulationConfig() {
  return (
    <div className="flex items-center justify-center py-8">
      <Text size="sm" style={{ color: "var(--graph-panel-text-dim)" }}>
        Simulation disabled (pre-computed UMAP positions)
      </Text>
    </div>
  );
}
