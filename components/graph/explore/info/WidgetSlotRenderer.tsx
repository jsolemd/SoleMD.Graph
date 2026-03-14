"use client";

import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { X } from "lucide-react";
import type { GraphNode } from "@/lib/graph/types";
import type { InfoWidgetSlot } from "@/lib/graph/info-widgets";
import { useDashboardStore } from "@/lib/graph/stores";
import { iconBtnStyles, panelTextStyle } from "../../PanelShell";
import { FacetSummary } from "./FacetSummary";
import { InfoHistogram } from "./InfoHistogram";
import { InfoBars } from "./InfoBars";

interface WidgetSlotRendererProps {
  slot: InfoWidgetSlot;
  scopedNodes: GraphNode[];
  allNodes: GraphNode[];
  hasSelection: boolean;
}

export function WidgetSlotRenderer({
  slot,
  scopedNodes,
  allNodes,
  hasSelection,
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
          hasSelection={hasSelection}
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
