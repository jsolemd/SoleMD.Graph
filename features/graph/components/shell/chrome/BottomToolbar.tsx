"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { GanttChart, Table2 } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import { iconBtnStyles } from "../../panels/PanelShell";
import { TIMELINE_HEIGHT } from "./GraphAttribution";

/** Bottom-left toggle bar for timeline and data table. */
export function BottomToolbar() {
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const toggleTimeline = useDashboardStore((s) => s.toggleTimeline);
  const toggleTable = useDashboardStore((s) => s.toggleTable);

  // Float above whichever bottom widgets are visible
  let bottomOffset = 12;
  if (showTimeline) bottomOffset += TIMELINE_HEIGHT;
  if (tableOpen) bottomOffset += tableHeight;

  return (
    <div
      className="absolute left-3 z-20 flex items-center gap-0.5 transition-[bottom] duration-200"
      style={{ bottom: bottomOffset }}
    >
      <Tooltip label={showTimeline ? "Hide timeline" : "Show timeline"} position="top" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={toggleTimeline}
          aria-pressed={showTimeline}
          aria-label={showTimeline ? "Hide timeline" : "Show timeline"}
        >
          <GanttChart size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={tableOpen ? "Hide table" : "Show table"} position="top" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={toggleTable}
          aria-pressed={tableOpen}
          aria-label={tableOpen ? "Hide table" : "Show table"}
        >
          <Table2 size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
