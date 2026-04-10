"use client";

import { memo } from "react";
import { useDashboardStore } from "@/features/graph/stores";
import { PANEL_BODY_CLASS, PanelShell } from "../panels/PanelShell";
import { PointsConfig } from "./PointsConfig";

function ConfigPanelComponent() {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <PanelShell
      title="Configuration"
      side="left"
      onClose={() => setActivePanel(null)}
    >
      <div className={`thin-scrollbar min-h-0 ${PANEL_BODY_CLASS}`}>
        <PointsConfig />
      </div>
    </PanelShell>
  );
}

export const ConfigPanel = memo(ConfigPanelComponent);
ConfigPanel.displayName = "ConfigPanel";
