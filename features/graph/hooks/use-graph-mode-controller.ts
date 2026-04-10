"use client";

import { useCallback } from "react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import type { GraphMode } from "@/features/graph/types";

export function useGraphModeController() {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const applyPromptModeDefault = useDashboardStore((s) => s.applyPromptModeDefault);
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);
  const setWikiExpanded = useDashboardStore((s) => s.setWikiExpanded);
  const stepPromptDown = useDashboardStore((s) => s.stepPromptDown);

  const applyMode = useCallback((nextMode: GraphMode) => {
    const config = getModeConfig(nextMode);
    setMode(nextMode);
    applyPromptModeDefault(config.layout.defaultPromptMode);
    // Only auto-open a panel when the mode explicitly declares one.
    // null/undefined = leave current panel state untouched.
    if (config.layout.defaultPanel) {
      setActivePanel(config.layout.defaultPanel);
    }
    // Learn mode auto-expands the wiki panel; other modes collapse it.
    setWikiExpanded(nextMode === 'learn');
  }, [applyPromptModeDefault, setActivePanel, setMode, setWikiExpanded]);

  return {
    mode,
    applyMode,
    stepPromptDown,
  };
}
