"use client";

import { ScrollArea, Stack, Text } from "@mantine/core";
import { useDashboardStore } from "@/lib/graph/stores";
import { PanelShell } from "../PanelShell";
import { PointsConfig } from "./PointsConfig";

export function ConfigPanel() {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <PanelShell
      title="Configuration"
      side="left"
      onClose={() => setActivePanel(null)}
    >
      <ScrollArea className="flex-1" px="md" py="sm">
        <Stack gap="md">
          <Text size="xs" style={{ color: "var(--graph-panel-text-dim)" }}>
            These controls are wired directly to the active Cosmograph instance.
            No placeholder tabs or inactive settings.
          </Text>
          <PointsConfig />
        </Stack>
      </ScrollArea>
    </PanelShell>
  );
}
