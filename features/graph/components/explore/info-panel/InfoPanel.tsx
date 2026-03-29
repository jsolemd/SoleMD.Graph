"use client";

import { useDashboardStore } from "@/features/graph/stores";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import type { GraphBundleQueries, GraphData } from "@/features/graph/types";
import { GeoInfoPanel } from "./GeoInfoPanel";
import { QueryDrivenInfoPanel } from "./QueryDrivenInfoPanel";

export function InfoPanel({
  data,
  queries,
  canvas,
}: {
  data: GraphData | null;
  queries: GraphBundleQueries;
  canvas: GraphCanvasSource;
}) {
  const activeLayer = useDashboardStore((state) => state.activeLayer);

  if (activeLayer === "geo") {
    if (!data) {
      return null;
    }
    return <GeoInfoPanel data={data} queries={queries} overlayCount={canvas.overlayCount} />;
  }

  return (
    <QueryDrivenInfoPanel
      queries={queries}
      overlayRevision={canvas.overlayRevision}
      overlayCount={canvas.overlayCount}
    />
  );
}
