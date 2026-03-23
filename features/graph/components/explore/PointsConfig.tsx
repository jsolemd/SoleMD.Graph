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
  const isMapLayer = layerConfig.rendererType === "maplibre";

  return (
    <Stack gap="lg">
      <ColorConfig activeLayer={activeLayer} />
      <SizeConfig activeLayer={activeLayer} isMapLayer={isMapLayer} />
      {/* Labels — MapLibre handles its own label rendering via symbol layers */}
      {!isMapLayer && <LabelConfig activeLayer={activeLayer} />}
      <PositionConfig activeLayer={activeLayer} isMapLayer={isMapLayer} />
      {hasLinks && <LinkConfig isMapLayer={isMapLayer} />}
    </Stack>
  );
}
