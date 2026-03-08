"use client";

import { CosmographTimeline } from "@cosmograph/react";

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
  "--cosmograph-timeline-bar-color": "var(--color-golden-yellow)",
  "--cosmograph-timeline-highlighted-bar-color": "var(--brand-accent)",
  "--cosmograph-timeline-selection-color": "var(--interactive-active)",
  "--cosmograph-timeline-font-family": "Inter, sans-serif",
  "--cosmograph-timeline-font-size": "9px",
};

export function TimelineBar() {
  return (
    <div
      style={{
        height: 44,
        overflow: "hidden",
        ...cosmographOverrides,
      } as React.CSSProperties}
    >
      <CosmographTimeline
        accessor="year"
        formatter={yearFormatter}
        barCount={40}
        barTopMargin={4}
        barRadius={1}
        barPadding={0.15}
        axisTickHeight={16}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
