"use client";

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

export function GraphCanvas({
  canvas,
  queries,
}: {
  canvas: GraphCanvasSource;
  queries: GraphBundleQueries;
}) {
  return <CosmographRenderer canvas={canvas} queries={queries} />;
}
