"use client";
import { CosmographHistogram } from "@cosmograph/react";

const widgetStyle: React.CSSProperties = { width: "100%" };

export function FilterHistogramWidget({ column }: { column: string }) {
  return (
    <CosmographHistogram
      id={`filter:${column}`}
      accessor={column}
      preserveSelectionOnUnmount
      highlightSelectedData
      useQuantiles
      style={widgetStyle}
    />
  );
}
