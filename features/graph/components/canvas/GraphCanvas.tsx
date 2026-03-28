"use client";

import dynamic from "next/dynamic";
import { useDashboardStore } from "@/features/graph/stores";
import { getLayerConfig } from "@/features/graph/lib/layers";
import type { GraphData, GraphBundleQueries } from "@/features/graph/types";
import type { GraphCanvasSource } from "@/features/graph/duckdb";

const CosmographRenderer = dynamic(
  () => import("@/features/graph/cosmograph/GraphRenderer"),
  {
    ssr: false,
    loading: () => (
      <div
        className="absolute inset-0 bg-[var(--graph-bg)]"
        role="img"
        aria-label="Loading knowledge graph..."
      />
    ),
  }
);

const MapCanvas = dynamic(
  () => import("./MapCanvas"),
  {
    ssr: false,
    loading: () => (
      <div
        className="absolute inset-0 bg-[var(--graph-bg)]"
        role="img"
        aria-label="Loading geographic map..."
      />
    ),
  }
);

export function GraphCanvas({
  data,
  canvas,
  queries,
}: {
  data: GraphData | null;
  canvas: GraphCanvasSource;
  queries: GraphBundleQueries;
}) {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const layerConfig = getLayerConfig(activeLayer);

  if (layerConfig.rendererType === "maplibre") {
    if (!data) {
      return (
        <div
          className="absolute inset-0 bg-[var(--graph-bg)]"
          role="img"
          aria-label="Loading geographic metadata..."
        />
      );
    }

    return <MapCanvas data={data} />;
  }

  return <CosmographRenderer canvas={canvas} data={data} queries={queries} />;
}
