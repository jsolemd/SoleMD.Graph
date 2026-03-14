"use client";

import { useDashboardStore } from "@/lib/graph/stores";
import { PanelShell } from "../PanelShell";
import { PointsConfig } from "./PointsConfig";

export function ConfigPanel() {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <PanelShell
      title="Configuration"
      side="left"
      onClose={() => setActivePanel(null)}
    >
      <div className="config-scroll flex-1 min-h-0 overflow-y-auto px-4 py-2">
        <PointsConfig />
      </div>
    </PanelShell>
  );
}
