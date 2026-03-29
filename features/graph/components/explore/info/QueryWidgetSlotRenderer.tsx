"use client";

import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
import type {
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
  GraphInfoScope,
} from "@/features/graph/types";
import type { InfoWidgetSlot } from "@/features/graph/lib/info-widgets";
import { useDashboardStore } from "@/features/graph/stores";
import {
  iconBtnStyles,
  panelTextDimStyle,
  panelTextStyle,
} from "../../panels/PanelShell";
import {
  QueryFacetSummary,
  QueryInfoBars,
  QueryInfoHistogram,
} from "./QueryWidgetVisualizations";

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

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Text size="xs" fw={600} style={panelTextStyle}>
          {slot.label}
        </Text>
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
