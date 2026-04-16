"use client";

import { useCallback } from "react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import type { GraphMode } from "@/features/graph/types";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";

export function useGraphModeController() {
  const shellVariant = useShellVariantContext();
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const applyPromptModeDefault = useDashboardStore((s) => s.applyPromptModeDefault);
  const openPanel = useDashboardStore((s) => s.openPanel);
  const openOnlyPanel = useDashboardStore((s) => s.openOnlyPanel);
  const setWikiExpanded = useDashboardStore((s) => s.setWikiExpanded);
  const stepPromptDown = useDashboardStore((s) => s.stepPromptDown);

  const applyMode = useCallback((nextMode: GraphMode) => {
    const config = getModeConfig(nextMode);
    setMode(nextMode);
    applyPromptModeDefault(config.layout.defaultPromptMode);
    if (config.layout.defaultOpenPanels) {
      if (shellVariant === "mobile") {
        openOnlyPanel(config.layout.defaultOpenPanels[config.layout.defaultOpenPanels.length - 1]);
      } else {
        for (const panel of config.layout.defaultOpenPanels) {
          openPanel(panel);
        }
      }
    }
    // Learn mode auto-expands the wiki panel; other modes collapse it.
    setWikiExpanded(nextMode === 'learn');
  }, [applyPromptModeDefault, openOnlyPanel, openPanel, setMode, setWikiExpanded, shellVariant]);

  return {
    mode,
    applyMode,
    stepPromptDown,
  };
}
