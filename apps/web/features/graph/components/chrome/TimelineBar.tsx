"use client";

import { memo, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useGraphInstance } from "@/features/graph/cosmograph";
import { Badge, Popover, Slider, Text, Tooltip } from "@mantine/core";
import { Gauge } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import { TimelineWidget } from "@/features/graph/cosmograph/widgets/TimelineWidget";
import type { GraphBundleQueries } from "@solemd/graph";
import {
  buildNumericRangeFilterScopeSql,
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import {
  SPEED_SLIDER_MARKS,
  formatSpeedLabel,
  formatSpeedLabelShort,
  multiplierToSliderStep,
  sliderStepToMultiplier,
  speedMultiplierToMs,
} from "@/features/graph/lib/timeline-utils";
import { edgeReveal } from "@/lib/motion";
import {
  panelChromeStyle,
  panelPillStyles,
  panelTextMutedStyle,
  panelTypePillStyles,
  promptSurfaceStyle,
} from "../panels/PanelShell";

const TIMELINE_HEIGHT = 44;
const TIMELINE_DEFAULT_EXTENT: [number, number] = [1945, 2024];

const timelineStyle: React.CSSProperties = {
  height: TIMELINE_HEIGHT,
  overflow: "hidden",
  backgroundColor: "var(--background)",
};

/**
 * Format year range — always "YYYY–YYYY" for stable width.
 * When no selection, shows full dataset extent (1945–2024).
 */
function formatRange(selection: [number, number]): string {
  const start = Math.round(Math.min(selection[0], selection[1]));
  const end = Math.round(Math.max(selection[0], selection[1]));
  return start === end ? String(start) : `${start}–${end}`;
}

/** Slider styles — compact, graph-themed, evenly-spaced marks. */
const speedSliderStyles = {
  root: { width: 140 },
  track: { height: 3 },
  thumb: { width: 10, height: 10, borderWidth: 1 },
  markLabel: {
    fontSize: 8,
    color: "var(--graph-panel-text-dim)",
    marginTop: 4,
  },
  mark: { width: 4, height: 4 },
  label: {
    fontSize: 9,
    padding: "1px 4px",
    backgroundColor: "var(--surface-alt)",
    color: "var(--text-primary)",
    border: "1px solid var(--graph-panel-border)",
  },
} as const;

function TimelineBarComponent({
  queries,
  bundleChecksum,
  overlayRevision,
}: {
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
}) {
  const cosmograph = useGraphInstance();
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const setVisibilityScopeClause = useDashboardStore(
    (s) => s.setVisibilityScopeClause,
  );
  const clearVisibilityScopeClause = useDashboardStore(
    (s) => s.clearVisibilityScopeClause,
  );
  const timelineSpeed = useDashboardStore((s) => s.timelineSpeed);
  const setTimelineSpeed = useDashboardStore((s) => s.setTimelineSpeed);
  const hasSelection = Array.isArray(timelineSelection);
  const [speedOpen, setSpeedOpen] = useState(false);

  const commitTimelineSelection = useCallback(
    (selection: [number, number] | undefined) => {
      const sourceId = `timeline:${timelineColumn}`;
      if (!selection) {
        setTimelineSelection(undefined);
        clearVisibilityScopeClause(sourceId);
        return;
      }

      const normalized: [number, number] = [
        Math.round(Math.min(selection[0], selection[1])),
        Math.round(Math.max(selection[0], selection[1])),
      ];
      if (
        normalized[0] === TIMELINE_DEFAULT_EXTENT[0] &&
        normalized[1] === TIMELINE_DEFAULT_EXTENT[1]
      ) {
        setTimelineSelection(undefined);
        clearVisibilityScopeClause(sourceId);
        return;
      }

      setTimelineSelection(normalized);
      setVisibilityScopeClause({
        kind: "timeline",
        sourceId,
        column: timelineColumn,
        value: normalized,
        sql: buildNumericRangeFilterScopeSql(timelineColumn, normalized),
      });
    },
    [
      clearVisibilityScopeClause,
      setTimelineSelection,
      setVisibilityScopeClause,
      timelineColumn,
    ],
  );

  /** Clicking the range pill toggles selection off (no separate X button = no layout shift). */
  const handleRangePillClick = () => {
    if (!hasSelection) return;
    clearSelectionClause(
      cosmograph?.pointsSelection,
      createSelectionSource(`timeline:${timelineColumn}`),
    );
    commitTimelineSelection(undefined);
  };

  const handleSliderChange = (step: number) => {
    setTimelineSpeed(sliderStepToMultiplier(step));
  };

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-stretch"
      {...edgeReveal(TIMELINE_HEIGHT)}
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

        {/*
         * Range pill — FIXED width, zero layout shift.
         *
         * Always shows "YYYY–YYYY" format. When no selection active, shows
         * the full extent in dim outline style. When selected, flips to
         * accent style + cursor:pointer. Clicking clears the selection
         * (toggle pattern — same as FilterBarWidget click-to-deselect).
         */}
        <Tooltip
          label="Click to clear selection"
          position="top"
          withArrow
          disabled={!hasSelection}
        >
          <Badge
            variant={hasSelection ? "light" : "outline"}
            size="xs"
            styles={{
              ...(hasSelection ? panelPillStyles : panelTypePillStyles),
              root: {
                ...(hasSelection ? panelPillStyles : panelTypePillStyles).root,
                cursor: hasSelection ? "pointer" : "default",
                fontVariantNumeric: "tabular-nums",
                minWidth: 52,
                justifyContent: "center",
                ...(hasSelection && {
                  animation: "pill-activate 300ms ease-out",
                }),
              },
            }}
            onClick={handleRangePillClick}
          >
            {hasSelection ? formatRange(timelineSelection) : "1945–2024"}
          </Badge>
        </Tooltip>

        {/* Speed popover — fixed-width pill, evenly-spaced slider */}
        <Popover
          opened={speedOpen}
          onChange={setSpeedOpen}
          position="top"
          withArrow
          shadow="sm"
          offset={8}
        >
          <Popover.Target>
            <Tooltip
              label="Animation speed"
              position="top"
              withArrow
              disabled={speedOpen}
            >
              <Badge
                variant="outline"
                size="xs"
                styles={{
                  ...panelTypePillStyles,
                  root: {
                    ...panelTypePillStyles.root,
                    cursor: "pointer",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 40,
                    justifyContent: "center",
                  },
                }}
                leftSection={<Gauge size={7} style={{ opacity: 0.6 }} />}
                onClick={() => setSpeedOpen((o) => !o)}
              >
                {formatSpeedLabel(timelineSpeed)}
              </Badge>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown
            style={{
              padding: "8px 12px 16px",
              ...promptSurfaceStyle,
            }}
          >
            <Slider
              value={multiplierToSliderStep(timelineSpeed)}
              onChange={handleSliderChange}
              min={1}
              max={9}
              step={1}
              marks={[...SPEED_SLIDER_MARKS]}
              label={formatSpeedLabelShort}
              styles={speedSliderStyles}
            />
          </Popover.Dropdown>
        </Popover>
      </div>
      <div className="min-w-0 flex-1">
        <TimelineWidget
          key={timelineColumn}
          column={timelineColumn}
          queries={queries}
          bundleChecksum={bundleChecksum}
          overlayRevision={overlayRevision}
          animationSpeedMs={speedMultiplierToMs(timelineSpeed)}
          selectedRange={timelineSelection}
          onSelection={commitTimelineSelection}
        />
      </div>
    </motion.div>
  );
}

export const TimelineBar = memo(TimelineBarComponent);
TimelineBar.displayName = "TimelineBar";
