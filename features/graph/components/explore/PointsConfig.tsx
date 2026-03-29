"use client";

import { Stack } from "@mantine/core";
import { useDashboardStore } from "@/features/graph/stores";
import { getLayerConfig } from "@/features/graph/lib/layers";
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
    <Stack gap="lg">
      <ColorConfig activeLayer={activeLayer} />
      <SizeConfig activeLayer={activeLayer} />
      <LabelConfig activeLayer={activeLayer} />
      <PositionConfig activeLayer={activeLayer} />
      {hasLinks && <LinkConfig />}
    </Stack>
  );
}
