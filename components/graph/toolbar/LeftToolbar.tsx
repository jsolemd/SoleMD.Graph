"use client";

import { ActionIcon, Stack, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import {
  SlidersHorizontal,
  Filter,
  Info,
  Table2,
  Clock,
} from "lucide-react";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import type { ActivePanel } from "@/lib/graph/dashboard-store";
import { PANEL_SPRING } from "../panels/PanelShell";

const PANEL_ITEMS: {
  panel: ActivePanel;
  icon: typeof SlidersHorizontal;
  label: string;
}[] = [
  { panel: "config", icon: SlidersHorizontal, label: "Configuration" },
  { panel: "filters", icon: Filter, label: "Filters" },
  { panel: "info", icon: Info, label: "Info & Search" },
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
                styles={{
                  root: {
                    backgroundColor: isActive
                      ? "var(--graph-panel-active)"
                      : "transparent",
                    color: isActive
                      ? "var(--graph-panel-text)"
                      : "var(--graph-panel-text-dim)",
                  },
                }}
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
            styles={{
              root: {
                backgroundColor: showTimeline
                  ? "var(--graph-panel-active)"
                  : "transparent",
                color: showTimeline
                  ? "var(--graph-panel-text)"
                  : "var(--graph-panel-text-dim)",
              },
            }}
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
            styles={{
              root: {
                backgroundColor: tableOpen
                  ? "var(--graph-panel-active)"
                  : "transparent",
                color: tableOpen
                  ? "var(--graph-panel-text)"
                  : "var(--graph-panel-text-dim)",
              },
            }}
          >
            <Table2 size={18} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    </motion.div>
  );
}
