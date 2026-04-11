"use client";

import { useCallback } from "react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import type { GraphMode } from "@/features/graph/types";

export function useGraphModeController() {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const applyPromptModeDefault = useDashboardStore((s) => s.applyPromptModeDefault);
  const openPanel = useDashboardStore((s) => s.openPanel);
  const setWikiExpanded = useDashboardStore((s) => s.setWikiExpanded);
  const stepPromptDown = useDashboardStore((s) => s.stepPromptDown);

  const applyMode = useCallback((nextMode: GraphMode) => {
    const config = getModeConfig(nextMode);
    setMode(nextMode);
    applyPromptModeDefault(config.layout.defaultPromptMode);
    // Open panels declared by the mode (additive — doesn't close others).
    if (config.layout.defaultOpenPanels) {
      for (const panel of config.layout.defaultOpenPanels) {
        openPanel(panel);
      }
    }
    // Learn mode auto-expands the wiki panel; other modes collapse it.
    setWikiExpanded(nextMode === 'learn');
  }, [applyPromptModeDefault, openPanel, setMode, setWikiExpanded]);

  return {
    mode,
    applyMode,
    stepPromptDown,
  };
}
