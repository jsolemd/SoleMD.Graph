"use client";

import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
import type {
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoScope,
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
  scope: GraphInfoScope;
  prefetchedFacetRows?: GraphInfoFacetRow[] | null;
  prefetchedBarRows?: Array<{ value: string; count: number }> | null;
  prefetchedHistogram?: GraphInfoHistogramResult | null;
}

export function QueryWidgetSlotRenderer({
  slot,
  scope,
  prefetchedFacetRows = null,
  prefetchedBarRows = null,
  prefetchedHistogram = null,
}: QueryWidgetSlotRendererProps) {
  const removeInfoWidget = useDashboardStore((state) => state.removeInfoWidget);
  const metaBadges =
    slot.kind === "histogram" && prefetchedHistogram
      ? [
          `${prefetchedHistogram.bins.length} bins`,
          `${formatNumber(prefetchedHistogram.totalCount)} values`,
        ]
      : slot.kind === "facet-summary" && prefetchedFacetRows
        ? [`top ${prefetchedFacetRows.length}`, scope]
        : slot.kind === "bars" && prefetchedBarRows
          ? [
              `top ${prefetchedBarRows.length}`,
              `${formatNumber(
                prefetchedBarRows.reduce((sum, row) => sum + row.count, 0),
              )} values`,
            ]
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
        prefetchedHistogram ? (
          <QueryInfoHistogram
            bins={prefetchedHistogram.bins}
            totalCount={prefetchedHistogram.totalCount}
            column={slot.column}
          />
        ) : (
          <Text style={panelTextDimStyle}>No numeric data</Text>
        )
      ) : slot.kind === "facet-summary" ? (
        prefetchedFacetRows ? (
          <QueryFacetSummary rows={prefetchedFacetRows} scope={scope} />
        ) : (
          <Text style={panelTextDimStyle}>No data</Text>
        )
      ) : prefetchedBarRows ? (
        <QueryInfoBars rows={prefetchedBarRows} />
      ) : (
        <Text style={panelTextDimStyle}>No data</Text>
      )}
    </div>
  );
}
