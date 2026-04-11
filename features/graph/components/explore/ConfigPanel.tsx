"use client";

import { memo } from "react";
import { useDashboardStore } from "@/features/graph/stores";
import { PANEL_BODY_CLASS, PanelShell } from "../panels/PanelShell";
import { PointsConfig } from "./PointsConfig";

function ConfigPanelComponent() {
  const closePanel = useDashboardStore((s) => s.closePanel);

  return (
    <PanelShell
      id="config"
      title="Configuration"
      onClose={() => closePanel("config")}
    >
      <div className={`thin-scrollbar min-h-0 ${PANEL_BODY_CLASS}`}>
        <PointsConfig />
      </div>
    </PanelShell>
  );
}

export const ConfigPanel = memo(ConfigPanelComponent);
ConfigPanel.displayName = "ConfigPanel";
