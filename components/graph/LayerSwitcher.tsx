"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { FileText, Globe2, Grid2x2 } from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { getModeConfig } from "@/lib/graph/modes";
import { LAYERS, LAYER_ORDER } from "@/lib/graph/layers";
import { iconBtnStyles } from "./PanelShell";
import type { MapLayer } from "@/lib/graph/types";

const LAYER_ICONS: Record<MapLayer, typeof Grid2x2> = {
  chunk: Grid2x2,
  paper: FileText,
  geo: Globe2,
};

export function LayerSwitcher({ layers }: { layers: MapLayer[] }) {
  const mode = useGraphStore((s) => s.mode);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const setActiveLayer = useDashboardStore((s) => s.setActiveLayer);
  const { color: modeColor } = getModeConfig(mode);

  return (
    <div className="flex items-center gap-0.5">
      {LAYER_ORDER.filter((layer) => layers.includes(layer)).map(
        (layer) => {
          const LayerIcon = LAYER_ICONS[layer];
          const { label } = LAYERS[layer];
          const isActive = activeLayer === layer;
          return (
            <Tooltip key={layer} label={label} position="bottom" withArrow>
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="xl"
                className="graph-icon-btn"
                styles={
                  isActive
                    ? { icon: { color: modeColor } }
                    : iconBtnStyles
                }
                onClick={() => setActiveLayer(layer)}
                aria-pressed={isActive}
                aria-label={label}
              >
                <LayerIcon />
              </ActionIcon>
            </Tooltip>
          );
        }
      )}
    </div>
  );
}
