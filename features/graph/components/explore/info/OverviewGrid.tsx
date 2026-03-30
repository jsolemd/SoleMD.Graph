"use client";

import { Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type { GraphInfoSummary, MapLayer } from "@/features/graph/types";
import {
  panelCardStyle,
  panelTextMutedStyle,
  panelTextStyle,
} from "../../panels/PanelShell";

interface OverviewGridProps {
  info: GraphInfoSummary;
  layer: MapLayer;
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg px-2 py-1"
      style={{
        ...panelCardStyle,
        backgroundColor:
          "color-mix(in srgb, var(--graph-panel-input-bg) 94%, white 6%)",
      }}
    >
      <div className="flex items-baseline gap-1.5">
        <Text
          fw={500}
          style={{
            ...panelTextMutedStyle,
            fontSize: 7,
            lineHeight: "9px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            ...panelTextStyle,
            fontSize: 11,
            lineHeight: "12px",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Text>
      </div>
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

  const pointsValue = isSubset
    ? `${formatNumber(scopedCount)} / ${formatNumber(totalCount)}`
    : formatNumber(totalCount);
  const yearsValue = yearRange
    ? yearRange.min === yearRange.max
      ? String(yearRange.min)
      : `${yearRange.min}-${yearRange.max}`
    : "—";

  return (
    <div className="flex flex-wrap gap-1.5">
      <StatChip label="Points" value={pointsValue} />
      <StatChip label="Base" value={formatNumber(baseCount)} />
      <StatChip label="Papers" value={formatNumber(papers)} />
      <StatChip label="Clusters" value={formatNumber(clusters)} />
      <StatChip label="Years" value={yearsValue} />
      <StatChip label="Overlay" value={formatNumber(overlayCount)} />
    </div>
  );
}
