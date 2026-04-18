"use client";

import { Group, Stack, Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type { GraphInfoSummary } from "@solemd/graph";
import {
  panelScaledPx,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../../panels/PanelShell";
import {
  getInfoComparisonColors,
  getInfoComparisonDisplayValue,
  getInfoComparisonHeading,
  getInfoComparisonOpacities,
  type InfoComparisonState,
} from "./comparison-layers";

interface OverviewGridProps {
  datasetInfo: GraphInfoSummary;
  selectedInfo?: GraphInfoSummary | null;
  filteredInfo?: GraphInfoSummary | null;
  comparisonState: InfoComparisonState;
}

function SummaryRow({
  label,
  totalValue,
  selectionValue,
  filteredValue,
  comparisonState,
}: {
  label: string;
  totalValue: number | null;
  selectionValue: number | null;
  filteredValue: number | null;
  comparisonState: InfoComparisonState;
}) {
  const colors = getInfoComparisonColors(comparisonState);
  const opacities = getInfoComparisonOpacities(comparisonState);
  const totalPct = totalValue != null && totalValue > 0 ? 100 : 0;
  const selectionPct =
    comparisonState.hasSelection &&
    totalValue != null &&
    totalValue > 0 &&
    selectionValue != null
      ? (selectionValue / totalValue) * 100
      : 0;
  const filteredPct =
    comparisonState.hasFiltered &&
    totalValue != null &&
    totalValue > 0 &&
    filteredValue != null
      ? (filteredValue / totalValue) * 100
      : 0;

  return (
    <div>
      <Group justify="space-between" mb={2} wrap="nowrap" gap={4}>
        <Text style={{ ...panelTextStyle, whiteSpace: "nowrap" }}>
          {label}
        </Text>
        <Text
          style={{
            ...panelTextDimStyle,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {getInfoComparisonDisplayValue({
            totalCount: totalValue ?? 0,
            selectionCount: selectionValue,
            filteredCount: filteredValue,
            format: (value) => formatNumber(value),
          })}
        </Text>
      </Group>
      <div
        className="relative overflow-hidden rounded-full"
        style={{
          height: panelScaledPx(6),
          backgroundColor: "var(--graph-panel-input-bg)",
        }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${totalPct}%`,
              backgroundColor: colors.all,
              opacity: opacities.all,
            }}
          />
        {comparisonState.hasSelection ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, selectionPct))}%`,
              backgroundColor: colors.selection,
              opacity: opacities.selection,
            }}
          />
        ) : null}
        {comparisonState.hasFiltered ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, filteredPct))}%`,
              backgroundColor: colors.filtered,
              opacity: opacities.filtered,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function OverviewGrid({
  datasetInfo,
  selectedInfo = null,
  filteredInfo = null,
  comparisonState,
}: OverviewGridProps) {
  return (
    <div>
      <Group gap={6} mb={4}>
        <Text fw={600} style={sectionLabelStyle}>
          {getInfoComparisonHeading(comparisonState)}
        </Text>
      </Group>
      <Stack gap={6}>
        <SummaryRow
          label="Points"
          totalValue={datasetInfo.totalCount}
          selectionValue={selectedInfo?.scopedCount ?? null}
          filteredValue={filteredInfo?.scopedCount ?? null}
          comparisonState={comparisonState}
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <SummaryRow
            label="Base"
            totalValue={datasetInfo.baseCount}
            selectionValue={selectedInfo?.baseCount ?? null}
            filteredValue={filteredInfo?.baseCount ?? null}
            comparisonState={comparisonState}
          />
          <SummaryRow
            label="Overlay"
            totalValue={datasetInfo.overlayCount}
            selectionValue={selectedInfo?.overlayCount ?? null}
            filteredValue={filteredInfo?.overlayCount ?? null}
            comparisonState={comparisonState}
          />
          <SummaryRow
            label="Papers"
            totalValue={datasetInfo.papers}
            selectionValue={selectedInfo?.papers ?? null}
            filteredValue={filteredInfo?.papers ?? null}
            comparisonState={comparisonState}
          />
          <SummaryRow
            label="Clusters"
            totalValue={datasetInfo.clusters}
            selectionValue={selectedInfo?.clusters ?? null}
            filteredValue={filteredInfo?.clusters ?? null}
            comparisonState={comparisonState}
          />
        </div>
      </Stack>
    </div>
  );
}
