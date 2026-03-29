"use client";

import { useDashboardStore } from "@/features/graph/stores";

/** Height of the timeline bar in px. */
export const TIMELINE_HEIGHT = 44;

export function GraphAttribution() {
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const tableHeight = useDashboardStore((s) => s.tableHeight);

  let bottomOffset = 12;
  if (showTimeline) bottomOffset += TIMELINE_HEIGHT;
  if (tableOpen) bottomOffset += tableHeight;

  return (
    <div
      className="absolute z-20 text-[10px] leading-none transition-[bottom,right] duration-200"
      style={{
        bottom: bottomOffset + 4,
        right: 12,
        color: "var(--graph-wordmark-text)",
      }}
    >
      <span>Visualized by </span>
      <a
        href="https://cosmograph.app/"
        target="_blank"
        rel="noreferrer"
        className="transition-opacity hover:opacity-80"
        style={{ color: "inherit" }}
      >
        cosmograph.app
      </a>
      <span> · Powered by </span>
      <a
        href="https://www.semanticscholar.org/"
        target="_blank"
        rel="noreferrer"
        className="transition-opacity hover:opacity-80"
        style={{ color: "inherit" }}
      >
        Semantic Scholar
      </a>
    </div>
  );
}
