"use client";

import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
import type { GraphNode } from "@/features/graph/types";
import type { InfoWidgetSlot } from "@/features/graph/lib/info-widgets";
import type { InfoScope } from "@/features/graph/hooks/use-info-stats";
import { useDashboardStore } from "@/features/graph/stores";
import { iconBtnStyles, panelTextStyle } from "../../panels/PanelShell";
import { FacetSummary } from "./FacetSummary";
import { InfoHistogram } from "./InfoHistogram";
import { InfoBars } from "./InfoBars";

interface WidgetSlotRendererProps {
  slot: InfoWidgetSlot;
  scopedNodes: GraphNode[];
  allNodes: GraphNode[];
  scope: InfoScope;
}

export function WidgetSlotRenderer({
  slot,
  scopedNodes,
  allNodes,
  scope,
}: WidgetSlotRendererProps) {
  const removeInfoWidget = useDashboardStore((s) => s.removeInfoWidget);

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
      {slot.kind === "facet-summary" && (
        <FacetSummary
          column={slot.column}
          scopedNodes={scopedNodes}
          allNodes={allNodes}
          scope={scope}
        />
      )}
      {slot.kind === "histogram" && (
        <InfoHistogram column={slot.column} scopedNodes={scopedNodes} />
      )}
      {slot.kind === "bars" && (
        <InfoBars column={slot.column} scopedNodes={scopedNodes} />
      )}
    </div>
  );
}
