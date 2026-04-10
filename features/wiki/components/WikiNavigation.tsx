"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { iconBtnStyles } from "@/features/graph/components/panels/PanelShell";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

export function WikiNavigation() {
  const historyIndex = useWikiStore((s) => s.historyIndex);
  const slugHistory = useWikiStore((s) => s.slugHistory);
  const goBack = useWikiStore((s) => s.goBack);
  const goForward = useWikiStore((s) => s.goForward);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < slugHistory.length - 1;

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip label="Back" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={goBack}
          disabled={!canGoBack}
          aria-label="Go back"
        >
          <ArrowLeft size={12} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Forward" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={goForward}
          disabled={!canGoForward}
          aria-label="Go forward"
        >
          <ArrowRight size={12} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
