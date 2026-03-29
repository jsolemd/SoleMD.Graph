"use client";

import { Group, Loader, Stack, Text } from "@mantine/core";
import { panelTextStyle, panelTextDimStyle } from "../../panels/PanelShell";
import type { GraphBundleLoadProgress } from "@/features/graph/types";

export function GraphMetadataHydrationState({
  progress,
  error,
}: {
  progress: GraphBundleLoadProgress | null;
  error: Error | null;
}) {
  return (
    <div className="absolute left-3 top-[52px] z-40">
      <div
        className="rounded-2xl px-3 py-2"
        style={{
          backgroundColor: "var(--graph-panel-bg)",
          border: "1px solid var(--graph-panel-border)",
          boxShadow: "var(--graph-panel-shadow)",
          maxWidth: 320,
        }}
      >
        <Stack gap={4}>
          <Group justify="space-between" align="center" gap="sm">
            <Text
              size="xs"
              fw={700}
              style={{
                color: "var(--graph-panel-text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Metadata
            </Text>
            {!error && <Loader size="xs" color="var(--brand-accent)" />}
          </Group>
          <Text size="sm" style={panelTextStyle}>
            {error
              ? "Geographic metadata hydration failed"
              : progress?.message ?? "Hydrating geographic tables and local summaries."}
          </Text>
          {error ? (
            <Text size="xs" style={panelTextDimStyle}>
              {error.message}
            </Text>
          ) : (
            <Text size="xs" style={panelTextDimStyle}>
              The graph is interactive now. Optional universe artifacts and heavier detail views attach only when a panel or workflow asks for them.
            </Text>
          )}
        </Stack>
      </div>
    </div>
  );
}
