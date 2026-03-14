"use client";

import { Progress, Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type { InfoStats } from "@/lib/graph/hooks/use-info-stats";
import type { MapLayer } from "@/lib/graph/types";
import {
  panelTextMutedStyle,
  panelTextStyle,
} from "../../PanelShell";

interface OverviewGridProps {
  info: InfoStats;
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
  const { scopedCount, totalCount, hasSelection, papers, clusters, noise, yearRange } =
    info;

  const isPaper = layer === "paper";

  return (
    <div className="grid grid-cols-2 gap-2">
      <StatCard
        label={isPaper ? "Papers" : "Points"}
        value={
          hasSelection
            ? `${formatNumber(scopedCount)} / ${formatNumber(totalCount)}`
            : formatNumber(totalCount)
        }
        proportion={hasSelection ? scopedCount / totalCount : undefined}
      />
      {isPaper ? (
        <StatCard label="Noise" value={formatNumber(noise)} />
      ) : (
        <StatCard label="Papers" value={formatNumber(papers)} />
      )}
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
    </div>
  );
}
