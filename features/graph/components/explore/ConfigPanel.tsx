"use client";

import { memo } from "react";
import { useDashboardStore } from "@/features/graph/stores";
import { PanelBody, PanelShell } from "../panels/PanelShell";
import { PointsConfig } from "./PointsConfig";

function ConfigPanelComponent() {
  const closePanel = useDashboardStore((s) => s.closePanel);

  return (
    <PanelShell
      id="config"
      title="Configuration"
      onClose={() => closePanel("config")}
    >
      <PanelBody panelId="config" viewportClassName="thin-scrollbar">
        <PointsConfig />
      </PanelBody>
    </PanelShell>
  );
}

export const ConfigPanel = memo(ConfigPanelComponent);
ConfigPanel.displayName = "ConfigPanel";
