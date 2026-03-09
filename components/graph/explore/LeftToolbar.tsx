"use client";

import { ActionIcon, Stack, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import {
  Database,
  SlidersHorizontal,
  Filter,
  Info,
  Table2,
  Clock,
} from "lucide-react";
import { useDashboardStore } from "@/lib/graph/stores";
import type { ActivePanel } from "@/lib/graph/stores";
import { PANEL_SPRING } from "../PanelShell";

function toolbarIconStyles(active: boolean) {
  return {
    root: {
      backgroundColor: active ? "var(--graph-panel-active)" : "transparent",
      color: active ? "var(--graph-panel-text)" : "var(--graph-panel-text-dim)",
    },
  };
}

const PANEL_ITEMS: {
  panel: ActivePanel;
  icon: typeof SlidersHorizontal;
  label: string;
}[] = [
  { panel: "config", icon: SlidersHorizontal, label: "Configuration" },
  { panel: "filters", icon: Filter, label: "Filters" },
  { panel: "info", icon: Info, label: "Info" },
  { panel: "query", icon: Database, label: "SQL Explorer" },
];

/** Horizontal gradient divider separating toolbar groups. */
function ToolbarDivider() {
  return (
    <div
      className="h-px w-5 my-1 rounded-full"
      style={{
        background:
          "linear-gradient(to right, transparent, var(--graph-prompt-divider), transparent)",
      }}
    />
  );
}

export function LeftToolbar() {
  const activePanel = useDashboardStore((s) => s.activePanel);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const toggleTable = useDashboardStore((s) => s.toggleTable);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const toggleTimeline = useDashboardStore((s) => s.toggleTimeline);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={PANEL_SPRING}
      className="flex flex-col items-center justify-between py-3"
      style={{
        width: 48,
        backgroundColor: "transparent",
      }}
    >
      <Stack gap={4} align="center">
        {PANEL_ITEMS.map(({ panel, icon: Icon, label }) => {
          const isActive = activePanel === panel;
          return (
            <Tooltip key={panel} label={label} position="right" withArrow>
              <ActionIcon
                variant="subtle"
                size={36}
                radius="xl"
                onClick={() => togglePanel(panel)}
                aria-pressed={isActive}
                aria-label={label}
                styles={toolbarIconStyles(isActive)}
              >
                <Icon size={18} />
              </ActionIcon>
            </Tooltip>
          );
        })}
      </Stack>

      <Stack gap={4} align="center">
        <ToolbarDivider />

        <Tooltip label="Timeline" position="right" withArrow>
          <ActionIcon
            variant="subtle"
            size={36}
            radius="xl"
            onClick={toggleTimeline}
            aria-pressed={showTimeline}
            aria-label="Timeline"
            styles={toolbarIconStyles(showTimeline)}
          >
            <Clock size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Data Table" position="right" withArrow>
          <ActionIcon
            variant="subtle"
            size={36}
            radius="xl"
            onClick={toggleTable}
            aria-pressed={tableOpen}
            aria-label="Data Table"
            styles={toolbarIconStyles(tableOpen)}
          >
            <Table2 size={18} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    </motion.div>
  );
}
