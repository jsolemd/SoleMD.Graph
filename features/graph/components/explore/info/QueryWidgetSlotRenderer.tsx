"use client";

import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
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
  getInfoComparisonDisplayValue,
  type InfoComparisonFacetRow,
  type InfoComparisonState,
  type InfoHistogramComparison,
} from "./comparison-layers";
import { QueryFacetSummary, QueryInfoBars, QueryInfoHistogram } from "./QueryWidgetVisualizations";
import { queryWidgetThemeVars } from "../widget-theme";

interface QueryWidgetSlotRendererProps {
  slot: InfoWidgetSlot;
  comparisonState: InfoComparisonState;
  prefetchedCategoricalRows?: InfoComparisonFacetRow[] | null;
  prefetchedHistogram?: InfoHistogramComparison | null;
}

export function QueryWidgetSlotRenderer({
  slot,
  comparisonState,
  prefetchedCategoricalRows = null,
  prefetchedHistogram = null,
}: QueryWidgetSlotRendererProps) {
  const removeInfoWidget = useDashboardStore((state) => state.removeInfoWidget);

  const metaBadges =
    slot.kind === "histogram" && prefetchedHistogram
      ? [
          `${prefetchedHistogram.dataset.bins.length} bins`,
          getInfoComparisonDisplayValue({
            totalCount: prefetchedHistogram.dataset.totalCount,
            selectionCount: prefetchedHistogram.selection?.totalCount ?? null,
            filteredCount: prefetchedHistogram.filtered?.totalCount ?? null,
            format: (value) => formatNumber(value),
          }) + " values",
        ]
      : (slot.kind === "facet-summary" || slot.kind === "bars") &&
          prefetchedCategoricalRows
        ? [`top ${prefetchedCategoricalRows.length}`]
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
            bins={prefetchedHistogram.dataset.bins}
            totalCount={prefetchedHistogram.dataset.totalCount}
            column={slot.column}
            comparisonState={comparisonState}
            selectionBins={prefetchedHistogram.selection?.bins ?? null}
            selectionTotalCount={prefetchedHistogram.selection?.totalCount ?? null}
            filteredBins={prefetchedHistogram.filtered?.bins ?? null}
            filteredTotalCount={prefetchedHistogram.filtered?.totalCount ?? null}
          />
        ) : (
          <Text style={panelTextDimStyle}>No numeric data</Text>
        )
      ) : slot.kind === "facet-summary" ? (
        prefetchedCategoricalRows ? (
          <QueryFacetSummary
            rows={prefetchedCategoricalRows}
            comparisonState={comparisonState}
          />
        ) : (
          <Text style={panelTextDimStyle}>No data</Text>
        )
      ) : prefetchedCategoricalRows ? (
        <QueryInfoBars
          rows={prefetchedCategoricalRows}
          comparisonState={comparisonState}
        />
      ) : (
        <Text style={panelTextDimStyle}>No data</Text>
      )}
    </div>
  );
}
