"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import type { GraphBundleQueries } from "@/features/graph/types";
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

function GraphCanvasComponent({
  canvas,
  queries,
  onFirstPaint,
}: {
  canvas: GraphCanvasSource;
  queries: GraphBundleQueries;
  onFirstPaint?: () => void;
}) {
  return (
    <CosmographRenderer
      canvas={canvas}
      queries={queries}
      onFirstPaint={onFirstPaint}
    />
  );
}

export const GraphCanvas = memo(GraphCanvasComponent);
GraphCanvas.displayName = "GraphCanvas";
