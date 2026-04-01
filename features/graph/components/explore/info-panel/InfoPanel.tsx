"use client";

import { memo } from "react";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import type { GraphBundleQueries } from "@/features/graph/types";
import { QueryDrivenInfoPanel } from "./QueryDrivenInfoPanel";

function InfoPanelComponent({
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

export const InfoPanel = memo(InfoPanelComponent);
InfoPanel.displayName = "InfoPanel";
