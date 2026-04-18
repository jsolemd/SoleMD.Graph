"use client";

import { useMemo } from "react";
import { Select, Switch, Stack, Text } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import {
  getColumnsForLayer,
  getRenderableColumnsForLayer,
} from "@/features/graph/lib/columns";
import type { GraphLayer } from "@solemd/graph";
import type { NumericColumnKey } from "@/features/graph/config";
import { sectionLabelStyle, panelSelectStyles, panelSwitchStyles, PANEL_ACCENT } from "../../panels/PanelShell";

export function PositionConfig({ activeLayer }: { activeLayer: GraphLayer }) {
  const renderColumns = useMemo(
    () => getRenderableColumnsForLayer(activeLayer),
    [activeLayer],
  );
  const layerColumns = useMemo(() => getColumnsForLayer(activeLayer), [activeLayer]);
  const numericCols = useMemo(
    () => renderColumns.filter((c) => c.type === 'numeric'),
    [renderColumns],
  );
  const queryNumericCols = useMemo(
    () => layerColumns.filter((c) => c.type === 'numeric'),
    [layerColumns],
  );

  const positionOptions = useMemo(
    () => numericCols.map((c) => ({ value: c.key, label: c.label })),
    [numericCols]
  );

  const timeColumnOptions = useMemo(() => [
    { value: "year", label: "Publication Year" },
    ...queryNumericCols
      .filter((c) => c.key !== "year" && c.key !== "x" && c.key !== "y")
      .map((c) => ({ value: c.key, label: c.label })),
  ], [queryNumericCols]);

  const {
    positionXColumn, positionYColumn, timelineColumn, showTimeline,
    setPositionXColumn, setPositionYColumn, setTimelineColumn, setShowTimeline,
  } = useDashboardStore(useShallow((s) => ({
    positionXColumn: s.positionXColumn,
    positionYColumn: s.positionYColumn,
    timelineColumn: s.timelineColumn,
    showTimeline: s.showTimeline,
    setPositionXColumn: s.setPositionXColumn,
    setPositionYColumn: s.setPositionYColumn,
    setTimelineColumn: s.setTimelineColumn,
    setShowTimeline: s.setShowTimeline,
  })));

  return (
    <>
      <div>
        <Text size="xs" fw={600} mb={4} style={sectionLabelStyle}>
          Positions
        </Text>
        <div className="grid grid-cols-2 gap-2">
          <Select
            size="xs"
            label="X column"
            data={positionOptions}
            value={positionXColumn}
            onChange={(v) => v && setPositionXColumn(v as NumericColumnKey)}
            styles={panelSelectStyles}
          />
          <Select
            size="xs"
            label="Y column"
            data={positionOptions}
            value={positionYColumn}
            onChange={(v) => v && setPositionYColumn(v as NumericColumnKey)}
            styles={panelSelectStyles}
          />
        </div>
      </div>

      {/* Timeline */}
      <div>
        <Text size="xs" fw={600} mb={4} style={sectionLabelStyle}>
          Timeline
        </Text>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Time data column"
            data={timeColumnOptions}
            value={timelineColumn}
            onChange={(v) => v && setTimelineColumn(v as NumericColumnKey)}
            styles={panelSelectStyles}
          />
          <Switch
            size="xs"
            color={PANEL_ACCENT}
            label="Show timeline"
            checked={showTimeline}
            onChange={(e) => setShowTimeline(e.currentTarget.checked)}
            styles={panelSwitchStyles}
          />
        </Stack>
      </div>
    </>
  );
}
