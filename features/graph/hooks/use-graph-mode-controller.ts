"use client";

import { useCallback } from "react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import type { GraphMode } from "@/features/graph/types";

export function useGraphModeController() {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const applyPromptModeDefault = useDashboardStore((s) => s.applyPromptModeDefault);
  const stepPromptDown = useDashboardStore((s) => s.stepPromptDown);

  const applyMode = useCallback((nextMode: GraphMode) => {
    setMode(nextMode);
    applyPromptModeDefault(getModeConfig(nextMode).layout.defaultPromptMode);
  }, [applyPromptModeDefault, setMode]);

  return {
    mode,
    applyMode,
    stepPromptDown,
  };
}
