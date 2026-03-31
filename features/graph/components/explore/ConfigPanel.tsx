"use client";

import { useDashboardStore } from "@/features/graph/stores";
import { PANEL_BODY_CLASS, PanelShell } from "../panels/PanelShell";
import { PointsConfig } from "./PointsConfig";

export function ConfigPanel() {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <PanelShell
      title="Configuration"
      side="left"
      onClose={() => setActivePanel(null)}
    >
      <div className={`config-scroll min-h-0 ${PANEL_BODY_CLASS}`}>
        <PointsConfig />
      </div>
    </PanelShell>
  );
}
