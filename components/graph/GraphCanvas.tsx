"use client";

import dynamic from "next/dynamic";
import type { GraphData } from "@/lib/graph/types";
import type { GraphCanvasSource } from "@/lib/graph/duckdb";

const CosmographRenderer = dynamic(
  () => import("./CosmographRenderer"),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0 bg-[var(--graph-bg)]"
        role="img"
        aria-label="Loading knowledge graph..."
      />
    ),
  }
);

export function GraphCanvas({
  data,
  canvas,
}: {
  data: GraphData;
  canvas: GraphCanvasSource;
}) {
  return <CosmographRenderer canvas={canvas} data={data} />;
}
