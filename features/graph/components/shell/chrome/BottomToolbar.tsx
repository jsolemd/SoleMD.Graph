"use client";

import { useCosmograph } from "@cosmograph/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { GanttChart, Table2 } from "lucide-react";
import {
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import { useDashboardStore } from "@/features/graph/stores";
import { iconBtnStyles } from "../../panels/PanelShell";
import { TIMELINE_HEIGHT } from "./GraphAttribution";
import { useGraphControlContrast } from "../../chrome/use-graph-control-contrast";

/** Bottom-left toggle bar for timeline and data table. */
export function BottomToolbar() {
  const { cosmograph } = useCosmograph();
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const toggleTimeline = useDashboardStore((s) => s.toggleTimeline);
  const toggleTable = useDashboardStore((s) => s.toggleTable);
  const { contrastAttr, contrastBlurClass } = useGraphControlContrast();

  // Float above whichever bottom widgets are visible
  let bottomOffset = 12;
  if (showTimeline) bottomOffset += TIMELINE_HEIGHT;
  if (tableOpen) bottomOffset += tableHeight;

  return (
    <div
      className={`absolute left-3 z-20 flex items-center gap-0.5 transition-[bottom] duration-200 ${contrastBlurClass}`}
      style={{ bottom: bottomOffset }}
      {...contrastAttr}
    >
      <Tooltip label={showTimeline ? "Hide timeline" : "Show timeline"} position="top" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => {
            if (showTimeline) {
              clearSelectionClause(
                cosmograph?.pointsSelection,
                createSelectionSource(`timeline:${timelineColumn}`),
              );
              setTimelineSelection(undefined);
            }

            toggleTimeline();
          }}
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
