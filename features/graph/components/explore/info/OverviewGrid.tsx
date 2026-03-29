"use client";

import { Progress, Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type { GraphInfoSummary, MapLayer } from "@/features/graph/types";
import {
  panelTextMutedStyle,
  panelTextStyle,
} from "../../panels/PanelShell";

interface OverviewGridProps {
  info: GraphInfoSummary;
  layer: MapLayer;
}

function StatCard({
  label,
  value,
  proportion,
}: {
  label: string;
  value: string;
  proportion?: number;
}) {
  return (
    <div
      className="rounded-lg px-2.5 py-1.5"
      style={{
        backgroundColor: "var(--graph-panel-input-bg)",
        border: "1px solid var(--graph-panel-border)",
      }}
    >
      <Text
        fw={600}
        style={{
          ...panelTextMutedStyle,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontSize: "0.55rem",
          lineHeight: 1,
        }}
      >
        {label}
      </Text>
      <Text mt={1} size="xs" fw={600} style={panelTextStyle}>
        {value}
      </Text>
      {proportion != null && (
        <Progress
          size={3}
          radius="xl"
          value={proportion * 100}
          color="var(--mode-accent)"
          mt={4}
          styles={{
            root: {
              backgroundColor: "var(--graph-panel-input-bg)",
              border: "1px solid var(--graph-panel-border)",
            },
          }}
        />
      )}
    </div>
  );
}

export function OverviewGrid({ info, layer }: OverviewGridProps) {
  void layer;
  const {
    scopedCount,
    totalCount,
    baseCount,
    overlayCount,
    isSubset,
    papers,
    clusters,
    yearRange,
  } = info;

  return (
    <div className="grid grid-cols-2 gap-2">
      <StatCard
        label="Points"
        value={
          isSubset
            ? `${formatNumber(scopedCount)} / ${formatNumber(totalCount)}`
            : formatNumber(totalCount)
        }
        proportion={
          isSubset && totalCount > 0 ? scopedCount / totalCount : undefined
        }
      />
      <StatCard
        label="Base"
        value={formatNumber(baseCount)}
        proportion={totalCount > 0 ? baseCount / totalCount : undefined}
      />
      <StatCard label="Papers" value={formatNumber(papers)} />
      <StatCard label="Clusters" value={formatNumber(clusters)} />
      <StatCard
        label="Years"
        value={
          yearRange
            ? yearRange.min === yearRange.max
              ? String(yearRange.min)
              : `${yearRange.min}–${yearRange.max}`
            : "—"
        }
      />
      <div
        className="col-span-2 rounded-lg px-2.5 py-1.5"
        style={{
          backgroundColor: "var(--graph-panel-input-bg)",
          border: "1px solid var(--graph-panel-border)",
        }}
      >
        <Text
          fw={600}
          style={{
            ...panelTextMutedStyle,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontSize: "0.55rem",
            lineHeight: 1,
          }}
        >
          Overlay
        </Text>
        <Text mt={1} size="xs" fw={600} style={panelTextStyle}>
          {formatNumber(overlayCount)}
        </Text>
      </div>
    </div>
  );
}
