"use client";

import type { GraphCanvasSource } from "@/features/graph/duckdb";
import type { GraphBundleQueries } from "@/features/graph/types";
import { QueryDrivenInfoPanel } from "./QueryDrivenInfoPanel";

export function InfoPanel({
  queries,
  canvas,
}: {
  queries: GraphBundleQueries;
  canvas: GraphCanvasSource;
}) {
  return (
    <QueryDrivenInfoPanel
      queries={queries}
      overlayRevision={canvas.overlayRevision}
      overlayCount={canvas.overlayCount}
    />
  );
}
