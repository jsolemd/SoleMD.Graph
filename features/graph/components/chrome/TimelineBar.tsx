"use client";

import { motion } from "framer-motion";
import { useCosmograph } from "@cosmograph/react";
import { ActionIcon, Badge, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import { TimelineWidget } from "@/features/graph/cosmograph/widgets/TimelineWidget";
import { getColumnMeta } from "@/features/graph/lib/columns";
import {
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import type { GraphBundleQueries } from "@/features/graph/types";
import { edgeReveal } from "@/lib/motion";
import {
  badgeAccentStyles,
  badgeOutlineStyles,
  iconBtnStyles,
  panelChromeStyle,
  panelTextMutedStyle,
} from "../panels/PanelShell";

const timelineStyle: React.CSSProperties = {
  height: 44,
  overflow: "hidden",
  backgroundColor: "var(--graph-bg)",
};

function formatRange(selection?: [number, number]) {
  if (!selection) {
    return "All";
  }

  const [min, max] = selection;
  const start = Math.round(Math.min(min, max));
  const end = Math.round(Math.max(min, max));
  return start === end ? String(start) : `${start}-${end}`;
}

export function TimelineBar({
  queries,
  bundleChecksum,
  overlayRevision,
}: {
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
}) {
  const { cosmograph } = useCosmograph();
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const columnLabel = getColumnMeta(timelineColumn)?.label ?? timelineColumn;
  const hasSelection = Array.isArray(timelineSelection);

  const handleClearSelection = () => {
    clearSelectionClause(
      cosmograph?.pointsSelection,
      createSelectionSource(`timeline:${timelineColumn}`),
    );
    setTimelineSelection(undefined);
  };

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-stretch"
      {...edgeReveal(44)}
      style={timelineStyle}
    >
      <div
        className="flex shrink-0 items-center gap-1.5 border-r px-3"
        style={{ borderColor: "var(--graph-panel-border)" }}
      >
        <Text
          className="uppercase tracking-[0.08em]"
          style={{ ...panelTextMutedStyle, ...panelChromeStyle }}
        >
          Timeline
        </Text>
        <Badge variant="outline" size="xs" styles={badgeOutlineStyles}>
          {columnLabel}
        </Badge>
        <Badge
          variant={hasSelection ? "light" : "outline"}
          size="xs"
          styles={hasSelection ? badgeAccentStyles : badgeOutlineStyles}
        >
          {formatRange(timelineSelection)}
        </Badge>
        {hasSelection ? (
          <Tooltip label="Clear timeline selection" position="top" withArrow>
            <ActionIcon
              variant="transparent"
              size={22}
              radius="xl"
              className="graph-icon-btn"
              styles={iconBtnStyles}
              onClick={handleClearSelection}
              aria-label="Clear timeline selection"
            >
              <X size={12} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <TimelineWidget
          key={timelineColumn}
          column={timelineColumn}
          queries={queries}
          bundleChecksum={bundleChecksum}
          overlayRevision={overlayRevision}
          onSelection={setTimelineSelection}
        />
      </div>
    </motion.div>
  );
}
