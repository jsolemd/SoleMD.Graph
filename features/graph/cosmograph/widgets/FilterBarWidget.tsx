"use client";
import { CosmographBars } from "@cosmograph/react";

const widgetStyle: React.CSSProperties = { width: "100%" };

export function FilterBarWidget({ column }: { column: string }) {
  return (
    <CosmographBars
      id={`filter:${column}`}
      accessor={column}
      selectOnClick
      preserveSelectionOnUnmount
      highlightSelectedData
      showSearch
      showSortingBlock
      showTotalWhenFiltered
      sort="count"
      style={widgetStyle}
    />
  );
}
