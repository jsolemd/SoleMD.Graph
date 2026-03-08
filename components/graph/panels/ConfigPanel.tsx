"use client";

import { Tabs, Text, ActionIcon, ScrollArea } from "@mantine/core";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { PointsConfig } from "./config/PointsConfig";
import { LinksConfig } from "./config/LinksConfig";
import { SimulationConfig } from "./config/SimulationConfig";

export function ConfigPanel() {
  const configTab = useDashboardStore((s) => s.configTab);
  const setConfigTab = useDashboardStore((s) => s.setConfigTab);
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="absolute top-0 left-0 z-20 flex h-full w-[300px] flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        borderRight: "1px solid var(--graph-panel-border)",
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
          Configuration
        </Text>
        <ActionIcon
          variant="subtle"
          size={28}
          radius="md"
          onClick={() => setActivePanel(null)}
          aria-label="Close config panel"
          styles={{
            root: { color: "var(--graph-panel-text-dim)" },
          }}
        >
          <X size={14} />
        </ActionIcon>
      </div>

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
    </motion.div>
  );
}
