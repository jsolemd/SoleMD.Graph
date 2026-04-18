"use client";

import { Stack } from "@mantine/core";
import { useDashboardStore } from "@/features/graph/stores";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { PanelDivider } from "../panels/PanelShell";
import { ColorConfig } from "./points/ColorConfig";
import { SizeConfig } from "./points/SizeConfig";
import { LabelConfig } from "./points/LabelConfig";
import { PositionConfig } from "./points/PositionConfig";
import { LinkConfig } from "./points/LinkConfig";

export function PointsConfig() {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const layerConfig = getLayerConfig(activeLayer);
  const hasLinks = layerConfig.hasLinks;

  return (
    <Stack gap="sm">
      <ColorConfig activeLayer={activeLayer} />
      <PanelDivider />
      <SizeConfig activeLayer={activeLayer} />
      <PanelDivider />
      <LabelConfig activeLayer={activeLayer} />
      <PanelDivider />
      <PositionConfig activeLayer={activeLayer} />
      {hasLinks && <><PanelDivider /><LinkConfig /></>}
    </Stack>
  );
}
