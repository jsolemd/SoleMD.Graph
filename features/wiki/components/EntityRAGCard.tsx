"use client";

import { useCallback } from "react";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { MessageSquareText } from "lucide-react";
import {
  iconBtnStyles,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelTextDimStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { useDashboardStore } from "@/features/graph/stores";
import type { WikiPageResponse } from "@/lib/engine/wiki-types";

interface EntityRAGCardProps {
  page: WikiPageResponse;
}

export function EntityRAGCard({ page }: EntityRAGCardProps) {
  const setRagPanelOpen = useDashboardStore((s) => s.setRagPanelOpen);

  const handleAsk = useCallback(() => {
    setRagPanelOpen(true);
  }, [setRagPanelOpen]);

  if (!page.entity_type) return null;

  return (
    <div className={panelAccentCardClassName} style={panelAccentCardStyle}>
      <div className="flex items-center justify-between">
        <div>
          <Text style={sectionLabelStyle}>Ask about this entity</Text>
          <Text style={panelTextDimStyle} className="mt-0.5">
            Query the evidence base scoped to {page.title}
          </Text>
        </div>
        <Tooltip label={`Ask about ${page.title}`} position="left" withArrow>
          <ActionIcon
            variant="transparent"
            size={28}
            radius="xl"
            className="graph-icon-btn"
            styles={iconBtnStyles}
            onClick={handleAsk}
            aria-label={`Ask about ${page.title}`}
          >
            <MessageSquareText size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}
