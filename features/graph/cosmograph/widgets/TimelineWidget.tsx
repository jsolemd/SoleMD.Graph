"use client";
import { CosmographTimeline, CosmographButtonPlayPause } from "@cosmograph/react";

const yearFormatter = (value: Date | number) =>
  String(Math.round(Number(value)));

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

interface TimelineWidgetProps {
  column: string;
  initialSelection?: [number, number];
  onSelection: (selection: [number, number] | undefined) => void;
}

export function TimelineWidget({ column, initialSelection, onSelection }: TimelineWidgetProps) {
  const handleSelection = (selection: [number, number] | [Date, Date] | undefined) => {
    if (selection && typeof selection[0] === "number" && typeof selection[1] === "number") {
      onSelection(selection as [number, number]);
      return;
    }
    onSelection(undefined);
  };

  return (
    <>
      <CosmographButtonPlayPause style={playPauseStyle} />
      <CosmographTimeline
        id={`timeline:${column}`}
        accessor={column}
        highlightSelectedData
        initialSelection={initialSelection}
        preserveSelectionOnUnmount
        useQuantiles
        useSymlogScale
        formatter={yearFormatter}
        onSelection={handleSelection}
        barCount={40}
        barTopMargin={4}
        barRadius={1}
        barPadding={0.15}
        axisTickHeight={16}
        style={{ width: "100%", height: "100%", flex: 1, ...cosmographOverrides } as React.CSSProperties}
      />
    </>
  );
}
