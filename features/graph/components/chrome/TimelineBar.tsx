"use client";

import { useCallback } from "react";
import { CosmographTimeline, CosmographButtonPlayPause } from "@cosmograph/react";
import { motion } from "framer-motion";
import { useDashboardStore } from "@/features/graph/stores";
import { smooth } from "@/lib/motion";

const yearFormatter = (value: Date | number) =>
  String(Math.round(Number(value)));

/**
 * Inline overrides beat Cosmograph's runtime-injected :root defaults.
 * Foundation tokens auto-swap between light/dark.
 */
const cosmographOverrides: Record<string, string> = {
  "--cosmograph-timeline-background": "var(--graph-bg)",
  "--cosmograph-timeline-text-color": "var(--text-tertiary)",
  "--cosmograph-timeline-axis-color": "var(--text-tertiary)",
  "--cosmograph-timeline-bar-color": "var(--filter-bar-base)",
  "--cosmograph-timeline-highlighted-bar-color": "var(--filter-bar-active)",
  "--cosmograph-timeline-selection-color": "var(--mode-accent-hover)",
  "--cosmograph-timeline-font-family": "var(--font-sans)",
  "--cosmograph-timeline-font-size": "9px",
};

const timelineStyle: React.CSSProperties = {
  height: 44,
  overflow: "hidden",
  backgroundColor: "var(--graph-bg)",
  ...cosmographOverrides,
} as React.CSSProperties;

const playPauseStyle: React.CSSProperties = {
  width: 32,
  flexShrink: 0,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  "--cosmograph-button-color": "var(--mode-accent)",
  "--cosmograph-button-background": "transparent",
  "--cosmograph-button-hover-background": "var(--interactive-hover)",
} as React.CSSProperties;

export function TimelineBar() {
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);

  const handleSelection = useCallback(
    (selection: [number, number] | [Date, Date] | undefined) => {
      if (
        selection &&
        typeof selection[0] === "number" &&
        typeof selection[1] === "number"
      ) {
        setTimelineSelection(selection as [number, number]);
        return;
      }
      setTimelineSelection(undefined);
    },
    [setTimelineSelection],
  );

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-stretch"
      initial={{ opacity: 0, y: 44 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 44 }}
      transition={smooth}
      style={timelineStyle}
    >
      <CosmographButtonPlayPause style={playPauseStyle} />
      <CosmographTimeline
        id={`timeline:${timelineColumn}`}
        accessor={timelineColumn}
        initialSelection={timelineSelection}
        preserveSelectionOnUnmount
        highlightSelectedData
        useQuantiles
        useSymlogScale
        formatter={yearFormatter}
        onSelection={handleSelection}
        barCount={40}
        barTopMargin={4}
        barRadius={1}
        barPadding={0.15}
        axisTickHeight={16}
        style={{ width: "100%", height: "100%", flex: 1 }}
      />
    </motion.div>
  );
}
