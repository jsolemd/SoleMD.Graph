"use client";

import { ScrollArea } from "@mantine/core";
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
        <PointsConfig />
      </ScrollArea>
    </PanelShell>
  );
}
