"use client";

import dynamic from "next/dynamic";
import type { GraphData } from "@/lib/graph/types";

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

export function GraphCanvas({ data }: { data: GraphData }) {
  return <CosmographRenderer data={data} />;
}
