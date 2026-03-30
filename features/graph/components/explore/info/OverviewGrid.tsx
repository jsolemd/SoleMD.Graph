"use client";

import { Group, Stack, Text } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type { GraphInfoSummary } from "@/features/graph/types";
import {
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../../panels/PanelShell";

interface OverviewGridProps {
  datasetInfo: GraphInfoSummary;
  subsetInfo?: GraphInfoSummary | null;
}

function formatScopedValue(total: number, subset?: number | null) {
  return subset != null
    ? `${formatNumber(subset)} / ${formatNumber(total)}`
    : formatNumber(total);
}

function SummaryRow({
  label,
  value,
  totalValue,
  scopedValue,
  subsetActive,
}: {
  label: string;
  value: string;
  totalValue: number | null;
  scopedValue: number | null;
  subsetActive: boolean;
}) {
  const totalPct =
    totalValue != null && totalValue > 0 ? 100 : 0;
  const scopedPct =
    subsetActive &&
    totalValue != null &&
    totalValue > 0 &&
    scopedValue != null
      ? (scopedValue / totalValue) * 100
      : totalPct;

  return (
    <div>
      <Group justify="space-between" mb={2}>
        <Text style={panelTextStyle}>{label}</Text>
        <Text
          style={{
            ...panelTextDimStyle,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Text>
      </Group>
      <div
        className="relative overflow-hidden rounded-full"
        style={{
          height: 6,
          backgroundColor: "var(--graph-panel-input-bg)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${totalPct}%`,
            backgroundColor: subsetActive
              ? "var(--filter-bar-base)"
              : "var(--filter-bar-active)",
            opacity: subsetActive ? 0.45 : 0.98,
          }}
        />
        {subsetActive ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, scopedPct))}%`,
              backgroundColor: "var(--filter-bar-active)",
              opacity: 0.98,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function OverviewGrid({ datasetInfo, subsetInfo = null }: OverviewGridProps) {
  const subsetActive = subsetInfo != null;

  return (
    <div>
      <Group gap={6} mb={4}>
        <Text fw={600} style={sectionLabelStyle}>
          {subsetActive ? "Selection" : "All"}
        </Text>
      </Group>
      <Stack gap={6}>
        <SummaryRow
          label="Points"
          value={formatScopedValue(datasetInfo.totalCount, subsetInfo?.scopedCount)}
          totalValue={datasetInfo.totalCount}
          scopedValue={subsetInfo?.scopedCount ?? null}
          subsetActive={subsetActive}
        />
        <SummaryRow
          label="Base"
          value={formatScopedValue(datasetInfo.baseCount, subsetInfo?.baseCount)}
          totalValue={datasetInfo.baseCount}
          scopedValue={subsetInfo?.baseCount ?? null}
          subsetActive={subsetActive}
        />
        <SummaryRow
          label="Papers"
          value={formatScopedValue(datasetInfo.papers, subsetInfo?.papers)}
          totalValue={datasetInfo.papers}
          scopedValue={subsetInfo?.papers ?? null}
          subsetActive={subsetActive}
        />
        <SummaryRow
          label="Clusters"
          value={formatScopedValue(datasetInfo.clusters, subsetInfo?.clusters)}
          totalValue={datasetInfo.clusters}
          scopedValue={subsetInfo?.clusters ?? null}
          subsetActive={subsetActive}
        />
        <SummaryRow
          label="Overlay"
          value={formatScopedValue(datasetInfo.overlayCount, subsetInfo?.overlayCount)}
          totalValue={datasetInfo.overlayCount}
          scopedValue={subsetInfo?.overlayCount ?? null}
          subsetActive={subsetActive}
        />
      </Stack>
    </div>
  );
}
