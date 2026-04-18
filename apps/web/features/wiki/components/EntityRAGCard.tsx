"use client";

import { useCallback } from "react";
import { Text } from "@mantine/core";
import { MessageSquareText } from "lucide-react";
import {
  PanelIconAction,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelTextDimStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { useDashboardStore } from "@/features/graph/stores";
import type { WikiPageResponse } from "@solemd/api-client/shared/wiki-types";

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
        <PanelIconAction
          label={`Ask about ${page.title}`}
          icon={<MessageSquareText size={14} />}
          onClick={handleAsk}
          size={28}
          tooltipPosition="left"
          aria-label={`Ask about ${page.title}`}
        />
      </div>
    </div>
  );
}
