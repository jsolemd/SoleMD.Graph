"use client";

import { Tabs, ScrollArea } from "@mantine/core";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { PanelShell } from "./PanelShell";
import { PointsConfig } from "./config/PointsConfig";
import { LinksConfig } from "./config/LinksConfig";
import { SimulationConfig } from "./config/SimulationConfig";

export function ConfigPanel() {
  const configTab = useDashboardStore((s) => s.configTab);
  const setConfigTab = useDashboardStore((s) => s.setConfigTab);
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <PanelShell
      title="Configuration"
      side="left"
      onClose={() => setActivePanel(null)}
    >
      <Tabs
        value={configTab}
        onChange={(v) => v && setConfigTab(v as typeof configTab)}
        classNames={{ root: "flex-1 flex flex-col overflow-hidden" }}
      >
        <Tabs.List px="xs">
          <Tabs.Tab value="points" size="xs">
            Points
          </Tabs.Tab>
          <Tabs.Tab value="links" size="xs">
            Links
          </Tabs.Tab>
          <Tabs.Tab value="simulation" size="xs">
            Simulation
          </Tabs.Tab>
        </Tabs.List>

        <ScrollArea className="flex-1" px="md" py="sm">
          <Tabs.Panel value="points">
            <PointsConfig />
          </Tabs.Panel>
          <Tabs.Panel value="links">
            <LinksConfig />
          </Tabs.Panel>
          <Tabs.Panel value="simulation">
            <SimulationConfig />
          </Tabs.Panel>
        </ScrollArea>
      </Tabs>
    </PanelShell>
  );
}
