"use client";

import { useCallback } from "react";
import { CosmographTimeline } from "@cosmograph/react";
import { timelineWidgetThemeVars } from "@/features/graph/components/explore/widget-theme";

/**
 * Native Cosmograph timeline — uses the integrated `CosmographTimeline` React
 * component instead of the standalone `Timeline` from `@cosmograph/ui`.
 *
 * The integrated widget:
 * - Reads data directly from the DuckDB coordinator via `accessor` (no JS fetch)
 * - Handles crossfilter updates internally (no `pointsSelection.update()` per tick)
 * - Handles scoped highlighting natively (`highlightSelectedData`)
 * - Creates its own FilteringClient (no manual `initCrossfilterClient`)
 *
 * Animation is smooth because each tick goes through the coordinator pipeline
 * (GPU-side filtering) instead of firing React state → DuckDB re-query per frame.
 */
export function TimelineWidget({
  column,
  animationSpeedMs,
  onSelection,
}: {
  column: string;
  /** Cosmograph animationSpeed in ms — lower = faster. */
  animationSpeedMs: number;
  onSelection: (selection: [number, number] | undefined) => void;
}) {
  const handleSelection = useCallback(
    (
      selection: [number, number] | [Date, Date] | undefined,
      _isManuallySelected?: boolean,
    ) => {
      if (!selection) {
        onSelection(undefined);
        return;
      }
      onSelection([Number(selection[0]), Number(selection[1])]);
    },
    [onSelection],
  );

  return (
    <CosmographTimeline
      accessor={column}
      id={`timeline:${column}`}
      barCount={32}
      allowSelection
      stickySelection
      showAnimationControls
      animationSpeed={animationSpeedMs}
      formatter={(value) => String(Math.round(Number(value)))}
      onSelection={handleSelection}
      className="h-full min-w-0 flex-1"
      style={timelineWidgetThemeVars}
    />
  );
}
