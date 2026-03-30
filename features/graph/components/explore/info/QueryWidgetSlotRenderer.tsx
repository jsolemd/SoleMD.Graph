"use client";

import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
import type {
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
} from "@/features/graph/types";
import type { InfoWidgetSlot } from "@/features/graph/lib/info-widgets";
import { useDashboardStore } from "@/features/graph/stores";
import { formatNumber } from "@/lib/helpers";
import {
  badgeOutlineStyles,
  iconBtnStyles,
  panelTextDimStyle,
  panelTextStyle,
} from "../../panels/PanelShell";
import {
  QueryFacetSummary,
  QueryInfoBars,
  QueryInfoHistogram,
} from "./QueryWidgetVisualizations";
import { queryWidgetThemeVars } from "../widget-theme";

interface QueryWidgetSlotRendererProps {
  slot: InfoWidgetSlot;
  subsetActive: boolean;
  prefetchedFacetRows?: GraphInfoFacetRow[] | null;
  prefetchedBarRows?: GraphInfoFacetRow[] | null;
  prefetchedDatasetHistogram?: GraphInfoHistogramResult | null;
  prefetchedSubsetHistogram?: GraphInfoHistogramResult | null;
}

export function QueryWidgetSlotRenderer({
  slot,
  subsetActive,
  prefetchedFacetRows = null,
  prefetchedBarRows = null,
  prefetchedDatasetHistogram = null,
  prefetchedSubsetHistogram = null,
}: QueryWidgetSlotRendererProps) {
  const removeInfoWidget = useDashboardStore((state) => state.removeInfoWidget);

  const metaBadges =
    slot.kind === "histogram" && prefetchedDatasetHistogram
      ? [
          `${prefetchedDatasetHistogram.bins.length} bins`,
          subsetActive && prefetchedSubsetHistogram
            ? `${formatNumber(prefetchedSubsetHistogram.totalCount)} / ${formatNumber(prefetchedDatasetHistogram.totalCount)} values`
            : `${formatNumber(prefetchedDatasetHistogram.totalCount)} values`,
        ]
      : slot.kind === "facet-summary" && prefetchedFacetRows
        ? [`top ${prefetchedFacetRows.length}`]
        : slot.kind === "bars" && prefetchedBarRows
          ? [`top ${prefetchedBarRows.length}`]
          : [];

  return (
    <div style={queryWidgetThemeVars}>
      <div className="mb-1 flex items-center justify-between">
        <div className="min-w-0">
          <Text size="xs" fw={600} style={panelTextStyle}>
            {slot.label}
          </Text>
          {metaBadges.length > 0 ? (
            <Group gap={6} mt={2}>
              {metaBadges.map((badge) => (
                <Badge
                  key={badge}
                  variant="outline"
                  size="xs"
                  styles={badgeOutlineStyles}
                >
                  {badge}
                </Badge>
              ))}
            </Group>
          ) : null}
        </div>
        <Tooltip label={`Remove ${slot.label}`} position="left" withArrow>
          <ActionIcon
            variant="subtle"
            size={18}
            radius="sm"
            onClick={() => removeInfoWidget(slot.column)}
            aria-label={`Remove ${slot.label} widget`}
            styles={iconBtnStyles}
          >
            <X size={10} />
          </ActionIcon>
        </Tooltip>
      </div>

      {slot.kind === "histogram" ? (
        prefetchedDatasetHistogram ? (
          <QueryInfoHistogram
            bins={prefetchedDatasetHistogram.bins}
            totalCount={prefetchedDatasetHistogram.totalCount}
            column={slot.column}
            highlightBins={subsetActive ? prefetchedSubsetHistogram?.bins ?? null : null}
            highlightTotalCount={
              subsetActive ? prefetchedSubsetHistogram?.totalCount ?? 0 : null
            }
          />
        ) : (
          <Text style={panelTextDimStyle}>No numeric data</Text>
        )
      ) : slot.kind === "facet-summary" ? (
        prefetchedFacetRows ? (
          <QueryFacetSummary rows={prefetchedFacetRows} subsetActive={subsetActive} />
        ) : (
          <Text style={panelTextDimStyle}>No data</Text>
        )
      ) : prefetchedBarRows ? (
        <QueryInfoBars rows={prefetchedBarRows} subsetActive={subsetActive} />
      ) : (
        <Text style={panelTextDimStyle}>No data</Text>
      )}
    </div>
  );
}
