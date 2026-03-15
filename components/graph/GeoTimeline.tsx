"use client";

import { useCallback, useMemo } from "react";
import { RangeSlider } from "@mantine/core";
import { motion } from "framer-motion";
import { useDashboardStore } from "@/lib/graph/stores";
import { smooth } from "@/lib/motion";
import type { GeoNode } from "@/lib/graph/types";

/**
 * Custom timeline widget for the geo layer.
 *
 * Replaces CosmographTimeline (which requires a live Cosmograph canvas).
 * Matches the visual spec: 44px height, histogram bars + range slider overlay,
 * slide-up animation, mode-accent coloring.
 */

interface GeoTimelineProps {
  geoNodes: GeoNode[];
}

export function GeoTimeline({ geoNodes }: GeoTimelineProps) {
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);

  const { bars, minYear, maxYear } = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const node of geoNodes) {
      if (node.firstYear != null) {
        const last = node.lastYear ?? node.firstYear;
        for (let y = node.firstYear; y <= last; y++) {
          buckets.set(y, (buckets.get(y) ?? 0) + 1);
        }
      }
    }
    const years = [...buckets.keys()].sort((a, b) => a - b);
    if (years.length === 0) return { bars: [], minYear: 0, maxYear: 0 };

    const maxCount = Math.max(...[...buckets.values()]);

    return {
      bars: years.map((y) => {
        const count = buckets.get(y) ?? 0;
        const inRange =
          !timelineSelection ||
          (y >= timelineSelection[0] && y <= timelineSelection[1]);
        return {
          year: y,
          count,
          // Symlog scale for height (matches CosmographTimeline's useSymlogScale)
          height: Math.max(2, (Math.log1p(count) / Math.log1p(maxCount)) * 32),
          inRange,
        };
      }),
      minYear: years[0],
      maxYear: years[years.length - 1],
    };
  }, [geoNodes, timelineSelection]);

  const handleChange = useCallback(
    (value: [number, number]) => {
      setTimelineSelection(value);
    },
    [setTimelineSelection],
  );

  if (bars.length === 0) return null;

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-20"
      initial={{ opacity: 0, y: 44 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 44 }}
      transition={smooth}
      style={{
        height: 44,
        backgroundColor: "var(--graph-bg)",
        overflow: "hidden",
      }}
    >
      <div className="relative h-full w-full">
        {/* Histogram bars */}
        <div className="absolute inset-0 flex items-end px-1">
          {bars.map(({ year, height, inRange }) => (
            <div
              key={year}
              className="flex-1 rounded-t-[1px]"
              style={{
                height,
                marginLeft: 0.5,
                marginRight: 0.5,
                backgroundColor: inRange
                  ? "var(--filter-bar-active)"
                  : "var(--filter-bar-base)",
                transition: "background-color 0.15s ease",
              }}
            />
          ))}
        </div>

        {/* Range slider overlay */}
        <div className="absolute inset-x-2 bottom-0 top-0 flex items-center">
          <RangeSlider
            min={minYear}
            max={maxYear}
            step={1}
            value={timelineSelection ?? [minYear, maxYear]}
            onChange={handleChange}
            size={2}
            label={(v) => String(v)}
            labelAlwaysOn={false}
            styles={{
              root: { width: "100%" },
              track: { backgroundColor: "transparent" },
              bar: { backgroundColor: "var(--mode-accent-hover)", opacity: 0.3 },
              thumb: {
                borderColor: "var(--mode-accent)",
                backgroundColor: "var(--mode-accent)",
                width: 8,
                height: 16,
                borderRadius: 2,
              },
              label: {
                fontSize: 9,
                backgroundColor: "var(--graph-panel-bg)",
                color: "var(--graph-panel-text)",
                border: "1px solid var(--graph-panel-border)",
              },
            }}
          />
        </div>

        {/* Year labels */}
        <span
          className="absolute left-2 bottom-0.5"
          style={{ fontSize: 9, color: "var(--text-tertiary)" }}
        >
          {minYear}
        </span>
        <span
          className="absolute right-2 bottom-0.5"
          style={{ fontSize: 9, color: "var(--text-tertiary)" }}
        >
          {maxYear}
        </span>
      </div>
    </motion.div>
  );
}
